import { utf8 } from '@/crypto/encoding'

// small but real files for the demo vaults, so preview and download show something true

function pdfEscape(s: string) {
  return s
    .replace(/[^\x20-\x7e]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrap(text: string, width = 88) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line)
      line = word
    } else {
      line = (line + ' ' + word).trim()
    }
  }
  if (line) lines.push(line)
  return lines
}

// a one-page PDF written by hand: catalog, page, one content stream, two built-in fonts
export function makePdf(
  kicker: string,
  title: string,
  sections: { heading: string; body: string }[],
) {
  const ops: string[] = ['BT', '/F1 9 Tf', '56 780 Td', `(${pdfEscape(kicker.toUpperCase())}) Tj`]
  ops.push('/F2 20 Tf', '0 -28 Td', `(${pdfEscape(title)}) Tj`)
  for (const s of sections) {
    ops.push('/F2 12 Tf', '0 -34 Td', `(${pdfEscape(s.heading)}) Tj`, '/F1 10.5 Tf')
    for (const line of wrap(s.body)) ops.push('0 -16 Td', `(${pdfEscape(line)}) Tj`)
  }
  ops.push('/F1 8 Tf', '0 -40 Td', '(Rendered from plaintext held only in this tab) Tj', 'ET')
  const stream = ops.join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return utf8(out)
}

export function makeMarkdown(title: string, rev: number, points: string[]) {
  return utf8(
    `# ${title}\n\n_Revision ${rev}_\n\n` +
      points.map((p) => `- ${p}`).join('\n') +
      '\n\n> This file was encrypted in a browser. The server only ever stored ciphertext.\n',
  )
}

export function makeCsv(header: string[], rows: (string | number)[][]) {
  return utf8([header, ...rows].map((r) => r.join(',')).join('\n') + '\n')
}

export function makeText(title: string, rev: number, lines: string[]) {
  return utf8(`${title}\nrevision ${rev}\n${'='.repeat(title.length)}\n\n${lines.join('\n')}\n`)
}

export function makeLogoSvg(accent: string) {
  return utf8(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="480" height="240">
  <rect width="240" height="120" fill="#101311"/>
  <rect x="40" y="34" width="14" height="52" fill="${accent}"/>
  <rect x="60" y="34" width="6" height="52" fill="#F1F0EA"/>
  <rect x="72" y="52" width="6" height="34" fill="#F1F0EA" opacity=".5"/>
  <text x="92" y="72" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#F1F0EA">Northgate</text>
</svg>
`)
}
