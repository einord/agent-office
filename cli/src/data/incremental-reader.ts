import { stat, open } from 'fs/promises';
import { createReadStream } from 'fs';
import type { ConversationMessage } from '../types.js';

/**
 * Tracks file read positions for incremental reading of JSONL files.
 * This dramatically improves performance for large conversation files
 * by only reading new content since the last read.
 */
export class IncrementalReader {
  /** Map of file path to last read byte position */
  private filePositions: Map<string, number> = new Map();

  /** Map of file path to cached messages (accumulated over time) */
  private messageCache: Map<string, ConversationMessage[]> = new Map();

  /** Maximum number of messages to keep in cache per file */
  private maxCachedMessages: number;

  /**
   * Creates a new IncrementalReader instance.
   * @param maxCachedMessages Maximum messages to keep in memory per file (default: 200)
   */
  constructor(maxCachedMessages: number = 200) {
    this.maxCachedMessages = maxCachedMessages;
  }

  /**
   * Reads new lines from a JSONL file since the last read position.
   * On first read, reads from the beginning of the file.
   * @param filePath Path to the JSONL file
   * @returns Array of newly parsed conversation messages
   */
  async readNewLines(filePath: string): Promise<ConversationMessage[]> {
    try {
      const stats = await stat(filePath);
      const currentSize = stats.size;
      const lastPosition = this.filePositions.get(filePath) || 0;

      // If file hasn't grown, return empty array
      if (currentSize <= lastPosition) {
        // File might have been truncated/replaced - reset position
        if (currentSize < lastPosition) {
          this.filePositions.set(filePath, 0);
          this.messageCache.delete(filePath);
          return this.readNewLines(filePath);
        }
        return [];
      }

      // Read only the new content
      const newContent = await this.readFromPosition(filePath, lastPosition, currentSize);
      this.filePositions.set(filePath, currentSize);

      // Parse the new lines
      const newMessages = this.parseJsonlContent(newContent);

      // Update cache with new messages
      this.updateCache(filePath, newMessages);

      return newMessages;
    } catch (error) {
      // File doesn't exist or can't be read
      return [];
    }
  }

  /**
   * Gets all cached messages for a file, including any new messages.
   * This is the main method to use for getting recent messages.
   * @param filePath Path to the JSONL file
   * @param maxMessages Maximum number of recent messages to return
   * @returns Array of conversation messages (most recent last)
   */
  async getRecentMessages(filePath: string, maxMessages: number = 100): Promise<ConversationMessage[]> {
    // First, read any new lines
    await this.readNewLines(filePath);

    // Return cached messages (limited to maxMessages)
    const cached = this.messageCache.get(filePath) || [];
    return cached.slice(-maxMessages);
  }

  /**
   * Forces a full re-read of a file (useful for initialization or recovery).
   * @param filePath Path to the JSONL file
   * @param maxLines Maximum number of lines to read from the end
   * @returns Array of conversation messages
   */
  async fullRead(filePath: string, maxLines: number = 100): Promise<ConversationMessage[]> {
    // Reset position to force full read
    this.filePositions.delete(filePath);
    this.messageCache.delete(filePath);

    try {
      const stats = await stat(filePath);

      // For full read, we need to read from the end
      // This is more complex but necessary for initial reads of large files
      const content = await this.readTailContent(filePath, stats.size, maxLines);
      const messages = this.parseJsonlContent(content);

      // Update position to current size
      this.filePositions.set(filePath, stats.size);
      this.messageCache.set(filePath, messages);

      return messages;
    } catch (error) {
      return [];
    }
  }

