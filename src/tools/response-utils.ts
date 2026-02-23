/**
 * Strip the local cache directory prefix from file paths in tool output.
 * Turns absolute server paths into relative Joomla source paths.
 * e.g. /home/user/mcp/cache/libraries/libraries/src/Foo.php → libraries/src/Foo.php
 */
export function sanitisePath(filePath: string): string {
  const marker = '/cache/libraries/';
  const idx = filePath.indexOf(marker);
  if (idx !== -1) {
    return filePath.substring(idx + marker.length);
  }
  return filePath;
}

/**
 * Truncate a response string to a maximum character count.
 * Cuts at the nearest newline boundary to avoid breaking markdown formatting.
 * Appends a hint if truncation occurred.
 */
export function truncateResponse(text: string, maxChars: number = 50_000): string {
  if (text.length <= maxChars) return text;

  // Find the last newline before the limit
  const cutoff = text.lastIndexOf('\n', maxChars);
  const truncated = cutoff > 0 ? text.substring(0, cutoff) : text.substring(0, maxChars);

  return truncated + '\n\n---\n*Response truncated. Use filters or parameters to narrow results.*';
}
