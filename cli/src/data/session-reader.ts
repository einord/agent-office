import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import type { SessionIndex, ConversationMessage, TokenUsage } from '../types.js';
import { getIncrementalReader } from './incremental-reader.js';

/** Default claude directory path */
let claudeDir = join(homedir(), '.claude');

/**
 * Sets the claude directory path for all session operations.
 * @param dir The directory path to use
 */
export function setClaudeDir(dir: string): void {
  claudeDir = dir;
}

/**
 * Gets the current claude directory path.
 * @returns The claude directory path
 */
export function getClaudeDir(): string {
  return claudeDir;
}

/**
 * Gets the projects directory path.
 * @returns The projects directory path
 */
function getProjectsDir(): string {
  return join(claudeDir, 'projects');
}

/**
 * Gets all project directories in ~/.claude/projects
 * @returns Array of project directory paths
 */
export async function getProjectDirs(): Promise<string[]> {
  try {
    const projectsDir = getProjectsDir();
    const entries = await readdir(projectsDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => join(projectsDir, entry.name));
  } catch (error) {
    return [];
  }
}

interface SessionIndexResult {
  entries: SessionIndex[];
  originalPath?: string;
}

/**
 * Reads session index from a project directory
 * @param projectDir Project directory path
 * @returns Session index entries and original path
 */
export async function readSessionIndex(projectDir: string): Promise<SessionIndexResult> {
  const indexPath = join(projectDir, 'sessions-index.json');

  try {
    const content = await readFile(indexPath, 'utf-8');
    const data = JSON.parse(content);

    // sessions-index.json can be an array or have an entries field
    const originalPath = data.originalPath;
    const projectPath = originalPath || decodeProjectPath(basename(projectDir));

    // Handle { version, entries: [...] } format
    if (data.entries && Array.isArray(data.entries)) {
      return {
        entries: data.entries.map((session: SessionIndex) => ({
          ...session,
          projectPath,
        })),
        originalPath,
      };
    }

    // Handle direct array format
    if (Array.isArray(data)) {
      return {
        entries: data.map((session: SessionIndex) => ({
          ...session,
          projectPath,
        })),
        originalPath,
      };
    }

    return { entries: [], originalPath };
  } catch (error) {
    return { entries: [] };
  }
}

/**
 * Decodes a project path from the directory name format
 * Directory names use - instead of /
 * @param dirName Encoded directory name
 * @returns Decoded path
 */
function decodeProjectPath(dirName: string): string {
  // Format: -Users-name-path-to-project becomes /Users/name/path/to/project
  if (dirName.startsWith('-')) {
    return dirName.replace(/-/g, '/');
  }
  return dirName;
}

/**
 * Finds all .jsonl conversation files in a project directory
 * @param projectDir Project directory path
 * @returns Array of .jsonl file paths sorted by modification time (newest first)
 */
export async function findConversationFiles(projectDir: string): Promise<string[]> {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    const jsonlFiles = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(entry => join(projectDir, entry.name));

    // Get stats and sort by mtime
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async file => {
        const stats = await stat(file);
        return { file, mtime: stats.mtime.getTime() };
      })
    );

    filesWithStats.sort((a, b) => b.mtime - a.mtime);
    return filesWithStats.map(f => f.file);
  } catch (error) {
    return [];
  }
}

/**
 * Reads the last N lines from a .jsonl file using incremental reading.
 * On subsequent calls, only reads new content appended since the last read.
 * @param filePath Path to .jsonl file
 * @param maxLines Maximum number of lines to return
 * @returns Array of parsed conversation messages
 */
export async function readConversationTail(
  filePath: string,
  maxLines: number = 50
): Promise<ConversationMessage[]> {
  try {
    const reader = getIncrementalReader();
    return await reader.getRecentMessages(filePath, maxLines);
  } catch (error) {
    return [];
  }
}

/**
 * Forces a full re-read of a conversation file (bypasses incremental cache).
 * Use this for initial reads or when you suspect the cache is stale.
 * @param filePath Path to .jsonl file
 * @param maxLines Maximum number of lines to read from the end
 * @returns Array of parsed conversation messages
 */
export async function readConversationFull(
  filePath: string,
  maxLines: number = 100
): Promise<ConversationMessage[]> {
  try {
    const reader = getIncrementalReader();
    return await reader.fullRead(filePath, maxLines);
  } catch (error) {
    return [];
  }
}

/**
 * Calculates total token usage from conversation messages
 * @param messages Conversation messages
 * @returns Total token usage
 */
export function calculateTokenUsage(messages: ConversationMessage[]): TokenUsage {
  const total: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  for (const msg of messages) {
    const usage = msg.message?.usage;
    if (usage) {
      total.input_tokens += usage.input_tokens || 0;
      total.output_tokens += usage.output_tokens || 0;
      total.cache_creation_input_tokens = (total.cache_creation_input_tokens ?? 0) + (usage.cache_creation_input_tokens || 0);
      total.cache_read_input_tokens = (total.cache_read_input_tokens ?? 0) + (usage.cache_read_input_tokens || 0);
    }
  }

  return total;
}

/**
 * Gets the session file path for a session ID in a project directory
 * @param projectDir Project directory path
 * @param sessionId Session ID
 * @returns Full path to the .jsonl file
 */
export function getSessionFilePath(projectDir: string, sessionId: string): string {
  return join(projectDir, `${sessionId}.jsonl`);
}

/**
 * Gets all active sessions across all projects
 * @returns Map of session ID to session info with project path
 */
export async function getAllSessions(): Promise<Map<string, SessionIndex & { projectDir: string; filePath: string }>> {
  const sessions = new Map();
  const projectDirs = await getProjectDirs();

  for (const projectDir of projectDirs) {
    const { entries: indexEntries, originalPath } = await readSessionIndex(projectDir);
    const conversationFiles = await findConversationFiles(projectDir);

    // Create a map of known sessions from index
    const indexMap = new Map<string, SessionIndex>();
    for (const entry of indexEntries) {
      indexMap.set(entry.sessionId, entry);
    }

    // Process all .jsonl files (including those not in index)
    for (const filePath of conversationFiles) {
      // Extract session ID from filename
      const fileName = basename(filePath);
      const sessionId = fileName.replace('.jsonl', '');

      // Check if the session file was recently modified
      try {
        const stats = await stat(filePath);
        const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);

        // Only include sessions modified in the last 60 minutes
        if (ageMinutes <= 60) {
          // Use index entry if available, otherwise use originalPath from index
          const indexEntry = indexMap.get(sessionId);
          const projectPath = indexEntry?.projectPath || originalPath || projectDir;

          sessions.set(sessionId, {
            sessionId,
            slug: indexEntry?.slug || sessionId.slice(0, 8),
            projectPath,
            gitBranch: indexEntry?.gitBranch,
            firstPrompt: indexEntry?.firstPrompt,
            summary: indexEntry?.summary,
            projectDir,
            filePath,
            lastModified: stats.mtime.getTime(),
          });
        }
      } catch {
        // File doesn't exist or can't be read, skip
      }
    }
  }

  return sessions;
}
