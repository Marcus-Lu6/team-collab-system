import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { Message, SystemEvent, EventHandler, Level, AgentIdentity, Role } from './types.js';

export class MessageBus {
  private emitter = new EventEmitter();
  private roles: Map<string, Role> = new Map();
  private messageHistory: Message[] = [];
  private crossLayerBuffer: Message[] = [];

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  registerRole(role: Role): void {
    this.roles.set(role.id, role);
  }

  on(eventType: SystemEvent['type'], handler: EventHandler): void {
    this.emitter.on(eventType, handler);
  }

  off(eventType: SystemEvent['type'], handler: EventHandler): void {
    this.emitter.off(eventType, handler);
  }

  private emit(event: SystemEvent): void {
    this.emitter.emit(event.type, event);
  }

  /**
   * Validate if communication is permitted between two agents
   */
  private validatePermission(from: AgentIdentity, to: AgentIdentity): { allowed: boolean; crossLayer: boolean; reason?: string } {
    const fromRole = this.roles.get(from.roleId);
    const toRole = this.roles.get(to.roleId);

    if (!fromRole || !toRole) {
      return { allowed: false, crossLayer: false, reason: 'Unknown role' };
    }

    // Check explicit communication permissions
    if (fromRole.canCommunicateWith.includes('*') || fromRole.canCommunicateWith.includes(to.roleId)) {
      const crossLayer = from.level !== to.level;
      return { allowed: true, crossLayer };
    }

    return { allowed: false, crossLayer: false, reason: `${from.roleId} cannot communicate with ${to.roleId}` };
  }

  /**
   * Get the numeric level for comparison
   */
  private getLevelNum(level: Level): number {
    return level === 'L1' ? 1 : level === 'L2' ? 2 : 3;
  }

  /**
   * Check if this is a skip-layer communication (e.g., L1 → L3 directly)
   */
  private isSkipLayer(from: Level, to: Level): boolean {
    return Math.abs(this.getLevelNum(from) - this.getLevelNum(to)) > 1;
  }

  /**
   * Send a message through the bus with permission validation
   */
  send(params: {
    from: AgentIdentity;
    to: AgentIdentity;
    type: Message['type'];
    content: string;
    metadata?: Message['metadata'];
  }): Message | { error: string } {
    const { from, to, type, content, metadata } = params;

    // Validate permissions
    const permission = this.validatePermission(from, to);
    if (!permission.allowed) {
      return { error: `Permission denied: ${permission.reason}` };
    }

    // Create message
    const message: Message = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      from,
      to,
      type,
      content,
      crossLayer: permission.crossLayer,
      metadata,
    };

    // Store in history
    this.messageHistory.push(message);

    // Buffer cross-layer messages for GitHub logging
    if (message.crossLayer) {
      this.crossLayerBuffer.push(message);
    }

    // Flag skip-layer communications
    if (this.isSkipLayer(from.level, to.level)) {
      console.warn(`⚠️ Skip-layer communication: ${from.roleId}(${from.level}) → ${to.roleId}(${to.level})`);
    }

    // Emit events
    this.emit({ type: 'message:sent', payload: message });
    this.emit({ type: 'message:received', payload: message });

    return message;
  }

  /**
   * Get buffered cross-layer messages and clear buffer
   */
  flushCrossLayerBuffer(): Message[] {
    const messages = [...this.crossLayerBuffer];
    this.crossLayerBuffer = [];
    return messages;
  }

  /**
   * Get cross-layer buffer size (for batch check)
   */
  getCrossLayerBufferSize(): number {
    return this.crossLayerBuffer.length;
  }

  /**
   * Get message history with optional filters
   */
  getHistory(filters?: {
    agentId?: string;
    type?: Message['type'];
    crossLayerOnly?: boolean;
    limit?: number;
  }): Message[] {
    let result = [...this.messageHistory];

    if (filters?.agentId) {
      result = result.filter(m => m.from.agentId === filters.agentId || m.to.agentId === filters.agentId);
    }
    if (filters?.type) {
      result = result.filter(m => m.type === filters.type);
    }
    if (filters?.crossLayerOnly) {
      result = result.filter(m => m.crossLayer);
    }
    if (filters?.limit) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  /**
   * Get conversation thread for a specific message
   */
  getThread(messageId: string): Message[] {
    const thread: Message[] = [];
    const visited = new Set<string>();

    const findRelated = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const msg = this.messageHistory.find(m => m.id === id);
      if (msg) {
        thread.push(msg);
        if (msg.metadata?.parentMessageId) {
          findRelated(msg.metadata.parentMessageId);
        }
      }

      // Find replies
      this.messageHistory
        .filter(m => m.metadata?.parentMessageId === id)
        .forEach(m => findRelated(m.id));
    };

    findRelated(messageId);
    return thread.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Clear all history (for testing)
   */
  clear(): void {
    this.messageHistory = [];
    this.crossLayerBuffer = [];
  }
}
