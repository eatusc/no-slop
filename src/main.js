import { deslop, slopScore, flagsFor } from './deslop.js'
import { diffHtml } from './diff.js'

const $ = (id) => document.getElementById(id)
const input = $('input')
const output = $('output')
const inCount = $('in-count')
const outCount = $('out-count')
const stats = $('stats')
const liveToggle = $('liveToggle')

const SAMPLE = `In today's fast-paced world, it's important to note that leveraging cutting-edge technology can truly revolutionize the way we work. 🚀 Furthermore, our robust and seamless platform delves into a myriad of features — each designed to elevate your workflow and unlock your team's full potential. Needless to say, this is a game-changer. ✨`

const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0)

const slopFill = $('slop-fill')
const slopNeedle = $('slop-needle')
const slopReadout = $('slop-readout')

function setSlopometer(text) {
  if (!text.trim()) {
    slopFill.style.width = '100%'
    slopNeedle.style.left = '0%'
    slopReadout.innerHTML = '<span class="muted">—</span>'
    return
  }
  const { score, label, color } = slopScore(text)
  slopFill.style.width = (100 - score) + '%'   // reveal gradient up to the score
  slopNeedle.style.left = score + '%'
  slopReadout.innerHTML = `<b style="color:${color}">${score}</b> / 100 · ${label}`
}

const hlToggle = $('hlToggle')
let lastClean = ''
let lastSrc = ''

function renderOutput() {
  if (!lastSrc.trim()) {
    output.innerHTML = '<span class="muted">The cleaned-up version shows up here…</span>'
    return
  }
  if (hlToggle.checked) output.innerHTML = diffHtml(lastSrc, lastClean)
  else output.textContent = lastClean
}

function run() {
  const src = input.value
  lastSrc = src
  inCount.textContent = words(src) + ' words'
  setSlopometer(src)
  if (!src.trim()) {
    lastClean = ''
    renderOutput()
    outCount.textContent = '0 words'
    stats.innerHTML = '<span class="muted">Nothing cleaned yet. Paste something on the left.</span>'
    return
  }
  const { text, groups, total } = deslop(src)
  lastClean = text
  renderOutput()
  outCount.textContent = words(text) + ' words'

  if (total === 0) {
    stats.innerHTML = '<span class="muted">Clean already — no slop found. Nice.</span>'
    return
  }
  const chips = groups
    .map((g) => `<span class="chip"><b>${g.count}</b> ${g.label.toLowerCase()}</span>`)
    .join('')
  const flags = flagsFor(src)
  const flagChips = flags
    .map((f) => `<span class="chip flag" title="${f.fix}">⚑ <b>${f.count}</b> ${f.label} — rewrite by hand</span>`)
    .join('')
  const legend =
    '<span class="legend"><mark>swapped</mark> <del>removed</del></span>'
  stats.innerHTML =
    `<span class="chip total"><b>${total}</b> fixes</span>` + chips + flagChips +
    '<span class="spacer"></span>' + legend +
    '<span class="toast" id="toast">Copied ✓</span>'
}

hlToggle.addEventListener('change', renderOutput)

function showToast() {
  const t = $('toast')
  if (!t) return
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 1400)
}

input.addEventListener('input', () => { if (liveToggle.checked) run() })
$('go').addEventListener('click', run)

$('copy').addEventListener('click', async () => {
  if (!lastClean) return
  try {
    await navigator.clipboard.writeText(lastClean)
  } catch (_) {
    const ta = document.createElement('textarea')
    ta.value = lastClean
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  showToast()
})

$('clear').addEventListener('click', () => {
  input.value = ''
  run()
  input.focus()
})

$('sample').addEventListener('click', () => {
  input.value = SAMPLE
  run()
})

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabs = [...document.querySelectorAll('.tab')]
const views = {
  deslop: document.getElementById('view-deslop'),
  rewrite: document.getElementById('view-rewrite'),
  examples: document.getElementById('view-examples'),
  rules: document.getElementById('view-rules'),
  voice: document.getElementById('view-voice'),
  api: document.getElementById('view-api'),
}
let examplesLoaded = false

function switchTab(name) {
  if (!views[name]) name = 'deslop'
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name))
  for (const k in views) views[k].classList.toggle('active', k === name)
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name)
  if (name === 'examples' && !examplesLoaded) loadExamples()
  if (name === 'rewrite' && !rewriteInit) initRewrite()
  if (name === 'rules' && !rulesDoc.isLoaded()) rulesDoc.load()
  if (name === 'voice' && !voiceDoc.isLoaded()) voiceDoc.load()
  if (name === 'api' && !apiDoc.isLoaded()) apiDoc.load()
}
tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)))
window.addEventListener('hashchange', () => switchTab(location.hash.slice(1)))

