import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countStories, renderSummary, withSummary } from './update-progress.mjs'

const doc = `# Stories

Intro.

---

## Phase A – First

- [x] **US-001 – One**
  - [ ] a sub-item that must not count
- [ ] **US-002 – Two**

## Phase B – Second

- [x] **US-003 – Three**
- [X] **US-004 – Four**

## Notes

No stories here.
`

test('counts only top-level stories, per phase, ignoring sub-items and empty sections', () => {
  assert.deepEqual(countStories(doc), [
    { name: 'Phase A – First', done: 1, total: 2 },
    { name: 'Phase B – Second', done: 2, total: 2 },
  ])
})

test('draws bars and percentages from the counts', () => {
  const out = renderSummary(countStories(doc))
  assert.match(out, /Overall progress: 3 of 4 stories \(75%\)/)
  assert.match(out, /\| Phase A – First \| 🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜  50% \| 1 \/ 2 \|/)
  assert.match(out, /\| Phase B – Second \| (?:🟩){10} 100% \| 2 \/ 2 \|/)
})

test('inserts above the first rule, then updates in place without duplicating', () => {
  const once = withSummary(doc)
  assert.ok(once.indexOf('progress:start') < once.indexOf('\n---\n'))
  assert.equal(withSummary(once), once) // running again changes nothing

  const ticked = once.replace('- [ ] **US-002', '- [x] **US-002')
  const updated = withSummary(ticked)
  assert.match(updated, /Overall progress: 4 of 4 stories \(100%\)/)
  assert.equal(updated.match(/progress:start/g).length, 1)
})
