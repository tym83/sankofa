#!/bin/sh
# Build the museum data from the content repository:
#   web/public/data/cards.json     (sankofa content export)
#   web/public/data/chapters.json  (chapter Markdown -> JSON)
#   web/public/media/              (content/media)
# Content comes from content/ when it has chapters; otherwise from the
# placeholder set in web/fixtures/. Override with SANKOFA_CONTENT=<dir>.
set -eu
web=$(cd "$(dirname "$0")/.." && pwd)
root=$(cd "$web/.." && pwd)
cd "$root"

src=${SANKOFA_CONTENT:-}
if [ -z "$src" ]; then
  if ls content/chapters/*.md >/dev/null 2>&1; then src=content; else src=web/fixtures; fi
fi
echo "content: $src"

mkdir -p web/public/data web/public/media
go run ./cmd/sankofa content export "$src/cards" -o web/public/data/cards.json
node "$web/scripts/build-chapters.ts" "$src/chapters" web/public/data/chapters.json
if [ -d "$src/media" ]; then
  cp -R "$src/media/." web/public/media/
fi
echo "media: $(ls web/public/media | wc -l | tr -d ' ') files"