// ---------------------------------------------------------------------------
// Examples tab
// ---------------------------------------------------------------------------
const exList = $('ex-list')
const exTitle = $('ex-title')
const exBody = $('ex-body')
const exScore = $('ex-score')
const exLoad = $('ex-load')
let exItems = []
let exCurrent = null
let exShowDismissed = false

async function loadExamples() {
  try {
    const r = await fetch('/api/examples')
    const data = await r.json()
    exItems = data.items || []
  } catch (_) {
    exList.innerHTML = '<div class="muted" style="padding:12px 6px">Could not load examples.</div>'
    return
  }
  examplesLoaded = true
  // score once, here, and keep it on each item (sorted worst-slop-first)
  exItems = exItems
    .map((it) => ({ ...it, sc: slopScore(it.text) }))
    .sort((a, b) => b.sc.score - a.sc.score)
  renderExList()
}

function exRow(it, isDismissed) {
  const act = isDismissed ? 'restore' : 'dismiss'
  const glyph = isDismissed ? '↩' : '✕'
  const title = isDismissed ? 'Restore' : 'Dismiss — already clean / not slop'
  return `<div class="ex-item${isDismissed ? ' ex-dismissed' : ''}" data-file="${it.file}">` +
    `<span class="ex-dot" style="background:${it.sc.color}"></span>` +
    `<span class="slug">${it.slug}</span>` +
    `<span class="stage">${it.stage || ''}</span>` +
    `<button class="ex-act" data-act="${act}" data-file="${it.file}" title="${title}">${glyph}</button>` +
    `</div>`
}

function renderExList() {
  const active = exItems.filter((it) => !it.dismissed)
  const dismissed = exItems.filter((it) => it.dismissed)
  let html = `<div class="ex-head">${active.length} examples`
  if (dismissed.length) {
    html += ` · <button class="lnk" id="ex-toggle">${exShowDismissed ? 'hide' : 'show'} ${dismissed.length} dismissed</button>`
  }
  html += '</div>'
  html += active.map((it) => exRow(it, false)).join('')
  if (exShowDismissed) html += dismissed.map((it) => exRow(it, true)).join('')
  exList.innerHTML = html

  exList.querySelectorAll('.ex-item').forEach((el) =>
    el.addEventListener('click', () => showExample(el.dataset.file)))
  exList.querySelectorAll('.ex-act').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      setDismissed(btn.dataset.file, btn.dataset.act === 'dismiss')
    }))
  const tg = document.getElementById('ex-toggle')
  if (tg) tg.addEventListener('click', () => { exShowDismissed = !exShowDismissed; renderExList() })
}

async function setDismissed(file, dismissed) {
  const it = exItems.find((x) => x.file === file)
  if (it) it.dismissed = dismissed
  renderExList()
  try {
    await fetch('/api/examples/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, dismissed }),
    })
  } catch (_) {}
}

function showExample(file) {
  const it = exItems.find((x) => x.file === file)
  if (!it) return
  exCurrent = it
  ;[...exList.children].forEach((c) => c.classList.toggle('active', c.dataset.file === file))
  const words = it.words || (it.text.trim().match(/\S+/g) || []).length
  exTitle.textContent = it.slug
  exScore.innerHTML = `slop <b style="color:${it.sc.color}">${it.sc.score}</b> · ${words} words`
  exBody.textContent = it.text
}

exLoad.addEventListener('click', () => {
  if (!exCurrent) return
  input.value = exCurrent.text
  switchTab('deslop')
  run()
})

// ---------------------------------------------------------------------------
// Rewrite tab (AI) — heavy rewrite via the claude/codex CLI + learning loop
// ---------------------------------------------------------------------------
const rwInput = $('rw-input')
const rwOutput = $('rw-output')
const rwInCount = $('rw-in-count')
const rwOutCount = $('rw-out-count')
const rwStatus = $('rw-status')
const rwSlop = $('rw-slop')
const rwEngine = $('rw-engine')
const rwVoice = $('rw-voice')
const rwGo = $('rw-go')
let rwLastInput = ''
let rwBusy = false
let rewriteInit = false

