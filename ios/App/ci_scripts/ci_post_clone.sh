#!/bin/sh
# Xcode Cloud post-clone: generate Capacitor iOS files that are gitignored.
# Apple looks for ci_scripts/ next to the selected .xcodeproj / .xcworkspace
# (ios/App/App.xcodeproj), not at the repository root.
set -eu

echo "[ci_post_clone] Generating Capacitor iOS resources"

if [ -n "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
  ROOT="$CI_PRIMARY_REPOSITORY_PATH"
else
  ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
fi

cd "$ROOT"
echo "[ci_post_clone] repository root: $ROOT"

# Cloud archives must use production remote URL, never a LAN override.
unset CAPACITOR_DEV_SERVER_URL

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[ci_post_clone] installing Node via Homebrew"
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_INSTALL_CLEANUP=1
  brew install node
fi

echo "[ci_post_clone] node $(node -v) npm $(npm -v)"

npm ci
npx --no-install cap sync ios

APP_DIR="$ROOT/ios/App/App"
missing=0
for rel in capacitor.config.json config.xml public/index.html; do
  if [ ! -f "$APP_DIR/$rel" ]; then
    echo "[ci_post_clone] missing required file: $APP_DIR/$rel" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  exit 1
fi

if ! grep -q "https://www.digitalmusicdatabase.com" "$APP_DIR/capacitor.config.json"; then
  echo "[ci_post_clone] production server URL missing from capacitor.config.json" >&2
  exit 1
fi

echo "[ci_post_clone] capacitor.config.json, config.xml, and public/index.html are present"
echo "[ci_post_clone] done"
