// Writes oversized.bin, one byte over the 10 MB limit, so you can see a too-big file refused.
// Too heavy to keep in git, so it is made on demand (and ignored by git):
//   node crm-api/src/test/fixtures/attachments/make-oversized.mjs
import { writeFileSync } from 'node:fs'

const out = new URL('./oversized.bin', import.meta.url)
writeFileSync(out, Buffer.alloc(10 * 1024 * 1024 + 1, 1))
console.log(`Wrote ${out.pathname}`)
