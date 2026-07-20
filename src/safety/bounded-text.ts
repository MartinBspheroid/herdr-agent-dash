/** Bound text by UTF-8 bytes while keeping the result valid UTF-8. */
export function boundText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(text);
  if (encoded.byteLength <= maxBytes) {
    return { text, truncated: false };
  }
  const decoder = new TextDecoder();
  let end = Math.max(0, maxBytes);
  let boundedText = decoder.decode(encoded.slice(0, end));
  while (new TextEncoder().encode(boundedText).byteLength > maxBytes && end > 0) {
    end -= 1;
    boundedText = decoder.decode(encoded.slice(0, end));
  }
  return { text: boundedText, truncated: true };
}

/** Bound a path or label by characters and mark truncation for display. */
export function truncateText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }
  if (maxCharacters < 2) {
    return '…'.slice(0, maxCharacters);
  }
  return `${text.slice(0, maxCharacters - 1)}…`;
}

/** Shorten an absolute path to its final directory segments without losing its root marker. */
export function compactPath(path: string, maxSegments: number): string {
  const segments = path.split(/[\\/]+/u).filter((segment) => segment.length > 0);
  if (segments.length <= maxSegments) return path;
  return `…/${segments.slice(-Math.max(1, maxSegments)).join('/')}`;
}