  /**
   * Reads content from a specific byte position.
   * @param filePath Path to the file
   * @param startPosition Starting byte position
   * @param endPosition Ending byte position
   * @returns Content string
   */
  private async readFromPosition(
    filePath: string,
    startPosition: number,
    endPosition: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      const stream = createReadStream(filePath, {
        start: startPosition,
        end: endPosition - 1,
        encoding: 'utf8',
      });

      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      stream.on('error', reject);
    });
  }

  /**
   * Reads the tail content of a file by reading from the end.
   * @param filePath Path to the file
   * @param fileSize Total file size
   * @param maxLines Maximum lines to read
   * @returns Content string containing the last N lines
   */
  private async readTailContent(
    filePath: string,
    fileSize: number,
    maxLines: number
  ): Promise<string> {
    // For very large files, we estimate where to start reading
    // Average JSONL line is ~2KB, so for 100 lines we start at ~200KB from end
    const estimatedBytesPerLine = 2048;
    const estimatedStartPosition = Math.max(0, fileSize - maxLines * estimatedBytesPerLine);

    let content: string;

    if (estimatedStartPosition > 0) {
      // Read from estimated position
      content = await this.readFromPosition(filePath, estimatedStartPosition, fileSize);

      // Find the first complete line (skip partial first line)
      const firstNewline = content.indexOf('\n');
      if (firstNewline > 0) {
        content = content.slice(firstNewline + 1);
      }
    } else {
      // File is small enough to read entirely
      content = await this.readFromPosition(filePath, 0, fileSize);
    }

    // Now take only the last N lines
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const tailLines = lines.slice(-maxLines);

    return tailLines.join('\n');
  }

  /**
   * Parses JSONL content into conversation messages.
   * @param content Raw JSONL content
   * @returns Array of parsed messages
   */
  private parseJsonlContent(content: string): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      try {
        const parsed = JSON.parse(trimmed);
        messages.push(parsed);
      } catch {
        // Skip invalid JSON lines
      }
    }

    return messages;
  }

  /**
   * Updates the message cache for a file with new messages.
   * @param filePath Path to the file
   * @param newMessages New messages to add
   */
  private updateCache(filePath: string, newMessages: ConversationMessage[]): void {
    const existing = this.messageCache.get(filePath) || [];
    const combined = [...existing, ...newMessages];

    // Keep only the most recent messages
    const trimmed = combined.slice(-this.maxCachedMessages);
    this.messageCache.set(filePath, trimmed);
  }

  /**
   * Clears the cache and position tracking for a specific file.
   * @param filePath Path to the file
   */
  clearFile(filePath: string): void {
    this.filePositions.delete(filePath);
    this.messageCache.delete(filePath);
  }

  /**
   * Removes cached data for files not in the provided set.
   * @param activeFilePaths Set of file paths that are still active
   */
  retainOnly(activeFilePaths: Set<string>): void {
    for (const filePath of this.filePositions.keys()) {
      if (!activeFilePaths.has(filePath)) {
        this.filePositions.delete(filePath);
        this.messageCache.delete(filePath);
      }
    }
  }

  /**
   * Clears all cached data.
   */
  clearAll(): void {
    this.filePositions.clear();
    this.messageCache.clear();
  }

  /**
   * Gets the current byte position for a file.
   * @param filePath Path to the file
   * @returns Current position or 0 if not tracked
   */
  getPosition(filePath: string): number {
    return this.filePositions.get(filePath) || 0;
  }

  /**
   * Gets the number of cached messages for a file.
   * @param filePath Path to the file
   * @returns Number of cached messages
   */
  getCachedCount(filePath: string): number {
    return this.messageCache.get(filePath)?.length || 0;
  }
}

/** Singleton instance for global use */
let globalReader: IncrementalReader | null = null;

/**
 * Gets or creates the global IncrementalReader instance.
 * @returns The global IncrementalReader
 */
export function getIncrementalReader(): IncrementalReader {
  if (!globalReader) {
    globalReader = new IncrementalReader();
  }
  return globalReader;
}

/**
 * Resets the global IncrementalReader instance.
 * Useful for testing or when restarting the monitor.
 */
export function resetIncrementalReader(): void {
  if (globalReader) {
    globalReader.clearAll();
  }
  globalReader = null;
}
