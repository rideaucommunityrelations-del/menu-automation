#!/bin/bash
# Double-click this file to start the Menu App server (if it isn't already
# running) and open it in your browser.

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

export PORT=3001
URL="http://localhost:$PORT"
LOG_FILE="$APP_DIR/server.log"
PID_FILE="$APP_DIR/.server.pid"

is_running() {
  lsof -ti:"$PORT" >/dev/null 2>&1
}

if ! is_running; then
  echo "Starting Menu App server..."
  nohup node server.js > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown

  for i in $(seq 1 20); do
    if curl -s -o /dev/null "$URL"; then
      break
    fi
    sleep 0.5
  done
fi

echo "Opening $URL"
open "$URL"

sleep 2
