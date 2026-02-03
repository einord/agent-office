import type { ConversationMessage, ActivityInfo, ActivityType, ToolUse } from '../types.js';
import { TOOL_ACTIVITY_MAP } from '../types.js';

/** Timeout in ms after which an inactive session is considered "done" */
const ACTIVITY_TIMEOUT_MS = 30_000; // 30 seconds

/** Tools that wait for user input - should never show as "done" */
const USER_INPUT_TOOLS = new Set([
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
]);

/**
 * Extracts the latest activity from conversation messages
 * @param messages Recent conversation messages
 * @param lastModified Optional timestamp of last file modification
 * @returns Current activity info
 */
export function getLatestActivity(messages: ConversationMessage[], lastModified?: number): ActivityInfo {
  const timeSinceModified = lastModified ? Date.now() - lastModified : 0;
  const isStale = timeSinceModified > ACTIVITY_TIMEOUT_MS;

  // Process messages in reverse order to find the most recent activity
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Check for tool use in message content
    const content = msg.message?.content;
    if (Array.isArray(content)) {
      // Check if this message has tool_use
      const toolUseBlock = content.find((block: { type: string }) => block.type === 'tool_use');
      if (toolUseBlock && toolUseBlock.name) {
        // Tools that wait for user input should always show as waiting, never "done"
        if (USER_INPUT_TOOLS.has(toolUseBlock.name)) {
          return {
            type: 'waiting_input',
            toolName: toolUseBlock.name,
            detail: extractToolDetail(toolUseBlock.name, toolUseBlock.input),
          };
        }

        // If stale and has tool_use, it might be waiting for result or done
        if (isStale) {
          return { type: 'done' };
        }

        const activity = TOOL_ACTIVITY_MAP[toolUseBlock.name];
        if (activity) {
          return {
            ...activity,
            detail: extractToolDetail(toolUseBlock.name, toolUseBlock.input),
          };
        }
        // Unknown tool, show as thinking
        return {
          type: 'thinking',
          toolName: toolUseBlock.name,
        };
      }

      // Check if it's an assistant message with only text (no tool_use) - likely done
      if (msg.message?.role === 'assistant' && msg.type === 'assistant') {
        const hasText = content.some((block: { type: string }) => block.type === 'text');
        const hasToolUse = content.some((block: { type: string }) => block.type === 'tool_use');

        if (hasText && !hasToolUse) {
          // Assistant responded with text only - session is done or waiting for user
          if (isStale) {
            return { type: 'done' };
          }
          // Recently finished, still show as done
          return { type: 'done' };
        }

        if (hasText) {
          // Has text but also tool_use - still thinking
          if (isStale) {
            return { type: 'done' };
          }
          return { type: 'thinking' };
        }
      }
    }

    // Check for tool_result (user message with tool results)
    if (msg.type === 'user' && msg.message?.role === 'user') {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        const hasToolResult = content.some((block: { type: string }) => block.type === 'tool_result');
        if (hasToolResult) {
          // Tool result received, Claude should be processing
          if (isStale) {
            return { type: 'done' };
          }
          return { type: 'thinking' };
        }
      }
    }
  }

  return { type: 'idle' };
}

/**
 * Extracts detail string from tool input
 * @param toolName Name of the tool
 * @param input Tool input parameters
 * @returns Human-readable detail string
 */
function extractToolDetail(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;

  switch (toolName) {
    case 'Read':
      return input.file_path as string;
    case 'Edit':
    case 'Write':
      return input.file_path as string;
    case 'Bash':
      return undefined;
    case 'Glob':
      return input.pattern as string;
    case 'Grep':
      return input.pattern as string;
    case 'Task':
      return input.description as string;
    case 'WebFetch':
      return input.url as string;
    case 'WebSearch':
      return input.query as string;
    case 'AskUserQuestion':
      // Extract first question if available
      const questions = input.questions as Array<{ question?: string }> | undefined;
      if (questions && questions.length > 0 && questions[0].question) {
        const q = questions[0].question;
        return q.length > 50 ? q.slice(0, 47) + '...' : q;
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Checks if a message indicates a sub-agent (sidechain)
 * @param msg Conversation message
 * @returns True if this is a sidechain message
 */
export function isSidechainMessage(msg: ConversationMessage): boolean {
  return msg.isSidechain === true;
}

/**
 * Extracts the working directory from messages
 * @param messages Conversation messages
 * @returns Working directory path or undefined
 */
export function extractWorkingDirectory(messages: ConversationMessage[]): string | undefined {
  // Look for cwd in messages (usually in the first message)
  for (const msg of messages) {
    if (msg.cwd) {
      return msg.cwd;
    }
  }
  return undefined;
}

/**
 * Determines if a session is actively processing
 * @param messages Recent messages
 * @param lastModified Timestamp of last file modification
 * @returns True if the session appears active
 */
export function isSessionActive(messages: ConversationMessage[], lastModified: number): boolean {
  const now = Date.now();
  const ageMs = now - lastModified;

  // Consider active if modified in the last 60 minutes
  const sixtyMinutesMs = 60 * 60 * 1000;
  if (ageMs < sixtyMinutesMs) {
    return true;
  }

  // Or if the last message indicates pending activity
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    const activity = getLatestActivity([lastMsg]);
    return activity.type === 'waiting_input';
  }

  return false;
}

/**
 * Groups sessions by their parent-child relationship
 * @param messages Messages from a session
 * @returns Parent session ID if this is a sub-agent, undefined otherwise
 */
export function findParentSession(messages: ConversationMessage[]): string | undefined {
  // Look for Task tool calls that spawned this session
  for (const msg of messages) {
    if (msg.isSidechain) {
      // This is a sub-agent session, but we need to find the parent
      // The parent info might be in the first message
      if (msg.type === 'system' && msg.message?.content) {
        // Try to extract parent session from system prompt
        // This is implementation-specific and may need adjustment
      }
    }
  }
  return undefined;
}
