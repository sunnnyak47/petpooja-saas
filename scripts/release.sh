#!/bin/bash
set -e

DESKTOP_DIR="$(cd "$(dirname "$0")/../desktop" && pwd)"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── 1. Get bump type (patch by default) ──────────────────────────
BUMP=${1:-patch}  # usage: ./release.sh [patch|minor|major]

# ── 2. Bump version in desktop/package.json ──────────────────────
cd "$DESKTOP_DIR"
OLD_VERSION=$(node -p "require('./package.json').version")

IFS='.' read -r MAJOR MINOR PATCH <<< "$OLD_VERSION"
if [ "$BUMP" = "major" ]; then
  MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
elif [ "$BUMP" = "minor" ]; then
  MINOR=$((MINOR + 1)); PATCH=0
else
  PATCH=$((PATCH + 1))
fi
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# Write new version
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "Version bumped: $OLD_VERSION → $NEW_VERSION"

# ── 3. Sync frontend & build DMG ─────────────────────────────────
npm run build:mac
echo "Build complete"

# ── 4. Commit & push to GitHub ───────────────────────────────────
cd "$ROOT_DIR"
git add desktop/package.json
git commit -m "release: v$NEW_VERSION"
git push origin main
echo "Pushed to GitHub"

# ── 5. Fix filename in latest-mac.yml (dots vs hyphens) ──────────
cd "$DESKTOP_DIR"
PRODUCT_NAME=$(node -p "require('./package.json').build.productName" | sed 's/ /./g')
sed -i '' "s/[^ ]*-${NEW_VERSION}/${PRODUCT_NAME}-${NEW_VERSION}/g" dist/latest-mac.yml

# ── 6. Create GitHub Release with DMG + latest-mac.yml ───────────
gh release create "v$NEW_VERSION" \
  dist/*.dmg \
  dist/latest-mac.yml \
  --title "v$NEW_VERSION" \
  --notes "MS-RM System v$NEW_VERSION — auto-update release"

echo ""
echo "Released v$NEW_VERSION — restaurants will auto-update on next launch."
