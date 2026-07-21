# No Slop — Django/DRF port

A second backend for the same de-slop engine, built on a **Python + Django +
Django REST Framework** stack, with React/Next.js as the intended frontend. It
shows the same engine and API contract running on a common enterprise Python
stack, not just the Node original.

The original app (`../`) is Node/Vite: one pure-function engine
(`../src/deslop.js`) reused by an HTTP API embedded in Vite's dev server, a
CLI, and an MCP server. This port keeps that same architecture — **one
engine, many surfaces** — translated to Django's idioms:

```
django_api/
  deslop/
    engine.py        # ported line-by-line from ../src/deslop.js — no Django import
    serializers.py    # DRF input validation (the response shape is verified in tests.py instead)
    parsers.py         # custom parser so raw text/plain bodies work, like the Node API
    views.py            # POST/GET /api/deslop/
    tests.py             # 18 tests: endpoint behavior, edge cases, engine parity
  cli/
    deslop_cli.py     # same engine, no server or Django needed
  noslop_api/
    settings.py        # DRF throttling + CORS in place of the Node origin-guard
```

## Why a second backend for the same tool

The Node version is what actually runs day to day. This port exists to prove
the same API design translates cleanly to Django/DRF — a common enterprise
backend stack — without changing the response contract at all.
A client (curl, a script, a React app) can point at either backend and get
the same output; see [Engine parity](#engine-parity) below for how that was
checked on real inputs rather than assumed from reading the regex side by
side (it isn't a formal proof across every possible string).

## Run it

**Requires Python 3.12+** (Django 6.0 needs it). macOS ships a much older
`/usr/bin/python3` (3.9.x) that will fail installing `requirements.txt` --
use a newer interpreter explicitly, e.g. Homebrew's `python3.12`+ or
`python3.14` (`brew install python@3.14`), not whatever `python3` resolves
to by default.

```bash
cd django_api
python3.14 -m venv venv && source venv/bin/activate   # or python3.12+
pip install -r requirements.txt
python manage.py migrate          # one-time; see "Migration noise" below
python manage.py test deslop      # 18 tests, all green
python manage.py runserver 127.0.0.1:8420
```

```bash
# full JSON report
curl -s -X POST http://127.0.0.1:8420/api/deslop/ \
  -H "Content-Type: application/json" \
  -d '{"text":"It is not just a tool, it is a revolution. 🚀"}'

# raw text body — same ergonomics as the Node API
curl -s -X POST "http://127.0.0.1:8420/api/deslop/?clean=1" \
  -H "Content-Type: text/plain" --data-binary 'We leverage a robust solution.'

# CLI, no server needed
echo "We leverage a robust solution." | python3 cli/deslop_cli.py --report
```

## Engine parity

Before wiring the Python port into Django, four representative inputs (clean
AI-slop text, mixed clean/sloppy prose, and a plain human sentence) were run
through both engines and diffed field-by-field: cleaned text, fix counts,
fix categories, slop score, and signal breakdown all matched exactly. The
diff script isn't checked in (it's a one-off), and the fixture strings and
their expected values are pinned in `deslop/tests.py`'s `EngineParityTests`.

**Scope of the pin:** `EngineParityTests` asserts `deslop/engine.py`'s output
against hardcoded expected values. It fails loudly if `engine.py` changes and
produces a different result for a pinned fixture, but it does not run
`../src/deslop.js` inside the Django test environment, so on its own it could
not catch drift introduced from the JavaScript side.

**That gap is now closed in CI.** `../scripts/parity-check.mjs` runs both
engines live over the same inputs (the pinned fixture families above plus
every committed caption in `../examples/`) and diffs the normalized output
field by field: cleaned text, fix totals and categories, slop score, label,
signal breakdown, per-100 density, word counts, and structural flags. Any
mismatch fails the run. It executes as the `engine-parity` job in
`../.github/workflows/ci.yml` on every push and pull request, and locally via
`npm run test:parity` from the repo root. Editing either engine's rules
without porting the change to the other now breaks CI instead of drifting
silently.

## What's different from the Node version, and why

| Concern | Node (`../vite.config.js`) | Django/DRF (here) |
|---|---|---|
| Raw text body | Reads the stream manually | Custom `PlainTextParser` — DRF has no built-in one |
| Input validation | None (any string is valid) | `DeslopRequestSerializer`, 4MB cap enforced with a real 400 |
| Abuse prevention | Rejects any request with a non-localhost `Origin` header | `AnonRateThrottle` (120/min) — Origin-header sniffing doesn't fit DRF's request cycle the same way |
| Cross-origin frontend | N/A — same-origin, Vite serves the app itself | `django-cors-headers`, scoped to `localhost`/`127.0.0.1` only, for a separate React/Next.js dev server |
| Tests | None in the Node version | 18 DRF `APITestCase` tests — endpoint shape, edge cases (empty text, oversized text, exact-boundary text, GET-path size cap), throttling (including one that actually drives past the limit and checks for a 429), and engine parity (including a JS-vs-Python rounding-semantics regression test) |

That last row is deliberate: the Node app has no test suite, and porting it
was the opportunity to add one, following a "a feature isn't done until the
tests are written" standard.
