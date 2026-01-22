#!/bin/bash

# TaskHub Stopper
# Gracefully shuts down API, Worker, and Reaper processes.

echo "[Stopper] Initiating shutdown sequence..."

# 1. Try to find PIDs using command line patterns
# We look specifically for main.py with our commands
TARGETS=("main.py api" "main.py worker" "main.py reaper")

for target in "${TARGETS[@]}"; do
    PIDS=$(pgrep -f "$target")
    if [ -n "$PIDS" ]; then
        echo "[Stopper] Sending SIGTERM to: $target (PIDs: $PIDS)"
        pkill -f "$target"
    fi
done

# 2. Wait a bit for graceful exit
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

# 3. Force kill if still running
echo "[Stopper] Some processes are hanging. Escalating to SIGKILL..."
for target in "${TARGETS[@]}"; do
    pkill -9 -f "$target"
done

echo "[Stopper] Shutdown complete (forced)."
