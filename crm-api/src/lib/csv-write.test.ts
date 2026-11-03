import { describe, expect, it } from 'vitest'

import { csvCell, csvRow } from './csv-write.js'

describe('csvCell', () => {
  it('leaves plain text alone and writes blanks as empty', () => {
    expect(csvCell('Anna')).toBe('Anna')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes cells holding the delimiter, quotes or line breaks, doubling inner quotes', () => {
    expect(csvCell('Acme, Inc.')).toBe('"Acme, Inc."')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"')
    expect(csvCell('a;b', ';')).toBe('"a;b"')
    expect(csvCell('a;b', ',')).toBe('a;b') // only the file's own delimiter forces quoting
  })

  it('defuses anything a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(
      `"'=HYPERLINK(""http://evil"",""click"")"`,
    )
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('+cmd|calc')).toBe("'+cmd|calc")
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell('\tTabbed')).toBe("'\tTabbed")
  })

  it('does not mangle phone numbers or plain negative numbers', () => {
    expect(csvCell('+359 88 111 1111')).toBe('+359 88 111 1111')
    expect(csvCell('+1 (555) 123-4567')).toBe('+1 (555) 123-4567')
    expect(csvCell('-5')).toBe('-5')
  })
})

describe('csvRow', () => {
  it('joins cells with the delimiter and ends with CRLF', () => {
    expect(csvRow(['a', 'b,c', null])).toBe('a,"b,c",\r\n')
    expect(csvRow(['a', 'b;c', 'd'], ';')).toBe('a;"b;c";d\r\n')
  })
})
