"""
No Slop -- de-slop engine, Python port
---------------------------------------------------------------------------
A line-by-line port of ../../src/deslop.js -- the Node engine that powers
the app, its HTTP API, its CLI, and its MCP server. This file is the same
kind of single source of truth for the Django/DRF side: the DRF view below
imports it directly, and so does the standalone CLI in ../cli/deslop_cli.py.
No Django import here on purpose -- it's pure Python, testable with `python
-m pytest` and requiring nothing but the standard library, same as the JS
original requires nothing but itself.

Exports:
    deslop(text)     -> {"text": str, "groups": [{"label": str, "count": int}], "total": int}
    flags_for(text)  -> [{"type": str, "label": str, "fix": str, "count": int, "samples": [str]}]
    slop_score(text) -> {"score": int, "label": str, "color": str, "signals": dict,
                          "per100": float, "words": int}
---------------------------------------------------------------------------
"""

import math
import re

# Smart-quote / whitespace characters normalized to plain ASCII.
LEFT_DQUOTE, RIGHT_DQUOTE = "“", "”"
LEFT_SQUOTE, RIGHT_SQUOTE = "‘", "’"
ELLIPSIS = "…"
NBSP = " "
EM_DASH, EN_DASH = "—", "–"


def _count_matches(text, pattern, flags=0):
    """Mirrors JS `(text.match(re) || []).length` for a global regex: counts
    every non-overlapping match regardless of how many capture groups it has
    (re.findall would instead return captured groups, not full matches)."""
    return sum(1 for _ in re.finditer(pattern, text, flags))


def _js_round(x):
    """Matches JS `Math.round()` (always rounds .5 up), not Python's builtin
    `round()` (banker's rounding: round-half-to-even, so `round(2.5) == 2`).
    Every value rounded in this module is non-negative, so floor(x + 0.5) is
    sufficient -- it would need adjusting to handle negative inputs the way
    Math.round does (round -2.5 up to -2, not down to -3)."""
    return math.floor(x + 0.5)


def _match_case(original, replacement):
    """Re-capitalize a replacement to match the casing of what it replaced,
    so swapping "Leverage" -> "Use" keeps the capital."""
    if not replacement:
        return replacement
    if original[:1] and original[:1] == original[:1].upper() and original[:1] != original[:1].lower():
        return replacement[:1].upper() + replacement[1:]
    return replacement


# Word-for-word swaps (whole word, case-insensitive, casing preserved). The
# point is to trade inflated AI vocabulary for plain language.
WORD_SWAPS = [
    ("delve into", "look at"), ("delving into", "looking at"), ("delves into", "looks at"),
    ("delve", "dig"), ("delves", "digs"),
    ("leverage", "use"), ("leveraging", "using"), ("leverages", "uses"),
    ("utilize", "use"), ("utilizing", "using"), ("utilizes", "uses"), ("utilization", "use"),
    ("facilitate", "help"), ("facilitates", "helps"),
    ("endeavor", "try"),
    ("commence", "start"), ("commences", "starts"),
    ("elevate", "improve"), ("elevates", "improves"), ("elevating", "improving"),
    ("underscore", "highlight"), ("underscores", "highlights"),
    ("foster", "build"), ("fosters", "builds"),
    ("garner", "get"), ("garners", "gets"),
    ("showcase", "show"), ("showcases", "shows"),
    ("a myriad of", "many"), ("myriad of", "many"), ("myriad", "many"),
    ("a plethora of", "plenty of"), ("plethora of", "plenty of"), ("plethora", "plenty"),
    ("a multitude of", "many"), ("multitude of", "many"),
    ("robust", "solid"),
    ("seamless", "smooth"), ("seamlessly", "smoothly"),
    ("vibrant", "lively"),
    ("bustling", "busy"),
    ("meticulous", "careful"), ("meticulously", "carefully"),
    ("cutting-edge", "advanced"), ("state-of-the-art", "advanced"),
    ("game-changer", "big deal"), ("game-changing", "major"),
    ("paradigm shift", "shift"),
    ("synergy", "teamwork"),
    ("holistic", "complete"),
    ("pivotal", "key"), ("crucial", "key"),
    ("essence", "core"),
    ("ever-evolving", "changing"), ("ever-changing", "changing"),
    ("unparalleled", "unmatched"), ("unprecedented", "rare"),
    ("transformative", "major"),
    ("revolutionize", "change"), ("revolutionizes", "changes"),
    ("embark on", "start"), ("embark", "start"),
    ("harness", "use"), ("harnessing", "using"),
    ("streamline", "simplify"), ("streamlines", "simplifies"), ("streamlining", "simplifying"),
]

