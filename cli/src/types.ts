/**
 * Represents a Claude process found via ps command
 */
export interface ClaudeProcess {
  pid: number;
  ppid: number;
  cpu: number;
  mem: number;
  command: string;
}

/**
 * Session metadata from sessions-index.json
 */
export interface SessionIndex {
  sessionId: string;
  slug?: string;
  firstPrompt?: string;
  summary?: string;
  gitBranch?: string;
  projectPath?: string;
  lastModified?: number;
}

/**
 * Token usage data from conversation messages
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Tool use information from a message
 */
export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Content block in a message (text, tool_use, tool_result, etc.)
 */
export interface ContentBlock {
  type: string;
  id?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * A message from the conversation log
 */
export interface ConversationMessage {
  type: string;
  uuid?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: Array<ContentBlock>;
    usage?: TokenUsage;
    /** Anthropic model ID (only present on assistant messages) */
    model?: string;
  };
  isSidechain?: boolean;
  cwd?: string;
  /** Parent session ID if this is a sub-agent */
  parentSessionId?: string;
}

/**
 * Activity status for display
 */
export type ActivityType =
  | 'reading'
  | 'writing'
  | 'running_command'
  | 'spawning_agent'
  | 'searching'
  | 'waiting_input'
  | 'thinking'
  | 'done'
  | 'idle';

/**
 * Activity info including what tool is being used
 */
export interface ActivityInfo {
  type: ActivityType;
  detail?: string;
  toolName?: string;
}

/**
 * Tracked session with all data
 */
export interface TrackedSession {
  sessionId: string;
  /** Unique identifier for agents - uses agentId for sub-agents, sessionId for main sessions */
  agentId: string;
  slug: string;
  projectPath: string;
  gitBranch?: string;
  pid?: number;
  color: string;
  tokens: {
    used: number;
    max: number;
    percentage: number;
  };
  totalTokens: {
    input: number;
    output: number;
  };
  sycophancyCount: number;
  activity: ActivityInfo;
  lastUpdate: Date;
  isSidechain: boolean;
  parentSessionId?: string;
  subAgents: TrackedSession[];
}

/**
 * Tool name to activity mapping
 */
export const TOOL_ACTIVITY_MAP: Record<string, ActivityInfo> = {
  'Read': { type: 'reading', toolName: 'Read' },
  'Edit': { type: 'writing', toolName: 'Edit' },
  'Write': { type: 'writing', toolName: 'Write' },
  'Bash': { type: 'running_command', toolName: 'Bash' },
  'Task': { type: 'spawning_agent', toolName: 'Task' },
  'Glob': { type: 'searching', toolName: 'Glob' },
  'Grep': { type: 'searching', toolName: 'Grep' },
  'AskUserQuestion': { type: 'waiting_input', toolName: 'AskUserQuestion' },
  'WebFetch': { type: 'reading', toolName: 'WebFetch' },
  'WebSearch': { type: 'searching', toolName: 'WebSearch' },
};

/**
 * Activity display info
 */
export interface ActivityDisplay {
  icon: string;
  label: string;
}

/**
 * Activity type to display mapping
 */
export const ACTIVITY_DISPLAY: Record<ActivityType, ActivityDisplay> = {
  reading: { icon: '📖', label: 'Reading file' },
  writing: { icon: '✏️', label: 'Writing code' },
  running_command: { icon: '⚡', label: 'Running command' },
  spawning_agent: { icon: '🤖', label: 'Spawning agent' },
  searching: { icon: '🔍', label: 'Searching' },
  waiting_input: { icon: '❓', label: 'Waiting for input' },
  thinking: { icon: '🤔', label: 'Thinking' },
  done: { icon: '✅', label: 'Done' },
  idle: { icon: '💤', label: 'Idle' },
};

/**
 * Colors for sessions
 */
export const SESSION_COLORS = [
  'cyan', 'magenta', 'yellow', 'blue',
  'green', 'red', 'white', 'gray'
] as const;

export type SessionColor = typeof SESSION_COLORS[number];

/**
 * Default max context window size (tokens). Claude's 4.x Sonnet and
 * Haiku models ship with 200k, Opus with 1M. Use getMaxContextTokens()
 * from session-reader to resolve the actual ceiling per message.
 */
export const MAX_CONTEXT_TOKENS = 200_000;

/**
 * Extended context window size (tokens) for models with 1M context,
 * i.e. Opus 4.5/4.6/4.7 by default and Sonnet on the 1M tier.
 */
export const MAX_CONTEXT_TOKENS_1M = 1_000_000;
