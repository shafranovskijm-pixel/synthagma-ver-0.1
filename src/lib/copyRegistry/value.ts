export function sameCopyValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameCopyValue(v, b[i]));
  return !!a && !!b && typeof a === 'object' && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(key => Object.prototype.hasOwnProperty.call(b, key) && sameCopyValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
