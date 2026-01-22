#!/bin/bash

# TaskHub Launcher (Daemon Mode)
# Starts API, Worker, and Reaper in background and exits.

# Create logs directory
mkdir -p logs

# Worker count (default 1)
WORKER_COUNT=${1:-1}

echo "[Launcher] Starting TaskHub in background with $WORKER_COUNT workers..."

# 1. Start API
echo "[Launcher] Starting API (logging to logs/api.log)..."
nohup uv run main.py api > logs/api.log 2>&1 &
echo $! > logs/api.pid

# Wait for API to warm up
sleep 2

# 2. Start Workers
echo "[Launcher] Starting $WORKER_COUNT Workers (logging to logs/worker.log)..."
# Clear previous worker log
: > logs/worker.log
for i in $(seq 1 $WORKER_COUNT); do
    nohup uv run main.py worker >> logs/worker.log 2>&1 &
done

# 3. Start Reaper
echo "[Launcher] Starting Reaper (logging to logs/reaper.log)..."
nohup uv run main.py reaper --interval 60 > logs/reaper.log 2>&1 &
echo $! > logs/reaper.pid

echo "------------------------------------------------"
echo "  TaskHub started successfully."
echo "------------------------------------------------"
echo "  Dashboard: http://127.0.0.1:8000"
echo "  Logs:      ./logs/"
echo "  Stop:      ./stop.sh"
echo "------------------------------------------------"