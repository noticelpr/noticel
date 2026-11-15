#!/bin/bash
# Runs the archive steps in order, unattended (2026-11-15): waits for the gallery photo lookup, adds galleries to the
# recent story files (they go online with the next "publish"), rebuilds the archive in R2 with views and galleries,
# then waits for the full archive copy and rebuilds it once more. Log: archive/finish-log.txt
cd "$(dirname "$0")/.."
log() { echo "$(date '+%Y-%m-%d %H:%M') $*" >> archive/finish-log.txt; }
log "waiting for the gallery photo lookup"
until grep -q "^Done\." archive/gallery-media.out; do sleep 60; done
log "photo lookup done; adding galleries to recent stories"
node scripts/apply-postmeta.mjs >> archive/finish-log.txt 2>&1
# Publish the galleries (approved by the owner on 2026-11-15): only the story files, only if the site builds
if ! git diff --quiet -- src/content/noticias; then
  if npm run build > archive/finish-build.log 2>&1; then
    git add src/content/noticias && git commit -q -m "Photo galleries from noticel.com's database on the recent stories" \
      && git pull -q --rebase origin main && git push -q origin main && log "galleries published" || log "galleries NOT published (git step failed)"
  else
    log "galleries NOT published: the site did not build (archive/finish-build.log)"
  fi
else
  log "no recent story needed a gallery"
fi
log "rebuilding the archive in R2 with views and galleries (stories copied so far)"
node scripts/archive-stories.mjs >> archive/historias-run.out 2>&1 && log "archive rebuilt" || log "archive rebuild FAILED (see archive/historias-run.out)"
log "waiting for the full archive copy"
until grep -q "^.*Finished:" archive/log.txt; do sleep 120; done
log "archive copy finished; final archive rebuild"
node scripts/archive-stories.mjs >> archive/historias-run.out 2>&1 && log "FINAL archive rebuilt: every old story is in R2" || log "final archive rebuild FAILED (see archive/historias-run.out)"
