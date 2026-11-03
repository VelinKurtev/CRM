/**
 * Tests run against their own database so they can never touch (or be skewed by) dev data.
 * Override with TEST_DATABASE_URL, e.g. in CI. The database name must end in `_test`.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://crm:crm@localhost:5433/crm_test?schema=public'

export const databaseName = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1))
