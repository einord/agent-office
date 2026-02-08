import type { ConversationMessage, ActivityInfo, ActivityType, ToolUse } from '../types.js';
import { TOOL_ACTIVITY_MAP } from '../types.js';

/** Timeout in ms after which an inactive session is considered "done" */
const ACTIVITY_TIMEOUT_MS = 30_000; // 30 seconds

/** Max timeout for "waiting for input" sessions - after this, consider abandoned */
const WAITING_INPUT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Tools that wait for user input */
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
export function getLatestActivity(messages: ConversationMessage[], lastModified?: number, hasPid?: boolean): ActivityInfo {
  const timeSinceModified = lastModified ? Date.now() - lastModified : 0;
  const isStale = timeSinceModified > ACTIVITY_TIMEOUT_MS;
  const staleType: ActivityType = hasPid ? 'idle' : 'done';

  // First, check if the very last message is a user response (not tool_result)
  // This means user has answered a question and Claude should be processing
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.type === 'user' && lastMsg.message?.role === 'user') {
      const content = lastMsg.message?.content;
      // User sent a plain text message - Claude should be processing it
      if (typeof content === 'string') {
        if (isStale) {
          return { type: staleType };
        }
        return { type: 'thinking' };
      }
      if (Array.isArray(content)) {
        const hasToolResult = content.some((block: { type: string }) => block.type === 'tool_result');
        if (hasToolResult) {
          // Last message is a tool_result - Claude hasn't responded yet, must still be processing
          return { type: 'thinking' };
        }
        // User sent a message that's not a tool_result - they answered a question
        if (isStale) {
          return { type: staleType };
        }
        return { type: 'thinking' };
      }
    }
  }

  // Process messages in reverse order to find the most recent activity
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Check for tool use in message content
    const content = msg.message?.content;
    if (Array.isArray(content)) {
      // Check if this message has tool_use
      const toolUseBlock = content.find((block: { type: string }) => block.type === 'tool_use');
      if (toolUseBlock && toolUseBlock.name) {
        // Tools that wait for user input
        if (USER_INPUT_TOOLS.has(toolUseBlock.name)) {
          // But first check if there's a user response after this message
          const msgIndex = i;
          const hasUserResponseAfter = messages.slice(msgIndex + 1).some(m =>
            m.type === 'user' && m.message?.role === 'user'
          );

          if (hasUserResponseAfter) {
            // User already responded, Claude should be processing
            if (isStale) {
              return { type: staleType };
            }
            return { type: 'thinking' };
          }

          // If waiting too long, consider the session abandoned
          if (timeSinceModified > WAITING_INPUT_TIMEOUT_MS) {
            return { type: 'done' };
          }

          return {
            type: 'waiting_input',
            toolName: toolUseBlock.name,
            detail: extractToolDetail(toolUseBlock.name, toolUseBlock.input),
          };
        }

        // If stale and has tool_use, it might be waiting for result or done
        if (isStale) {
          return { type: staleType };
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
          return { type: staleType };
        }

        if (hasText) {
          // Has text but also tool_use - still thinking
          if (isStale) {
            return { type: staleType };
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
            return { type: staleType };
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
 * Detects if a session is a sidechain (sub-agent) based on its messages.
 * A session is considered a sidechain if any of its messages have isSidechain: true.
 * @param messages Conversation messages
 * @returns True if this is a sidechain session
 */
export function detectSidechain(messages: ConversationMessage[]): boolean {
  return messages.some(msg => msg.isSidechain === true);
}

/**
 * Extracts Task tool spawns from messages.
 * These represent sub-agents that were spawned by this session.
 * @param messages Conversation messages
 * @returns Array of Task tool use info with descriptions
 */
export function extractTaskSpawns(messages: ConversationMessage[]): Array<{
  toolUseId: string;
  description: string;
  subagentType?: string;
}> {
  const spawns: Array<{ toolUseId: string; description: string; subagentType?: string }> = [];

  for (const msg of messages) {
    const content = msg.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'Task') {
        const input = block.input as Record<string, unknown> | undefined;
        if (input && block.id) {
          spawns.push({
            toolUseId: block.id,
            description: (input.description as string) || 'Unknown task',
            subagentType: input.subagent_type as string | undefined,
          });
        }
      }
    }
  }

  return spawns;
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

  // Consider active if modified in the last 12 hours
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  if (ageMs < twelveHoursMs) {
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
