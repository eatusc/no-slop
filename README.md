# No Slop

Paste AI-generated text, get the human version. A minimalist tool that strips the
tells of language-model writing — em-dash overload, curly quotes, emoji, filler
openers, throat-clearing transitions, hype phrases, and inflated vocabulary — then
shows you exactly what changed and scores how sloppy the original was.

Runs locally on a dedicated port: **http://localhost:4242**

One engine — [`src/deslop.js`](src/deslop.js) — powers the app, the HTTP API, and the
CLI, so they all behave identically.

---

## Features

- **De-slop** — paste on the left, clean version on the right, live. A word-level diff
  highlights what was **swapped** (green) and **removed** (struck red).
- **Slopometer** — a 0–100 gradient meter scoring how much slop the text carries,
  weighting the *"it's not X, it's Y"* antithesis pattern hardest (the #1 AI tell).
- **Flags** — structural tells that can't be safely auto-rewritten (the antithesis
  family) are flagged for you to fix by hand.
- **Examples** — browse a caption corpus, sorted by slop score.
- **Rules / Voice / API** — [`no-slop-rules.md`](no-slop-rules.md) (what to strip),
  [`voice.md`](voice.md) (what to emulate), and [`API.md`](API.md), all viewable and
  editable in-app, saved straight to disk.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:4242
```

The de-slop API is live whenever the app is running.

---

## Use the API

`POST /api/deslop` with raw text, or JSON `{"text": "..."}`.

```bash
# full JSON report: clean text + slop score + fixes + flags
curl -s -X POST http://localhost:4242/api/deslop \
  -H "Content-Type: text/plain" --data-binary 'your AI text here'

# just the clean text (text/plain) — ideal for piping
curl -s -X POST "http://localhost:4242/api/deslop?clean=1" --data-binary @notes.md
```

Response shape:

```jsonc
{
  "clean": "the de-slopped text",
  "slop":  { "score": 100, "label": "Pure slop", "signals": { "flips": 1, ... } },
  "fixes": { "total": 14, "byCategory": [ { "label": "Inflated words", "count": 9 } ] },
  "flags": [ { "type": "antithesis", "label": "\"it's not X, it's Y\" pattern",
              "fix": "Cut the negation. Make the one positive point directly.",
              "count": 1, "samples": ["It is not just a tool, it is"] } ],
  "words": { "in": 23, "out": 18 }
}
```

`clean` is auto-fixed. `flags` are things to rewrite by hand. Full reference: [`API.md`](API.md).

No server? Use the CLI: `echo "text" | node cli/deslop.mjs --report`.

---

## Plug it into your workflow

### 1. A shell command you can run from anywhere
Add to `~/.zshrc` (adjust the path), then `source ~/.zshrc`:

```bash
deslop() {
  # reads stdin or a file arg, prints the clean text
  if [ -t 0 ] && [ -n "$1" ]; then
    curl -s -X POST "http://localhost:4242/api/deslop?clean=1" --data-binary @"$1"
  else
    curl -s -X POST "http://localhost:4242/api/deslop?clean=1" --data-binary @-
  fi
}
```

```bash
pbpaste | deslop | pbcopy        # clean whatever's on your clipboard (macOS)
deslop draft.md > draft.clean.md # clean a file
```

(Offline variant, no server: `deslop() { node ~/Sites/localhost/noslop/cli/deslop.mjs "$@"; }`)

### 2. Tell an LLM / coding agent to use it
Paste this into Claude Code, Cursor, or any agent with shell or HTTP access:

> **De-slop rule.** Before you hand me any final writing, run it through my local No Slop
> engine instead of editing by feel. POST the text to
> `http://localhost:4242/api/deslop` (raw body), return the `clean` field, then for each
> item in `flags` rewrite that sentence per its `fix`. Show me the final text and the
> `slop.score`.

Or point the model at the rules files directly (the "anti-style-file" method): give it
[`no-slop-rules.md`](no-slop-rules.md) and [`voice.md`](voice.md) and say *"apply these
as rules to everything you write for me."*

### 3. From Node / a script

```js
const res = await fetch('http://localhost:4242/api/deslop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text }),
})
const { clean, slop, flags } = await res.json()
```

Or import the engine directly, no server:

```js
import { deslop, slopScore, flagsFor } from './src/deslop.js'
const { text: clean } = deslop(input)
```

### 4. From Python

```python
import requests
def deslop(text: str) -> str:
    r = requests.post("http://localhost:4242/api/deslop",
                      data=text.encode(), headers={"Content-Type": "text/plain"})
    return r.json()["clean"]
```

### 5. macOS Quick Action / Raycast / Alfred
Make a "Clean selected text" service that pipes the selection through the CLI or curl:

```bash
node ~/Sites/localhost/noslop/cli/deslop.mjs   # input: stdin, output: replaces selection
```

### 6. As an agent tool (MCP-style)
Describe one tool to your agent:

- **name:** `deslop`
- **description:** "Remove AI-writing tells from text. Returns cleaned text plus flags to rewrite by hand."
- **call:** `POST http://localhost:4242/api/deslop` with `{ "text": "..." }`
- **use the result's** `clean` field; surface `flags` to the user.

---

## How it works

The engine encodes the rules in [`no-slop-rules.md`](no-slop-rules.md); the positive
voice to aim for is in [`voice.md`](voice.md). The app, [`API.md`](API.md) endpoint, and
[`cli/deslop.mjs`](cli/deslop.mjs) all call the same `deslop()`, `slopScore()`, and
`flagsFor()` — change a rule once, everything updates.

---

## License

MIT for the code. Example captions are sample content. Third-party essay text is **not**
included; the long-form writing rules in `voice.md` are general craft in our own words,
and any analysis source can be regenerated locally with `examples/lyn-alden/fetch-lyn.sh`.
