/**
 * Formatting utilities for display.
 */

/**
 * Format raw bytes into a human-readable string.
 * e.g. 1_048_576 → "1.00 MB"
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Calculate reduction percentage between two sizes.
 * e.g. original=100, compressed=49 → 51.00
 */
export function reductionPercent(original: number, compressed: number): number {
  if (original === 0) return 0;
  return ((original - compressed) / original) * 100;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Compute target output size in bytes from original size and percentage.
 */
export function computeTargetSize(originalBytes: number, pct: number): number {
  return Math.round(originalBytes * (pct / 100));
}
