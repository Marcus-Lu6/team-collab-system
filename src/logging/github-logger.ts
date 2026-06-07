import type { Message, Decision } from '../core/types.js';

/**
 * GitHub Logger - Batches cross-layer messages and commits to repo
 * Phase 1: Formats markdown. Phase 2: Adds actual git operations.
 */
export class GitHubLogger {
  private buffer: Message[] = [];
  private decisions: Decision[] = [];
  private batchSize: number;
  private batchIntervalMs: number;
  private logPath: string;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: { batchSize: number; batchIntervalMs: number; logPath: string }) {
    this.batchSize = config.batchSize;
    this.batchIntervalMs = config.batchIntervalMs;
    this.logPath = config.logPath;
  }

  /**
   * Start the batch timer
   */
  start(): void {
    this.timer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.batchIntervalMs);
  }

  /**
   * Stop the batch timer
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Flush remaining
    if (this.buffer.length > 0) {
      this.flush();
    }
  }

  /**
   * Add a cross-layer message to the buffer
   */
  addMessage(message: Message): void {
    this.buffer.push(message);

    // Auto-flush if batch size reached
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Add a decision to log
   */
  addDecision(decision: Decision): void {
    this.decisions.push(decision);
  }

  /**
   * Flush buffer - format to markdown and commit
   */
  private flush(): void {
    const messages = [...this.buffer];
    const decisions = [...this.decisions];
    this.buffer = [];
    this.decisions = [];

    const markdown = this.formatMarkdown(messages);
    const decisionMd = decisions.length > 0 ? this.formatDecisions(decisions) : null;

    // Phase 1: Just log to console. Phase 2 will add git commit.
    const date = new Date().toISOString().split('T')[0];
    const month = date.slice(0, 7);
    const filePath = `${this.logPath}/${month}/${date}.md`;

    console.log(`\n📝 GitHub Logger would commit to: ${filePath}`);
    console.log(`   ${messages.length} cross-layer messages`);
    if (decisionMd) {
      console.log(`   ${decisions.length} decisions`);
    }
    console.log('---');
    console.log(markdown);
    if (decisionMd) {
      console.log(decisionMd);
    }
    console.log('---\n');
  }

  /**
   * Format messages as structured markdown
   */
  private formatMarkdown(messages: Message[]): string {
    const date = new Date().toISOString().split('T')[0];
    let md = `# Cross-Layer Communication Log - ${date}\n\n`;

    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const direction = `${msg.from.roleId}(${msg.from.level}) → ${msg.to.roleId}(${msg.to.level})`;

      md += `## ${time} | ${msg.type.toUpperCase()}\n\n`;
      md += `**${direction}**\n\n`;
      md += `> ${msg.content}\n\n`;

      if (msg.metadata?.taskId) {
        md += `_Task: ${msg.metadata.taskId}_\n\n`;
      }
      md += `---\n\n`;
    }

    return md;
  }

  /**
   * Format decisions as markdown
   */
  private formatDecisions(decisions: Decision[]): string {
    const date = new Date().toISOString().split('T')[0];
    let md = `# Decisions Log - ${date}\n\n`;

    for (const d of decisions) {
      const time = new Date(d.timestamp).toLocaleTimeString();
      md += `## ${time} | Decision by ${d.madeBy.roleId}\n\n`;
      md += `**Context:** ${d.context}\n\n`;
      md += `**Decision:** ${d.decision}\n\n`;
      md += `**Rationale:** ${d.rationale}\n\n`;
      md += `**Affected:** ${d.affectedAgents.join(', ')}\n\n`;
      md += `---\n\n`;
    }

    return md;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}