function setVoiceCount(total, learned) {
  rwVoice.textContent = `voice: ${total} examples (${learned} learned)`
}
async function loadVoiceCount() {
  try {
    const d = await (await fetch('/api/style')).json()
    setVoiceCount(d.total, d.learnedCount)
  } catch (_) { rwVoice.textContent = 'voice: —' }
}
function initRewrite() { rewriteInit = true; loadVoiceCount(); updateRwCounts() }

function updateRwCounts() {
  rwInCount.textContent = words(rwInput.value) + ' words'
  rwOutCount.textContent = words(rwOutput.value) + ' words'
  const a = rwLastInput.trim() ? slopScore(rwLastInput).score : null
  const b = rwOutput.value.trim() ? slopScore(rwOutput.value).score : null
  rwSlop.textContent = a != null && b != null ? `slop ${a} → ${b}` : ''
}

function setRwBusy(on, label) {
  rwBusy = on
  rwGo.disabled = on
  rwStatus.textContent = label || ''
  rwStatus.classList.toggle('rw-running', on)
}

async function doRewrite() {
  const text = rwInput.value.trim()
  if (!text || rwBusy) return
  rwLastInput = text
  const engine = rwEngine.value
  setRwBusy(true, `Rewriting with ${engine}… (~10–40s)`)
  rwOutput.value = ''
  try {
    const r = await fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, engine }),
    })
    const d = await r.json()
    if (!r.ok || d.error) throw new Error(d.error || 'rewrite failed')
    rwOutput.value = d.output || ''
    setRwBusy(false, 'done — edit it, then “Add to my voice”')
    updateRwCounts()
  } catch (err) {
    setRwBusy(false, '')
    alert('Rewrite failed: ' + err.message + '\n\nIs the No Slop server running, and is the CLI logged in?')
  }
}

rwInput.addEventListener('input', updateRwCounts)
rwOutput.addEventListener('input', updateRwCounts)
rwGo.addEventListener('click', doRewrite)
$('rw-regen').addEventListener('click', doRewrite)
$('rw-sample').addEventListener('click', () => { rwInput.value = SAMPLE; updateRwCounts() })
$('rw-clear').addEventListener('click', () => {
  rwInput.value = ''; rwOutput.value = ''; rwLastInput = ''; rwStatus.textContent = ''
  updateRwCounts(); rwInput.focus()
})
$('rw-copy').addEventListener('click', async () => {
  if (!rwOutput.value) return
  try { await navigator.clipboard.writeText(rwOutput.value) } catch (_) {}
})
$('rw-save').addEventListener('click', async () => {
  const input2 = rwLastInput.trim(), output = rwOutput.value.trim()
  if (!input2 || !output) { alert('Rewrite something first, then save.'); return }
  try {
    const r = await fetch('/api/style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: input2, output, engine: rwEngine.value }),
    })
    const d = await r.json()
    if (!r.ok || d.error) throw new Error(d.error || 'save failed')
    setVoiceCount(d.total, d.learnedCount)
    const t = $('rw-saved'); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800)
  } catch (err) { alert('Save failed: ' + err.message) }
})

// "Rewrite this ✦" from the Examples tab loads the caption and runs a rewrite
$('ex-rewrite').addEventListener('click', () => {
  if (!exCurrent) return
  rwInput.value = exCurrent.text
  rwOutput.value = ''
  switchTab('rewrite')
  updateRwCounts()
  doRewrite()
})

// ---- voice examples viewer / pruner + consolidate ----
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const exmOverlay = $('exm-overlay')
const exmList = $('exm-list')
const exmSub = $('exm-sub')

