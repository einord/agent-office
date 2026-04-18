import type { ActivityType } from '../types.js';
import type { EventActivity } from './client.js';

/**
 * Maps a CLI activity type to the backend's activity vocabulary.
 * Mirrors the mapping in sync/server-client.ts but kept here so the
 * event-mode bundle doesn't pull in the full sync client.
 */
export function mapActivity(activity: ActivityType): EventActivity {
  switch (activity) {
    case 'reading': return 'reading';
    case 'writing': return 'writing';
    case 'running_command': return 'working';
    case 'spawning_agent': return 'working';
    case 'searching': return 'reading';
    case 'waiting_input': return 'waiting';
    case 'thinking': return 'thinking';
    case 'done': return 'done';
    case 'idle': return 'idle';
    default: return 'idle';
  }
}

/** Swedish label for the status line displayed in the terminal */
export function activityLabelSv(activity: EventActivity): string {
  switch (activity) {
    case 'thinking': return 'Tänker';
    case 'working': return 'Jobbar';
    case 'coding': return 'Kodar';
    case 'reading': return 'Läser';
    case 'writing': return 'Skriver';
    case 'done': return 'Klar';
    case 'idle': return 'Inaktiv';
    case 'waiting': return 'Väntar på svar';
    case 'paused': return 'Pausad';
    case 'leaving': return 'Lämnar';
    case 'offline': return 'Offline';
    case 'disconnected': return 'Frånkopplad';
    default: return activity;
  }
}
