# No Slop — Log

A running log of the app and the caption-conversion work.

---

## 2026-06-27 — App built

- Created the **No Slop** app at `~/Sites/localhost/noslop`.
- Stack: Vite (vanilla JS, no framework — fast install, single dependency).
- **Dedicated permanent port: 4242** (`http://localhost:4242`). Set in `vite.config.js`
  with `strictPort`, so a plain `npm run dev` always lands there.
- Dashboard launcher: `~/Desktop/Apps/Run_NoSlop.command` → app now shows
  up on the App Dashboard (localhost:4000). First run auto-runs `npm install`.
- Interface: paste AI text on the left, get the de-slopped version on the right, live.
  Footer shows a count of every fix by category. Copy button. "Try a sample" button.
- Engine: `src/deslop.js` — em/en dashes, smart quotes, emoji, filler openers,
  throat-clearing transitions, empty hype phrases, inflated-word swaps, cleanup pass.
- Wrote `no-slop-rules.md` (the full ruleset, AUTO + HUMAN) and researched 2026
  best-practice for human-sounding writing to ground it.

### Caption corpus collected
- Pulled every `caption.txt` from `~/Sites/localhost/slideshows`.
- 33 unique captions (deduped by content) copied into `examples/`, indexed in
  `examples/_index.json` (slug, pipeline stage, word count, source path).
- These are HAP's real captions — used as the test/conversion set. Note: many are
  already strong, human HAP voice; they're the benchmark to measure the de-slopper
  against, not just slop to strip.

---

## 2026-06-27 — Slopometer + minimalist redesign

- Added the **Slopometer**: a green→red gradient bar with a needle, scoring text
  0 (human) to 100 (pure slop). Algorithm v1 in `slopScore()` (`src/deslop.js`):
  weighted "slop points" from mechanical tells + structure signals (hedges, vague
  nouns, rule-of-three), normalized per 100 words, squashed through a saturating
  curve. Sanity check: the slop sample → 100; real HAP captions → 0–24 (human /
  lightly seasoned). Tunable via `WEIGHTS` and `K` — refine as we go.
- **Redesigned to minimalist editorial** (per the "Bring The Hype" reference):
  warm cream background, serif display wordmark (Hoefler/Caslon), hairline rules,
  uppercase letter-spaced labels, lots of whitespace, terracotta accent. Dropped
  the dark dashboard theme.
- Registered with the App Dashboard (rescan → 17 apps).

---

## 2026-06-27 — Tabs, examples browser, editable rules, change highlights

- Added **tab nav**: De-slop · Examples · Rules (with `#hash` deep-links).
- **Examples tab**: browses all 33 captions from `examples/`, sorted by slop score
  with a colored dot each; click to read; "De-slop this →" loads it into the tool.
  Served by a new Vite middleware API (`/api/examples`) in `vite.config.js`.
- **Rules tab**: loads `no-slop-rules.md`, edit it in-app, **Save writes straight to
  the file on disk** (`GET`/`POST /api/rules`, atomic write). Cmd+Enter saves.
- **Change highlights** (`src/diff.js`): the output pane is now a word-level diff —
  removed slop struck through in red, swapped-in words highlighted green, with a
  legend + per-category counts. Toggle with the "Highlights" checkbox; Copy always
  copies the clean plain text. Capitalization/whitespace-only noise is ignored.
- `?demo=1` preloads a slop sample to show the highlights immediately.

---

## 2026-06-27 — voice.md

- Added `voice.md`: the positive counterpart to `no-slop-rules.md` — what good writing
  should *sound* like, not just what to strip. 10 voice traits + signature moves +
  rhythm cheatsheet, every example a real HAP caption from `examples/`
  (dont-read-this-bot, build-it-yourself, ai-jobs-doom-boom, ai-interface-mcp,
  thrivepact-case-study, ai-codes-shortcuts, start-here).
- **Voice tab added** — mirrors Rules: view/edit `voice.md` on disk. Refactored both
  into one reusable doc-editor (`setupDoc` in `main.js`, shared `.doc-*` CSS) served by
  a generic `GET/POST /api/doc/<name>` endpoint (`rules`, `voice`). Cmd+Enter saves the
  active doc. (Old `/api/rules` route replaced.)

