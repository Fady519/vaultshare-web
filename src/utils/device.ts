// "Windows · Edge 141" from a user agent string, for the sign-in context cells
export function describeDevice(ua = navigator.userAgent) {
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua) && !/Mobile/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS'

  const browsers: [RegExp, string][] = [
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ]
  for (const [re, name] of browsers) {
    const m = ua.match(re)
    if (m) return `${os} · ${name} ${m[1]}`
  }
  return os
}
