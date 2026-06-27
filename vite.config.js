import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
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
  const voice = readFileSafe(path.join(root, 'voice.md'))
  const { seed, learned } = loadStyleExamples()
  const pairs = [...seed, ...learned.slice(-10)]
  const examples = pairs.map((p, i) =>
    `### Example ${i + 1}\nBEFORE (sloppy / AI):\n${clip(p.input || '', 1400)}\n\nAFTER (my voice — what I want):\n${clip(p.output || '', 1400)}`
  ).join('\n\n')

  return `You rewrite AI-sounding text into MY personal voice. You are not an editor — you are a ghostwriter who rewrites from scratch.

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

=== BEFORE → AFTER EXAMPLES (this is the target — imitate hard) ===
${examples}`
}

function runClaude(system, userText) {
  return new Promise((resolve, reject) => {
    const instruction = `Rewrite the following text in my voice, per the system instructions. Output ONLY the rewrite:\n\n${userText}`
    const args = ['-p', instruction, '--append-system-prompt', system, '--model', CLAUDE_MODEL, '--output-format', 'text']
    execFile(CLAUDE_BIN, args, { cwd: root, timeout: 180000, maxBuffer: 20 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || '').trim() || err.message))
        resolve((stdout || '').trim())
      })
  })
}

function runCodex(system, userText) {
  return new Promise((resolve, reject) => {
    const prompt = `${system}\n\n=== TASK ===\nRewrite the following text in my voice, per the instructions above. Output ONLY the rewrite, nothing else:\n\n${userText}`
    execFile(CODEX_BIN, ['exec', prompt], { cwd: root, timeout: 180000, maxBuffer: 20 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || '').trim() || err.message))
        resolve((stdout || '').trim())
      })
  })
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

function readBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => (d += c))
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

    // allow agents / tools to call the API from anywhere
    if (route.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
  server: { host: '127.0.0.1', port: 4242, strictPort: true },
  preview: { host: '127.0.0.1', port: 4242, strictPort: true },
})
