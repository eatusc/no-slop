#!/usr/bin/env node
// Cross-engine parity check: runs the SAME inputs through the Node engine
// (src/deslop.js) and the Python port (django_api/deslop/engine.py), then
// diffs the normalized outputs field by field. Any mismatch fails the run.
//
// Inputs: a set of pinned fixture strings (the same families pinned in
// django_api/deslop/tests.py) plus every committed .txt caption in examples/.
//
// Usage: node scripts/parity-check.mjs   (from the repo root)
// Requires: node >= 20 and a python3 on PATH. The Python engine is pure
// stdlib, so no pip install is needed.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { deslop, flagsFor, slopScore } from '../src/deslop.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Pinned fixture strings: the known-tricky families (antithesis flag, emoji vs
// meaningful symbols, brand casing, abbreviations, all-caps swaps, rounding).
const FIXTURES = [
  'It is not just a tool, it is a revolution. 🚀 Furthermore, our seamless platform delves into a myriad of features.',
  'The team shipped the feature on time. Tests pass. Users are happy.',
  'revenue rose 5% → 10%',
  'passed ✓ shipped 🚀',
  'It works. iPhone sales rose.',
  'iOS and eBay lead.',
  'done. the next step.',
  'shipped it, e.g. the login flow',
  'LEVERAGE the synergy',
  'Furthermore, our seamless platform leverages cutting-edge AI. 🚀',
  '',
  'word',
]

// Every committed example caption is a parity input too.
const EXAMPLES_DIR = path.join(ROOT, 'examples')
const exampleFiles = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((f) => f.endsWith('.txt'))
  .sort()
const inputs = [
  ...FIXTURES,
  ...exampleFiles.map((f) => fs.readFileSync(path.join(EXAMPLES_DIR, f), 'utf8')),
]
const names = [
  ...FIXTURES.map((s, i) => `fixture[${i}] ${JSON.stringify(s.slice(0, 60))}`),
  ...exampleFiles.map((f) => `examples/${f}`),
]

function normalizeNode(text) {
  const d = deslop(text)
  const s = slopScore(text)
  const f = flagsFor(text)
  return {
    clean: d.text,
    total: d.total,
    groups: d.groups,
    score: s.score,
    label: s.label,
    signals: s.signals,
    per100: s.per100,
    words: s.words,
    flags: f.map((x) => ({ type: x.type, count: x.count, samples: x.samples })),
  }
}

const nodeResults = inputs.map(normalizeNode)

const python = process.env.PYTHON || 'python3'
const pyOut = execFileSync(python, [path.join(ROOT, 'scripts', 'parity_runner.py')], {
  input: JSON.stringify(inputs),
  maxBuffer: 64 * 1024 * 1024,
  encoding: 'utf8',
})
const pyResults = JSON.parse(pyOut)

let failures = 0
for (let i = 0; i < inputs.length; i++) {
  const a = JSON.stringify(nodeResults[i], null, 2)
  const b = JSON.stringify(pyResults[i], null, 2)
  if (a !== b) {
    failures++
    console.error(`MISMATCH on ${names[i]}`)
    const aLines = a.split('\n')
    const bLines = b.split('\n')
    for (let j = 0; j < Math.max(aLines.length, bLines.length); j++) {
      if (aLines[j] !== bLines[j]) {
        console.error(`  node:   ${aLines[j] ?? '(missing)'}`)
        console.error(`  python: ${bLines[j] ?? '(missing)'}`)
      }
    }
  }
}

if (failures) {
  console.error(`\nParity check FAILED: ${failures} of ${inputs.length} inputs differ between src/deslop.js and django_api/deslop/engine.py.`)
  process.exit(1)
}
console.log(`Parity check passed: ${inputs.length} inputs (${FIXTURES.length} pinned fixtures + ${exampleFiles.length} example captions) produce identical output from both engines.`)
