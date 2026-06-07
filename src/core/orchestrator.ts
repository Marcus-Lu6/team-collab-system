import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MessageBus } from './message-bus.js';
import { RoleRegistry } from './role-registry.js';
import { StrategicAgent } from '../agents/strategic.js';
import { ManagerAgent } from '../agents/manager.js';
import { ExecutorAgent } from '../agents/executor.js';
import { SqliteLogger } from '../logging/sqlite-logger.js';
import { GitHubLogger } from '../logging/github-logger.js';
import type { SystemConfig, Message, Role } from './types.js';
import type { BaseAgent } from '../agents/base-agent.js';

export class Orchestrator {
  private messageBus: MessageBus;
  private roleRegistry: RoleRegistry;
  private agents: Map<string, BaseAgent> = new Map();
  private agentsByRole: Map<string, BaseAgent> = new Map();
  private sqliteLogger: SqliteLogger;
  private githubLogger: GitHubLogger;
  private config: SystemConfig;

  constructor(configPath?: string) {
    const cfgPath = configPath || resolve(process.cwd(), 'config/system.json');
    this.config = JSON.parse(readFileSync(cfgPath, 'utf-8')) as SystemConfig;

    // Initialize core components
    this.messageBus = new MessageBus();
    this.roleRegistry = new RoleRegistry(this.config);
    this.sqliteLogger = new SqliteLogger(resolve(process.cwd(), 'data/system.db'));
    this.githubLogger = new GitHubLogger(this.config.logging);

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
    // Connect L3 agents to their L2 managers
    const managers = Array.from(this.agentsByRole.entries())
      .filter(([_, agent]) => agent.role.level === 'L2');
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

  /**
   * Get an agent by role ID
   */
  getAgent(roleId: string): BaseAgent | undefined {
    return this.agentsByRole.get(roleId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Send a message from one role to another
   */
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

  /**
   * Process all pending messages across agents (one round)
   */
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

  /**
   * Run processing loop until no more pending work
   */
  async runUntilIdle(maxRounds = 10): Promise<void> {
    let round = 0;
    while (round < maxRounds) {
      const processed = await this.processRound();
      if (processed === 0) break;
      round++;
      console.log(`   Round ${round}: processed ${processed} messages`);
    }
  }

  /**
   * Get system stats
   */
  getStats(): {
    agents: number;
    dbStats: ReturnType<SqliteLogger['getStats']>;
    githubBuffer: number;
  } {
    return {
      agents: this.agents.size,
      dbStats: this.sqliteLogger.getStats(),
      githubBuffer: this.githubLogger.getBufferSize(),
    };
  }

  /**
   * Get message history
   */
  getMessageHistory(limit?: number): Message[] {
    return this.messageBus.getHistory({ limit });
  }

  /**
   * Shutdown gracefully
   */
  shutdown(): void {
    this.githubLogger.stop();
    this.sqliteLogger.close();
    console.log('🛑 Orchestrator shut down');
  }
}
