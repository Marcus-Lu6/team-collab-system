import { readFileSync } from 'fs';
import { resolve } from 'path';
import { nanoid } from 'nanoid';
import { MessageBus } from './message-bus.js';
import { RoleRegistry } from './role-registry.js';
import { StrategicAgent } from '../agents/strategic.js';
import { ManagerAgent } from '../agents/manager.js';
import { ExecutorAgent } from '../agents/executor.js';
import { SqliteLogger } from '../logging/sqlite-logger.js';
import { GitHubLogger, type GitHubLoggerConfig } from '../logging/github-logger.js';
import type { SystemConfig, Message, Role, Task, SystemEvent, EventHandler } from './types.js';
import type { BaseAgent } from '../agents/base-agent.js';

export class Orchestrator {
  private messageBus: MessageBus;
  private roleRegistry: RoleRegistry;
  private agents: Map<string, BaseAgent> = new Map();
  private agentsByRole: Map<string, BaseAgent> = new Map();
  private sqliteLogger: SqliteLogger;
  private githubLogger: GitHubLogger;
  private config: SystemConfig;
  private tasks: Map<string, Task> = new Map();

  constructor(configPath?: string, options?: { repoRoot?: string; autoPush?: boolean }) {
    const cfgPath = configPath || resolve(process.cwd(), 'config/system.json');
    this.config = JSON.parse(readFileSync(cfgPath, 'utf-8')) as SystemConfig;

    const repoRoot = options?.repoRoot || process.cwd();

    // Initialize core components
    this.messageBus = new MessageBus();
    this.roleRegistry = new RoleRegistry(this.config);
    this.sqliteLogger = new SqliteLogger(resolve(repoRoot, 'data/system.db'));

    const loggerConfig: GitHubLoggerConfig = {
      ...this.config.logging,
      repoRoot,
      autoPush: options?.autoPush ?? true,
    };
    this.githubLogger = new GitHubLogger(loggerConfig);

    // Wire up logging
    this.messageBus.on('message:sent', (event) => {
      if (event.type === 'message:sent') {
        const msg = event.payload as Message;
        this.sqliteLogger.logMessage(msg);
        if (msg.crossLayer) {
          this.githubLogger.addMessage(msg);
        }
      }
    });
  }

  /**
   * Initialize all agents based on config
   */
  initialize(): void {
    for (const role of this.config.roles) {
      this.messageBus.registerRole(role);
      const agent = this.createAgent(role);
      this.agents.set(agent.id, agent);
      this.agentsByRole.set(role.id, agent);
      this.sqliteLogger.registerAgent({
        id: agent.id,
        roleId: role.id,
        level: role.level,
        model: role.model,
      });
    }

    // Wire up manager-executor relationships
    this.wireHierarchy();

    // Start GitHub logger timer
    this.githubLogger.start();

    console.log('🚀 Orchestrator initialized');
    console.log(`   ${this.agents.size} agents registered`);
    console.log('   Hierarchy:', JSON.stringify(this.roleRegistry.getHierarchy(), null, 2));
  }

  private createAgent(role: Role): BaseAgent {
    switch (role.level) {
      case 'L1':
        return new StrategicAgent(role, this.messageBus);
      case 'L2':
        return new ManagerAgent(role, this.messageBus);
      case 'L3':
        return new ExecutorAgent(role, this.messageBus);
    }
  }

