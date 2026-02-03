import { readFileSync } from 'fs';
import { watch } from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

let currentConfig: AppConfig | null = null;
const configListeners: ((config: AppConfig) => void)[] = [];

/**
 * Loads the configuration from config.json.
 * Throws an error if the file cannot be read or parsed.
 */
function loadConfigFromFile(): AppConfig {
  const content = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(content) as AppConfig;
}

/**
 * Gets the current configuration.
 * Loads from file if not already loaded.
 */
export function getConfig(): AppConfig {
  if (!currentConfig) {
    currentConfig = loadConfigFromFile();
    console.log('[ConfigLoader] Configuration loaded successfully');
  }
  return currentConfig;
}

/**
 * Registers a listener that will be called whenever the configuration changes.
 * @param listener - Callback function that receives the new configuration
 */
export function onConfigChange(listener: (config: AppConfig) => void): void {
  configListeners.push(listener);
}

/**
 * Removes a previously registered configuration change listener.
 * @param listener - The listener to remove
 */
export function removeConfigListener(listener: (config: AppConfig) => void): void {
  const index = configListeners.indexOf(listener);
  if (index !== -1) {
    configListeners.splice(index, 1);
  }
}

/**
 * Reloads the configuration from file and notifies all listeners.
 */
function reloadConfig(): void {
  try {
    const newConfig = loadConfigFromFile();
    currentConfig = newConfig;
    console.log('[ConfigLoader] Configuration reloaded successfully');

    for (const listener of configListeners) {
      try {
        listener(newConfig);
      } catch (error) {
        console.error('[ConfigLoader] Error in config change listener:', error);
      }
    }
  } catch (error) {
    console.error('[ConfigLoader] Failed to reload configuration:', error);
  }
}

/**
 * Initializes the configuration watcher for hot-reload functionality.
 * Watches the config.json file and reloads on changes.
 */
export function initConfigWatcher(): void {
  // Ensure config is loaded first
  getConfig();

  const watcher = watch(CONFIG_PATH, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', () => {
    console.log('[ConfigLoader] Configuration file changed, reloading...');
    reloadConfig();
  });

  watcher.on('error', (error) => {
    console.error('[ConfigLoader] Watcher error:', error);
  });

  console.log('[ConfigLoader] Configuration watcher initialized');
}

/**
 * Gets a user by their API key.
 * @param key - The API key to look up
 * @returns The user if found, undefined otherwise
 */
export function getUserByKey(key: string): { key: string; displayName: string } | undefined {
  const config = getConfig();
  return config.users.find((user) => user.key === key);
}
