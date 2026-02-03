import { exec } from 'child_process';
import { promisify } from 'util';
import type { ClaudeProcess } from '../types.js';

const execAsync = promisify(exec);

/**
 * Scans for running Claude processes using ps command
 * @returns Array of found Claude processes
 */
export async function scanClaudeProcesses(): Promise<ClaudeProcess[]> {
  try {
    // Use ps to find claude processes
    const { stdout } = await execAsync('ps aux | grep -i "[c]laude" || true');

    const processes: ClaudeProcess[] = [];
    const lines = stdout.trim().split('\n').filter(line => line.length > 0);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND...
      const pid = parseInt(parts[1], 10);
      const cpu = parseFloat(parts[2]);
      const mem = parseFloat(parts[3]);
      const command = parts.slice(10).join(' ');

      // Skip grep processes and non-claude processes
      if (command.includes('grep') || !command.toLowerCase().includes('claude')) {
        continue;
      }

      processes.push({
        pid,
        ppid: 0, // Will be populated if needed
        cpu,
        mem,
        command,
      });
    }

    return processes;
  } catch (error) {
    // No processes found or error
    return [];
  }
}

/**
 * Gets open files for Claude processes using lsof
 * @returns Map of PID to array of open file paths
 */
export async function getOpenSessionFiles(): Promise<Map<number, string[]>> {
  const fileMap = new Map<number, string[]>();

  try {
    const { stdout } = await execAsync('lsof -c claude 2>/dev/null || true');
    const lines = stdout.trim().split('\n').filter(line => line.length > 0);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) continue;

      const pid = parseInt(parts[1], 10);
      const filePath = parts[parts.length - 1];

      // Only track .jsonl session files
      if (filePath.includes('.claude') && filePath.endsWith('.jsonl')) {
        const existing = fileMap.get(pid) || [];
        existing.push(filePath);
        fileMap.set(pid, existing);
      }
    }
  } catch (error) {
    // lsof failed or no open files
  }

  return fileMap;
}

/**
 * Matches processes to their session files
 * @param processes Claude processes
 * @param openFiles Map of PID to open files
 * @returns Map of session file path to PID
 */
export function matchProcessesToSessions(
  processes: ClaudeProcess[],
  openFiles: Map<number, string[]>
): Map<string, number> {
  const sessionToPid = new Map<string, number>();

  for (const process of processes) {
    const files = openFiles.get(process.pid);
    if (files) {
      for (const file of files) {
        sessionToPid.set(file, process.pid);
      }
    }
  }

  return sessionToPid;
}
