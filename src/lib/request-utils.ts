export function cleanText(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
