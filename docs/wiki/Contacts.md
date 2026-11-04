# Contacts

Under **Contacts** in the sidebar. Reading needs `contacts:read`; the actions below need the permission shown.

## Create

**New contact** (needs `contacts:write`). First and last name are required; everything else is optional:
email, phone, job title, company, address, city, postal code, country, LinkedIn / X / Facebook links, tags and a note.

- **Company:** pick an existing one from the suggestions or type a new name. Names match ignoring letter case, so
  "ACME" links to "Acme" instead of creating a duplicate.
- **Tags:** type and press Enter or comma. Existing tags are reused, ignoring case.
- **Note:** saved as the first note on the contact.
- Whoever creates a contact owns it.

## List, search and filter

- **Search** matches name, email, phone, job title and company. Every word must match somewhere, in any order:
  "bob acme" finds Bob at Acme.
- **Filters:** owner (My contacts), company and tags. They combine. Pick several tags and choose whether a contact
  needs *any* of them or *all* of them. Clicking a tag on a row adds it to the filter.
  The export uses the same filters.
- **Sort** by name or company (click the column header again to reverse). 20 per page.
- Search, filters, sort and page are kept in the address, so you can refresh, go back, or share the link.

## Tags

Tags group contacts. Type a tag on the contact form (Enter or comma); existing tags are reused whatever their case, and
a contact can have up to 20.

- **Filter:** the **Tags** button on the list, or click any tag in a row. With two or more tags, choose *any* or *all*.
- **Tag many at once** (needs `contacts:write`): tick rows (or the header box for the whole page), then **Add tags** or
  **Remove tags**. Up to 500 contacts at a time. It is all or nothing: if a contact would end up over 20 tags,
  nothing changes. The selection is dropped when you change the page or filters.
- **Manage tags** (needs `tags:manage`: Managers and Admins): the **Tags** page in the sidebar lists every tag with how
  many contacts and records use it. Rename it, give it a colour (shown on its badges everywhere), or delete it. A
  rename or delete applies to every record that uses the tag; deleting removes the tag but keeps the records. Renaming
  to a name another tag already has is refused.
- Bulk tagging, renames and deletes are recorded in the audit log.

## Edit and delete

- **Edit** (`contacts:write`): from the contact's name in the list. Clear a field to remove its value.
- **Delete:** Managers and Admins can delete any contact; **Sales can delete contacts they own**; Support can't.
  The confirmation says what goes with it: the contact's notes, tasks, activities and tag links are deleted; its
  deals and leads stay but lose the link. Deletes are recorded in the audit log.

## Import from CSV

**Import CSV** on the list page (needs `contacts:write`).

1. Choose a file (or drag it in). The page checks it and shows what would happen. **Nothing is saved yet.**
2. Review: how many contacts are ready, and which rows would be skipped and why.
3. Click **Import**. Valid rows are imported; invalid rows are skipped, not blocking the rest.

**File rules:** up to 2 MB and 2,000 rows; first row is column names; UTF-8; comma, semicolon or tab separated
(Excel's European exports work). `first name` and `last name` columns are required.

| Column | Also accepted as |
| --- | --- |
| `first_name` | first name, given name, forename |
| `last_name` | last name, surname, family name |
| `email` | e-mail, mail |
| `phone` | mobile, telephone, tel |
| `job_title` | title, position, role |
| `company` | organisation, employer |
| `address` | street |
| `city` | town |
| `postal_code` | postcode, zip |
| `country` | |
| `linkedin`, `twitter`, `facebook` | `…_url`; links must start with `http://` or `https://` |
| `tags` | separated by `;` `,` or `\|` |
| `note` | notes, comments |

Capitalisation and punctuation in headers don't matter. Unknown columns are ignored and listed.

**A row is skipped** when it fails the same rules as the create form (missing name, invalid email or link, more than
20 tags, text too long), when its email repeats an earlier row in the file, or when a contact with that email already
exists. Each skipped row is reported with its spreadsheet row number (the header is row 1) and the reason.

Things to know:

- Contacts **without an email can't be matched**, so importing the same file twice adds them again.
- A new company is created only if your role may create companies.
- All accepted rows are saved together: if the database fails, none are.
- Each import is recorded in the audit log.

Sample files: `crm-api/src/test/fixtures/contacts/` (`valid.csv`, `with-errors.csv`, `valid-excel-semicolon.csv`, and
files that are refused outright). A header-only template is available from the import page.

## Export to CSV

**Export** on the list page (needs `contacts:export`: Managers and Admins).

- Downloads **every** contact matching your current search and filters, not just the visible page, up to 10,000.
- UTF-8 with a BOM, so Cyrillic and other non-English names open correctly in Excel. If Excel shows one column,
  use **Download CSV for Excel (semicolons)**.
- Columns match the import, plus `owner` and `created`, so an export can be edited and imported elsewhere. Notes are not
  included.
- Cells that begin like a spreadsheet formula (`=`, `@`, or a suspicious `+`/`-`) get a leading `'` so they can't run
  when the file is opened. Ordinary phone numbers such as `+359 88 111 1111` are unchanged.
- Every export is recorded in the audit log with the filters used and the number of rows.
