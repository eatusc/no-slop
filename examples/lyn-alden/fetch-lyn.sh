#!/bin/zsh
# Pull Lyn Alden essays into this folder as plain-text voice examples.
# Usage:  ./fetch-lyn.sh                      # fetch the default set
#         ./fetch-lyn.sh <slug> [<slug> ...]  # fetch specific article slugs
#         (slug = the URL path, e.g. fractional-reserve-banking)
set -e
cd "$(dirname "$0")"

DEFAULT=(fractional-reserve-banking why-most-cryptocurrencies-wont-accrue-value)
SLUGS=("${@:-${DEFAULT[@]}}")

for slug in $SLUGS; do
  url="https://www.lynalden.com/${slug}/"
  echo "Fetching $url"
  curl -sL -A "Mozilla/5.0" "$url" -o "/tmp/lyn_$slug.html"
  python3 - "$slug" <<'PY'
import re, html, sys
slug = sys.argv[1]
raw = open(f'/tmp/lyn_{slug}.html', encoding='utf-8', errors='replace').read()
m = re.search(r'<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*?)</div>\s*<(?:footer|div[^>]*class="[^"]*(?:post-|entry-footer|sharedaddy))', raw, re.S)
body = m.group(1) if m else raw
body = re.sub(r'<(script|style|figure|figcaption)[^>]*>.*?</\1>', ' ', body, flags=re.S)
out = []
for tag, c in re.findall(r'<(h2|h3|p)[^>]*>(.*?)</\1>', body, re.S):
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip()
    if len(t) < 2: continue
    out.append(('## ' + t) if tag in ('h2', 'h3') else t)
text = '\n\n'.join(out)
open(f'{slug}.txt', 'w', encoding='utf-8').write(text + '\n')
print(f"  -> {slug}.txt ({len(text.split())} words)")
PY
done
