import { execFileSync } from 'node:child_process'

import pg from 'pg'

import { databaseName, TEST_DATABASE_URL } from './test-db.js'

/** Once per test run: make sure the test database exists and is migrated. */
export default async function setup() {
  const name = databaseName(TEST_DATABASE_URL)
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to run tests against "${name}": the database name must end in _test`)
  }

  // Connect to the server's maintenance database to create the test database if missing.
  const admin = new URL(TEST_DATABASE_URL)
  admin.pathname = '/postgres'
  admin.search = ''
  const client = new pg.Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`)
  } finally {
    await client.end()
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
}
