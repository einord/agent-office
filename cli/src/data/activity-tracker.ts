import type { ConversationMessage, ActivityInfo, ActivityType, ToolUse } from '../types.js';
import { TOOL_ACTIVITY_MAP } from '../types.js';

/**
 * Extracts the latest activity from conversation messages
 * @param messages Recent conversation messages
 * @returns Current activity info
 */
export function getLatestActivity(messages: ConversationMessage[]): ActivityInfo {
  // Process messages in reverse order to find the most recent activity
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Check for tool use in message content
    const content = msg.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          const activity = TOOL_ACTIVITY_MAP[block.name];
          if (activity) {
            return {
              ...activity,
              detail: extractToolDetail(block.name, block.input),
            };
          }
          // Unknown tool, show as thinking
          return {
            type: 'thinking',
            toolName: block.name,
          };
        }
      }
    }

    // Check if it's a thinking message (assistant with text content)
    if (msg.message?.role === 'assistant' && msg.type === 'assistant') {
      const hasText = content?.some((block: { type: string }) => block.type === 'text');
      if (hasText) {
        return { type: 'thinking' };
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
      const cmd = input.command as string;
      // Truncate long commands
      return cmd?.length > 50 ? cmd.slice(0, 47) + '...' : cmd;
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
