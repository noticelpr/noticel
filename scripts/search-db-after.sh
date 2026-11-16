#!/bin/bash
# Tonight (2026-11-16): once the final archive rebuild is done (scripts/archive-finish.sh), refresh the search database
# with every story. Log: archive/finish-log.txt
cd "$(dirname "$0")/.."
until grep -q "FINAL archive rebuilt" archive/finish-log.txt; do sleep 120; done
echo "$(date '+%Y-%m-%d %H:%M') refreshing the search database with every story" >> archive/finish-log.txt
node scripts/search-db.mjs > archive/search-db.out 2>&1 && echo "$(date '+%Y-%m-%d %H:%M') search database refreshed: $(tail -1 archive/search-db.out)" >> archive/finish-log.txt || echo "$(date '+%Y-%m-%d %H:%M') search database refresh FAILED (archive/search-db.out)" >> archive/finish-log.txt
