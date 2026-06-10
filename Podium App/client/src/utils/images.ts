export function getSafeImageUrl(src?: string | null) {
  if (!src) return undefined;

  if (src.startsWith('/')) return src;

  try {
    const url = new URL(src);
    return url.protocol === 'https:' ? src : undefined;
  } catch {
    return undefined;
  }
}