# Empty hype / cliché phrases -- deleted or reduced to something honest.
PHRASE_SWAPS = [
    (r"\brich tapestry of\b", ""),
    (r"\btapestry of\b", ""),
    (r"\bin the realm of\b", "in"),
    (r"\bin the world of\b", "in"),
    (r"\bnavigating the (complexities|landscape|world) of\b", "handling"),
    (r"\bstands as a testament to\b", "shows"),
    (r"\bis a testament to\b", "shows"),
    (r"\ba testament to\b", "proof of"),
    (r"\bplays a (crucial|vital|key|pivotal) role in\b", "is key to"),
    (r"\bplays a (crucial|vital|key|pivotal) role\b", "matters"),
    (r"\ba beacon of\b", ""),
    (r"\bthe power of\b", ""),
    (r"\bunlock the (full )?potential of\b", "get the most from"),
    (r"\bunlock(s|ing)? (the )?potential\b", "deliver"),
    (r"\btake (it|things|your \w+) to the next level\b", "improve it"),
    (r"\bin today'?s fast-paced world\b", ""),
    (r"\bin today'?s (digital|modern) (age|world|era)\b", ""),
]

# Sentence-opening filler -- removed, the sentence still stands without it.
OPENERS = [
    r"\bit'?s important to (note|remember|understand|mention|consider) that\b",
    r"\bit is important to (note|remember|understand|mention|consider) that\b",
    r"\bit'?s worth (noting|mentioning) that\b",
    r"\bit is worth (noting|mentioning) that\b",
    r"\bit should be noted that\b",
    r"\bneedless to say,?\s*",
    r"\bat the end of the day,?\s*",
    r"\bwhen it comes to\b",
    r"\bthat being said,?\s*",
    r"\bwith that said,?\s*",
    r"\bin conclusion,?\s*",
    r"\bin summary,?\s*",
    r"\bto summarize,?\s*",
    r"\ball in all,?\s*",
    r"\bas (we|you) (can see|navigate|explore|delve)\b[^,.]*,?\s*",
]

# Throat-clearing transitions at the start of a sentence -- just deleted.
# No IGNORECASE here (matches capitalized only) -- same as the JS source.
TRANSITIONS = (
    r"(^|[.!?]\s+|\n)(Furthermore|Moreover|Additionally|Notably|Importantly|"
    r"Indeed|Essentially|Ultimately|Consequently|Subsequently),?\s+"
)

EMOJI_RE = (
    "[\U0001F000-\U0001FAFF☀-➿←-⇿⬀-⯿︀-️‍]"
)


