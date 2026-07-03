#!/usr/bin/env python3
"""
No Slop CLI (Python) -- de-slop text from the shell. Same engine as the
Django API and the Node original (../../cli/deslop.mjs). Imports engine.py
directly; does not need Django or the dev server running.

Usage:
    echo "your text" | python3 cli/deslop_cli.py          # clean text -> stdout
    python3 cli/deslop_cli.py file.txt                     # clean a file
    python3 cli/deslop_cli.py --json   < file.txt           # full JSON report
    python3 cli/deslop_cli.py --report < file.txt           # clean text + a summary
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from deslop.engine import deslop, flags_for, slop_score  # noqa: E402


def main():
    args = sys.argv[1:]
    json_out = "--json" in args
    report = "--report" in args
    file_arg = next((a for a in args if not a.startswith("--")), None)

    try:
        text = Path(file_arg).read_text() if file_arg else sys.stdin.read()
    except OSError:
        sys.stderr.write("No input. Pipe text in or pass a file path.\n")
        sys.exit(1)

    result = deslop(text)
    clean, groups, total = result["text"], result["groups"], result["total"]
    s = slop_score(text)
    flags = flags_for(text)

    if json_out:
        sys.stdout.write(json.dumps({
            "clean": clean,
            "slop": {"score": s["score"], "label": s["label"], "signals": s["signals"]},
            "fixes": {"total": total, "byCategory": groups},
            "flags": flags,
        }, indent=2) + "\n")
        return

    sys.stdout.write(clean + ("" if clean.endswith("\n") else "\n"))
    if report:
        lines = ["", f"— slop {s['score']}/100 ({s['label']}) · {total} auto-fixes"]
        for g in groups:
            lines.append(f"  {g['count']}× {g['label']}")
        if flags:
            lines.append("  flags (rewrite by hand):")
            for f in flags:
                lines.append(f"  ⚑ {f['count']}× {f['label']} — {f['fix']}")
        sys.stderr.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
