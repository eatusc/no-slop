import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deslop, slopScore, flagsFor } from './src/deslop.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const EXAMPLES_DIR = path.join(root, 'examples')

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