def deslop(text):
    groups = []

    def tally(label, count):
        if count > 0:
            groups.append({"label": label, "count": count})

    # 1. Curly quotes, ellipsis, non-breaking spaces -> plain ASCII.
    smart_class = f"[{LEFT_DQUOTE}{RIGHT_DQUOTE}{LEFT_SQUOTE}{RIGHT_SQUOTE}{ELLIPSIS}{NBSP}]"
    smart = _count_matches(text, smart_class)
    text = (
        text.replace(LEFT_DQUOTE, '"').replace(RIGHT_DQUOTE, '"')
        .replace(LEFT_SQUOTE, "'").replace(RIGHT_SQUOTE, "'")
        .replace(ELLIPSIS, "...")
        .replace(NBSP, " ")
    )
    tally("Smart quotes & special chars", smart)

    # 2. Em / en dashes. Number ranges keep a hyphen; everything else becomes
    #    a comma so the prose reads like a person wrote it.
    dashes = _count_matches(text, f"[{EM_DASH}{EN_DASH}]")
    text = re.sub(r"(\d)\s*[" + EN_DASH + EM_DASH + r"]\s*(\d)", r"\1-\2", text)
    text = re.sub(r"\s*[" + EM_DASH + EN_DASH + r"]\s*", ", ", text)
    tally("Em / en dashes", dashes)

    # 3. Emoji and variation selectors.
    emoji = _count_matches(text, EMOJI_RE)
    text = re.sub(EMOJI_RE, "", text)
    tally("Emoji", emoji)

    # 4. Filler openers.
    openers = 0
    for pat in OPENERS:
        openers += _count_matches(text, pat, re.IGNORECASE)
        text = re.sub(pat, "", text, flags=re.IGNORECASE)
    tally("Filler openers", openers)

    # 5. Throat-clearing transitions.
    transitions = _count_matches(text, TRANSITIONS)
    text = re.sub(TRANSITIONS, r"\1", text)
    tally("Throat-clearing transitions", transitions)

    # 6. Empty hype phrases.
    phrases = 0
    for pat, rep in PHRASE_SWAPS:
        phrases += _count_matches(text, pat, re.IGNORECASE)
        text = re.sub(pat, rep, text, flags=re.IGNORECASE)
    tally("Empty hype phrases", phrases)

    # 7. Inflated vocabulary -> plain words.
    words = 0

    def swap_word(m):
        nonlocal words
        words += 1
        return _match_case(m.group(0), to)

    for frm, to in WORD_SWAPS:
        pat = r"\b" + re.escape(frm) + r"\b"
        text = re.sub(pat, swap_word, text, flags=re.IGNORECASE)
    tally("Inflated words", words)

    # 8. Tidy up the wreckage: doubled punctuation, orphan spaces, blank lines.
    text = re.sub(r"[ \t]+([,.;:!?])", r"\1", text)
    text = re.sub(r",\s*,", ",", text)
    text = re.sub(r"([.!?;:])\s*,+", r"\1", text)
    text = re.sub(r",+\s*([.!?;:])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r" +$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"^[,;:.\s]+", "", text)
    text = re.sub(r"\(\s*\)", "", text)

    # 9. Re-capitalize sentence starts (openers we removed may have exposed a
    #    lowercase word as the new first word).
    def recap(m):
        return m.group(1) + m.group(2).upper()

    text = re.sub(r"(^|[.!?]\s+|\n\s*)([a-z])", recap, text)

    text = text.strip()

    total = sum(g["count"] for g in groups)
    return {"text": text, "groups": groups, "total": total}


# ---------------------------------------------------------------------------
# Flags -- slop the engine detects but will NOT auto-rewrite (too risky), so a
# human fixes them. Headlined by the "it's not X, it's Y" antithesis pattern.
# ---------------------------------------------------------------------------
FLAG_PATTERNS = [
    {
        "type": "antithesis",
        "label": "\"it's not X, it's Y\" pattern",
        "fix": "Cut the negation. Make the one positive point directly.",
        "re": r"\b(it'?s|it is|this is|that'?s|they'?re|we'?re|you'?re|there'?s)\s+not\s+"
              r"(just\s+|only\s+|merely\s+|simply\s+)?[^.?!,]{2,45}?,\s*"
              r"(it'?s|it is|they'?re|that'?s|but)\b",
    },
    {
        "type": "not-just-but",
        "label": '"not just X, but (also) Y" pattern',
        "fix": 'Drop "not just... but". State Y on its own.',
        "re": r"\bnot\s+(just|only|merely|simply)\b[^.?!]{2,70}?\bbut(\s+also)?\b",
    },
    {
        "type": "isnt-its",
        "label": "\"X isn't Y, it's Z\" pattern",
        "fix": "Skip the setup. Say Z plainly.",
        "re": r"\b(isn'?t|aren'?t|wasn'?t|weren'?t)\s+(just\s+|only\s+)?[^.?!,]{2,45}?,\s*(it'?s|they'?re|it is|but)\b",
    },
    {
        "type": "not-about-but",
        "label": '"not about X, it\'s about Y" pattern',
        "fix": "Just say what it IS about.",
        "re": r"\bnot\s+(just\s+)?about\b[^.?!]{2,60}?\b(it'?s|but|it is)\b",
    },
]