  private wireHierarchy(): void {
    const executors = Array.from(this.agentsByRole.entries())
      .filter(([_, agent]) => agent.role.level === 'L3');

    // Default: PM manages all L3 agents
    const pm = this.agentsByRole.get('project-manager') as ManagerAgent | undefined;
    if (pm) {
      for (const [roleId, executor] of executors) {
        (pm as ManagerAgent).registerSubordinate(roleId, executor.identity);
        (executor as ExecutorAgent).setManager(pm.identity);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Agent Access
  // ═══════════════════════════════════════════════════════

  getAgent(roleId: string): BaseAgent | undefined {
    return this.agentsByRole.get(roleId);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  // ═══════════════════════════════════════════════════════
  //  Messaging
  // ═══════════════════════════════════════════════════════

  sendMessage(fromRoleId: string, toRoleId: string, type: Message['type'], content: string, metadata?: Message['metadata']): Message | { error: string } {
    const fromAgent = this.agentsByRole.get(fromRoleId);
    const toAgent = this.agentsByRole.get(toRoleId);

    if (!fromAgent || !toAgent) {
      return { error: `Agent not found: ${!fromAgent ? fromRoleId : toRoleId}` };
    }

    return this.messageBus.send({
      from: fromAgent.identity,
      to: toAgent.identity,
      type,
      content,
      metadata,
    });
  }

  getMessageHistory(limit?: number, filters?: { type?: Message['type']; crossLayerOnly?: boolean; agentId?: string }): Message[] {
    return this.messageBus.getHistory({ limit, ...filters });
  }

  getMessageById(messageId: string): Message | undefined {
    return this.messageBus.getHistory({}).find(m => m.id === messageId);
  }

  getMessageThread(messageId: string): Message[] {
    return this.messageBus.getThread(messageId);
  }

  searchMessages(query: string): Message[] {
    const all = this.messageBus.getHistory({});
    const q = query.toLowerCase();
    return all.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.from.roleId.toLowerCase().includes(q) ||
      m.to.roleId.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q)
    );
  }

  // ═══════════════════════════════════════════════════════
  //  Tasks
  // ═══════════════════════════════════════════════════════

  createTask(params: { title: string; description: string; assignTo: string; priority: string }): Task | { error: string } {
    const agent = this.agentsByRole.get(params.assignTo);
    if (!agent) {
      return { error: `Agent not found: ${params.assignTo}` };
    }

    const task: Task = {
      id: nanoid(),
      title: params.title,
      description: params.description,
      status: 'pending',
      assignedTo: params.assignTo,
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: params.priority as Task['priority'],
    };

    this.tasks.set(task.id, task);
    this.sqliteLogger.logTask(task);

    // Send as a message to the assigned agent
    this.sendMessage('strategic-director', params.assignTo, 'task', `[Task ${task.id}] ${params.title}: ${params.description}`, {
      taskId: task.id,
      priority: task.priority,
    });

    return task;
  }

  getTasks(filters?: { status?: string; assignedTo?: string }): Task[] {
    let result = Array.from(this.tasks.values());
    if (filters?.status) {
      result = result.filter(t => t.status === filters.status);
    }
    if (filters?.assignedTo) {
      result = result.filter(t => t.assignedTo === filters.assignedTo);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════
  //  Hierarchy & Config
  // ═══════════════════════════════════════════════════════

  getHierarchy(): ReturnType<RoleRegistry['getHierarchy']> {
    return this.roleRegistry.getHierarchy();
  }

  getRoles(): Role[] {
    return this.roleRegistry.getAll();
  }

  // ═══════════════════════════════════════════════════════
  //  Events (for WebSocket wiring)
  // ═══════════════════════════════════════════════════════

  onEvent(eventType: SystemEvent['type'], handler: EventHandler): void {
    this.messageBus.on(eventType, handler);
  }

  // ═══════════════════════════════════════════════════════
  //  Processing
  // ═══════════════════════════════════════════════════════

  async processRound(): Promise<number> {
    let processed = 0;
    for (const agent of this.agents.values()) {
      while (agent.hasPendingWork()) {
        await agent.processNext();
        processed++;
      }
    }
    return processed;
  }

  async runUntilIdle(maxRounds = 10): Promise<void> {
    let round = 0;
    while (round < maxRounds) {
      const processed = await this.processRound();
      if (processed === 0) break;
      round++;
      console.log(`   Round ${round}: processed ${processed} messages`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Stats & Lifecycle
  // ═══════════════════════════════════════════════════════

  getStats(): {
    agents: number;
    dbStats: ReturnType<SqliteLogger['getStats']>;
    githubBuffer: number;
    githubCommits: number;
    activeTasks: number;
  } {
    return {
      agents: this.agents.size,
      dbStats: this.sqliteLogger.getStats(),
      githubBuffer: this.githubLogger.getBufferSize(),
      githubCommits: this.githubLogger.getCommitCount(),
      activeTasks: Array.from(this.tasks.values()).filter(t => t.status !== 'completed').length,
    };
  }

  async shutdown(): Promise<void> {
    await this.githubLogger.stop();
    this.sqliteLogger.close();
    console.log('🛑 Orchestrator shut down');
  }

  async flushLogs(): Promise<void> {
    await this.githubLogger.forceFlush();
  }
}
