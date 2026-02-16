# Dockerfile Additions Checklist

Keep this file synced with any manual package installs so the container image stays consistent.

## Required Packages
- `gh` (GitHub CLI) – install via `apt-get install -y gh`
- `python3-pip` (plus build-essential & Python headers) – install via `apt-get install -y python3-pip` to enable backend venvs and dependency installs.
- `python3.11-venv` – install via `apt-get install -y python3.11-venv` so `python3 -m venv` works inside the container.
- `ripgrep` – install via `apt-get install -y ripgrep` for fast repo-wide search.

## Node/NPM Globals
- `@openai/codex` – install via `npm i -g @openai/codex` (Codex CLI for MCP + coding agent access).

## Playwright Runtime
- Install browsers + system deps once: `npx playwright install --with-deps chromium`

## Setup Steps
1. `apt-get update`
2. `apt-get install -y gh`
3. `apt-get install -y python3-pip`
4. `apt-get install -y python3.11-venv`
5. `apt-get install -y ripgrep`
6. `npm i -g @openai/codex`
7. `npx playwright install --with-deps chromium`

Add these commands to the Dockerfile to avoid re-installing after reboot.
