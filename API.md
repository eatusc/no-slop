# No Slop — API

Run any text through the de-slop engine programmatically. Same engine as the app.
Use it from a script, an agent, or by telling an LLM to call it.

**The server must be running on port 4242** (turn on "No Slop" in the dashboard, or
double-click `Run_NoSlop.command`). Base URL: `http://localhost:4242`.

---

## Endpoint

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
> If you have shell access: `printf '%s' "<TEXT>" | node /Users/YOUR_USER/Sites/localhost/noslop/cli/deslop.mjs --report`.
> Otherwise POST it: `curl -s -X POST "http://localhost:4242/api/deslop" -H "Content-Type: text/plain" --data-binary "<TEXT>"`.
> Return the `clean` text. Then look at `flags` — for each one, manually rewrite that
> sentence per its `fix` (these are the "it's not X, it's Y" patterns the engine won't
> touch). Show me the final text and the slop score.

Short version for a quick prompt:

> Run this through my de-slopper at `http://localhost:4242/api/deslop` (POST, raw text),
> give me back the `clean` field, and hand-fix anything in `flags`.

---

## Notes

- CORS is open (`Access-Control-Allow-Origin: *`), so browser tools and agents can call it.
- The rules behind the engine: `no-slop-rules.md` (strip) and `voice.md` (emulate).
- The API and CLI share `src/deslop.js` with the app — one engine, one behavior.
