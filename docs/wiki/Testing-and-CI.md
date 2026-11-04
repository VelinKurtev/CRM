# Testing and CI

## Running tests

```bash
cd crm-api && npm test     # API: Vitest + supertest, against a real PostgreSQL
cd crm-app && npm test     # App: Vitest + Testing Library (jsdom), API calls mocked
```

## API tests use their own database

Tests run against **`crm_test`** on the same PostgreSQL server, never your development data. The first run creates
the database and applies the migrations automatically. Two safeguards keep it that way: the test setup refuses to
start unless the database name ends in `_test`, and every test file re-checks it. Override with `TEST_DATABASE_URL`.

Test files run one after another, because several suites count rows across whole tables and would trip over each
other if they wrote at the same time. Each suite creates uniquely named data (a timestamp in the names) and removes it
afterwards.

Rate limiting is switched off under test, and logs are silent. To see logs while debugging: `LOG_LEVEL=error npm test`.

## Test CSV files

`crm-api/src/test/fixtures/contacts/`:

| File | Purpose |
| --- | --- |
| `valid.csv` | Every row imports (quoting, multi-line note, Cyrillic, blanks, companies and tags in mixed case) |
| `with-errors.csv` | 3 good rows and 8 bad ones: each should be reported with its row number and reason |
| `valid-excel-semicolon.csv` | Excel-style: BOM, `;`, Windows line endings, friendly headers, an unknown column |
| `missing-columns.csv`, `unclosed-quote.csv`, `header-only.csv` | Refused outright |

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, as two parallel jobs.

- **`api`:** starts a PostgreSQL 16 service container (with a health check), sets `DATABASE_URL`,
  `TEST_DATABASE_URL` and a throwaway `JWT_SECRET`, then runs `npm ci`, `typecheck`, `lint`, `test` and `build` in
  `crm-api`. The tests create and migrate `crm_test` themselves, so there is no separate database step.
- **`app`:** runs `npm ci`, `typecheck`, `lint`, `test` and `build` in `crm-app`. No database needed.

Both use Node.js 24 (`actions/setup-node@v7` with `node-version: 24`) and cache npm downloads per lockfile.
A failing step turns the commit or pull request red.

The progress-bar script has its own tests (`node --test scripts/`); they are not part of CI yet.
