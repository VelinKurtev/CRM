# Dashboard

The first page after signing in. Every card hides itself if your role can't read that data.

| Card | Shows | Who sees it |
| --- | --- | --- |
| **Sales overview** | Revenue won this month, deals won, change against last month | Anyone who can read deals |
| **New leads** | Leads created in the last 7 days and how many are still new | Anyone who can read leads |
| **Open deals** | How many, and their total value | Anyone who can read deals |
| **Upcoming tasks** | Your open tasks, soonest due first, with an overdue count | Anyone who can read tasks |
| **Recent activity** | Latest calls, emails and meetings across the team | Anyone who can read activities |
| **Notifications** | Your latest notifications and unread count | Everyone |
| **Revenue** | A line chart of revenue won per month for 12 months, with a table view | Managers and admins (`reports:read`) |

## Quick actions

Buttons at the top create records in one click, each shown only if your role may create that record: **Add contact**
(opens the full contact form), and small dialogs for **Add lead**, **Add deal** and **Add task**.

## Things to know

- Amounts are added up and shown as US dollars. The database allows a currency per deal, so this needs revisiting if
  you use more than one.
- Months follow the server's calendar. If the server runs in a different timezone from your users, a deal closed near
  midnight on the 1st can land in the neighbouring month.
- The revenue chart is drawn in plain SVG (no chart library). Hover or use the arrow keys to read a month; "Show table"
  gives the same numbers as a table.
- Figures cover the whole team, not just your own records.

## Layout

Every signed-in page sits in the same frame: a sidebar (collapses to icons, becomes a drawer on phones), a top bar
with your menu, breadcrumbs, and a footer. Sidebar items are listed in `crm-app/src/components/layout/nav-items.ts`
and filtered by permission.
