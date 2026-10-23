// "Mozilla/5.0 (Windows NT 10.0…) Chrome/128…" -> { browser: 'Chrome 128', os: 'Windows' }
export function describeAgent(ua: string) {
  const browser =
    match(ua, /Edg\/(\d+)/, 'Edge') ??
    match(ua, /Firefox\/(\d+)/, 'Firefox') ??
    match(ua, /Chrome\/(\d+)/, 'Chrome') ??
    match(ua, /Version\/(\d+).*Safari/, 'Safari') ??
    'Unknown browser'
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Unknown OS'
  return { browser, os }
}

function match(ua: string, re: RegExp, name: string) {
  const m = ua.match(re)
  return m ? `${name} ${m[1]}` : null
}
