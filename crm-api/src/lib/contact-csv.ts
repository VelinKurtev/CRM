import { parse } from 'csv-parse/sync'

import { HttpError } from './http-error.js'

export const MAX_IMPORT_ROWS = 2000

/** Accepted column headers (any capitalisation or punctuation) and the contact field each fills. */
const ALIASES: Record<string, string[]> = {
  firstName: ['firstname', 'first', 'givenname', 'forename'],
  lastName: ['lastname', 'last', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'telephone', 'tel'],
  jobTitle: ['jobtitle', 'title', 'position', 'role'],
  company: ['company', 'companyname', 'organization', 'organisation', 'employer'],
  address: ['address', 'street', 'streetaddress', 'address1'],
  city: ['city', 'town'],
  postalCode: ['postalcode', 'postcode', 'zip', 'zipcode'],
  country: ['country'],
  linkedinUrl: ['linkedin', 'linkedinurl'],
  twitterUrl: ['twitter', 'twitterurl', 'x'],
  facebookUrl: ['facebook', 'facebookurl'],
  tags: ['tags', 'tag', 'labels'],
  note: ['note', 'notes', 'comment', 'comments'],
}

const FIELD_BY_HEADER = new Map(
  Object.entries(ALIASES).flatMap(([field, names]) => names.map((n) => [n, field] as const)),
)

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '')

export type CsvRow = {
  /** Spreadsheet row number: the header is row 1, so the first contact is row 2. */
  row: number
  /** Contact fields keyed by name, blank cells left out, tags already split. */
  fields: Record<string, unknown>
}

/**
 * The file's separator, taken from its header line: whichever of comma, semicolon or tab appears
 * most (outside quotes). Excel in many locales writes semicolons. One separator per file, so a
 * `;` inside an unquoted tags cell in a comma file stays part of that cell.
 */
function detectDelimiter(text: string) {
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of header) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch]++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

const fileError = (message: string) => new HttpError(400, message, { file: message })

/**
 * Read a CSV (comma, semicolon or tab separated; UTF-8, with or without a BOM) into contact
 * fields. Throws a 400 if the file is not CSV or cannot hold contacts at all; problems in
 * individual rows are left for the caller to validate.
 */
export function parseContactsCsv(text: string) {
  let records: string[][]
  try {
    records = parse(text, {
      delimiter: detectDelimiter(text),
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unreadable'
    throw fileError(`This file is not valid CSV (${detail}).`)
  }
  if (records.length === 0) throw fileError('The file is empty.')

  const [header, ...data] = records
  const columns = header.map((h) => FIELD_BY_HEADER.get(normalise(h)))
  for (const required of ['firstName', 'lastName']) {
    if (!columns.includes(required)) {
      const label = required === 'firstName' ? 'first name' : 'last name'
      throw fileError(`The file needs a "${label}" column (for example first_name / last_name).`)
    }
  }
  if (data.length === 0) throw fileError('The file has a header but no contacts.')
  if (data.length > MAX_IMPORT_ROWS) {
    throw fileError(`Too many rows: import at most ${MAX_IMPORT_ROWS} contacts at a time.`)
  }

  const ignoredColumns = header.filter((h, i) => h && columns[i] === undefined)

  const rows: CsvRow[] = data.map((cells, i) => {
    const fields: Record<string, unknown> = {}
    columns.forEach((field, c) => {
      const value = cells[c]?.trim()
      if (!field || !value || field in fields) return // first column for a field wins
      fields[field] =
        field === 'tags'
          ? value
              .split(/[;,|]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : value
    })
    // A blank name is reported as "required", not as a missing value.
    fields.firstName ??= ''
    fields.lastName ??= ''
    return { row: i + 2, fields }
  })

  return { rows, ignoredColumns }
}
