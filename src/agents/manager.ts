import { BaseAgent } from './base-agent.js';
import type { Message, Role, Task, AgentIdentity } from '../core/types.js';
import type { MessageBus } from '../core/message-bus.js';
import { nanoid } from 'nanoid';

/**
 * L2 Manager Agent (PM or Creative Lead)
 * Responsibilities: Task decomposition, coordination, progress tracking
 */
export class ManagerAgent extends BaseAgent {
  private managedTasks: Task[] = [];
  private subordinates: Map<string, AgentIdentity> = new Map();

  constructor(role: Role, messageBus: MessageBus) {
    super(role, messageBus);
  }

  /**
   * Register a subordinate (L3) agent this manager coordinates
   */
  registerSubordinate(id: string, identity: AgentIdentity): void {
    this.subordinates.set(id, identity);
  }

  protected async think(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'task':
        return this.handleTask(message);
      case 'response':
        return this.handleResponse(message);
      case 'escalation':
        return this.handleEscalation(message);
      case 'query':
        return this.handleQuery(message);
      default:
        return this.handleGeneral(message);
    }
  }

  private async handleTask(message: Message): Promise<Message | null> {
    const prompt = `
As ${this.role.name}, decompose this task into subtasks:
From: ${message.from.roleId} (${message.from.level})
Task: ${message.content}

Break it down into concrete, assignable subtasks for the execution team.
Available team members: ${Array.from(this.subordinates.keys()).join(', ')}
    `.trim();

    const response = await this.callModel(prompt);

    // Create managed task
    const task: Task = {
      id: nanoid(),
      title: message.content.slice(0, 80),
      description: message.content,
      status: 'in_progress',
      assignedTo: this.role.id,
      createdBy: message.from.roleId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: message.metadata?.priority || 'medium',
      subtasks: [],
    };
    this.managedTasks.push(task);

    // Delegate to first available subordinate (simplified for Phase 1)
    const firstSub = Array.from(this.subordinates.values())[0];
    if (firstSub) {
      const delegated = this.sendMessage(firstSub, 'task', `[Delegated by ${this.role.name}] ${message.content}`, {
        taskId: task.id,
        priority: message.metadata?.priority,
        parentMessageId: message.id,
      });

      if (!('error' in delegated)) {
        console.log(`📋 ${this.role.name} delegated task to ${firstSub.roleId}`);
      }
    }

    // Report back to sender
    const result = this.sendMessage(message.from, 'response', `Task received and delegated. ${response}`, {
      taskId: task.id,
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  private async handleResponse(message: Message): Promise<Message | null> {
    // Update task status if this is a task completion report
    if (message.metadata?.taskId) {
      const task = this.managedTasks.find(t => t.id === message.metadata?.taskId);
      if (task) {
        task.status = 'completed';
        task.updatedAt = new Date().toISOString();
        console.log(`✅ ${this.role.name}: Task "${task.title}" completed by ${message.from.roleId}`);
      }
    }

    // If from subordinate, potentially report up to L1
    if (message.from.level === 'L3') {
      console.log(`📨 ${this.role.name} received report from ${message.from.roleId}`);
    }

    return null;
  }

  private async handleEscalation(message: Message): Promise<Message | null> {
    const prompt = `
As ${this.role.name}, handle this escalation from ${message.from.roleId}:
${message.content}

Can you resolve it, or does it need to go to the Strategic Director?
    `.trim();

    const response = await this.callModel(prompt);

    // For Phase 1, always try to resolve locally
    const result = this.sendMessage(message.from, 'decision', `[Resolved by ${this.role.name}] ${response}`, {
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  private async handleQuery(message: Message): Promise<Message | null> {
    const prompt = `
As ${this.role.name}, answer this query:
From: ${message.from.roleId}
Query: ${message.content}
    `.trim();

    const response = await this.callModel(prompt);
    const result = this.sendMessage(message.from, 'response', response, {
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  private async handleGeneral(message: Message): Promise<Message | null> {
    console.log(`💬 ${this.role.name} received: ${message.content.slice(0, 60)}`);
    return null;
  }

  /**
   * Escalate to the next level when unable to resolve
   */
  async escalate(toIdentity: AgentIdentity, reason: string, context: Message[]): Promise<Message | { error: string }> {
    return this.sendMessage(toIdentity, 'escalation', reason, {
      priority: 'high',
      tags: ['escalation'],
    });
  }

  getManagedTasks(): Task[] {
    return [...this.managedTasks];
  }
}
