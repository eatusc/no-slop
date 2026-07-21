#!/usr/bin/env python3
"""Python side of the cross-engine parity check.

Reads a JSON array of input strings on stdin, runs each through the Python
engine (django_api/deslop/engine.py), and writes a JSON array of normalized
results to stdout. scripts/parity-check.mjs runs the same inputs through the
Node engine (src/deslop.js) and diffs the two result sets.

Needs only the standard library: engine.py is pure Python on purpose.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "django_api"))

from deslop.engine import deslop, flags_for, slop_score  # noqa: E402


def normalize(text):
    d = deslop(text)
    s = slop_score(text)
    f = flags_for(text)
    return {
        "clean": d["text"],
        "total": d["total"],
        "groups": d["groups"],
        "score": s["score"],
        "label": s["label"],
        "signals": s["signals"],
        "per100": s["per100"],
        "words": s["words"],
        "flags": [
            {"type": x["type"], "count": x["count"], "samples": x["samples"]}
            for x in f
        ],
    }


def main():
    inputs = json.load(sys.stdin)
    json.dump([normalize(t) for t in inputs], sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
