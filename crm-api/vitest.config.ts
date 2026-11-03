import { defineConfig } from 'vitest/config'

import { TEST_DATABASE_URL } from './src/test/test-db.js'

export default defineConfig({
  test: {
    // Several suites count rows across whole tables, so files must not write at the same time.
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Set here (dotenv never overrides existing variables), so a developer's .env can't redirect tests.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-only-secret-not-for-production',
    },
  },
})
