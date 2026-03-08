#!/usr/bin/env python3
"""
Backend server starter for FastAPI.
"""

import os
import subprocess
import sys
import time

# Configuration
BACKEND_PORT = os.getenv("PORT", "8000")


def start_backend():
    """Start the FastAPI backend."""
    print("[STARTER] Starting FastAPI backend on port", BACKEND_PORT)
    return subprocess.Popen(
        ["python3", "app.py"], cwd="/", env={**os.environ, "PORT": BACKEND_PORT}
    )


def main():
    process = None

    try:
        process = start_backend()
        print("[STARTER] Service running!")
        print(f"[STARTER] Backend: http://0.0.0.0:{BACKEND_PORT}")

        while True:
            retcode = process.poll()
            if retcode is not None:
                print(f"[STARTER] backend exited with code {retcode}")
                return retcode
            time.sleep(1)

    except KeyboardInterrupt:
        print("[STARTER] Shutting down...")
        if process:
            process.terminate()
        sys.exit(0)


if __name__ == "__main__":
    main()
