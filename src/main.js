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
    '<span class="spacer" style="flex:1"></span>' + legend +
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

// Cmd/Ctrl+Enter runs even when Live is off.
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (views.rules.classList.contains('active')) rulesDoc.save()
    else if (views.voice.classList.contains('active')) voiceDoc.save()
    else if (views.api.classList.contains('active')) apiDoc.save()
    else run()
  }
})

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabs = [...document.querySelectorAll('.tab')]
const views = {
  deslop: document.getElementById('view-deslop'),
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
  exList.innerHTML = ''
  exItems
    .map((it) => ({ ...it, sc: slopScore(it.text) }))
    .sort((a, b) => b.sc.score - a.sc.score)
    .forEach((it) => {
      const el = document.createElement('div')
      el.className = 'ex-item'
      el.dataset.file = it.file
      el.innerHTML =
        `<span class="ex-dot" style="background:${it.sc.color}"></span>` +
        `<span class="slug">${it.slug}</span>` +
        `<span class="stage">${it.stage || ''}</span>`
      el.addEventListener('click', () => showExample(it.file))
      exList.appendChild(el)
    })
}

function showExample(file) {
  const it = exItems.find((x) => x.file === file)
  if (!it) return
  exCurrent = it
  ;[...exList.children].forEach((c) => c.classList.toggle('active', c.dataset.file === file))
  const sc = slopScore(it.text)
  exTitle.textContent = it.slug
  exScore.innerHTML = `slop <b style="color:${sc.color}">${sc.score}</b> · ${it.words || it.text.trim().split(/\s+/).length} words`
  exBody.textContent = it.text
}

exLoad.addEventListener('click', () => {
  if (!exCurrent) return
  input.value = exCurrent.text
  switchTab('deslop')
  run()
})

// ---------------------------------------------------------------------------
// Doc editor tabs (Rules, Voice) — view + edit a markdown file on disk
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

// open the tab named in the URL hash on load (#examples / #rules), default de-slop
if (location.hash) switchTab(location.hash.slice(1))

// ?demo preloads the sample so the highlights are visible immediately
if (new URLSearchParams(location.search).has('demo')) input.value = SAMPLE

run()
if (views.deslop.classList.contains('active')) input.focus()
