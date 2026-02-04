import { readFileSync, existsSync, statSync } from 'fs';
import { watch } from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Determines the config file path.
 * Priority: CONFIG_PATH env var > ./config.json (cwd) > ../../config.json (relative to dist)
 */
function getConfigPath(): string {
  // Check environment variable first
  if (process.env.CONFIG_PATH) {
    return path.resolve(process.env.CONFIG_PATH);
  }

  // Check current working directory
  const cwdConfig = path.resolve(process.cwd(), 'config.json');
  if (existsSync(cwdConfig) && statSync(cwdConfig).isFile()) {
    return cwdConfig;
  }

  // Fall back to relative path from dist folder
  return path.resolve(__dirname, '../../config.json');
}

const CONFIG_PATH = getConfigPath();

let currentConfig: AppConfig | null = null;
const configListeners: ((config: AppConfig) => void)[] = [];

/**
 * Loads the configuration from config.json.
 * Throws an error if the file cannot be read or parsed.
 */
function loadConfigFromFile(): AppConfig {
  // Check if path exists and is a file
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Configuration file not found: ${CONFIG_PATH}\n` +
      `Please create a config.json file or set CONFIG_PATH environment variable.\n` +
      `See config.example.json for the required format.`
    );
  }

  const stats = statSync(CONFIG_PATH);
  if (!stats.isFile()) {
    throw new Error(
      `Configuration path is not a file: ${CONFIG_PATH}\n` +
      `This usually happens when Docker creates an empty directory because the source file doesn't exist.\n` +
      `Make sure config.json exists on the host before starting the container.`
    );
  }

  const content = readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(content) as Partial<AppConfig>;

  // Apply defaults for optional fields
  return {
    ...config,
    inactivityTimeoutSeconds: config.inactivityTimeoutSeconds ?? 60,
  } as AppConfig;
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
