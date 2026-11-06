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

The person who creates a deal is its owner. The dashboard's **Add deal** shortcut creates one with just a name, value
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

Stages and pipelines are set up by admins in a later story; until then the standard pipeline is created the first time
it is needed (Qualification, Proposal, Negotiation, Closed won, Closed lost).

## Not here yet

The board with drag-and-drop between stages, converting a lead into a deal and managing pipelines come with their own
stories.
