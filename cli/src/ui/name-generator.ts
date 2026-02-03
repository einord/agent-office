/**
 * Syllable parts for generating names
 */
const ONSETS = [
  'b', 'br', 'c', 'ch', 'd', 'dr', 'f', 'fr', 'g', 'gr',
  'h', 'j', 'k', 'kr', 'l', 'm', 'n', 'p', 'pr', 'qu',
  'r', 's', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'str',
  't', 'th', 'tr', 'v', 'w', 'z'
];

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'au', 'ea', 'ei', 'io', 'ou'];

const CODAS = [
  '', 'b', 'd', 'f', 'g', 'k', 'l', 'll', 'm', 'n',
  'nd', 'ng', 'nk', 'nt', 'p', 'r', 'rd', 'rk', 'rm', 'rn',
  's', 'sh', 'sk', 'st', 't', 'th', 'x', 'z'
];

/**
 * Simple hash function for strings
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generates a pronounceable name from a session ID
 * @param sessionId The session identifier
 * @returns A generated name like "Brindok" or "Quelami"
 */
export function generateName(sessionId: string): string {
  const hash = hashString(sessionId);

  // Use different parts of the hash for each component
  const syllableCount = 2 + (hash % 2); // 2-3 syllables

  let name = '';
  let h = hash;

  for (let i = 0; i < syllableCount; i++) {
    const onset = ONSETS[h % ONSETS.length];
    h = Math.floor(h / ONSETS.length) || hashString(sessionId + i);

    const vowel = VOWELS[h % VOWELS.length];
    h = Math.floor(h / VOWELS.length) || hashString(sessionId + i + 'v');

    // Only add coda to last syllable or randomly
    const addCoda = i === syllableCount - 1 || (h % 3 === 0);
    const coda = addCoda ? CODAS[h % CODAS.length] : '';
    h = Math.floor(h / CODAS.length) || hashString(sessionId + i + 'c');

    name += onset + vowel + coda;
  }

  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}
