export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function excerptAround(text: string, keyword: string, radius = 70): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + keyword.length + radius);
  return text.slice(start, end).trim();
}
