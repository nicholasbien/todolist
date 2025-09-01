#!/bin/bash

echo "Setting up MCP servers for the TodoList app"
echo "============================================"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

echo "Installing MCP servers globally..."

# Install Puppeteer MCP server
echo "1. Installing Puppeteer MCP server..."
npm install -g @modelcontextprotocol/server-puppeteer

# Install Filesystem MCP server
echo "2. Installing Filesystem MCP server..."
npm install -g @modelcontextprotocol/server-filesystem

# Install other useful MCP servers (optional)
# echo "3. Installing GitHub MCP server..."
# npm install -g @modelcontextprotocol/server-github

echo ""
echo "✅ MCP servers installed successfully!"
echo ""
echo "You can now test them with:"
echo "  - Puppeteer: mcp-server-puppeteer"
echo "  - Filesystem: mcp-server-filesystem /path/to/directory"
echo ""
echo "Or use them in your app with the unified agent!"