---

## 2026-06-27 — Lyn Alden as a long-form voice example

- Pulled from lynalden.com/feed/ (feed had summaries only, so fetched full articles).
- Saved two essays to `examples/lyn-alden/`: `fractional-reserve-banking.txt` (9.2k words)
  and `why-most-cryptocurrencies-wont-accrue-value.txt` (2.2k words), as plain text.
- Added an **External benchmark — Lyn Alden** section to `voice.md`: 6 traits for
  long-form analytical writing (plain opener, receipts with real numbers, own your
  track record, build in steps, conviction without hype, explicit "why it matters"),
  each with a real excerpt. Complements the short-form HAP captions.
- `examples/lyn-alden/fetch-lyn.sh <slug>` re-pulls / adds more essays.
- Note: her essays live in a subfolder and intentionally do NOT appear in the Examples
  tab (that tab is the *slop* test set; her writing is the good-voice benchmark).
- **Codified her style into rules.** Measured her essays (sentence-length distribution,
  single-sentence paragraph rate, numeric density, And/But openers, rhetorical-question
  count) and turned the patterns into a 12-rule **"Long-form rules — derived from Lyn
  Alden"** section in `voice.md`, plus a long-form structure arc. Each rule has a real
  excerpt. Grounded in data, not generic advice.

---

## 2026-06-27 — API + CLI, creator research, GitHub

- **De-slop API**: `POST /api/deslop` (raw text or JSON) → `{clean, slop, fixes, flags,
  words}`; `?clean=1` returns plain text. CORS open. Served by the Vite middleware on
  4242, importing the same `src/deslop.js` as the app. Added an **API tab** (API.md,
  editable) and a copy-paste LLM instruction block in `API.md`.
- **CLI**: `cli/deslop.mjs` — `echo text | node cli/deslop.mjs [--report|--json]`,
  `npm run deslop`. Same engine, no server needed.
- **Flags**: engine now detects the "it's not X, it's Y" antithesis family (Hormozi's
  #1 tell) + "not just X but Y" / "X isn't Y, it's Z" / "not about X, it's about Y".
  Not auto-rewritten — surfaced as ⚑ chips in the UI, `flags` in the API, and weighted
  hardest in the Slopometer. Removed the old crude `not only` auto-swap.
- **Creator research → rules**: added §0 (antithesis pattern) and a "Field notes —
  what creators flag" table to `no-slop-rules.md` (Hormozi, Peter Yang, Nassery,
  Ramonov, Stolte, Vyas, Wize AI), plus two principles: refine-don't-generate (Leila
  Hormozi) and the anti-style-file method.
- **GitHub**: pushed to https://github.com/eatusc/no-slop (public, main). Excluded
  `node_modules` and `examples/lyn-alden/*.txt` (third-party copyright — regenerate via
  `fetch-lyn.sh`). Added `README.md`.

---

## 2026-06-27 — White-hat reframing of the long-form rules

- Reworked the long-form section of `voice.md` from "emulate Lyn Alden" to **general
  clear-writing craft**. Added an explicit white-hat note: her public essays were used
  *only* to identify/measure which general techniques mark human prose — NOT to imitate
  her voice or reuse her words. Replaced all her verbatim quotes with generic, self-
  written illustrations. Updated the Sources section to state her text isn't
  redistributed and to respect lynalden.com's terms. Engine/rules unchanged.

---

## 2026-06-27 — Code cleanup + README integration guide

- **Cleanup pass** (behavior unchanged, all verified): de-duped the `count`/`countMatches`
  helper in `deslop.js`; updated the stale "browser-only" header to note it runs
  anywhere (app/API/CLI) and listed all exports; moved the Cmd+Enter keydown handler in
  `main.js` below the declarations it uses (top-to-bottom read order); Examples now
  scores each item once and reuses it (no recompute in `showExample`); dropped a
  redundant inline `flex:1` style; refreshed stale comments in `main.js`/`vite.config.js`.
- **README rewrite** with a "Plug it into your workflow" section: shell function +
  pbpaste/pbcopy, LLM/agent instruction, Node, Python, macOS Quick Action/Raycast, and
  an MCP-style tool description. Response shape and engine-as-single-source documented.

---

