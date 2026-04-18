import readline from 'readline';

/** Allowed character class in display names */
const NAME_RE = /^[\p{L}\p{N} _.,\-'!?()]+$/u;

const NAME_MAX = 30;

/**
 * Prompts the user for a display name, with retry on invalid input.
 * `defaultValue` is suggested in brackets and accepted on a blank reply.
 */
export async function promptDisplayName(defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const suggestion = defaultValue ? ` [${defaultValue}]` : '';
      const answer = await ask(rl, `Vad heter du?${suggestion} › `);
      const trimmed = answer.trim();
      const candidate = trimmed.length === 0 && defaultValue ? defaultValue : trimmed;

      if (!candidate) {
        process.stdout.write('  Skriv ditt namn (1-30 tecken).\n');
        continue;
      }
      if (candidate.length > NAME_MAX) {
        process.stdout.write(`  För långt namn (max ${NAME_MAX} tecken). Försök igen.\n`);
        continue;
      }
      if (!NAME_RE.test(candidate)) {
        process.stdout.write('  Bara bokstäver, siffror och vanliga tecken är tillåtna.\n');
        continue;
      }

      return candidate;
    }
  } finally {
    rl.close();
  }
}

/**
 * Prompts for a manual server URL, returning null if the user just hits enter.
 */
export async function promptServerUrl(defaultValue?: string): Promise<string | null> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suggestion = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await ask(rl, `Server-adress (t.ex. 192.168.1.20:3100)${suggestion} › `);
    const trimmed = answer.trim();
    const value = trimmed.length === 0 && defaultValue ? defaultValue : trimmed;
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
    return `http://${value.replace(/\/+$/, '')}`;
  } finally {
    rl.close();
  }
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}
