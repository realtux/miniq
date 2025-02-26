#!/usr/bin/env bash

# Function to display usage
usage() {
    echo "Usage: $0 <node_script.js> <number_of_instances>"
    echo "Example: $0 test.js 4"
    exit 1
}

# Check if correct number of arguments are provided
if [ "$#" -ne 2 ]; then
    usage
fi

# Assign parameters to variables
NODE_SCRIPT="$1"
NUM_INSTANCES="$2"

# Validate that the Node.js file exists
if [ ! -f "$NODE_SCRIPT" ]; then
    echo "Error: File '$NODE_SCRIPT' not found"
    exit 1
fi

# Validate that number of instances is a positive integer
if ! [[ "$NUM_INSTANCES" =~ ^[0-9]+$ ]] || [ "$NUM_INSTANCES" -le 0 ]; then
    echo "Error: Number of instances must be a positive integer"
    exit 1
fi

# Array to store process IDs
PIDS=()

# Function to clean up all child processes
cleanup() {
    echo "Terminating all instances..."
    for pid in "${PIDS[@]}"; do
        kill -TERM "$pid" 2>/dev/null
    done
    exit 0
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Start the specified number of Node.js instances in background
for ((i=1; i<=NUM_INSTANCES; i++))
do
    node "$NODE_SCRIPT" &
    PIDS+=($!)
    echo "Started instance $i with PID ${PIDS[-1]}"
done

# Wait for all background processes to complete
wait

echo "All instances have completed"
