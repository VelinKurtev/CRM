# Deals

**Deals** in the sidebar lists sales opportunities, newest first, 20 per page. Search matches the deal's name or its
company's name; the status filter shows open, won or lost deals. Search, filter and page are kept in the address.
Everyone who can read deals sees the list; **New deal** and each row's **Edit** appear for people who can write
(Sales, Manager and Admin).

## Fields

| Field | Notes |
| --- | --- |
| Deal name | Required, up to 200 characters |
| Company | Optional. Found by searching, so it is always one that exists |
| Contact | Optional, found the same way. Shown if you can read contacts. A deal can have a company, a contact, both or neither |
| Value | Optional amount in USD, 0 or more, up to two decimals |
| Stage | One of the stages of the deal's pipeline. New deals start in the first stage of the default pipeline |
| Probability | Whole number 0 to 100: the chance of winning. See below |
| Expected closing date | Optional calendar date |

The person who creates a deal is its owner (a deal converted from a lead stays with the lead's owner). The dashboard's **Add deal** shortcut creates one with just a name, value
and date; open it from **Deals** to fill in the rest.

## Stages, status and probability

- **Probability follows the stage.** Every stage has its own probability. When you pick a stage on the form, the
  probability changes to match, and you can still type another number if you know better.
- **Won and lost close the deal.** Moving a deal into a stage marked *won* or *lost* sets its status to Won or Lost and
  records when it closed (the dashboard's revenue counts won deals by that date). Its probability is then fixed at 100
  or 0 and the field is locked.
- **Moving it back reopens it.** Choosing an open stage again makes the deal Open, clears the closing time and gives it
  that stage's probability.
- A deal can only move between the stages of **its own pipeline**.

Admins set up the pipelines and their stages: see [[Pipelines]]. Until they do, the standard pipeline is created the first
time it is needed (Qualification, Proposal, Negotiation, Closed won, Closed lost).

## The board

**Deals → Board** (the **List | Board** switch at the top of the page) shows the pipeline as a Kanban board: a column
per stage in order, each headed by its name, how many deals are in it and their total value. A card shows the deal's
name (a link to edit it), its company or contact, value, probability and expected closing date.

- **Drag a card** to another column to move the deal to that stage. The card appears in its new column straight away; if
  the server refuses the move it jumps back and a message says why.
- **Or use the menu** on the card ("Move … to"). It does the same thing and works with a keyboard, a screen reader or a
  touch screen. To drag with the keyboard instead, focus the grip button on a card, press Space, use the arrow keys and
  press Space again to drop (Escape cancels).
- Moving a card is the same as changing the stage on the edit form, so the rules in *Stages, status and probability*
  above apply: dropping a deal in a won or lost column closes it, and dragging it back out reopens it.
- Each column shows the 50 most recently changed deals and says "Showing the latest 50 of N" when there are more.
  Won and lost columns collect these over time, so use the list (with its search and status filter) to find old ones.
- With more than one pipeline, a **Pipeline** menu at the top chooses which board to show.
- Read-only roles see the board but cannot drag or move cards.

## Not here yet

Deals can also come from leads: see *Converting a lead into a deal* on the [[Leads]] page.
