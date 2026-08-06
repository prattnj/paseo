// Deterministic integer hash — used for all "variety" so the city is
// identical on every load. No Math.random anywhere in the project.
export function hash(a, b = 0, c = 0) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  h = (h ^ (h >>> 13)) | 0;
  h = (h * 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

// Pick an element of arr deterministically from hash inputs.
export function pick(arr, a, b = 0, c = 0) {
  return arr[hash(a, b, c) % arr.length];
}

// Deterministic float in [0, 1).
export function frac(a, b = 0, c = 0) {
  return hash(a, b, c) / 4294967296;
}

// Deterministic float in [lo, hi).
export function range(lo, hi, a, b = 0, c = 0) {
  return lo + (hi - lo) * frac(a, b, c);
}
