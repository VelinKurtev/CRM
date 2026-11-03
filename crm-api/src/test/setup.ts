import { databaseName } from './test-db.js'

// Last line of defence: no test file may ever run against a non-test database.
const url = process.env.DATABASE_URL ?? ''
if (!databaseName(url).endsWith('_test')) {
  throw new Error('Tests must run against a database whose name ends in _test')
}
