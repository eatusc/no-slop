import assert from 'node:assert/strict'
import test from 'node:test'

import { deslop, flagsFor, slopScore } from '../src/deslop.js'

const SLOPPY = "It is not just a tool, it is a revolution. 🚀 Furthermore, our seamless platform leverages cutting-edge AI."

test('deslop removes deterministic AI-writing signals', () => {
  const result = deslop(SLOPPY)

  assert.equal(result.text.includes('🚀'), false)
  assert.equal(result.text.includes('Furthermore'), false)
  assert.equal(result.text.includes('seamless'), false)
  assert.equal(result.text.includes('leverages'), false)
  assert.equal(result.text.includes('cutting-edge'), false)
  assert.ok(result.total >= 5)
})

test('deslop preserves clean human text', () => {
  const input = 'The team shipped the feature on time. Tests pass.'
  const result = deslop(input)

  assert.equal(result.text, input)
  assert.equal(result.total, 0)
})

test('slopScore returns a bounded score and signal breakdown', () => {
  const result = slopScore(SLOPPY)

  assert.ok(result.score >= 0 && result.score <= 100)
  assert.ok(result.score > 50)
  assert.equal(typeof result.signals.emoji, 'number')
  assert.equal(typeof result.signals.transitions, 'number')
  assert.equal(typeof result.signals.words, 'number')
})

test('flagsFor leaves structural rewrites to a person or agent', () => {
  const flags = flagsFor(SLOPPY)

  assert.equal(flags.some((flag) => flag.type === 'antithesis'), true)
  assert.equal(deslop(SLOPPY).text.toLowerCase().includes('not just'), true)
})

test('meaningful arrows, check marks, and brand casing survive cleanup', () => {
  assert.equal(deslop('revenue rose 5% → 10%').text, 'Revenue rose 5% → 10%')
  assert.equal(deslop('passed ✓ shipped 🚀').text, 'Passed ✓ shipped')
  assert.equal(deslop('iOS and eBay lead.').text, 'iOS and eBay lead.')
})
