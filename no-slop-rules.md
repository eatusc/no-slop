# No Slop — The Rules

The single ruleset that powers the **No Slop** app and guides every manual edit.
"Slop" = text that reads like a language model wrote it: inflated, hedged, evenly
polished, and saying nothing. The goal is writing that sounds like a person who was
actually there. (HAP's own `dont-read-this-bot` caption says it best: *"The edge now
is not sounding more polished. The edge is sounding like somebody was actually there."*)

Three kinds of rules:
- **AUTO** — the app fixes it mechanically (see `src/deslop.js`).
- **FLAG** — the app *detects* it but won't auto-rewrite (too risky); you fix it by hand.
- **HUMAN** — judgment calls the app can't detect; a person finishes.

---

## 0. The #1 tell: the antithesis pattern (FLAG)

> *"It's not X, it's Y."* · *"This isn't just X, it's about Y."* · *"Not A, not B, but C."*

The single most-flagged AI tell among creators. Alex Hormozi calls the forced
*"it's not X, it's Y, not A, not B, but D"* the top red flag — it dilutes your point and
screams generic AI. Commenters call it *"the camel toe of content"* — they spot it
instantly in captions, LinkedIn posts, and emails. Peter Yang blocks *"this isn't just
X, it's about Y."* Anna Nassery flags the same structure.

**The fix (Hormozi):** cut the preamble. Make one clear point. Move on. Don't define
something by what it isn't — say what it *is*, once.

The engine **flags** every occurrence (it won't rewrite it for you) and weights it
hardest in the Slopometer. Patterns detected: `it's not X, it's Y` · `not just X but Y`
· `X isn't Y, it's Z` · `not about X, it's about Y`.

---

## 1. Punctuation tells

| Rule | Type | Do |
|---|---|---|
| Em / en dash overload (`word — word`) | AUTO | Replace with a comma or split into two sentences. Keep hyphens only in number ranges (`2020-2021`) and real compounds (`full-time`). |
| Smart/curly quotes `“ ” ‘ ’` and `…` | AUTO | Convert to straight `"` `'` and `...`. |
| Non-breaking & double spaces | AUTO | Collapse to single normal spaces. |
| Semicolons stitching two ideas | HUMAN | Usually just a period. People rarely type `;`. |
| Colons used to sound profound (`The truth: …`) | HUMAN | Cut or rephrase. |

## 2. Filler openers (delete, the sentence survives)

`It's important to note that` · `It's worth noting/mentioning that` · `It should be
noted that` · `Needless to say` · `At the end of the day` · `That being said` · `When
it comes to` · `In conclusion` · `In summary` · `All in all` · `As we can see`
→ **AUTO**: removed, next word re-capitalized.

## 3. Throat-clearing transitions (delete)

`Furthermore` · `Moreover` · `Additionally` · `Notably` · `Importantly` · `Indeed` ·
`Essentially` · `Ultimately` · `Consequently` · `Subsequently`
→ **AUTO**: removed at sentence start. The next sentence stands on its own.

## 4. Inflated vocabulary → plain words (AUTO)

delve → dig/look at · leverage → use · utilize → use · facilitate → help · endeavor →
try · commence → start · elevate → improve · underscore → highlight · foster → build ·
garner → get · showcase → show · myriad → many · plethora → plenty · multitude → many ·
robust → solid · seamless → smooth · vibrant → lively · bustling → busy · meticulous →
careful · cutting-edge / state-of-the-art → advanced · game-changer → big deal ·
paradigm shift → shift · synergy → teamwork · holistic → complete · pivotal/crucial →
key · transformative → major · revolutionize → change · harness → use · streamline →
simplify · embark → start · unparalleled → unmatched.

## 5. Empty hype phrases (cut or honest-ize, AUTO)

`rich tapestry of` → cut · `in the realm/world of` → `in` · `a testament to` → `proof
of` · `plays a crucial role in` → `is key to` · `a beacon of` → cut · `the power of` →
cut · `unlock the full potential of` → `get the most from` · `take it to the next
level` → `improve it` · `in today's fast-paced world` → cut · `not only … but also` →
flatten.

## 6. Emoji & decoration (AUTO)

Strip 🚀 ✨ 🔥 ✅ and friends, plus arrow/symbol clutter. One emoji on purpose is fine;
a sprinkle on every line is a tell. (Re-add deliberately by hand.)

## 7. Structure tells — HUMAN judgment (the app flags, you fix)

- **Rule of three everywhere.** "Fast, simple, and powerful." Break the pattern; vary the count.
- **Even sentence length.** AI writes everything mid-length. Add burstiness: a 3-word line next to a 25-word one.
- **The setup-twist cliché.** "It's not X. It's Y." / "And that pause is the problem." Use once, not every paragraph.
- **Hedging.** `can help`, `may`, `often`, `tends to`, `arguably`, `generally`. Say it straight or cut it.
- **Vague nouns.** `solutions`, `experiences`, `journey`, `landscape`, `space`, `ecosystem`. Name the actual thing.
- **No specifics.** Add the real number, the real name, the real detail. Specificity is the strongest human signal.
- **Summary that repeats the body.** Delete restated conclusions.
- **Fake balance.** "On one hand… on the other…" with no opinion. Take a side.

## 8. The four-step human pass (after AUTO)

From the `dont-read-this-bot` manifesto, applied as the manual checklist:
1. **Say what you actually think** — add the opinion the model wouldn't commit to.
2. **Use the real details** — names, numbers, dates, the specific thing.
3. **Read it out loud** — anything you'd never say, rewrite.
4. **Leave a little mess in** — a fragment, an aside, an imperfect rhythm. Polish is the tell.

---

## Field notes — what creators keep flagging (2026)

Recurring tells from popular Instagram/X posts on AI slop, and who called each out:

| Tell | Why it sucks | Flagged by | Handled by |
|---|---|---|---|
| "It's not X, it's Y" structure | Dilutes the point, generic AI | Alex Hormozi, Peter Yang, Anna Nassery | §0 FLAG |
| Overuse of em dashes | Robotic, over-formal | Sabrina Ramonov, Leila Hormozi | §1 AUTO |
| Buzzwords: seamless, delve, game-changing | Instant ChatGPT tell | Joe Stolte | §4 AUTO |
| Filler / vague phrasing, formal closings | Sounds like a school essay | Georgie Barrat | §2,§5 AUTO |
| No real opinion / input | "AI furniture": looks productive, says nothing | Deepali Vyas, Leila Hormozi | §7,§8 HUMAN |
| 3-item lists, uniform perfect grammar | Lacks human "burstiness" | The Wize AI | §7 HUMAN |

Two principles worth internalizing:

- **Refine, don't generate (Leila Hormozi).** AI should refine *your* thinking, not
  invent from nothing. Prompting with zero of your own content = slop by default. Bring
  the substance; use the engine and rules to clean the surface.
- **The anti-style file works (the @comfortfajugbagbe method).** Instead of a 400-word
  "please don't sound like AI" prompt, point the model at a file of known bad patterns
  and say *"apply these as rules to everything you write."* That's exactly what
  `no-slop-rules.md` + `voice.md` are for — feed them to your LLM (see `API.md`).

---

## Why mechanical de-slop is step one, not the whole job

Detectors in 2026 look past surface tokens at sentence-structure variety and
"burstiness," so swapping words alone won't make text *think* like a person — it just
stops it screaming "AI." The app handles the mechanical layer (sections 1–6) instantly
and consistently; the human layer (sections 7–8) is where the writing actually becomes
yours. Run No Slop first, then do the human pass.

Sources:
- [10 Ways to Make AI-Generated Text Sound More Human](https://humanizeai.com/blog/ways-to-make-ai-generated-text-more-human/)
- [How to Make AI Text Sound Human](https://aurawriteai.com/blog/how-to-make-ai-text-sound-human)
- [How to Make AI Writing Sound Genuinely Human in 2026](https://medium.com/@vaibhav.agarwal.iitd/how-to-make-ai-writing-sound-genuinely-human-and-beat-top-ai-detectors-in-2026-2ff888b8d5c5)
- [Humanize AI Text — Microsoft 365 Copilot](https://www.microsoft.com/en-us/microsoft-copilot/copilot-101/humanize-ai-text)
- HAP `dont-read-this-bot` caption (`[redacted]/2-ready/instagram/dont-read-this-bot-carousel/caption.txt`)
