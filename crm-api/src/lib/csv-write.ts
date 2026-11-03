/**
 * A value that a spreadsheet would run as a formula if it opened the file: it starts with `=`,
 * `@`, a tab or a carriage return, or with `+` / `-` followed by something other than a plain
 * phone number or number (so "+359 88 111 1111" survives, "-2+3" and "+cmd|..." do not).
 */
const looksLikeFormula = (v: string) =>
  /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-]?[\d\s().-]+$/.test(v))

/** One CSV cell: quoted when needed, and defused if it could execute as a spreadsheet formula. */
export function csvCell(value: string | null | undefined, delimiter = ','): string {
  let text = value ?? ''
  if (looksLikeFormula(text)) text = `'${text}`
  return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const csvRow = (cells: (string | null | undefined)[], delimiter = ',') =>
  cells.map((c) => csvCell(c, delimiter)).join(delimiter) + '\r\n'