## 2026-06-27 — Fix: footer/chips overlapping text on long input

- Bug: with a long paste, the two-pane `main` grid row auto-sized to the text height,
  so panes overflowed and the footer chips/legend painted over the content mid-page.
- Fix: `main { grid-template-rows: minmax(0, 1fr) }` + `.pane { min-height: 0;
  overflow: hidden }` so each pane scrolls internally and the footer stays pinned.
- Added a `?text=...` URL param (prefill the de-slopper with URL-encoded text) — handy
  for sharing/deep-links, and used it to reproduce + verify the fix.

---

## 2026-06-27 — AI Rewrite tab + learning loop (the real de-slop)

The regex engine only does surface cleanup. Added a true **rewrite** that restructures,
distills, and writes in Eric's voice — driven by an LLM via his local CLI (no API key).

- **Engine:** shells to the `claude` CLI (`claude -p --append-system-prompt --model
  claude-opus-4-8 --output-format text`), or `codex exec`. Uses existing login. Binary
  paths resolved (`~/.local/bin/claude`, `/opt/homebrew/bin/codex`) so it works under the
  dashboard's env. `/api/rewrite` in `vite.config.js`.
- **Prompt:** system = a distilled "tells to avoid" list (NOT the rules' word-swap table,
  which caused literal swapping) + full `voice.md` + the style-bank examples as
  BEFORE→AFTER few-shot. Heavy-rewrite mandate + hard constraints (keep numbers, names,
  links exactly; output only the rewrite).
- **Spec (from clarifying Qs):** full rewrite · distill to essentials · my voice · may add
  a real take · Opus 4.8 · separate Rewrite tab (instant De-slop stays) · one output +
  Regenerate · editable output.
- **Learning loop:** "Add to my voice" saves the input → my-edited-output pair to
  `style/examples.jsonl` (gitignored); future rewrites read it as few-shot. Seeded with
  the before/after Eric gave (`style/seed.jsonl`, committed). `/api/style` GET/POST.
- **UI:** Rewrite tab (engine select, Rewrite, Regenerate, voice count); Examples tab got
  a "Rewrite this ✦" button. Cmd+Enter rewrites.
- Verified: SpaceX caption rewrote from a long structured post into punchy distilled lines
  in ~10s, keeping every figure/name/hashtag and adding a take.

---

## 2026-06-27 — Security & cleanup pass (pre-public audit)

- **CSRF/origin guard:** `/api/*` now rejects cross-origin browser requests (Origin not
  localhost → 403). Since the server can run the CLI and write files, this stops a
  website you visit from driving it. CLI/agents (no Origin) still work.
- **Removed wildcard CORS** (`ACAO: *`) and set Vite `server.cors: false`; bound to
  `127.0.0.1` only. Other origins can't read API responses.
- **Input caps:** request body ≤ 4MB; rewrite/style text ≤ 40k chars; engine whitelisted.
- **Shell safety:** CLI calls use `execFile` with arg arrays (no shell), so pasted text
  can't inject commands.
- **Privacy:** stripped personal `source` paths (`/Users/ericlai/...`) from
  `examples/_index.json`; scrubbed the username from `API.md`/`log.md`. No secrets/keys
  in the repo (verified). Switched commit author to a GitHub noreply email.
- Verified: all JS syntax-checks; no stray/untracked files; node_modules, learned voice
  data, and third-party essays all gitignored.

---

## Conversion progress

Working through `examples/` one at a time. Mark each as we go.

| # | Caption | Status | Notes |
|---|---|---|---|
| 1 | dont-read-this-bot | — | The non-slop manifesto. Use as the gold standard. |
| 2 | start-here | — | |
| 3 | ai-jobs-doom-boom | — | Has a stray ` - ` to normalize. |
| … | (30 more in `examples/`) | — | |

**Status key:** — not started · 🔧 in progress · ✅ done · ⏭ skipped (already clean)

---

## Ideas / TODO

- [ ] Side-by-side diff highlighting (show exactly what changed inline).
- [ ] Per-rule toggles so aggressive swaps (e.g. `crucial → key`) can be turned off.
- [ ] "Human pass" checklist (rules §7–8) shown next to the output as reminders.
- [ ] Batch mode: drop a folder of captions, get all de-slopped versions.
