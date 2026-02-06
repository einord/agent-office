let canCount = 0;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let lastTriggeredHour = -1;
let broadcastCleaningFn: (() => void) | null = null;

const CLEANING_HOURS = [0, 6, 12, 18];

/**
 * Increments the can counter (called when get_drink is assigned).
 */
export function incrementCanCount(): void {
  canCount++;
}

/**
 * Returns the current can count for sync_complete payloads.
 */
export function getCanCount(): number {
  return canCount;
}

/**
 * Initializes the cleaning service with a broadcast callback.
 * Checks every 30 seconds if it's time to trigger cleaning.
 */
export function initCleaningService(broadcastFn: () => void): void {
  broadcastCleaningFn = broadcastFn;

  // Set lastTriggeredHour to current hour to avoid immediate trigger on startup
  lastTriggeredHour = new Date().getHours();

  checkInterval = setInterval(() => {
    const currentHour = new Date().getHours();

    if (CLEANING_HOURS.includes(currentHour) && lastTriggeredHour !== currentHour) {
      lastTriggeredHour = currentHour;

      if (canCount > 0) {
        console.log(`[Cleaning] Triggering cleaning at hour ${currentHour}, canCount=${canCount}`);
        canCount = 0;
        broadcastCleaningFn?.();
      } else {
        console.log(`[Cleaning] Skipping cleaning at hour ${currentHour}, no cans to clean`);
      }
    }
  }, 30000);

  console.log('[Cleaning] Service initialized');
}

/**
 * Stops the cleaning service.
 */
export function stopCleaningService(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  broadcastCleaningFn = null;
  console.log('[Cleaning] Service stopped');
}
