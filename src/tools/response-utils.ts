/**
 * Known server-side prefixes to strip from output paths.
 * Sorted longest-first so the most specific prefix matches first.
 * Configured at startup via configureSanitiser().
 */
let knownPrefixes: string[] = [];

/**
 * Configure the path sanitiser with server-side directory prefixes.
 * All paths starting with any of these prefixes will be stripped to
 * relative Joomla source paths in tool output.
 *
 * Call once at startup after sync config is available.
 */
export function configureSanitiser(prefixes: string[]): void {
  // Normalise to forward slashes, ensure trailing slash, sort longest-first
  knownPrefixes = prefixes
    .map(p => {
      let norm = p.replace(/\\/g, '/');
      if (!norm.endsWith('/')) norm += '/';
      return norm;
    })
    .sort((a, b) => b.length - a.length);
}

/**
 * Strip server-side directory prefixes from file paths in tool output.
 * Turns absolute server paths into relative Joomla source paths.
 *
 * Uses the prefixes registered via configureSanitiser(). Also handles
 * Windows-style backslash paths and the legacy /cache/libraries/ marker
 * as a fallback.
 */
export function sanitisePath(filePath: string): string {
  // Normalise backslashes for consistent matching
  const normalised = filePath.replace(/\\/g, '/');

  // Try configured prefixes (longest-first)
  for (const prefix of knownPrefixes) {
    if (normalised.startsWith(prefix)) {
      return normalised.substring(prefix.length);
    }
  }

  // Fallback: legacy marker for unconfigured usage (e.g. tests, standalone)
  const marker = '/cache/libraries/';
  const idx = normalised.indexOf(marker);
  if (idx !== -1) {
    return normalised.substring(idx + marker.length);
  }

  return normalised;
}

/**
 * Truncate a response string to a maximum character count.
 * Cuts at the nearest newline boundary to avoid breaking markdown formatting.
 * Appends a hint if truncation occurred.
 */
export function truncateResponse(text: string, maxChars: number = 20_000): string {
  if (text.length <= maxChars) return text;

  // Find the last newline before the limit
  const cutoff = text.lastIndexOf('\n', maxChars);
  const truncated = cutoff > 0 ? text.substring(0, cutoff) : text.substring(0, maxChars);

  return truncated + '\n\n---\n*Response truncated. Use filters or parameters to narrow results.*';
}
