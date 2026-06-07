import { BaseAgent } from './base-agent.js';
import type { Message, Role, Decision } from '../core/types.js';
import type { MessageBus } from '../core/message-bus.js';
import { nanoid } from 'nanoid';

/**
 * L1 Strategic Director Agent
 * Responsibilities: Final decisions, conflict resolution, strategic planning
 */
export class StrategicAgent extends BaseAgent {
  private decisions: Decision[] = [];

  constructor(role: Role, messageBus: MessageBus) {
    super(role, messageBus);
  }

  protected async think(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'escalation':
        return this.handleEscalation(message);
      case 'query':
        return this.handleQuery(message);
      case 'response':
        return this.handleReport(message);
      default:
        return this.handleGeneral(message);
    }
  }

  private async handleEscalation(message: Message): Promise<Message | null> {
    const prompt = `
As Strategic Director, an escalation has been raised:
From: ${message.from.roleId} (${message.from.level})
Issue: ${message.content}

Make a decisive resolution. Consider the broader strategic impact.
    `.trim();

    const response = await this.callModel(prompt);

    // Record the decision
    const decision: Decision = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      madeBy: this.identity,
      context: message.content,
      decision: response,
      rationale: 'Escalation resolution based on strategic priorities',
      affectedAgents: [message.from.agentId],
      relatedMessageIds: [message.id],
    };
    this.decisions.push(decision);

    // Send decision back
    const result = this.sendMessage(message.from, 'decision', response, {
      parentMessageId: message.id,
      priority: 'high',
    });

    return 'error' in result ? null : result;
  }

  private async handleQuery(message: Message): Promise<Message | null> {
    const prompt = `
As Strategic Director, answer this query:
From: ${message.from.roleId}
Query: ${message.content}

Provide strategic guidance.
    `.trim();

    const response = await this.callModel(prompt);
    const result = this.sendMessage(message.from, 'response', response, {
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  private async handleReport(message: Message): Promise<Message | null> {
    // Acknowledge reports from L2
    console.log(`📊 Director received report from ${message.from.roleId}: ${message.content.slice(0, 80)}`);
    return null; // No response needed for acknowledgment
  }

  private async handleGeneral(message: Message): Promise<Message | null> {
    const prompt = `
As Strategic Director, process this message:
From: ${message.from.roleId} (${message.from.level})
Type: ${message.type}
Content: ${message.content}

Decide: respond, delegate, or acknowledge.
    `.trim();

    const response = await this.callModel(prompt);
    const result = this.sendMessage(message.from, 'response', response, {
      parentMessageId: message.id,
    });

    return 'error' in result ? null : result;
  }

  /**
   * Initiate a strategic directive (top-down communication)
   */
  async issueDirective(toIdentity: AgentIdentity, directive: string, priority: Message['metadata']['priority'] = 'high'): Promise<Message | { error: string }> {
    return this.sendMessage(toIdentity, 'task', directive, { priority });
  }

  getDecisions(): Decision[] {
    return [...this.decisions];
  }
}
