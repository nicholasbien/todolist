# Rich Message Examples

## Problem

Posting markdown tables, code blocks, and special characters via CLI breaks due to bash escaping:

```bash
# ❌ This breaks:
node todolist-cli.js post-message -s <id> -c "```\nX | O |\n---|---"
# Error: sh: 4: Syntax error: "|" unexpected
```

## Solution

Use `post-rich-message.js` which handles all escaping properly:

```bash
# Option 1: Write to temp file
cat > /tmp/msg.md << 'EOF'
# Tic-Tac-Toe Board

|   |   |   |
|---|---|---|
| O |   |   |
|   | X |   |
|   |   |   |

Your move!
EOF

node post-rich-message.js <session_id> /tmp/msg.md
```

```bash
# Option 2: Pipe via stdin
cat << 'EOF' | node post-rich-message.js <session_id>
## Portfolio Summary

| Position | Value | Change |
|----------|-------|--------|
| NVDA | $15K | +5% |
| TSLA | $12K | -2% |

**Total:** $247,000
EOF
```

```bash
# Option 3: Use echo with proper escaping
echo '**Bold** and *italic* and `code`' | node post-rich-message.js <session_id>
```

## Complete Example

```bash
export TODOLIST_API_URL=https://todolist-backend-production-a83b.up.railway.app
export TODOLIST_AUTH_TOKEN=your_token_here

# Create rich message
cat > /tmp/board.md << 'EOF'
🎮 Tic-Tac-Toe

```
 O |   |  
---+---+---
   | X |  
---+---+---
   |   |  
```

**Your turn!** Where do you place your O?

Options: top-center, top-right, middle-left, middle-right, bottom-left, bottom-center, bottom-right
EOF

# Post it
node post-rich-message.js 69acb7b64f228ace7e2b38b9 /tmp/board.md
```

## Supported Formatting

The todolist web UI supports full markdown:

- `**bold**` → **bold**
- `*italic*` → *italic*
- `` `code` `` → `code`
- ```` ```code blocks``` ````
- Tables with `|---|---|`
- Lists with `- ` or `1. `
- Headers with `# `
- Links `[text](url)`

## Helper Script

The new `post-rich-message.js` script:
- Reads from file or stdin (no shell escaping issues)
- Uses Node.js HTTP directly (no curl/exec)
- Handles all special characters: `|`, `-`, `` ` ``, `*`, etc.
- Shows success/error messages
- Works with any markdown content

## Migration

Update existing scripts:

```bash
# Old (breaks on special chars):
node todolist-cli.js post-message -s $id -c "$msg"

# New (works with all markdown):
echo "$msg" | node post-rich-message.js $id
```

## Testing

```bash
# Create test message
cat > /tmp/test.md << 'EOF'
# Test Rich Message

| Feature | Status |
|---------|--------|
| Tables | ✅ |
| Code | `inline` |
| Bold | **yes** |
| Lists | - item |

**All working!**
EOF

# Post to test session
node post-rich-message.js <your_test_session_id> /tmp/test.md
```

---
*Created to fix bash escaping issues with rich UI content*
