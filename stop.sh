#!/bin/bash

# TaskHub Stopper
# Gracefully shuts down API, Scheduler, Worker, and Reaper processes.

LOG_DIR="logs"
echo "[Stopper] Initiating shutdown sequence..."

# Function to kill by PID file
kill_by_pid() {
    local pidfile=$1
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo "  -> Killing PID $pid ($(basename "$pidfile" .pid))..."
            kill "$pid"
        fi
        rm "$pidfile"
    fi
}

# 1. Kill based on known PID files (More precise)
if [ -d "$LOG_DIR" ]; then
    for pidfile in "$LOG_DIR"/*.pid; do
        kill_by_pid "$pidfile"
    done
fi

# 2. Fallback: Kill by pattern (Cleanup stragglers)
# We look specifically for main.py with our commands
TARGETS=("main.py api" "main.py worker" "main.py reaper" "main.py scheduler")

for target in "${TARGETS[@]}"; do
    if pgrep -f "$target" > /dev/null; then
        echo "  -> Cleanup: pkill -f '$target'"
        pkill -f "$target"
    fi
done

# 3. Wait for exit
echo "[Stopper] Waiting for processes to exit..."
MAX_WAIT=5
COUNT=0
while [ $COUNT -lt $MAX_WAIT ]; do
    STILL_RUNNING=0
    for target in "${TARGETS[@]}"; do
        if pgrep -f "$target" > /dev/null; then
            STILL_RUNNING=1
            break
        fi
    done
    
    if [ $STILL_RUNNING -eq 0 ]; then
        echo "[Stopper] All services stopped gracefully."
        exit 0
    fi
    
    sleep 1
    COUNT=$((COUNT + 1))
done

# 4. Force kill
echo "[Stopper] Force killing hanging processes..."
for target in "${TARGETS[@]}"; do
    pkill -9 -f "$target"
done

echo "[Stopper] Shutdown complete."