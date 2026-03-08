#!/usr/bin/env python3
"""
Combined server starter - runs both FastAPI backend and webhook server.

This allows both services to share MongoDB connection without disk space issues.
"""

import subprocess
import sys
import os
import signal
import time

# Configuration
BACKEND_PORT = os.getenv("PORT", "8000")
WEBHOOK_PORT = os.getenv("WEBHOOK_PORT", "8081")

def start_backend():
    """Start the FastAPI backend."""
    print("[STARTER] Starting FastAPI backend on port", BACKEND_PORT)
    return subprocess.Popen(
        ["python3", "app.py"],
        cwd="/",
        env={**os.environ, "PORT": BACKEND_PORT}
    )

def start_webhook():
    """Start the webhook server."""
    print("[STARTER] Starting webhook server on port", WEBHOOK_PORT)
    return subprocess.Popen(
        ["node", "scripts/webhook-server.js"],
        cwd="/workspace/scripts",
        env={**os.environ, "WEBHOOK_PORT": WEBHOOK_PORT}
    )

def main():
    processes = []
    
    try:
        # Start backend
        backend = start_backend()
        processes.append(("backend", backend))
        
        # Wait a bit for backend to initialize
        time.sleep(5)
        
        # Start webhook
        webhook = start_webhook()
        processes.append(("webhook", webhook))
        
        print("[STARTER] Both services running!")
        print(f"[STARTER] Backend: http://0.0.0.0:{BACKEND_PORT}")
        print(f"[STARTER] Webhook: http://0.0.0.0:{WEBHOOK_PORT}")
        
        # Wait for either process to exit
        while True:
            for name, proc in processes:
                retcode = proc.poll()
                if retcode is not None:
                    print(f"[STARTER] {name} exited with code {retcode}")
                    # Kill other process
                    for other_name, other_proc in processes:
                        if other_proc != proc:
                            other_proc.terminate()
                    return retcode
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("[STARTER] Shutting down...")
        for name, proc in processes:
            proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main()
