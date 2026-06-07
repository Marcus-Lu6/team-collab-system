import { BaseAgent } from './base-agent.js';
import type { Message, Role, AgentIdentity } from '../core/types.js';
import type { MessageBus } from '../core/message-bus.js';

/**
 * L3 Executor Agent (Developer, Data Analyst, QA)
 * Responsibilities: Execute tasks, report progress, escalate blockers
 */
export class ExecutorAgent extends BaseAgent {
  private manager: AgentIdentity | null = null;
  private completedWork: { taskId: string; result: string; completedAt: string }[] = [];

  constructor(role: Role, messageBus: MessageBus) {
    super(role, messageBus);
  }

  /**
   * Set the managing agent for this executor
   */
  setManager(identity: AgentIdentity): void {
    this.manager = identity;
  }

  protected async think(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'task':
        return this.handleTask(message);
      case 'query':
        return this.handleQuery(message);
      case 'decision':
        return this.handleDecision(message);
      default:
        return this.handleGeneral(message);
    }
  }

  private async handleTask(message: Message): Promise<Message | null> {
    const prompt = `
As ${this.role.name} (${this.role.capabilities.join(', ')}), execute this task:
${message.content}

Provide your work output.
    `.trim();

    console.log(`🔨 ${this.role.name} working on: ${message.content.slice(0, 60)}...`);

    const response = await this.callModel(prompt);

    // Record completed work
    this.completedWork.push({
      taskId: message.metadata?.taskId || 'unknown',
      result: response,
      completedAt: new Date().toISOString(),
    });

    // Report back to sender (usually L2 manager)
    const result = this.sendMessage(message.from, 'response', `[Completed by ${this.role.name}] ${response}`, {
      taskId: message.metadata?.taskId,
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  private async handleQuery(message: Message): Promise<Message | null> {
    const prompt = `
As ${this.role.name}, answer this query using your expertise in ${this.role.capabilities.join(', ')}:
${message.content}
    `.trim();

    const response = await this.callModel(prompt);
    const result = this.sendMessage(message.from, 'response', response, {
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  private async handleDecision(message: Message): Promise<Message | null> {
    // Accept decisions from higher levels
    console.log(`📌 ${this.role.name} received decision from ${message.from.roleId}: ${message.content.slice(0, 60)}`);
    return null;
  }

  private async handleGeneral(message: Message): Promise<Message | null> {
    console.log(`💬 ${this.role.name} received: ${message.content.slice(0, 60)}`);
    return null;
  }

  /**
   * Escalate a blocker to the manager
   */
  async escalateBlocker(reason: string): Promise<Message | { error: string } | null> {
    if (!this.manager) {
      console.error(`${this.role.name} has no manager set, cannot escalate`);
      return null;
    }

    return this.sendMessage(this.manager, 'escalation', `[Blocker from ${this.role.name}] ${reason}`, {
      priority: 'high',
      tags: ['blocker'],
    });
  }

  /**
   * Query a peer agent
   */
  async queryPeer(peerIdentity: AgentIdentity, question: string): Promise<Message | { error: string }> {
    return this.sendMessage(peerIdentity, 'query', question);
  }

  getCompletedWork(): typeof this.completedWork {
    return [...this.completedWork];
  }
}
