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
| Owner | Any active user. Left blank on the new-lead form it means you |
| Notes | Optional text, up to 5000 characters |

On the edit form, clearing source, value or notes removes them, and the owner can be set to *Nobody*. The owner
cannot be an inactive user.

## Pipeline stages

A lead moves through **New Lead → Contacted → Qualified → Proposal Sent → Negotiation**, and ends **Won** or **Lost**.
There are no rules about the order: a lead can skip ahead, step back or be reopened.

- Each row has a stage control and a small progress bar (six steps, New Lead to Won; a lost lead's bar is red).
  Pick another stage there to move the lead; people who can only read leads see the stage as text.
- The chips above the list show how many leads are in each stage, for the current search and priority. Click one to
  show only that stage, and again to clear it.
- The stage can also be changed on the edit form.

Leads created before the pipeline existed were mapped over: *Unqualified* became **Lost** and *Converted* became **Won**.

## Not here yet

Attachments, reassignment by managers and converting a lead to a deal come with their own stories.
