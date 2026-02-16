# Dockerfile Additions Checklist

Keep this file synced with any manual package installs so the container image stays consistent.

## Required Packages
- `gh` (GitHub CLI) – install via `apt-get install -y gh`
- `python3-pip` (plus build-essential & Python headers) – install via `apt-get install -y python3-pip` to enable backend venvs and dependency installs.
- `python3.11-venv` – install via `apt-get install -y python3.11-venv` so `python3 -m venv` works inside the container.

## Setup Steps
1. `apt-get update`
2. `apt-get install -y gh`
3. `apt-get install -y python3-pip`
4. `apt-get install -y python3.11-venv`

Add these commands to the Dockerfile to avoid re-installing after reboot.
