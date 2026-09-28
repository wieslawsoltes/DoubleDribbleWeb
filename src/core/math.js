/** Pure, deterministic helpers. No browser dependencies. */
export const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function normalized(x, y) {
  const n = Math.hypot(x, y);
  return n > 0.00001 ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1), 0, 1);
  return Math.hypot(p.x-a.x-dx*t, p.y-a.y-dy*t);
}
export class Random {
  constructor(seed = 198709) { this.state = seed >>> 0 || 1; }
  next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
  range(a, b) { return lerp(a, b, this.next()); }
  int(n) { return Math.floor(this.next() * n); }
}
export const COURT = Object.freeze({ width: 480, height: 204, centerY: 102, leftRim: 24, rightRim: 456, rimZ: 26, arc: 112, corner: 86 });
export const TEAMS = Object.freeze([
  { id: 'bos', city: 'BOSTON', short: 'BOS', name: 'Frogs', color: '#24a65a', trim: '#f4f1ce', dark: '#075e32' },
  { id: 'ny', city: 'NEW YORK', short: 'NY', name: 'Eagles', color: '#f4f0d9', trim: '#2161c5', dark: '#a3b2c6' },
  { id: 'chi', city: 'CHICAGO', short: 'CHI', name: 'Ox', color: '#ef5432', trim: '#faf0cf', dark: '#a82d29' },
  { id: 'la', city: 'LOS ANGELES', short: 'LA', name: 'Breakers', color: '#f4b832', trim: '#7756c9', dark: '#ca731d' }
]);
export const LEVELS = Object.freeze([
  { name: 'LEVEL 1', speed: 0.82, accuracy: 0.19, think: 0.20, steal: 0.17 },
  { name: 'LEVEL 2', speed: 0.96, accuracy: 0.10, think: 0.13, steal: 0.30 },
  { name: 'LEVEL 3', speed: 1.04, accuracy: 0.05, think: 0.08, steal: 0.43 }
]);
export function isThreePoint(x, y, rimX) {
  return Math.abs(y - COURT.centerY) > COURT.corner || Math.hypot(x - rimX, y - COURT.centerY) > COURT.arc;
}
export function clockText(seconds) {
  const n = Math.max(0, Math.ceil(seconds - 0.00001));
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export const blankInput = () => ({ x: 0, y: 0, a: false, b: false });
