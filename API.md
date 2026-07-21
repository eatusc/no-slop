# No Slop — API

Run any text through the de-slop engine programmatically. Same engine as the app.
Use it from a script, an agent, or by telling an LLM to call it.

**The server must be running on port 4242.** Start it with `npm run dev` or
`npm run preview`. Base URL: `http://localhost:4242`.

---

## Primary integration endpoint

### `POST /api/deslop`
Body: raw text, **or** JSON `{"text": "..."}`.

```bash
# raw text in, JSON report out
curl -s -X POST http://localhost:4242/api/deslop \
  -H "Content-Type: text/plain" \
  --data-binary 'It is not just a tool, it is a revolution. 🚀 Furthermore, our seamless platform delves into a myriad of features.'
```

```bash
# JSON in
curl -s -X POST http://localhost:4242/api/deslop \
  -H "Content-Type: application/json" \
  -d '{"text":"... your AI text ..."}'
```

### Just the clean text (no JSON)
Add `?clean=1` to get `text/plain` back — ideal for piping:

```bash
curl -s -X POST "http://localhost:4242/api/deslop?clean=1" --data-binary @notes.md > notes.clean.md
```

### `GET /api/deslop?text=...`
Quick one-liners (URL-encoded). For anything long, use POST.

---

## Response shape

```jsonc
{
  "clean": "The de-slopped text.",
  "slop": {
    "score": 100,                 // 0 (human) … 100 (pure slop)
    "label": "Pure slop",
    "per100": 75.5,               // weighted slop points per 100 words
    "signals": { "flips": 1, "dashes": 1, "emoji": 1, "openers": 2, "words": 9, ... }
  },
  "fixes": {
    "total": 14,
    "byCategory": [ { "label": "Inflated words", "count": 9 }, ... ]
  },
  "flags": [                      // detected but NOT auto-fixed — rewrite by hand
    {
      "type": "antithesis",
      "label": "\"it's not X, it's Y\" pattern",
      "fix": "Cut the negation. Make the one positive point directly.",
      "count": 1,
      "samples": ["It is not just a tool, it is"]
    }
  ],
  "words": { "in": 23, "out": 18 }
}
```

`clean` is the auto-fixed text. `flags` are structural tells (the "it's not X, it's Y"
family) that can't be safely rewritten by machine — a human should fix those.

---

## Local application routes

The browser application uses several additional local endpoints. They are
documented so the integration surface is explicit, but only `/api/deslop` is a
stable, general-purpose text-processing contract.

| Method | Route | Purpose |
|---|---|---|
| `GET`, `POST` | `/api/deslop` | Clean text and return a score, fixes, and structural flags |
| `POST` | `/api/rewrite` | Run a heavy rewrite through an installed Claude or Codex CLI |
| `GET` | `/api/style` | Return seed and locally learned voice examples |
| `POST` | `/api/style` | Save a before/after voice example locally |
| `DELETE` | `/api/style?index=N` | Delete a locally learned example |
| `POST` | `/api/consolidate` | Distill learned examples into rules in `voice.md` |
| `GET` | `/api/examples` | Load the example corpus and computed metadata |
| `POST` | `/api/examples/dismiss` | Hide or restore an example locally |
| `GET`, `POST` | `/api/doc/{rules|voice|api}` | Read or atomically update an editable project document |

The AI rewrite and consolidation routes depend on a locally installed and
authenticated CLI. They do not accept or store hosted API keys. Learned voice
examples and dismissal state are gitignored.

### `POST /api/rewrite`

```json
{ "text": "Draft to rewrite", "engine": "claude" }
```

`engine` is restricted to `claude` or `codex`. Inputs are limited to 40,000
characters. Successful responses contain `{ "output": "...", "engine": "..." }`.

### `GET`, `POST`, `DELETE /api/style`

Save a locally learned before/after pair:

```json
{
  "input": "Original draft",
  "output": "Human rewrite",
  "engine": "manual"
}
```

Use `GET /api/style` to inspect counts and learned examples. Delete an example
with `DELETE /api/style?index=0`.

### `POST /api/examples/dismiss`

```json
{ "file": "example.txt", "dismissed": true }
```

Only simple `.txt` filenames are accepted.

---

## MCP tools

The native MCP server does not use these HTTP routes or require the Vite server.
It imports the shared engine directly and communicates over stdio.

| Tool | Input | Result |
|---|---|---|
| `deslop` | `{ "text": "..." }` | Clean text, score, fixes, flags, and JSON report |
| `slop_score` | `{ "text": "..." }` | Score and label only |

See [`mcp/README.md`](mcp/README.md) for client configuration.

---

## CLI (no server needed)

```bash
echo "your text" | node cli/deslop.mjs           # clean text -> stdout
node cli/deslop.mjs notes.md                      # clean a file
node cli/deslop.mjs --report < notes.md           # clean text + slop summary (to stderr)
node cli/deslop.mjs --json   < notes.md           # full JSON report
npm run deslop -- --report < notes.md             # via npm script
```

---

## Tell an LLM to use it

Paste this into any assistant that can run shell commands or HTTP (Claude Code, Cursor,
an agent, etc.):

> **De-slop instruction.** Whenever I ask you to "de-slop" text, or before you hand me
> any final writing, run it through my local No Slop engine instead of editing by feel.
> If you have shell access: `printf '%s' "<TEXT>" | node /path/to/noslop/cli/deslop.mjs --report`.
> Otherwise POST it: `curl -s -X POST "http://localhost:4242/api/deslop" -H "Content-Type: text/plain" --data-binary "<TEXT>"`.
> Return the `clean` text. Then look at `flags` — for each one, manually rewrite that
> sentence per its `fix` (these are the "it's not X, it's Y" patterns the engine won't
> touch). Show me the final text and the slop score.

Short version for a quick prompt:

> Run this through my de-slopper at `http://localhost:4242/api/deslop` (POST, raw text),
> give me back the `clean` field, and hand-fix anything in `flags`.

---

## Notes

- The server binds to `127.0.0.1` only (never the network) and rejects cross-origin
  browser requests. CLI tools and agents (curl, scripts) work fine — they don't send an
  `Origin` header. A website you visit cannot drive the API or read its responses.
- The rules behind the engine: `no-slop-rules.md` (strip) and `voice.md` (emulate).
- The API and CLI share `src/deslop.js` with the app — one engine, one behavior.
