import { boundText } from '@/safety/bounded-text';

const ESCAPE = String.fromCharCode(27);
const ANSI_ESCAPE = new RegExp(
  `${ESCAPE}(?:\\][^${String.fromCharCode(7)}]*(?:${String.fromCharCode(7)}|${ESCAPE}\\\\)|\\[[0-?]*[ -/]*[@-~]|[@-_])`,
  'g',
);
const CONTROL_CHARACTERS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
);
const BIDI_CONTROLS =
  /(?:\u202A|\u202B|\u202C|\u202D|\u202E|\u2066|\u2067|\u2068|\u2069|\u200B|\u200C|\u200D|\uFEFF)/gu;

/** Strip terminal control sequences and bound untrusted output before rendering. */
export function sanitizeTerminalText(
  text: string,
  maxBytes: number,
): {
  readonly text: string;
  readonly truncated: boolean;
} {
  const withoutAnsi = text.replace(ANSI_ESCAPE, '');
  const withoutControls = withoutAnsi.replace(CONTROL_CHARACTERS, '').replace(BIDI_CONTROLS, '');
  return boundText(withoutControls, maxBytes);
}

/** Normalize a Herdr terminal title into a safe, readable activity label. */
export function sanitizeTitle(text: string): string {
  return sanitizeTerminalText(text, 512)
    .text.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/gu, '')
    .trim();
}
