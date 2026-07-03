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

echo ""
echo "Mike OSS is running!"
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:3000"
echo ""
echo "Close the Terminal tabs to stop the servers."
