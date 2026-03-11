#!/bin/sh
set -e

# Validate required env vars
for var in OPENROUTER_API_KEY TELEGRAM_BOT_TOKEN GATEWAY_TOKEN; do
  eval val=\$$var
  if [ -z "$val" ]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done

# Create per-agent directory
mkdir -p /root/.openclaw/agents/main/agent

# Write auth-profiles.json with the OpenRouter API key
cat > /root/.openclaw/agents/main/agent/auth-profiles.json <<EOF
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

echo "Entrypoint: auth-profiles.json written"
echo "Entrypoint: starting openclaw gateway..."

exec openclaw gateway run --port 18789
