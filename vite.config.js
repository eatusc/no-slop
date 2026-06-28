import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deslop, slopScore, flagsFor } from './src/deslop.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const EXAMPLES_DIR = path.join(root, 'examples')
const STYLE_DIR = path.join(root, 'style')
const SEED_FILE = path.join(STYLE_DIR, 'seed.jsonl')         // shipped, generic
const LEARNED_FILE = path.join(STYLE_DIR, 'examples.jsonl')  // local, grows on "Add to my voice"
const CLAUDE_MODEL = 'claude-opus-4-8'

// ---------------------------------------------------------------------------
// AI rewrite — shell out to the user's local CLI (claude / codex). No API key:
// it uses their existing login. Same rules+voice files as the app drive the
// system prompt, and the style bank (seed + learned pairs) is few-shot context.
// ---------------------------------------------------------------------------

function whichBin(name, candidates) {
  for (const c of candidates) { try { if (c && fs.existsSync(c)) return c } catch (_) {} }
  return name // fall back to PATH lookup
}
const HOME = os.homedir()
const CLAUDE_BIN = whichBin('claude', [process.env.CLAUDE_BIN, path.join(HOME, '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'])
const CODEX_BIN = whichBin('codex', [process.env.CODEX_BIN, '/opt/homebrew/bin/codex', '/usr/local/bin/codex', path.join(HOME, '.local/bin/codex')])

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (_) { return '' } }

function loadStyleExamples() {
  const parse = (txt) => txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch (_) { return null } }).filter(Boolean)
  const seed = parse(readFileSafe(SEED_FILE))
  const learned = parse(readFileSafe(LEARNED_FILE))
  return { seed, learned, all: [...seed, ...learned] }
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)

// A distilled tells list — NOT the full swap table from no-slop-rules.md.
// Dumping the word-for-word swaps makes the model do literal substitutions
// instead of rewriting; this keeps it as "avoid these," not "swap these."
const TELLS = `- Em-dashes, curly quotes, and emoji.
- Filler openers: "It's important to note", "Needless to say", "At the end of the day", "In conclusion".
- Throat-clearing transitions: "Furthermore", "Moreover", "Additionally".
- Hype/inflated words: leverage, utilize, seamless, robust, cutting-edge, myriad, game-changer, delve, elevate, revolutionize, unlock, foster.
- Empty phrases: "in today's fast-paced world", "rich tapestry of", "a testament to", "take it to the next level".
- The antithesis tic: "it's not X, it's Y" / "not just X but Y" / "this isn't about X, it's about Y".
- Rule-of-three lists, even sentence length, hedging, vague nouns (solutions, journey, landscape), and saying nothing.`

function buildSystemPrompt() {
  // Strip the italic example quotes (`*"..."*`) from voice.md — the model tends
  // to parrot those isolated sentences as openers. Keep the principles/headers.
  const voice = readFileSafe(path.join(root, 'voice.md'))
    .split('\n').filter((l) => !l.includes('*"')).join('\n')
  const { seed, learned } = loadStyleExamples()
  const pairs = [...seed, ...learned.slice(-10)]
  const examples = pairs.map((p, i) =>
    `### Example ${i + 1}\nBEFORE (sloppy / AI):\n${clip(p.input || '', 1400)}\n\nAFTER (my voice — what I want):\n${clip(p.output || '', 1400)}`
  ).join('\n\n')

  return `You rewrite AI-sounding text into MY personal voice. You are not an editor — you are a ghostwriter who rewrites from scratch.

CRITICAL OUTPUT RULE: Your entire response must be ONLY the rewritten version of the user's text. No preamble, no commentary, no thinking out loud, no "wrong file", no quoting. The RULES, VOICE, and EXAMPLES sections below are REFERENCE ONLY — never copy, quote, or mention any sentence from them. Rewrite only the user's text (it comes after all this, marked clearly).

THIS IS A HEAVY REWRITE, NOT A LIGHT EDIT. If your draft looks like the input with a few words swapped, you have failed — throw it out and start over.
- Distill hard. Cut to the core message. The output should be MUCH shorter than the input (often half or less).
- Restructure completely: collapse paragraphs and bullet lists into short, punchy lines and one-line statements. Break the input's shape.
- Vary rhythm: mix three-word lines with longer ones. Use fragments. Sound like a person talking, not an essay.
- Add a real take. You MAY sharpen the point and drop a blunt one-line reaction (like the "Not true anymore!" in the example). Don't hedge, don't both-sides it.
- Kill every AI tell (listed below).

HARD CONSTRAINTS — never violate:
- Keep every number, statistic, date, and percentage exactly as written.
- Keep every name and proper noun (people, products, companies, tools) exactly.
- Keep every link/URL exactly.
- Don't invent facts the source doesn't support. Sharpening the point is fine; fabricating claims is not.
- Output ONLY the rewritten text. No preamble, no "Here's the rewrite", no commentary, no quotes around it.

The BEFORE → AFTER examples at the very end are the single most important guide — they show exactly the kind of transformation and the voice I want. Imitate that transformation aggressively. When in doubt, make it shorter and blunter.

=== AI TELLS TO KILL ===
${TELLS}

=== MY VOICE (study this) ===
${voice}

=== BEFORE → AFTER EXAMPLES (REFERENCE ONLY — study the transformation, never copy or quote these lines) ===
${examples}`
}

