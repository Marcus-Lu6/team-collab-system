export type Level = 'L1' | 'L2' | 'L3';

export type MessageType = 'task' | 'query' | 'response' | 'escalation' | 'decision';

export interface AgentIdentity {
  agentId: string;
  roleId: string;
  level: Level;
}

export interface Message {
  id: string;
  timestamp: string;
  from: AgentIdentity;
  to: AgentIdentity;
  type: MessageType;
  content: string;
  crossLayer: boolean;
  metadata?: {
    taskId?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    tags?: string[];
    parentMessageId?: string;
  };
}

export interface Role {
  id: string;
  name: string;
  level: Level;
  model: string;
  capabilities: string[];
  canCommunicateWith: string[];
  escalationPath: string[];
  systemPrompt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  assignedTo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  parentTaskId?: string;
  subtasks?: string[];
  dependencies?: string[];
}

export interface Decision {
  id: string;
  timestamp: string;
  madeBy: AgentIdentity;
  context: string;
  decision: string;
  rationale: string;
  affectedAgents: string[];
  relatedMessageIds: string[];
}

export interface EscalationRequest {
  id: string;
  timestamp: string;
  from: AgentIdentity;
  to: AgentIdentity;
  reason: string;
  context: Message[];
  status: 'pending' | 'resolved' | 'dismissed';
  resolution?: string;
}

export interface SystemConfig {
  roles: Role[];
  permissions: {
    sameLevel: string;
    crossLayer: string;
    skipLayer: string;
  };
  logging: {
    batchSize: number;
    batchIntervalMs: number;
    logPath: string;
    decisionLogSuffix: string;
  };
  escalation: {
    maxRetries: number;
    timeoutMs: number;
  };
}

export interface ModelConfig {
  providers: Record<string, {
    baseUrl: string;
    models: Record<string, { maxTokens: number; temperature: number }>;
  }>;
  fallback: Record<string, string>;
}

// Event types for the MessageBus
export type SystemEvent =
  | { type: 'message:sent'; payload: Message }
  | { type: 'message:received'; payload: Message }
  | { type: 'task:created'; payload: Task }
  | { type: 'task:updated'; payload: Task }
  | { type: 'escalation:requested'; payload: EscalationRequest }
  | { type: 'escalation:resolved'; payload: EscalationRequest }
  | { type: 'decision:made'; payload: Decision }
  | { type: 'agent:status'; payload: { agentId: string; status: string } };

export type EventHandler = (event: SystemEvent) => void | Promise<void>;
