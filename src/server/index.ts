import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { Orchestrator } from '../core/orchestrator.js';
import type { Message } from '../core/types.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Initialize orchestrator
const orchestrator = new Orchestrator();
orchestrator.initialize();

// --- REST API ---

app.get('/api/agents', (_req, res) => {
  const agents = orchestrator.getAllAgents().map(a => a.getInfo());
  res.json(agents);
});

app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const messages = orchestrator.getMessageHistory(limit);
  res.json(messages);
});

app.get('/api/stats', (_req, res) => {
  res.json(orchestrator.getStats());
});

app.post('/api/messages', async (req, res) => {
  const { from, to, type, content, metadata } = req.body;

  if (!from || !to || !type || !content) {
    res.status(400).json({ error: 'Missing required fields: from, to, type, content' });
    return;
  }

  const result = orchestrator.sendMessage(from, to, type, content, metadata);
  if ('error' in result) {
    res.status(403).json(result);
    return;
  }

  // Emit to WebSocket clients
  io.emit('message:new', result);

  // Process the message
  await orchestrator.runUntilIdle(5);

  res.json(result);
});

// --- WebSocket ---

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// --- Start Server ---

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`\n🌐 Team Collab Server running on http://localhost:${PORT}`);
  console.log(`   REST API: http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/agents   - List all agents`);
  console.log(`     GET  /api/messages - Message history`);
  console.log(`     GET  /api/stats    - System stats`);
  console.log(`     POST /api/messages - Send a message`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await orchestrator.shutdown();
  process.exit(0);
});
