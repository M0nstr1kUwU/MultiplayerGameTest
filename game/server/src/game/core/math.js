export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance2 = (a, b) => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
export function randomId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
