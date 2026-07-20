#!/bin/bash
# Mike OSS Launcher
# Double-click this file in Finder to start Mike OSS

# Source nvm so npm is available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

MIKE_DIR="$HOME/mike-OSS"

echo "Starting Mike OSS..."
echo ""

# Start backend in a new Terminal tab
osascript <<EOF
tell application "Terminal"
    activate
    set backendTab to do script "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \\\\. \"\$NVM_DIR/nvm.sh\" && cd '$MIKE_DIR/backend' && echo '=== Mike Backend ===' && npm run dev"
    delay 0.5
    tell application "System Events" to keystroke "t" using command down
    delay 0.5
    do script "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \\\\. \"\$NVM_DIR/nvm.sh\" && cd '$MIKE_DIR/frontend' && echo '=== Mike Frontend ===' && npm run dev" in front window
end tell
EOF

echo "Waiting for servers to start..."
sleep 6

echo "Opening Mike in browser..."
open http://localhost:3000

# Scan Mike OSS upstream + forks for new features (runs in background).
# Report opens in browser only if NEW items were found since last scan.
echo "Scanning Mike OSS forks for new features (background)..."
(node "$MIKE_DIR/scripts/fork-scan/scan.mjs" --open-if-new > "$MIKE_DIR/scripts/fork-scan/last-scan.log" 2>&1 &)

# Scan competitors (Harvey, Legora, CoCounsel) for new feature announcements,
# in parallel with the fork scan. Report opens only if NEW items were found.
echo "Scanning competitors for new features (background)..."
(node "$MIKE_DIR/scripts/competitor-scan/scan.mjs" --open-if-new > "$MIKE_DIR/scripts/competitor-scan/last-scan.log" 2>&1 &)

echo ""
echo "Mike OSS is running!"
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:3000"
echo ""
echo "Close the Terminal tabs to stop the servers."