// Run a CLI with stdin CLOSED (stdio[0]: 'ignore' → /dev/null). This is critical:
// both `claude -p` and `codex exec` will block forever waiting on stdin otherwise.
// If outFile is given, the clean result is read from there (codex --output-last-message);
// otherwise stdout is used (claude --output-format text).
function runCli(bin, args, { outFile } = {}) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(bin, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) { return reject(e) }
    let stdout = '', stderr = '', killed = false
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL') }, 180000)
    child.stdout.on('data', (d) => { stdout += d; if (stdout.length > 20 * 1024 * 1024) child.kill('SIGKILL') })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      let fileOut = ''
      if (outFile) {
        try { fileOut = fs.readFileSync(outFile, 'utf8').trim() } catch (_) {}
        try { fs.unlinkSync(outFile) } catch (_) {}
      }
      const result = (fileOut || stdout).trim()
      if (killed) return reject(new Error('timed out after 180s'))
      if (result) return resolve(result)
      reject(new Error(stderr.trim() || `${path.basename(bin)} exited with code ${code}`))
    })
  })
}

const tmpFile = (tag) => path.join(os.tmpdir(), `noslop-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`)

function runClaude(system, userText) {
  const instruction = `Here is MY text to rewrite. Rewrite ONLY this, in my voice, per the system instructions. Output nothing but the rewrite — no preamble, no quoting the guide or examples:\n\n<<<TEXT TO REWRITE>>>\n${userText}\n<<<END>>>`
  return runCli(CLAUDE_BIN, ['-p', instruction, '--append-system-prompt', system, '--model', CLAUDE_MODEL, '--output-format', 'text'])
}

function runCodex(system, userText) {
  const prompt = `${system}\n\n=== TASK ===\nRewrite the following text in my voice, per the instructions above. Output ONLY the rewrite, nothing else:\n\n${userText}`
  const outFile = tmpFile('codex')
  // read-only sandbox + ephemeral so it can't touch files or persist sessions
  const args = ['exec', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '-o', outFile, prompt]
  return runCli(CODEX_BIN, args, { outFile })
}

// editable markdown docs exposed at /api/doc/<name>
const DOCS = {
  rules: path.join(root, 'no-slop-rules.md'),
  voice: path.join(root, 'voice.md'),
  api: path.join(root, 'API.md'),
}

const wordCount = (s) => (s.trim().match(/\S+/g) || []).length

// The shape every de-slop API call returns.
function deslopResult(text) {
  const src = text || ''
  const { text: clean, groups, total } = deslop(src)
  const s = slopScore(src)
  return {
    clean,
    slop: { score: s.score, label: s.label, per100: s.per100, signals: s.signals },
    fixes: { total, byCategory: groups },
    flags: flagsFor(src), // detected-but-not-auto-fixed; rewrite by hand
    words: { in: wordCount(src), out: wordCount(clean) },
  }
}

const MAX_BODY = 4 * 1024 * 1024 // 4MB cap so a huge POST can't exhaust memory
function readBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => {
      d += c
      if (d.length > MAX_BODY) { req.destroy(); resolve('') } // too big -> treat as empty
    })
    req.on('end', () => resolve(d))
    req.on('error', () => resolve(''))
  })
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

