# Notes

Notes capture what is worth remembering about a customer: preferences, budget, how they like to be contacted.
They can be added to **contacts**, **companies** and **deals**. The contact and company pages have a Notes section
with a box at the top; the deal screens will use the same notes when they are built.

- A note is up to 5000 characters, plain text with line breaks kept. It shows its author and date, and *edited* if it
  was changed afterwards.
- Newest first; each page shows the latest 50 and says how many there are in all.
- The first note typed on the **New contact** form is saved as the contact's first note.

## Who can do what

| Action | Needs |
| --- | --- |
| Read notes | `notes:read` (every role) |
| Add a note | `notes:write` (every role), and permission to read the record it is for |
| Edit a note | Its author only, with `notes:write`. Nobody can edit someone else's words, managers included |
| Delete a note | Its author, or anyone with `notes:delete` (Sales, Manager, Admin) |

Deleting a contact, company or deal deletes its notes with it.

Endpoints are in the [[API Reference]].
