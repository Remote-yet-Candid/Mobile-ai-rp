#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Mobile-ai-rp
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 3 || !process.release.lts) throw new Error("Node 24 LTS >=24.3.0 is required");'
command -v git >/dev/null
if [ ! -f package.json ]; then
  echo 'Project foundation is not present in this checkout yet. Review/merge the foundation PR or select its branch; no application initialization was performed.'
  exit 0
fi
# Avoid a system-wide write if the runtime does not already provide the pinned pnpm.
if ! command -v pnpm >/dev/null || [ "$(pnpm --version)" != '11.25.0' ]; then
  npm install --prefix /workspace/.mobile-ai-rp-cli --save-exact --no-audit --no-fund --strict-ssl=true pnpm@11.25.0
  export PATH="/workspace/.mobile-ai-rp-cli/node_modules/.bin:$PATH"
fi
export CI=1
export EXPO_NO_TELEMETRY=1
export DISABLE_EAS_ANALYTICS=1
pnpm install --frozen-lockfile
pnpm build:packages