// Local API served inside Vite's dev/preview server:
//   POST /api/deslop      de-slop text (raw or JSON) -> report, or ?clean=1 plain text
//   GET  /api/examples    the caption corpus
//   GET/POST /api/doc/<name>   read/write an editable markdown doc (rules|voice|api)
function noslopApi() {
  const handler = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    const route = url.pathname

    // Cross-origin guard (CSRF defense). This server can run your CLI and write
    // files, so a website you visit must NOT be able to drive it. Browsers always
    // attach an Origin header on cross-origin requests; reject anything not from
    // localhost. CLI tools / agents (curl) send no Origin and are allowed, and the
    // app itself is same-origin. No wildcard CORS header is set, so other origins
    // also can't read any response.
    if (route.startsWith('/api/')) {
      const origin = req.headers.origin
      if (origin) {
        let host = ''
        try { host = new URL(origin).hostname } catch (_) {}
        if (host !== 'localhost' && host !== '127.0.0.1') {
          return json(res, 403, { error: 'cross-origin requests are not allowed' })
        }
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    }

    try {
      // ---- the de-slop API ----------------------------------------------
      // POST /api/deslop   body: raw text, or JSON {"text": "..."}
      // GET  /api/deslop?text=...    (or ?clean=1 to return plain text only)
      if (route === '/api/deslop') {
        let text = ''
        if (req.method === 'GET') {
          text = url.searchParams.get('text') || ''
        } else {
          const body = await readBody(req)
          const ct = req.headers['content-type'] || ''
          if (ct.includes('application/json')) {
            try { text = JSON.parse(body).text || '' } catch (_) { text = '' }
          } else {
            text = body
          }
        }
        const result = deslopResult(text)
        // ?clean=1 → return just the cleaned text as text/plain (easy to pipe)
        if (url.searchParams.get('clean') === '1' || url.searchParams.get('format') === 'text') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
          return res.end(result.clean)
        }
        return json(res, 200, result)
      }

      // ---- AI rewrite: shell to claude/codex ----------------------------
      if (route === '/api/rewrite' && req.method === 'POST') {
        const body = await readBody(req)
        let text = '', engine = 'claude'
        try { const j = JSON.parse(body); text = j.text || ''; engine = j.engine || 'claude' } catch (_) {}
        if (!text.trim()) return json(res, 400, { error: 'No text provided.' })
        if (text.length > 40000) return json(res, 400, { error: 'Text too long (40k char limit).' })
        if (engine !== 'claude' && engine !== 'codex') engine = 'claude' // whitelist the engine
        const system = buildSystemPrompt()
        try {
          const output = engine === 'codex' ? await runCodex(system, text) : await runClaude(system, text)
          return json(res, 200, { output, engine })
        } catch (err) {
          return json(res, 500, { error: `${engine} CLI failed: ${err.message}` })
        }
      }

      // ---- style bank: the learned voice examples -----------------------
      if (route === '/api/style' && req.method === 'GET') {
        const { seed, learned } = loadStyleExamples()
        return json(res, 200, { seedCount: seed.length, learnedCount: learned.length, total: seed.length + learned.length, learned })
      }
      if (route === '/api/style' && req.method === 'POST') {
        const body = await readBody(req)
        let input = '', output = '', engine = ''
        try { const j = JSON.parse(body); input = j.input || ''; output = j.output || ''; engine = j.engine || '' } catch (_) {}
        if (!input.trim() || !output.trim()) return json(res, 400, { error: 'Need both input and output.' })
        if (input.length > 40000 || output.length > 40000) return json(res, 400, { error: 'Example too long (40k char limit).' })
        const entry = JSON.stringify({ input, output, engine, ts: new Date().toISOString() })
        fs.appendFileSync(LEARNED_FILE, entry + '\n')
        const { seed, learned } = loadStyleExamples()
        return json(res, 200, { ok: true, total: seed.length + learned.length, learnedCount: learned.length })
      }

      if (route === '/api/examples' && req.method === 'GET') {
        let index = []
        try {
          index = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, '_index.json'), 'utf8'))
        } catch (_) {
          // fall back to whatever .txt files are present
          index = fs.readdirSync(EXAMPLES_DIR)
            .filter((f) => f.endsWith('.txt'))
            .map((f) => ({ file: f, slug: f.replace(/\.txt$/, ''), stage: '', words: 0 }))
        }
        const items = index.map((it) => {
          let text = ''
          try { text = fs.readFileSync(path.join(EXAMPLES_DIR, it.file), 'utf8') } catch (_) {}
          return { ...it, text }
        })
        return json(res, 200, { items })
      }

      const docMatch = route.match(/^\/api\/doc\/(\w+)$/)
      if (docMatch && DOCS[docMatch[1]]) {
        const file = DOCS[docMatch[1]]
        if (req.method === 'GET') {
          let text = ''
          try { text = fs.readFileSync(file, 'utf8') } catch (_) {}
          return json(res, 200, { text })
        }
        if (req.method === 'POST') {
          const body = await readBody(req)
          let text = ''
          try { text = JSON.parse(body).text || '' } catch (_) { text = '' }
          const tmp = file + '.tmp'
          fs.writeFileSync(tmp, text)        // atomic write
          fs.renameSync(tmp, file)
          return json(res, 200, { ok: true, bytes: Buffer.byteLength(text) })
        }
      }

      next()
    } catch (err) {
      json(res, 500, { error: err.message })
    }
  }

  return {
    name: 'noslop-api',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}

// No Slop runs on its own dedicated, permanent port (4242).
export default defineConfig({
  plugins: [noslopApi()],
  // bind to loopback only (never the LAN), and disable Vite's own permissive
  // dev CORS — the app is same-origin and the API has its own origin guard
  server: { host: '127.0.0.1', port: 4242, strictPort: true, cors: false },
  preview: { host: '127.0.0.1', port: 4242, strictPort: true, cors: false },
})
