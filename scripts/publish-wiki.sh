#!/usr/bin/env bash
# Publish docs/wiki/ to this repository's GitHub wiki, replacing its pages.
#
#   scripts/publish-wiki.sh
#
# The wiki is a separate git repo (<repo>.wiki.git). GitHub only creates it after the first page is
# saved in the web UI (repo → Wiki → "Create the first page"), so do that once before the first run.
# Edit the pages in docs/wiki/ and re-run; do not edit them on GitHub, or the next run overwrites them.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
origin=$(git -C "$root" remote get-url origin)
wiki="${origin%.git}.wiki.git"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if ! git clone --quiet "$wiki" "$tmp" 2>/dev/null; then
  echo "Could not clone $wiki" >&2
  echo "If this is the first time: on GitHub open the repo's Wiki tab and create the first page, then run again." >&2
  exit 1
fi

rsync -a --delete --exclude .git "$root/docs/wiki/" "$tmp/"
cd "$tmp"
git add -A
if git diff --cached --quiet; then
  echo "Wiki is already up to date."
  exit 0
fi
git commit --quiet -m "Update wiki from docs/wiki"
git push --quiet
echo "Wiki updated: ${origin%.git}/wiki"
