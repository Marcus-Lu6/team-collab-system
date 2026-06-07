import { resolve } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import simpleGit, { type SimpleGit } from 'simple-git';
import type { Message, Decision } from '../core/types.js';

export interface GitHubLoggerConfig {
  batchSize: number;
  batchIntervalMs: number;
  logPath: string;
  repoRoot: string;
  remote?: string;       // e.g. 'origin'
  branch?: string;       // e.g. 'main'
  autoPush?: boolean;    // push after commit (default: true)
}

/**
 * GitHub Logger - Batches cross-layer messages and commits to repo
 * Writes structured markdown files, then git add + commit + push.
 */
export class GitHubLogger {
  private buffer: Message[] = [];
  private decisions: Decision[] = [];
  private batchSize: number;
  private batchIntervalMs: number;
  private logPath: string;
  private repoRoot: string;
  private remote: string;
  private branch: string;
  private autoPush: boolean;
  private git: SimpleGit;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private commitCount = 0;

  constructor(config: GitHubLoggerConfig) {
    this.batchSize = config.batchSize;
    this.batchIntervalMs = config.batchIntervalMs;
    this.logPath = config.logPath;
    this.repoRoot = config.repoRoot;
    this.remote = config.remote || 'origin';
    this.branch = config.branch || 'main';
    this.autoPush = config.autoPush ?? true;
    this.git = simpleGit(this.repoRoot);
  }

  /**
   * Start the batch timer
   */
  start(): void {
    this.timer = setInterval(() => {
      if (this.buffer.length > 0 && !this.flushing) {
        this.flush().catch(err => console.error('GitHubLogger flush error:', err));
      }
    }, this.batchIntervalMs);
    console.log(`📝 GitHubLogger started (batch: ${this.batchSize} msgs or ${this.batchIntervalMs / 1000}s)`);
  }

  /**
   * Stop the batch timer and flush remaining
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait for any in-flight flush to finish
    await this.flushQueue;
    // Flush remaining buffer
    if (this.buffer.length > 0) {
      await this.flush();
    }
    console.log(`📝 GitHubLogger stopped (${this.commitCount} commits made this session)`);
  }

  private flushQueue: Promise<void> = Promise.resolve();

  /**
   * Add a cross-layer message to the buffer
   */
  addMessage(message: Message): void {
    this.buffer.push(message);

    // Auto-flush if batch size reached
    if (this.buffer.length >= this.batchSize && !this.flushing) {
      this.flushQueue = this.flushQueue
        .then(() => this.flush())
        .catch(err => console.error('GitHubLogger flush error:', err));
    }
  }

  /**
   * Add a decision to log
   */
  addDecision(decision: Decision): void {
    this.decisions.push(decision);
  }

  /**
   * Flush buffer - write markdown files, git add, commit, push
   */
  async flush(): Promise<void> {
    if (this.flushing || (this.buffer.length === 0 && this.decisions.length === 0)) return;
    this.flushing = true;

    try {
      const messages = [...this.buffer];
      const decisions = [...this.decisions];
      this.buffer = [];
      this.decisions = [];

      const date = new Date().toISOString().split('T')[0];
      const month = date.slice(0, 7);
      const dirPath = resolve(this.repoRoot, this.logPath, month);

      // Ensure directory exists
      mkdirSync(dirPath, { recursive: true });

      // Write/append message log
      const msgFilePath = resolve(dirPath, `${date}.md`);
      const msgMarkdown = this.formatMessages(messages, date);
      this.appendToFile(msgFilePath, msgMarkdown, `# Cross-Layer Communication Log - ${date}\n\n`);

      // Write/append decision log if any
      const filesToAdd = [msgFilePath];
      if (decisions.length > 0) {
        const decFilePath = resolve(dirPath, `${date}-decisions.md`);
        const decMarkdown = this.formatDecisions(decisions, date);
        this.appendToFile(decFilePath, decMarkdown, `# Decisions Log - ${date}\n\n`);
        filesToAdd.push(decFilePath);
      }

      // Git operations
      const relativePaths = filesToAdd.map(f => f.replace(this.repoRoot + '/', ''));
      await this.git.add(relativePaths);

      const commitMsg = this.buildCommitMessage(messages.length, decisions.length, date);
      await this.git.commit(commitMsg);
      this.commitCount++;

      console.log(`📝 Committed: ${commitMsg}`);

      // Push if configured
      if (this.autoPush) {
        try {
          await this.git.push(this.remote, this.branch);
          console.log(`   ↑ Pushed to ${this.remote}/${this.branch}`);
        } catch (pushErr) {
          console.warn(`   ⚠️ Push failed (will retry next flush):`, (pushErr as Error).message);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Append content to a file, creating with header if new
   */
  private appendToFile(filePath: string, content: string, header: string): void {
    if (!existsSync(filePath)) {
      writeFileSync(filePath, header + content, 'utf-8');
    } else {
      appendFileSync(filePath, content, 'utf-8');
    }
  }

  /**
   * Format messages as structured markdown entries
   */
  private formatMessages(messages: Message[], _date: string): string {
    let md = '';

    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false });
      const direction = `${msg.from.roleId}(${msg.from.level}) → ${msg.to.roleId}(${msg.to.level})`;

      md += `## ${time} | ${msg.type.toUpperCase()}\n\n`;
      md += `**${direction}**\n\n`;

      // Multi-line content gets proper blockquote
      const lines = msg.content.split('\n');
      md += lines.map(l => `> ${l}`).join('\n') + '\n\n';

      if (msg.metadata?.taskId) {
        md += `_Task: ${msg.metadata.taskId}_\n\n`;
      }
      if (msg.metadata?.priority) {
        md += `_Priority: ${msg.metadata.priority}_\n\n`;
      }
      if (msg.metadata?.tags?.length) {
        md += `_Tags: ${msg.metadata.tags.join(', ')}_\n\n`;
      }

      md += `---\n\n`;
    }

    return md;
  }

  /**
   * Format decisions as markdown entries
   */
  private formatDecisions(decisions: Decision[], _date: string): string {
    let md = '';

    for (const d of decisions) {
      const time = new Date(d.timestamp).toLocaleTimeString('en-US', { hour12: false });
      md += `## ${time} | Decision by ${d.madeBy.roleId} (${d.madeBy.level})\n\n`;
      md += `**Context:**\n> ${d.context}\n\n`;
      md += `**Decision:**\n> ${d.decision}\n\n`;
      md += `**Rationale:** ${d.rationale}\n\n`;
      md += `**Affected agents:** ${d.affectedAgents.join(', ')}\n\n`;
      md += `**Related messages:** ${d.relatedMessageIds.join(', ')}\n\n`;
      md += `---\n\n`;
    }

    return md;
  }

  /**
   * Build a descriptive commit message
   */
  private buildCommitMessage(msgCount: number, decCount: number, date: string): string {
    const parts: string[] = [`log(${date}):`];

    if (msgCount > 0) {
      parts.push(`${msgCount} cross-layer message${msgCount > 1 ? 's' : ''}`);
    }
    if (decCount > 0) {
      parts.push(`${decCount} decision${decCount > 1 ? 's' : ''}`);
    }

    return parts.join(' ');
  }

  /**
   * Force an immediate flush (useful for testing or shutdown)
   */
  async forceFlush(): Promise<void> {
    await this.flushQueue;
    await this.flush();
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getCommitCount(): number {
    return this.commitCount;
  }
}
