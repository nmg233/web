export function returnContext(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const path = value.split('?')[0];
  return /^\/(observer\/students(?:\/\d+)?|mentor\/reviews|courses\/\d+)$/.test(path) ? value : fallback;
}
