/*
  Line counts for the version "change summary". Runs after both versions
  are decrypted in this tab, the server never sees either side.
  Plain LCS; for very long files it falls back to counting lines as a
  multiset, which is close enough for a summary.
*/

const MAX_CELLS = 4_000_000

export type LineDiff = { added: number; removed: number; unchanged: number }

export function lineDiff(before: string, after: string): LineDiff {
  const a = splitLines(before)
  const b = splitLines(after)

  if (a.length * b.length > MAX_CELLS) return roughDiff(a, b)

  // one row of the LCS table at a time
  let prev = new Uint32Array(b.length + 1)
  let row = new Uint32Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1])
    }
    ;[prev, row] = [row, prev]
  }
  const same = prev[b.length]
  return { added: b.length - same, removed: a.length - same, unchanged: same }
}

function splitLines(text: string) {
  if (!text) return []
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
}

function roughDiff(a: string[], b: string[]): LineDiff {
  const counts = new Map<string, number>()
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1)
  let same = 0
  for (const line of b) {
    const n = counts.get(line) ?? 0
    if (n > 0) {
      same++
      counts.set(line, n - 1)
    }
  }
  return { added: b.length - same, removed: a.length - same, unchanged: same }
}
