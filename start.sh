#!/bin/bash

# TaskHub Launcher (Daemon Mode)
# Starts API, Scheduler, Worker, and Reaper in background.

# Configuration
WORKER_COUNT=${1:-1}
LOG_DIR="logs"
PID_DIR="logs" # Keep PIDs in logs for now as per existing convention

mkdir -p "$LOG_DIR"

echo "[Launcher] Starting TaskHub (Workers: $WORKER_COUNT)..."

# Helper function
start_service() {
    local name=$1
    local cmd=$2
    local logfile="$LOG_DIR/$name.log"
    local pidfile="$PID_DIR/$name.pid"

    echo "  -> Starting $name..."
    nohup uv run $cmd > "$logfile" 2>&1 &
    echo $! > "$pidfile"
}

# 1. Start API
start_service "api" "main.py api"

# Wait for API to warm up
sleep 2

# 2. Start Scheduler
start_service "scheduler" "main.py scheduler"

# 3. Start Reaper
start_service "reaper" "main.py reaper --interval 60"

# 4. Start Workers
# Clear shared worker log header or separate them?
# Let's keep a combined log for workers but separate PIDs
WORKER_LOG="$LOG_DIR/worker.log"
: > "$WORKER_LOG"

for i in $(seq 1 $WORKER_COUNT); do
    echo "  -> Starting worker-$i..."
    nohup uv run main.py worker >> "$WORKER_LOG" 2>&1 &
    echo $! > "$PID_DIR/worker-$i.pid"
done

echo "------------------------------------------------"
echo "  TaskHub started successfully."
echo "------------------------------------------------"
echo "  Dashboard: http://127.0.0.1:8457"
echo "  Components: API, Scheduler, Reaper, Workers($WORKER_COUNT)"
echo "  Logs:      ./$LOG_DIR/"
echo "  Stop:      ./stop.sh"
echo "------------------------------------------------"
