#!/usr/bin/env node
// ---------------------------------------------------------------------------
// No Slop CLI — de-slop text from the shell. Same engine as the app/API.
// ---------------------------------------------------------------------------
// Usage:
//   echo "your text" | node cli/deslop.mjs          # clean text -> stdout
//   node cli/deslop.mjs file.txt                     # clean a file
//   node cli/deslop.mjs --json < file.txt            # full JSON report
//   node cli/deslop.mjs --report < file.txt          # clean text + a summary
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import { deslop, slopScore, flagsFor } from '../src/deslop.js'

const args = process.argv.slice(2)
const jsonOut = args.includes('--json')
const report = args.includes('--report')
const fileArg = args.find((a) => !a.startsWith('--'))

let input = ''
try {
  input = fileArg ? fs.readFileSync(fileArg, 'utf8') : fs.readFileSync(0, 'utf8')
} catch (_) {
  process.stderr.write('No input. Pipe text in or pass a file path.\n')
  process.exit(1)
}

const { text: clean, groups, total } = deslop(input)
const s = slopScore(input)
const flags = flagsFor(input)

if (jsonOut) {
  process.stdout.write(JSON.stringify({
    clean,
    slop: { score: s.score, label: s.label, signals: s.signals },
    fixes: { total, byCategory: groups },
    flags,
  }, null, 2) + '\n')
} else {
  process.stdout.write(clean + (clean.endsWith('\n') ? '' : '\n'))
  if (report) {
    const lines = []
    lines.push('')
    lines.push(`— slop ${s.score}/100 (${s.label}) · ${total} auto-fixes`)
    for (const g of groups) lines.push(`  ${g.count}× ${g.label}`)
    if (flags.length) {
      lines.push('  flags (rewrite by hand):')
      for (const f of flags) lines.push(`  ⚑ ${f.count}× ${f.label} — ${f.fix}`)
    }
    process.stderr.write(lines.join('\n') + '\n')
  }
}
