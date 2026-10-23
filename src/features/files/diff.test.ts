import { describe, expect, it } from 'vitest'
import { lineDiff } from './diff'

describe('lineDiff', () => {
  it('counts added and removed lines', () => {
    const before = 'a\nb\nc\nd\n'
    const after = 'a\nB\nc\nd\ne\n'
    expect(lineDiff(before, after)).toEqual({ added: 2, removed: 1, unchanged: 3 })
  })

  it('treats crlf and a trailing newline the same', () => {
    expect(lineDiff('x\r\ny\r\n', 'x\ny')).toEqual({ added: 0, removed: 0, unchanged: 2 })
  })

  it('handles empty sides', () => {
    expect(lineDiff('', 'one\ntwo')).toEqual({ added: 2, removed: 0, unchanged: 0 })
    expect(lineDiff('one', '')).toEqual({ added: 0, removed: 1, unchanged: 0 })
  })

  it('falls back to a rough count for huge files', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const changed = [...big.slice(0, 2990), 'new 1', 'new 2'].join('\n')
    const r = lineDiff(big.join('\n'), changed)
    expect(r).toEqual({ added: 2, removed: 10, unchanged: 2990 })
  })
})
