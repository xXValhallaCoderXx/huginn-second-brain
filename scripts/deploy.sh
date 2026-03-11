#!/usr/bin/env bash
set -euo pipefail

# Huginn Second Brain — VPS Deploy Script
# Usage: ./scripts/deploy.sh [--with-proxy]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

# Check prerequisites
command -v docker >/dev/null 2>&1 || { error "Docker not found. Install: https://docs.docker.com/engine/install/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { error "Docker Compose not found."; exit 1; }

# Check .env
if [ ! -f .env ]; then
    error ".env file not found. Run: cp .env.example .env && edit .env"
    exit 1
fi

# Validate required vars
source .env
for var in OPENROUTER_API_KEY TELEGRAM_BOT_TOKEN GATEWAY_TOKEN; do
    if [ -z "${!var:-}" ]; then
        error "$var is not set in .env"
        exit 1
    fi
done
info "Environment variables OK"

# Generate gateway token if placeholder
if [ "${GATEWAY_TOKEN}" = "CHANGE_ME" ] || [ ${#GATEWAY_TOKEN} -lt 16 ]; then
    NEW_TOKEN=$(openssl rand -hex 24)
    sed -i "s|^GATEWAY_TOKEN=.*|GATEWAY_TOKEN=${NEW_TOKEN}|" .env
    info "Generated gateway token"
fi

# Determine profiles
PROFILES=""
if [[ "${1:-}" == "--with-proxy" ]]; then
    if [ -z "${DOMAIN:-}" ]; then
        error "DOMAIN not set in .env (required for --with-proxy)"
        exit 1
    fi
    PROFILES="--profile proxy"
    info "Enabling Caddy reverse proxy for ${DOMAIN}"
fi

# Deploy
info "Pulling images..."
docker compose ${PROFILES} pull

info "Starting services..."
docker compose ${PROFILES} up -d

info "Waiting for health check..."
sleep 10

if docker compose ps | grep -q "healthy"; then
    info "Huginn is running and healthy! 🎉"
else
    warn "Services starting (may take 30s for first npm install)"
fi

echo ""
info "Logs:    docker compose logs -f openclaw"
info "Status:  docker compose ps"
info "Stop:    docker compose down"
if [ -n "$PROFILES" ]; then
    info "HTTPS:   https://${DOMAIN}"
fi
