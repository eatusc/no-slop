# No Slop

Paste AI-generated text, get the human version. A minimalist tool that strips the
tells of language-model writing — em-dash overload, curly quotes, emoji, filler
openers, throat-clearing transitions, hype phrases, and inflated vocabulary — then
shows you exactly what changed and scores how sloppy the original was.

Runs locally on a dedicated port: **http://localhost:4242**

![tabs: De-slop · Examples · Rules · Voice · API](#)

## Features

- **De-slop** — paste on the left, clean version on the right, live. A word-level
  diff highlights what was **swapped** (green) and **removed** (struck red).
- **Slopometer** — a 0–100 gradient meter scoring how much slop the text carries,
  weighting the *"it's not X, it's Y"* antithesis pattern hardest (the #1 AI tell).
- **Flags** — structural tells that can't be safely auto-rewritten (the antithesis
  family) are flagged for you to fix by hand.
- **Examples** — browse a corpus of captions, sorted by slop score.
- **Rules / Voice** — `no-slop-rules.md` (what to strip) and `voice.md` (what to
  emulate), both viewable and editable in-app, saved straight to disk.
- **API + CLI** — run text through the same engine programmatically. See `API.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:4242
```

## API

```bash
# clean text -> JSON report (slop score, fixes, flags)
curl -s -X POST http://localhost:4242/api/deslop \
  -H "Content-Type: text/plain" --data-binary 'your AI text here'

# just the clean text
curl -s -X POST "http://localhost:4242/api/deslop?clean=1" --data-binary @notes.md

# CLI (no server)
echo "your text" | node cli/deslop.mjs --report
```

Full reference, response shape, and a copy-paste instruction for pointing an LLM at it:
see [`API.md`](API.md).

## How it works

One engine — `src/deslop.js` — powers the app, the API, and the CLI. The rules it
encodes are documented in [`no-slop-rules.md`](no-slop-rules.md); the positive voice
to aim for is in [`voice.md`](voice.md).

## License

MIT for the code. Example captions are sample content; third-party essay text is not
included (regenerate locally with `examples/lyn-alden/fetch-lyn.sh`).