def flags_for(text):
    text = text or ""
    out = []
    seen = set()
    for p in FLAG_PATTERNS:
        samples = []
        for m in re.finditer(p["re"], text, re.IGNORECASE):
            snip = re.sub(r"\s+", " ", m.group(0)).strip()
            key = p["type"] + "|" + snip.lower()
            if key in seen:
                continue
            seen.add(key)
            samples.append(snip[:90] + "…" if len(snip) > 90 else snip)
        if samples:
            out.append({"type": p["type"], "label": p["label"], "fix": p["fix"], "count": len(samples), "samples": samples})
    return out


def _flag_count(text):
    return sum(f["count"] for f in flags_for(text))


def word_count(text):
    """Whitespace-separated token count. Shared by slop_score() below and by
    the DRF view's "words in / words out" field, so there's exactly one
    definition of "word" in this codebase instead of two that could drift."""
    return len((text or "").split())


# ---------------------------------------------------------------------------
# Slopometer -- score how sloppy text is from 0 (human) to 100 (pure slop).
# Same weights and saturating curve as the JS original, so the two engines
# score identical input identically.
# ---------------------------------------------------------------------------
HEDGES = r"\b(can help|may|might|tends? to|arguably|generally|typically|relatively|somewhat|quite|really|simply|just|actually|basically|essentially)\b"
VAGUE = r"\b(solutions?|experiences?|journeys?|landscapes?|ecosystems?|stakeholders?|insights?|offerings?|capabilit(?:y|ies)|the space)\b"
RULE_OF_THREE = r"\b[\w-]+,\s+[\w-]+,?\s+and\s+[\w-]+\b"

WEIGHTS = {
    "flips": 6, "dashes": 3, "emoji": 2, "openers": 4, "transitions": 3,
    "hype": 4, "words": 2, "hedges": 1.5, "vague": 1.5, "ruleOfThree": 2.5,
}


def slop_score(text):
    text = text or ""
    words = max(1, word_count(text))  # floor at 1 so the /words division below can't 0-divide

    result = deslop(text)
    groups = {g["label"]: g["count"] for g in result["groups"]}

    def g(label):
        return groups.get(label, 0)

    signals = {
        "flips": _flag_count(text),
        "dashes": g("Em / en dashes"),
        "emoji": g("Emoji"),
        "openers": g("Filler openers"),
        "transitions": g("Throat-clearing transitions"),
        "hype": g("Empty hype phrases"),
        "words": g("Inflated words"),
        "hedges": _count_matches(text, HEDGES, re.IGNORECASE),
        "vague": _count_matches(text, VAGUE, re.IGNORECASE),
        "ruleOfThree": _count_matches(text, RULE_OF_THREE, re.IGNORECASE),
    }

    points = sum(signals.get(k, 0) * w for k, w in WEIGHTS.items())
    per100 = (points / words) * 100
    k = 14  # tuning constant -- higher = more forgiving
    score = _js_round(100 * (1 - math.exp(-per100 / k)))

    if score < 15:
        label, color = "Human", "#2ecc71"
    elif score < 35:
        label, color = "Lightly seasoned", "#9acd32"
    elif score < 55:
        label, color = "Slop-ish", "#f5a623"
    elif score < 75:
        label, color = "Heavy slop", "#ff8c42"
    else:
        label, color = "Pure slop", "#ff5a5f"

    return {
        "score": score, "label": label, "color": color, "signals": signals,
        "per100": _js_round(per100 * 10) / 10, "words": words,
    }
