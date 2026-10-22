const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  let i = 0
  let value = bytes
  while (value >= 1024 && i < UNITS.length - 1) {
    value /= 1024
    i++
  }
  const digits = value >= 100 || i === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${UNITS[i]}`
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "14 Jan 2026"
export function formatDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// "09:15"
export function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// same wording as the vault list in figma: "2h ago", "Yesterday", "3 days ago", "12 Jan"
export function timeAgo(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// "Maya Okafor" -> "Maya O."
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

// "a1f7c2...8c" style, used for hashes and fingerprints in lists
export function shortHash(hex: string, head = 4, tail = 2) {
  if (hex.length <= head + tail) return hex
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`
}
