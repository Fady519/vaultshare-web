// registration is refused on a browser that can't do this properly (UC-01 6a),
// we never fall back to something weaker
export function cryptoSupport() {
  const missing: string[] = []
  if (!globalThis.isSecureContext) missing.push('a secure (https) connection')
  if (!globalThis.crypto?.subtle) missing.push('the Web Crypto API')
  if (typeof WebAssembly === 'undefined') missing.push('WebAssembly')
  if (typeof Worker === 'undefined') missing.push('Web Workers')
  return { ok: missing.length === 0, missing }
}
