#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — Homebrew Formula Updater
# Usage: bash scripts/update-homebrew.sh 0.2.1
# ════════════════════════════════════════════
set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>  e.g. $0 0.2.1"
  exit 1
fi

TAP_DIR="${2:-../homebrew-evokit}"
FORMULA="$TAP_DIR/Formula/evokit.rb"

if [ ! -f "$FORMULA" ]; then
  echo "❌ Formula not found at $FORMULA"
  echo "   Clone the tap repo first:"
  echo "   git clone git@github.com:zyTheGit/homebrew-evokit.git $TAP_DIR"
  exit 1
fi

echo "📦 Updating homebrew-evokit to v$VERSION ..."

cd /tmp
npm pack "@zythegit/evokit@$VERSION"
SHA=$(shasum -a 256 "zythegit-evokit-$VERSION.tgz" | cut -d' ' -f1)
rm "zythegit-evokit-$VERSION.tgz"

cd - > /dev/null

sed -i "s|sha256 \".*\"|sha256 \"$SHA\"|" "$FORMULA"

# Update version in the comment / filename references
if grep -q "evokit-" "$FORMULA"; then
  sed -i "s|evokit-[0-9.]*\.tgz|evokit-$VERSION.tgz|" "$FORMULA"
fi

echo "✅ Updated: $FORMULA"
echo "   SHA256: $SHA"
echo ""
echo "Next steps:"
echo "  cd $TAP_DIR"
echo "  git add Formula/evokit.rb"
echo "  git commit -m 'evokit v$VERSION'"
echo "  git push"
