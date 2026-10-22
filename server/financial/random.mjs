export function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
export function normal(next) {
  return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, next()))) * Math.cos(2 * Math.PI * next());
}
export function keyedSeed(seed, draw, key) {
  let hash = (seed ^ Math.imul(draw + 1, 0x9e3779b1)) >>> 0;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
