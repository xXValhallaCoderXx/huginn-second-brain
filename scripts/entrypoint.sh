#!/bin/sh
set -e

# Validate required env vars
for var in OPENROUTER_API_KEY TELEGRAM_BOT_TOKEN GATEWAY_TOKEN TAVILY_API_KEY; do
  eval val=\$$var
  if [ -z "$val" ]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done

# Use Railway's $PORT if set, otherwise default to 18789
PORT="${PORT:-18789}"

# Use persistent volume path if mounted (Railway Volume), else default
DATA_DIR="${DATA_DIR:-/data}"
OPENCLAW_HOME="${DATA_DIR}/.openclaw"
export OPENCLAW_STATE_DIR="${OPENCLAW_HOME}"

mkdir -p "${OPENCLAW_HOME}/agents/main/agent"

# First run: seed config and workspace from the baked image
if [ ! -f "${OPENCLAW_HOME}/openclaw.json" ]; then
  echo "Entrypoint: first run — seeding config and workspace to ${OPENCLAW_HOME}..."
  cp /app/openclaw.json "${OPENCLAW_HOME}/openclaw.json"
  cp -r /app/workspace "${OPENCLAW_HOME}/workspace"
fi

# Always write auth-profiles.json from env var
cat > "${OPENCLAW_HOME}/agents/main/agent/auth-profiles.json" <<EOF
{
  "version": 1,
  "profiles": {
    "openrouter:default": {
      "type": "api_key",
      "provider": "openrouter",
      "key": "${OPENROUTER_API_KEY}"
    }
  }
}
EOF

echo "Entrypoint: OPENCLAW_STATE_DIR=${OPENCLAW_HOME} PORT=${PORT}"
echo "Entrypoint: starting openclaw gateway..."

# Ensure vault is on the persistent volume
mkdir -p "${DATA_DIR}/vault"
obsidian-cli set-default "${DATA_DIR}/vault" 2>/dev/null || true

exec openclaw gateway run --port "${PORT}"
