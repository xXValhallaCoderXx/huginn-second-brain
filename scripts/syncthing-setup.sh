#!/bin/sh
# syncthing-setup.sh — Bootstrap Syncthing config on first run.
# Generates config, binds GUI to 0.0.0.0, adds the vault as a shared folder.
set -e

SYNCTHING_HOME="${SYNCTHING_HOME:-/data/syncthing}"
VAULT_PATH="${VAULT_PATH:-/data/vault}"

if [ -f "$SYNCTHING_HOME/config.xml" ]; then
  echo "[syncthing-setup] Config already exists, skipping."
  exit 0
fi

echo "[syncthing-setup] First run — generating Syncthing config..."
mkdir -p "$SYNCTHING_HOME" "$VAULT_PATH"

# Generate initial config with GUI credentials
syncthing generate \
  --config="$SYNCTHING_HOME" \
  --skip-port-probing \
  --gui-user="${SYNCTHING_GUI_USER:-admin}" \
  --gui-password="${SYNCTHING_GUI_PASSWORD:-changeme}"

# Bind GUI to all interfaces (required for Railway / Docker access)
sed -i 's|<address>127.0.0.1:8384</address>|<address>0.0.0.0:8384</address>|' \
  "$SYNCTHING_HOME/config.xml"

# Add the vault as a shared folder
sed -i "/<\/configuration>/i\\
    <folder id=\"huginn-vault\" label=\"Huginn Vault\" path=\"${VAULT_PATH}\" type=\"sendreceive\" \\
     rescanIntervalS=\"60\" fsWatcherEnabled=\"true\" fsWatcherDelayS=\"10\" \\
     ignorePerms=\"false\" autoNormalize=\"true\">\\
        <filesystemType>basic<\/filesystemType>\\
        <minDiskFree unit=\"%\">1<\/minDiskFree>\\
    <\/folder>" "$SYNCTHING_HOME/config.xml"

# Print device ID so the user can pair their clients
echo "[syncthing-setup] Config generated."
echo "[syncthing-setup] Device ID:"
syncthing --device-id --home="$SYNCTHING_HOME" 2>/dev/null || \
  grep -oP '(?<=<device id=")[^"]+' "$SYNCTHING_HOME/config.xml" | head -1
echo ""
echo "[syncthing-setup] Access the GUI at http://<host>:8384 to pair devices."
