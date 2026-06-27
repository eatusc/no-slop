// ---------------------------------------------------------------------------
// Word-level diff for the No Slop output pane.
// ---------------------------------------------------------------------------
// Compares the original paste against the de-slopped text and marks what
// changed: removed slop shown struck-through, new/replacement words highlighted.
// Capitalization-only and whitespace-only differences are ignored as noise.
// ---------------------------------------------------------------------------

function tokenize(s) {
  // words, whitespace runs, and punctuation clusters as separate tokens
  return s.match(/\s+|[\p{L}\p{N}']+|[^\s\p{L}\p{N}']+/gu) || []
}

const isWs = (t) => /^\s+$/.test(t)
const norm = (t) => (isWs(t) ? ' ' : t.toLowerCase())

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

// Longest-common-subsequence alignment -> ops: {t:'eq'|'ins'|'del', v}
function diffTokens(a, b) {
  const na = a.length, nb = b.length
  const A = a.map(norm), B = b.map(norm)
  const dp = Array.from({ length: na + 1 }, () => new Uint32Array(nb + 1))
  for (let i = na - 1; i >= 0; i--) {
    for (let j = nb - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0, j = 0
  while (i < na && j < nb) {
    if (A[i] === B[j]) { ops.push({ t: 'eq', v: b[j] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', v: a[i] }); i++ }
    else { ops.push({ t: 'ins', v: b[j] }); j++ }
  }
  while (i < na) { ops.push({ t: 'del', v: a[i++] }) }
  while (j < nb) { ops.push({ t: 'ins', v: b[j++] }) }
  return ops
}

// Render the de-slopped text with change highlights as HTML.
export function diffHtml(original, cleaned) {
  const a = tokenize(original), b = tokenize(cleaned)
  // guard: skip the O(n*m) diff on very large pastes, just show plain text
  if (a.length * b.length > 4_000_000) return escapeHtml(cleaned)

  const ops = diffTokens(a, b)
  let html = ''
  for (const op of ops) {
    if (isWs(op.v)) {
      // keep real whitespace for eq/ins; for a removed run, leave a single
      // space so struck-through words don't collide
      html += op.t === 'del' ? ' ' : escapeHtml(op.v)
      continue
    }
    const esc = escapeHtml(op.v)
    if (op.t === 'eq') html += esc
    else if (op.t === 'ins') html += `<mark class="add">${esc}</mark>`
    else html += `<del>${esc}</del>`
  }
  // collapse runs of spaces/tabs (but never newlines) left by removed slop
  return html.replace(/[^\S\n]{2,}/g, ' ')
}
