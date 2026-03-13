# Todolist MCP Server

An MCP (Model Context Protocol) server that provides todo management capabilities for Claude Desktop and other MCP clients.

## Features

- ✅ Add, list, update, and delete todos
- 🏠 Support for multiple spaces (workspaces)
- 📝 Category management
- 🔐 Authenticated access to your todolist backend
- 💾 Real-time synchronization with your todolist app

## Setup

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Get Authentication Token

1. Start your todolist backend server:
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn app:app --host 0.0.0.0 --port 8141 --reload
   ```

2. Login to get your auth token (you can use curl or the web interface):
   ```bash
   # Sign up (if needed)
   curl -H "Content-Type: application/json" -d '{"email": "your@email.com"}' http://localhost:8141/auth/signup

   # Login with verification code from email/console
   curl -H "Content-Type: application/json" -d '{"email": "your@email.com", "code": "123456"}' http://localhost:8141/auth/login
   ```

3. Copy the `token` from the login response.

### 3. Get Your Default Space ID

```bash
# List your spaces (using the token from step 2)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8141/spaces
```

Copy the `_id` of your default/personal space.

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
TODOLIST_API_URL=http://localhost:8141
TODOLIST_AUTH_TOKEN=your_jwt_token_here
DEFAULT_SPACE_ID=your_default_space_id_here
```

### 5. Build the Server

```bash
npm run build
```

## Using with Claude Desktop

### Step 1: Create Configuration Directory
First, create the Claude Desktop configuration directory if it doesn't exist:

**macOS**:
```bash
mkdir -p "$HOME/Library/Application Support/Claude"
```

**Windows**:
```cmd
mkdir "%APPDATA%\Claude"
```

### Step 2: Create Configuration File
Create the MCP configuration file at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Step 3: Add MCP Server Configuration
Add this JSON configuration to the file:

```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/path/to/your/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "http://localhost:8141",
        "TODOLIST_AUTH_TOKEN": "your_jwt_token_here",
        "DEFAULT_SPACE_ID": "your_default_space_id_here"
      }
    }
  }
}
```

**Important**: Replace the placeholder values:
- `/path/to/your/todolist/mcp-server/dist/index.js` → Full path to your compiled MCP server
- `your_jwt_token_here` → Your authentication token from Step 2 above
- `your_default_space_id_here` → Your default space ID from Step 3 above

### Step 4: Restart Claude Desktop
Close and reopen Claude Desktop for the changes to take effect.

### Step 5: Verify Installation
Once Claude Desktop restarts, your todolist MCP server should be available. You can test it by asking Claude to:
- "Add a todo to learn TypeScript"
- "List all my todos"
- "Show me my spaces"

## Development Mode

For development, you can run the server directly with tsx:

```bash
npm run dev
```

## Available Tools

### `add_todo`
Add a new todo item.
- `text` (required): The todo item text
- `space_id` (optional): Space ID (uses default if not provided)

### `list_todos`
List all todos, optionally filtered by completion status.
- `space_id` (optional): Space ID (uses default if not provided)
- `completed` (optional): Filter by completion status

### `update_todo`
Update a todo item.
- `id` (required): Todo ID
- `text` (optional): New todo text
- `completed` (optional): Completion status
- `category` (optional): Todo category

### `delete_todo`
Delete a todo item.
- `id` (required): Todo ID

### `list_spaces`
List all accessible spaces.

### `create_space`
Create a new space.
- `name` (required): Space name

### `list_categories`
List categories for a space.
- `space_id` (optional): Space ID (uses default if not provided)

## Example Usage with Claude Desktop

Once configured, you can ask Claude Desktop things like:

- "Add a todo to learn TypeScript"
- "List all my incomplete todos"
- "Mark todo with ID xyz as completed"
- "Create a new space called 'Work Projects'"
- "Show me all my spaces"
- "What categories do I have?"

## Troubleshooting

### Authentication Errors
- Make sure your auth token is valid and not expired
- Tokens expire after 30 days of inactivity
- Re-login to get a fresh token if needed

### Connection Errors
- Ensure your todolist backend is running
- Check that the API URL in your config matches your backend
- Verify network connectivity

### Space/Todo Not Found
- Make sure you're using the correct space ID
- List your spaces to verify the correct IDs
- Check that you have access to the space

### MCP Server Not Appearing in Claude Desktop
- Verify the path to the compiled JavaScript file is correct
- Check that all environment variables are set in the config
- Look at Claude Desktop's logs for error messages
- Restart Claude Desktop after configuration changes

## Development

The server is built with:
- TypeScript for type safety
- @modelcontextprotocol/sdk for MCP protocol implementation
- axios for HTTP requests to your todolist backend
- dotenv for environment variable management

To modify or extend functionality, edit `src/index.ts` and rebuild with `npm run build`.
