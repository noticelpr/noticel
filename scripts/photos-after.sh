#!/bin/bash
# Tonight (2026-11-16): after the story search refresh (scripts/search-db-after.sh), copy noticel.com's photo list and
# load it into the search database for panel → Fotos → Archivo and Analítica → Total de fotos. Log: archive/finish-log.txt
cd "$(dirname "$0")/.."
until grep -q "search database refreshed\|search database refresh FAILED" archive/finish-log.txt; do sleep 120; done
echo "$(date '+%Y-%m-%d %H:%M') copying noticel.com's photo list (~296,000)" >> archive/finish-log.txt
node scripts/media-copy.mjs > archive/media-run.out 2>&1
echo "$(date '+%Y-%m-%d %H:%M') photo list copied; loading it into the search database" >> archive/finish-log.txt
node scripts/photos-db.mjs > archive/photos-db.out 2>&1 && echo "$(date '+%Y-%m-%d %H:%M') photo search ready: $(tail -1 archive/photos-db.out)" >> archive/finish-log.txt || echo "$(date '+%Y-%m-%d %H:%M') photo search load FAILED (archive/photos-db.out)" >> archive/finish-log.txt
