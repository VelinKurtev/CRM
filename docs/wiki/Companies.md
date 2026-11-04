# Companies

**Companies** in the sidebar lists organizations, 20 per page. Search matches name or industry, and the search and page
are kept in the address.

## Fields

| Field | Notes |
| --- | --- |
| Name | Required, up to 200 characters. Unique whatever the letter case, because contacts find companies by name |
| Industry | Optional text |
| Employees | Optional whole number, 0 or more |
| Annual revenue | Optional amount in USD, up to two decimals |
| Website | Optional full link starting with `http://` or `https://` |

The company that creates it is its owner. The list also shows how many contacts each company has.

## Who can do what

- Anyone with `companies:read` (every role) can see the list.
- `companies:write` (Sales, Manager, Admin) can create and edit. Support can look but not change.
- Clearing a field on the edit form removes its value; the name cannot be cleared.
- Deleting companies is not available yet.
