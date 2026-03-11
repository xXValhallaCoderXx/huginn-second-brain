#!/bin/bash
# Wait for CouchDB to be ready, then create the LiveSync database with proper settings
set -e

COUCHDB_URL="http://${COUCHDB_USER:-admin}:${COUCHDB_PASSWORD}@localhost:5984"
DB_NAME="${LIVESYNC_DB:-obsidian-livesync}"

echo "Waiting for CouchDB to start..."
until curl -sf "${COUCHDB_URL}/_up" > /dev/null 2>&1; do
  sleep 2
done

echo "CouchDB is up. Creating database '${DB_NAME}'..."
curl -sf -X PUT "${COUCHDB_URL}/${DB_NAME}" || echo "DB may already exist, continuing..."

echo "Setting database security..."
curl -sf -X PUT "${COUCHDB_URL}/${DB_NAME}/_security" \
  -H "Content-Type: application/json" \
  -d '{"admins":{"names":[],"roles":[]},"members":{"names":[],"roles":[]}}' || true

echo "CouchDB init complete. Database '${DB_NAME}' ready for LiveSync."
