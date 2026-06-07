import { nanoid } from 'nanoid';
import type { Role, Message, AgentIdentity, Task, Level } from '../core/types.js';
import type { MessageBus } from '../core/message-bus.js';

export type AgentStatus = 'idle' | 'thinking' | 'waiting' | 'error';

export interface AgentContext {
  conversationHistory: Message[];
  currentTask?: Task;
  pendingMessages: Message[];
}

export abstract class BaseAgent {
  readonly id: string;
  readonly role: Role;
  readonly identity: AgentIdentity;
  protected messageBus: MessageBus;
  protected context: AgentContext;
  protected status: AgentStatus = 'idle';

  constructor(role: Role, messageBus: MessageBus) {
    this.id = nanoid();
    this.role = role;
    this.identity = {
      agentId: this.id,
      roleId: role.id,
      level: role.level,
    };
    this.messageBus = messageBus;
    this.context = {
      conversationHistory: [],
      pendingMessages: [],
    };

    // Register for incoming messages
    this.messageBus.on('message:received', (event) => {
      if (event.type === 'message:received') {
        const msg = event.payload as Message;
        if (msg.to.agentId === this.id) {
          this.onMessageReceived(msg);
        }
      }
    });
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getInfo(): { id: string; role: string; level: Level; model: string; status: AgentStatus } {
    return {
      id: this.id,
      role: this.role.name,
      level: this.role.level,
      model: this.role.model,
      status: this.status,
    };
  }

  /**
   * Send a message to another agent
   */
  protected sendMessage(to: AgentIdentity, type: Message['type'], content: string, metadata?: Message['metadata']): Message | { error: string } {
    return this.messageBus.send({
      from: this.identity,
      to,
      type,
      content,
      metadata,
    });
  }

  /**
   * Handle an incoming message
   */
  protected onMessageReceived(message: Message): void {
    this.context.pendingMessages.push(message);
    this.context.conversationHistory.push(message);
  }

  /**
   * Process next pending message (called by orchestrator)
   */
  async processNext(): Promise<Message | null> {
    const message = this.context.pendingMessages.shift();
    if (!message) return null;

    this.status = 'thinking';
    try {
      const response = await this.think(message);
      this.status = 'idle';
      return response;
    } catch (error) {
      this.status = 'error';
      console.error(`Agent ${this.role.name} error:`, error);
      return null;
    }
  }

  /**
   * Check if agent has pending work
   */
  hasPendingWork(): boolean {
    return this.context.pendingMessages.length > 0;
  }

  /**
   * Core thinking logic - to be implemented by subclasses
   * Should process the message and optionally send a response
   */
  protected abstract think(message: Message): Promise<Message | null>;

  /**
   * Generate response using the agent's model
   * In Phase 1, this is a mock. Phase 5 will add real model calls.
   */
  protected async callModel(prompt: string): Promise<string> {
    // Mock implementation for Phase 1
    // Will be replaced with real provider calls in Phase 5
    return `[${this.role.name}] Response to: ${prompt.slice(0, 100)}...`;
  }
}
