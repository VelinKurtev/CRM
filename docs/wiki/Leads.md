# Leads

**Leads** in the sidebar lists potential customers, newest first, 20 per page. Search matches title or source; the
stage chips and priority filter narrow it further. Search, filters and page are kept in the address. Everyone who can read
leads sees the list; **New lead** and each row's **Edit** appear for people who can write (Sales, Manager and Admin).

## Fields

| Field | Notes |
| --- | --- |
| Title | Required, up to 200 characters |
| Source | Optional text, up to 100 characters, e.g. Website or Referral |
| Value | Optional estimated worth in USD, 0 or more, up to two decimals |
| Priority | Low, Medium (the default) or High |
| Stage | New Lead (the default), Contacted, Qualified, Proposal Sent, Negotiation, Won or Lost. See below |
| Owner | Whoever creates the lead, unless a manager or admin gives it to another active user. See [Assigning leads](#assigning-leads) |
| Notes | Optional text, up to 5000 characters |

On the edit form, clearing source, value or notes removes them.

## Assigning leads

Work is handed out by **managers and admins** (the `leads:assign` permission). Sales users own the leads they create
and cannot give a lead away, take someone else's, or pick another owner when creating one: the Owner choice simply
isn't shown to them, and the API refuses it (403).

People who can assign:

- **From the list**: every row has an owner dropdown. Pick someone to reassign the lead at once, or **Nobody** to leave
  it unowned.
- **On the form**: the Owner field on the new and edit lead pages. Leaving it on *Me* when creating keeps the lead.

The new owner must be an active user. A lead whose owner has since been deactivated shows them as *inactive* and can
still be edited; it is only the next reassignment that has to name an active user. Each reassignment is written to the
audit log (who, which lead, from whom, to whom).

## Pipeline stages

A lead moves through **New Lead → Contacted → Qualified → Proposal Sent → Negotiation**, and ends **Won** or **Lost**.
There are no rules about the order: a lead can skip ahead, step back or be reopened.

- Each row has a stage control and a small progress bar (six steps, New Lead to Won; a lost lead's bar is red).
  Pick another stage there to move the lead; people who can only read leads see the stage as text.
- The chips above the list show how many leads are in each stage, for the current search and priority. Click one to
  show only that stage, and again to clear it.
- The stage can also be changed on the edit form.

Leads created before the pipeline existed were mapped over: *Unqualified* became **Lost** and *Converted* became **Won**.

## Attachments

Keep related material with the lead. On a lead's **Edit** page, under the form, **Attachments** lists its files
(name, size, who added it and when). People who can write leads can:

- **Add files**: pick one or several. Each can be up to **10 MB**, and a lead can have up to **25** files. A file that
  is empty, too big or refused is listed with the reason while the others still go through.
- **Download** a file, which saves it under its own name.
- **Remove** a file, after a confirmation. Removal cannot be undone.

The Leads list shows a paperclip and the number of files next to any lead that has some. Files are kept in the
database (not on disk), so they are backed up with everything else and are deleted with their lead. Adding and
removing files is written to the audit log.

Downloads are always saved as files, never opened inside the page, whatever their type, so an uploaded web page or
script cannot run in the CRM. The API lets anyone with `leads:read` list and download files; the Edit page is where
the files are managed.

## Not here yet

Reassignment by managers and converting a lead to a deal come with their own stories.
