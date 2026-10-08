export function requestKey() {
  // 当前部署也可能使用 HTTP：randomUUID 只在安全上下文可用，getRandomValues 不受此限制。
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
