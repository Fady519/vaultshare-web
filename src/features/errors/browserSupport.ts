/*
  Everything is encrypted in the browser, so a browser without these simply
  can't use VaultShare. We refuse instead of falling back to weaker crypto.
*/
export function missingFeatures() {
  const missing: string[] = []
  if (!window.isSecureContext) missing.push('secure context')
  if (!globalThis.crypto?.subtle) missing.push('Web Crypto (crypto.subtle)')
  if (!globalThis.crypto?.getRandomValues) missing.push('a secure random generator')
  if (typeof WebAssembly !== 'object') missing.push('WebAssembly (for Argon2id)')
  if (typeof Worker !== 'function') missing.push('Web Workers')
  return missing
}
