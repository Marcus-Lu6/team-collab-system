import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { Orchestrator } from '../core/orchestrator.js';
import type { Message, SystemEvent } from '../core/types.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Initialize orchestrator
const orchestrator = new Orchestrator(undefined, { autoPush: false });
orchestrator.initialize();

// Wire all system events to WebSocket
const eventTypes: SystemEvent['type'][] = [
  'message:sent', 'message:received', 'task:created', 'task:updated',
  'escalation:requested', 'escalation:resolved', 'decision:made', 'agent:status',
];
for (const eventType of eventTypes) {
  orchestrator.onEvent(eventType, (event) => {
    io.emit(eventType, event);
  });
}

// ═══════════════════════════════════════════════════════
//  REST API - Agents
// ═══════════════════════════════════════════════════════

app.get('/api/agents', (_req, res) => {
  const agents = orchestrator.getAllAgents().map(a => a.getInfo());
  res.json(agents);
});

app.get('/api/agents/:roleId', (req, res) => {
  const agent = orchestrator.getAgent(req.params.roleId);
  if (!agent) {
    res.status(404).json({ error: `Agent not found: ${req.params.roleId}` });
    return;
  }
  res.json(agent.getInfo());
});

// ═══════════════════════════════════════════════════════
//  REST API - Messages
// ═══════════════════════════════════════════════════════

app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const type = req.query.type as string | undefined;
  const crossLayerOnly = req.query.crossLayer === 'true';
  const agentId = req.query.agentId as string | undefined;

  const messages = orchestrator.getMessageHistory(limit, { type: type as Message['type'], crossLayerOnly, agentId });
  res.json(messages);
});

app.get('/api/messages/:messageId', (req, res) => {
  const message = orchestrator.getMessageById(req.params.messageId);
  if (!message) {
    res.status(404).json({ error: `Message not found: ${req.params.messageId}` });
    return;
  }
  res.json(message);
});

app.get('/api/messages/:messageId/thread', (req, res) => {
  const thread = orchestrator.getMessageThread(req.params.messageId);
  res.json(thread);
});

app.post('/api/messages', async (req, res) => {
  const { from, to, type, content, metadata } = req.body;

  if (!from || !to || !type || !content) {
    res.status(400).json({ error: 'Missing required fields: from, to, type, content' });
    return;
  }

  const validTypes = ['task', 'query', 'response', 'escalation', 'decision'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const result = orchestrator.sendMessage(from, to, type, content, metadata);
  if ('error' in result) {
    res.status(403).json(result);
    return;
  }

  // Process the message through agent pipeline
  await orchestrator.runUntilIdle(5);

  // Return the original message + any responses generated
  const responses = orchestrator.getMessageHistory(10, { agentId: result.to.agentId })
    .filter(m => m.metadata?.parentMessageId === result.id);

  res.json({ message: result, responses });
});

// ═══════════════════════════════════════════════════════
//  REST API - Tasks
// ═══════════════════════════════════════════════════════

app.get('/api/tasks', (req, res) => {
  const status = req.query.status as string | undefined;
  const assignedTo = req.query.assignedTo as string | undefined;
  const tasks = orchestrator.getTasks({ status, assignedTo });
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, description, assignTo, priority } = req.body;

  if (!title || !assignTo) {
    res.status(400).json({ error: 'Missing required fields: title, assignTo' });
    return;
  }

  const task = orchestrator.createTask({
    title,
    description: description || title,
    assignTo,
    priority: priority || 'medium',
  });

  if ('error' in task) {
    res.status(400).json(task);
    return;
  }

  io.emit('task:created', task);
  res.status(201).json(task);
});

// ═══════════════════════════════════════════════════════
//  REST API - Hierarchy & Config
// ═══════════════════════════════════════════════════════

app.get('/api/hierarchy', (_req, res) => {
  res.json(orchestrator.getHierarchy());
});

app.get('/api/roles', (_req, res) => {
  res.json(orchestrator.getRoles());
});

// ═══════════════════════════════════════════════════════
//  REST API - Stats & Search
// ═══════════════════════════════════════════════════════

app.get('/api/stats', (_req, res) => {
  res.json(orchestrator.getStats());
});

app.get('/api/search', (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }
  const results = orchestrator.searchMessages(q);
  res.json(results);
});

// ═══════════════════════════════════════════════════════
//  REST API - Logs flush (manual trigger)
// ═══════════════════════════════════════════════════════

app.post('/api/logs/flush', async (_req, res) => {
  await orchestrator.flushLogs();
  res.json({ success: true, stats: orchestrator.getStats() });
});

// ═══════════════════════════════════════════════════════
//  WebSocket
// ═══════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Send current state on connect
  socket.emit('init', {
    agents: orchestrator.getAllAgents().map(a => a.getInfo()),
    stats: orchestrator.getStats(),
  });

  // Allow sending messages via WebSocket too
  socket.on('message:send', async (data: { from: string; to: string; type: string; content: string; metadata?: Record<string, unknown> }) => {
    const result = orchestrator.sendMessage(data.from, data.to, data.type as Message['type'], data.content, data.metadata as Message['metadata']);
    if ('error' in result) {
      socket.emit('error', result);
      return;
    }
    await orchestrator.runUntilIdle(5);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ═══════════════════════════════════════════════════════
//  Start Server
// ═══════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`\n🌐 Team Collab Server running on http://localhost:${PORT}`);
  console.log(`\n   REST API Endpoints:`);
  console.log(`     GET    /api/agents              - List all agents`);
  console.log(`     GET    /api/agents/:roleId      - Get agent by role`);
  console.log(`     GET    /api/messages            - Message history (query: limit, type, crossLayer, agentId)`);
  console.log(`     GET    /api/messages/:id        - Get message by ID`);
  console.log(`     GET    /api/messages/:id/thread - Get conversation thread`);
  console.log(`     POST   /api/messages            - Send a message`);
  console.log(`     GET    /api/tasks               - List tasks (query: status, assignedTo)`);
  console.log(`     POST   /api/tasks               - Create a task`);
  console.log(`     GET    /api/hierarchy            - Organization hierarchy`);
  console.log(`     GET    /api/roles               - Role definitions`);
  console.log(`     GET    /api/stats               - System statistics`);
  console.log(`     GET    /api/search?q=           - Search messages`);
  console.log(`     POST   /api/logs/flush          - Force flush logs to git`);
  console.log(`\n   WebSocket Events (emitted):`);
  console.log(`     message:sent, message:received, task:created, task:updated`);
  console.log(`     escalation:requested, escalation:resolved, decision:made, agent:status`);
  console.log(`     init (on connect)`);
  console.log(`\n   WebSocket Events (received):`);
  console.log(`     message:send - Send a message via WS`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await orchestrator.shutdown();
  process.exit(0);
});
