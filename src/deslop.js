// ---------------------------------------------------------------------------
// No Slop — de-slop engine (single source of truth for the app, API, and CLI)
// ---------------------------------------------------------------------------
// Takes AI-generated text and strips the tells: em-dash overload, curly quotes,
// emoji, hype words, filler openers and empty transition phrases. Pure string
// work with no dependencies — runs anywhere (browser, Node API, CLI). Instant.
//
// Exports:
//   deslop(text)    -> { text, groups: [{ label, count }], total }
//   flagsFor(text)  -> [{ type, label, fix, count, samples }]   (rewrite by hand)
//   slopScore(text) -> { score, label, color, signals, per100, words }
// ---------------------------------------------------------------------------

// Count non-overlapping matches of a global regex.
function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

// Re-capitalize a replacement to match the casing of the text it replaced,
// so swapping "Leverage" -> "Use" keeps the capital and "LEVERAGE" -> "USE".
function matchCase(original, replacement) {
  if (!replacement) return replacement;
  // ALL CAPS -> ALL CAPS ("LEVERAGE" -> "USE")
  if (original.length > 1 && original === original.toUpperCase() &&
      original !== original.toLowerCase()) {
    return replacement.toUpperCase();
  }
  // Capitalized -> capitalize the first letter ("Leverage" -> "Use")
  if (original[0] && original[0] === original[0].toUpperCase() &&
      original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Word-for-word swaps (whole word, case-insensitive, casing preserved).
// The point is to trade inflated AI vocabulary for plain language.
const WORD_SWAPS = [
  ['delve into', 'look at'],
  ['delving into', 'looking at'],
  ['delves into', 'looks at'],
  ['delve', 'dig'],
  ['delves', 'digs'],
  ['leverage', 'use'],
  ['leveraging', 'using'],
  ['leverages', 'uses'],
  ['utilize', 'use'],
  ['utilizing', 'using'],
  ['utilizes', 'uses'],
  ['utilization', 'use'],
  ['facilitate', 'help'],
  ['facilitates', 'helps'],
  ['endeavor', 'try'],
  ['commence', 'start'],
  ['commences', 'starts'],
  ['elevate', 'improve'],
  ['elevates', 'improves'],
  ['elevating', 'improving'],
  ['underscore', 'highlight'],
  ['underscores', 'highlights'],
  ['foster', 'build'],
  ['fosters', 'builds'],
  ['garner', 'get'],
  ['garners', 'gets'],
  ['showcase', 'show'],
  ['showcases', 'shows'],
  ['a myriad of', 'many'],
  ['myriad of', 'many'],
  ['myriad', 'many'],
  ['a plethora of', 'plenty of'],
  ['plethora of', 'plenty of'],
  ['plethora', 'plenty'],
  ['a multitude of', 'many'],
  ['multitude of', 'many'],
  ['robust', 'solid'],
  ['seamless', 'smooth'],
  ['seamlessly', 'smoothly'],
  ['vibrant', 'lively'],
  ['bustling', 'busy'],
  ['meticulous', 'careful'],
  ['meticulously', 'carefully'],
  ['cutting-edge', 'advanced'],
  ['state-of-the-art', 'advanced'],
  ['game-changer', 'big deal'],
  ['game-changing', 'major'],
  ['paradigm shift', 'shift'],
  ['synergy', 'teamwork'],
  ['holistic', 'complete'],
  ['pivotal', 'key'],
  ['crucial', 'key'],
  ['essence', 'core'],
  ['ever-evolving', 'changing'],
  ['ever-changing', 'changing'],
  ['unparalleled', 'unmatched'],
  ['unprecedented', 'rare'],
  ['transformative', 'major'],
  ['revolutionize', 'change'],
  ['revolutionizes', 'changes'],
  ['embark on', 'start'],
  ['embark', 'start'],
  ['harness', 'use'],
  ['harnessing', 'using'],
  ['streamline', 'simplify'],
  ['streamlines', 'simplifies'],
  ['streamlining', 'simplifying'],
];

// Empty hype / cliché phrases — deleted or reduced to something honest.
const PHRASE_SWAPS = [
  [/\brich tapestry of\b/gi, ''],
  [/\btapestry of\b/gi, ''],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin the world of\b/gi, 'in'],
  [/\bnavigating the (complexities|landscape|world) of\b/gi, 'handling'],
  [/\bstands as a testament to\b/gi, 'shows'],
  [/\bis a testament to\b/gi, 'shows'],
  [/\ba testament to\b/gi, 'proof of'],
  [/\bplays a (crucial|vital|key|pivotal) role in\b/gi, 'is key to'],
  [/\bplays a (crucial|vital|key|pivotal) role\b/gi, 'matters'],
  [/\ba beacon of\b/gi, ''],
  [/\bthe power of\b/gi, ''],
  [/\bunlock the (full )?potential of\b/gi, 'get the most from'],
  [/\bunlock(s|ing)? (the )?potential\b/gi, 'deliver'],
  [/\btake (it|things|your \w+) to the next level\b/gi, 'improve it'],
  [/\bin today'?s fast-paced world\b/gi, ''],
  [/\bin today'?s (digital|modern) (age|world|era)\b/gi, ''],
];

// Sentence-opening filler — removed, the sentence still stands without it.
const OPENERS = [
  /\bit'?s important to (note|remember|understand|mention|consider) that\b/gi,
  /\bit is important to (note|remember|understand|mention|consider) that\b/gi,
  /\bit'?s worth (noting|mentioning) that\b/gi,
  /\bit is worth (noting|mentioning) that\b/gi,
  /\bit should be noted that\b/gi,
  /\bneedless to say,?\s*/gi,
  /\bat the end of the day,?\s*/gi,
  /\bwhen it comes to\b/gi,
  /\bthat being said,?\s*/gi,
  /\bwith that said,?\s*/gi,
  /\bin conclusion,?\s*/gi,
  /\bin summary,?\s*/gi,
  /\bto summarize,?\s*/gi,
  /\ball in all,?\s*/gi,
  /\bas (we|you) (can see|navigate|explore|delve)\b[^,.]*,?\s*/gi,
];

// Throat-clearing transitions at the start of a sentence — just deleted.
const TRANSITIONS = [
  /(^|[.!?]\s+|\n)(Furthermore|Moreover|Additionally|Notably|Importantly|Indeed|Essentially|Ultimately|Consequently|Subsequently),?\s+/g,
];

export function deslop(input) {
  let text = input;
  const groups = [];
  const tally = (label, count) => { if (count > 0) groups.push({ label, count }); };

  // 1. Curly quotes, ellipsis, non-breaking spaces -> plain ASCII.
  let smart = 0;
  smart += countMatches(text, /[“”‘’… ]/g);
  text = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/ /g, ' ');
  tally('Smart quotes & special chars', smart);

  // 2. Em / en dashes. Number ranges keep a hyphen; everything else becomes a
  //    comma or period so the prose reads like a person wrote it.
  let dashes = countMatches(text, /[—–]/g);
  text = text
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')        // 2020–2021 -> 2020-2021
    .replace(/\s*[—–]\s*/g, ', ');                  // word — word -> word, word
  tally('Em / en dashes', dashes);

  // 3. Emoji and variation selectors. Arrows (U+2190–21FF) and the check/cross
  //    marks (U+2713–2718: ✓✔✕✖✗✘) are excluded — they're meaningful in prose,
  //    not decorative, so stripping them corrupted text like "5% → 10%".
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2712}\u{2719}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
  let emoji = countMatches(text, emojiRe);
  text = text.replace(emojiRe, '');
  tally('Emoji', emoji);

  // 4. Filler openers.
  let openers = 0;
  for (const re of OPENERS) { openers += countMatches(text, re); text = text.replace(re, ''); }
  tally('Filler openers', openers);

  // 5. Throat-clearing transitions.
  let transitions = 0;
  for (const re of TRANSITIONS) {
    transitions += countMatches(text, re);
    text = text.replace(re, '$1');
  }
  tally('Throat-clearing transitions', transitions);

  // 6. Empty hype phrases.
  let phrases = 0;
  for (const [re, rep] of PHRASE_SWAPS) {
    phrases += countMatches(text, re);
    text = text.replace(re, rep);
  }
  tally('Empty hype phrases', phrases);

  // 7. Inflated vocabulary -> plain words.
  let words = 0;
  for (const [from, to] of WORD_SWAPS) {
    const re = new RegExp('\\b' + from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
    text = text.replace(re, (m) => { words++; return matchCase(m, to); });
  }
  tally('Inflated words', words);

  // 8. Tidy up the wreckage: doubled punctuation, orphan spaces, blank lines.
  text = text
    .replace(/[ \t]+([,.;:!?])/g, '$1')      // space before punctuation
    .replace(/,\s*,/g, ',')                   // ",," -> ","
    .replace(/([.!?;:])\s*,+/g, '$1')         // ".," / ". ," -> "."  (orphan comma after a removed clause)
    .replace(/,+\s*([.!?;:])/g, '$1')         // ",." / ", ." -> "."  (orphan comma before sentence end)
    .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    .replace(/[ \t]{2,}/g, ' ')               // collapse runs of spaces
    .replace(/ +$/gm, '')                     // trailing spaces per line
    .replace(/\n{3,}/g, '\n\n')               // max one blank line
    .replace(/^[,;:.\s]+/, '')                // leading orphan punctuation
    .replace(/\(\s*\)/g, '');                 // empty parens left behind

  // 9. Re-capitalize sentence starts (openers we removed may have exposed a
  //    lowercase word as the new first word). Leave intentional lowercase-initial
  //    brand names alone (iPhone, iOS, eBay — the next letter is a capital) and
  //    don't capitalize after common lowercase abbreviations (e.g., i.e., vs.).
  const LOWER_ABBR = /\b(?:e\.g|i\.e|etc|vs|cf|viz|approx|esp)\.\s*$/i;
  text = text.replace(/(^|[.!?]\s+|\n\s*)([a-z])(?![a-zA-Z]*[A-Z])/g, (m, pre, ch, offset, str) =>
    LOWER_ABBR.test(str.slice(0, offset + pre.length)) ? m : pre + ch.toUpperCase(),
  );

  text = text.trim();

  const total = groups.reduce((n, g) => n + g.count, 0);
  return { text, groups, total };
}

// ---------------------------------------------------------------------------
// Flags — slop the engine detects but will NOT auto-rewrite (too risky), so a
// human fixes them. Headlined by the "it's not X, it's Y" antithesis pattern,
// which creators (Alex Hormozi, Peter Yang, Anna Nassery) call the #1 AI tell.
// ---------------------------------------------------------------------------
const FLAG_PATTERNS = [
  {
    type: 'antithesis',
    label: '"it\'s not X, it\'s Y" pattern',
    fix: 'Cut the negation. Make the one positive point directly.',
    re: /\b(it'?s|it is|this is|that'?s|they'?re|we'?re|you'?re|there'?s)\s+not\s+(just\s+|only\s+|merely\s+|simply\s+)?[^.?!,]{2,45}?,\s*(it'?s|it is|they'?re|that'?s|but)\b/gi,
  },
  {
    type: 'not-just-but',
    label: '"not just X, but (also) Y" pattern',
    fix: 'Drop "not just… but". State Y on its own.',
    re: /\bnot\s+(just|only|merely|simply)\b[^.?!]{2,70}?\bbut(\s+also)?\b/gi,
  },
  {
    type: 'isnt-its',
    label: '"X isn\'t Y, it\'s Z" pattern',
    fix: 'Skip the setup. Say Z plainly.',
    re: /\b(isn'?t|aren'?t|wasn'?t|weren'?t)\s+(just\s+|only\s+)?[^.?!,]{2,45}?,\s*(it'?s|they'?re|it is|but)\b/gi,
  },
  {
    type: 'not-about-but',
    label: '"not about X, it\'s about Y" pattern',
    fix: 'Just say what it IS about.',
    re: /\bnot\s+(just\s+)?about\b[^.?!]{2,60}?\b(it'?s|but|it is)\b/gi,
  },
]

export function flagsFor(input) {
  const text = input || ''
  const out = []
  const seen = new Set()
  for (const p of FLAG_PATTERNS) {
    const samples = []
    for (const m of text.matchAll(p.re)) {
      const snip = m[0].replace(/\s+/g, ' ').trim()
      const key = p.type + '|' + snip.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      samples.push(snip.length > 90 ? snip.slice(0, 90) + '…' : snip)
    }
    if (samples.length) out.push({ type: p.type, label: p.label, fix: p.fix, count: samples.length, samples })
  }
  return out
}

function flagCount(text) {
  return flagsFor(text).reduce((n, f) => n + f.count, 0)
}

// ---------------------------------------------------------------------------
// Slopometer — score how sloppy text is from 0 (human) to 100 (pure slop).
// ---------------------------------------------------------------------------
// v1 algorithm (we'll refine): tally weighted "slop points" from mechanical
// tells (the same things deslop fixes) plus a few structure signals, normalize
// per 100 words so length doesn't matter, then squash through a saturating
// curve into 0–100. Returns the score, a label, a color, and the raw signals
// so the bar can be tuned.
// ---------------------------------------------------------------------------

// extra structure detectors (not auto-fixed, but they smell like slop)
const HEDGES = /\b(can help|may|might|tends? to|arguably|generally|typically|relatively|somewhat|quite|really|simply|just|actually|basically|essentially)\b/gi;
const VAGUE = /\b(solutions?|experiences?|journeys?|landscapes?|ecosystems?|stakeholders?|insights?|offerings?|capabilit(?:y|ies)|the space)\b/gi;
const RULE_OF_THREE = /\b[\w-]+,\s+[\w-]+,?\s+and\s+[\w-]+\b/gi;

// points per occurrence — heavier = more damning
const WEIGHTS = {
  flips: 6,        // "it's not X, it's Y" — the #1 AI tell, weight it hardest
  dashes: 3,
  emoji: 2,
  openers: 4,
  transitions: 3,
  hype: 4,
  words: 2,
  hedges: 1.5,
  vague: 1.5,
  ruleOfThree: 2.5,
};

export function slopScore(input) {
  const text = input || '';
  const words = Math.max(1, (text.trim().match(/\S+/g) || []).length);

  // Reuse the de-slop engine to count the mechanical tells consistently.
  const { groups } = deslop(text);
  const g = (label) => (groups.find((x) => x.label === label) || {}).count || 0;

  const signals = {
    flips: flagCount(text),
    dashes: g('Em / en dashes'),
    emoji: g('Emoji'),
    openers: g('Filler openers'),
    transitions: g('Throat-clearing transitions'),
    hype: g('Empty hype phrases'),
    words: g('Inflated words'),
    hedges: countMatches(text, HEDGES),
    vague: countMatches(text, VAGUE),
    ruleOfThree: countMatches(text, RULE_OF_THREE),
  };

  let points = 0;
  for (const k in WEIGHTS) points += (signals[k] || 0) * WEIGHTS[k];

  // Normalize to a per-100-word density, then saturate.
  const per100 = (points / words) * 100;
  const K = 14; // tuning constant — higher = more forgiving
  const score = Math.round(100 * (1 - Math.exp(-per100 / K)));

  let label, color;
  if (score < 15) { label = 'Human'; color = '#2ecc71'; }
  else if (score < 35) { label = 'Lightly seasoned'; color = '#9acd32'; }
  else if (score < 55) { label = 'Slop-ish'; color = '#f5a623'; }
  else if (score < 75) { label = 'Heavy slop'; color = '#ff8c42'; }
  else { label = 'Pure slop'; color = '#ff5a5f'; }

  return { score, label, color, signals, per100: Math.round(per100 * 10) / 10, words };
}
