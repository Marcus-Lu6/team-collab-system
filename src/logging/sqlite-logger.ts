import Database from 'better-sqlite3';
import type { Message, Task, Decision } from '../core/types.js';

export class SqliteLogger {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        from_agent_id TEXT NOT NULL,
        from_role_id TEXT NOT NULL,
        from_level TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        to_role_id TEXT NOT NULL,
        to_level TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        cross_layer INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_to TEXT,
        created_by TEXT,
        priority TEXT DEFAULT 'medium',
        parent_task_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        made_by_agent_id TEXT NOT NULL,
        made_by_role_id TEXT NOT NULL,
        made_by_level TEXT NOT NULL,
        context TEXT NOT NULL,
        decision TEXT NOT NULL,
        rationale TEXT,
        affected_agents TEXT,
        related_message_ids TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        role_id TEXT NOT NULL,
        level TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        registered_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_cross_layer ON messages(cross_layer);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
    `);
  }

  logMessage(message: Message): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, timestamp, from_agent_id, from_role_id, from_level, to_agent_id, to_role_id, to_level, type, content, cross_layer, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.timestamp,
      message.from.agentId,
      message.from.roleId,
      message.from.level,
      message.to.agentId,
      message.to.roleId,
      message.to.level,
      message.type,
      message.content,
      message.crossLayer ? 1 : 0,
      message.metadata ? JSON.stringify(message.metadata) : null
    );
  }

  logTask(task: Task): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (id, title, description, status, assigned_to, created_by, priority, parent_task_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.title,
      task.description,
      task.status,
      task.assignedTo,
      task.createdBy,
      task.priority,
      task.parentTaskId || null,
      task.createdAt,
      task.updatedAt
    );
  }

  logDecision(decision: Decision): void {
    const stmt = this.db.prepare(`
      INSERT INTO decisions (id, timestamp, made_by_agent_id, made_by_role_id, made_by_level, context, decision, rationale, affected_agents, related_message_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      decision.id,
      decision.timestamp,
      decision.madeBy.agentId,
      decision.madeBy.roleId,
      decision.madeBy.level,
      decision.context,
      decision.decision,
      decision.rationale,
      JSON.stringify(decision.affectedAgents),
      JSON.stringify(decision.relatedMessageIds)
    );
  }

  registerAgent(agent: { id: string; roleId: string; level: string; model: string }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (id, role_id, level, model, status)
      VALUES (?, ?, ?, ?, 'idle')
    `);

    stmt.run(agent.id, agent.roleId, agent.level, agent.model);
  }

  getMessages(filters?: { crossLayerOnly?: boolean; limit?: number }): Message[] {
    let sql = 'SELECT * FROM messages';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.crossLayerOnly) {
      conditions.push('cross_layer = 1');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY timestamp DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      from: { agentId: row.from_agent_id as string, roleId: row.from_role_id as string, level: row.from_level as Message['from']['level'] },
      to: { agentId: row.to_agent_id as string, roleId: row.to_role_id as string, level: row.to_level as Message['to']['level'] },
      type: row.type as Message['type'],
      content: row.content as string,
      crossLayer: (row.cross_layer as number) === 1,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  getStats(): { totalMessages: number; crossLayerMessages: number; totalTasks: number; completedTasks: number } {
    const msgCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const crossCount = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE cross_layer = 1').get() as { count: number };
    const taskCount = this.db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
    const doneCount = this.db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").get() as { count: number };

    return {
      totalMessages: msgCount.count,
      crossLayerMessages: crossCount.count,
      totalTasks: taskCount.count,
      completedTasks: doneCount.count,
    };
  }

  close(): void {
    this.db.close();
  }
}
