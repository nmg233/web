export function returnContext(value, fallback) {
  if (typeof value !== 'string') return fallback;
  if(!value.startsWith('/')||value.startsWith('//')||value.includes('\\')||Array.from(value).some(char=>char.charCodeAt(0)<=32))return fallback;
  const path = value.split('?')[0];
  return /^\/(dashboard|admin\/(?:organization|teaching)|mentor\/requests|observer\/students(?:\/\d+)?|mentor\/reviews|courses\/\d+)$/.test(path) ? value : fallback;
}