function renderExamples(data) {
  exmSub.textContent = `${data.total} total · ${data.seedCount} seed (locked) · ${data.learnedCount} learned`
  const items = data.learned || []
  if (!items.length) {
    exmList.innerHTML = '<div class="muted small" style="padding:14px 0">No learned examples yet. Rewrite something, then “Add to my voice”.</div>'
    return
  }
  exmList.innerHTML = items.map((p, i) => {
    const a = esc((p.input || '').replace(/\s+/g, ' ').slice(0, 70))
    const b = esc((p.output || '').replace(/\s+/g, ' ').slice(0, 70))
    return `<div class="exm-row"><div class="exm-text">` +
      `<div class="exm-a"><del>${a}…</del></div><div class="exm-b">→ ${b}…</div></div>` +
      `<button class="exm-del" data-i="${i}" title="Delete this example">✕</button></div>`
  }).join('')
  exmList.querySelectorAll('.exm-del').forEach((btn) =>
    btn.addEventListener('click', () => deleteExample(parseInt(btn.dataset.i, 10))))
}

async function openExamples() {
  try {
    const data = await (await fetch('/api/style')).json()
    renderExamples(data)
    exmOverlay.classList.add('open')
  } catch (_) { alert('Could not load examples.') }
}

async function deleteExample(i) {
  if (!confirm('Delete this learned example? This cannot be undone.')) return
  try {
    const data = await (await fetch('/api/style?index=' + i, { method: 'DELETE' })).json()
    renderExamples(data)
    setVoiceCount(data.total, data.learnedCount)
  } catch (_) { alert('Delete failed.') }
}

async function consolidateVoice() {
  const btn = $('rw-consolidate')
  if (!confirm('Distill all your saved edits into rules and write them into voice.md?\n(Uses the claude CLI — takes ~15–60s.)')) return
  const prev = btn.textContent
  btn.textContent = 'Distilling…'; btn.disabled = true
  try {
    const r = await fetch('/api/consolidate', { method: 'POST' })
    const d = await r.json()
    if (!r.ok || d.error) throw new Error(d.error || 'failed')
    voiceDoc.load() // refresh the Voice tab so it shows the new section
    alert(`Done — distilled ${d.count} edits into a "Learned rules" section in voice.md.\nOpen the Voice tab to see it.`)
  } catch (err) {
    alert('Consolidate failed: ' + err.message)
  } finally {
    btn.textContent = prev; btn.disabled = false
  }
}

$('rw-view').addEventListener('click', openExamples)
$('rw-consolidate').addEventListener('click', consolidateVoice)
$('exm-close').addEventListener('click', () => exmOverlay.classList.remove('open'))
exmOverlay.addEventListener('click', (e) => { if (e.target === exmOverlay) exmOverlay.classList.remove('open') })

// ---------------------------------------------------------------------------
// Doc editor tabs (Rules, Voice, API) — view + edit a markdown file on disk
// ---------------------------------------------------------------------------
function setupDoc(name, apiPath) {
  const ta = $(name + '-text')
  let loaded = false

  async function load() {
    try {
      const data = await (await fetch(apiPath)).json()
      ta.value = data.text || ''
      loaded = true
    } catch (_) {
      ta.value = '# Could not load — is the dev server running?'
    }
  }
  async function save() {
    try {
      await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ta.value }),
      })
      const t = $(name + '-saved')
      t.classList.add('show')
      setTimeout(() => t.classList.remove('show'), 1600)
    } catch (_) {
      alert('Save failed — is the dev server running?')
    }
  }

  $(name + '-save').addEventListener('click', save)
  $(name + '-reload').addEventListener('click', load)
  return { load, save, isLoaded: () => loaded }
}

const rulesDoc = setupDoc('rules', '/api/doc/rules')
const voiceDoc = setupDoc('voice', '/api/doc/voice')
const apiDoc = setupDoc('api', '/api/doc/api')

// Cmd/Ctrl+Enter: save the active doc editor, or run the de-slopper otherwise.
document.addEventListener('keydown', (e) => {
  if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return
  if (views.rules.classList.contains('active')) rulesDoc.save()
  else if (views.voice.classList.contains('active')) voiceDoc.save()
  else if (views.api.classList.contains('active')) apiDoc.save()
  else if (views.rewrite.classList.contains('active')) doRewrite()
  else run()
})

// open the tab named in the URL hash on load (#examples / #rules), default de-slop
if (location.hash) switchTab(location.hash.slice(1))

// ?demo preloads the sample; ?text=... prefills with arbitrary (URL-encoded) text
const params = new URLSearchParams(location.search)
if (params.has('text')) input.value = params.get('text')
else if (params.has('demo')) input.value = SAMPLE

run()
if (views.deslop.classList.contains('active')) input.focus()
