# Markdown Formatting Guide for AI Agent Responses

This document describes the markdown formatting supported in the AI agent's message renderer and how to use it effectively.

## Supported Markdown Elements

### Headers

The agent supports four levels of headers:

```markdown
# H1 Header - Large title (3xl font, bold)
## H2 Header - Section header (2xl font, bold)
### H3 Header - Subsection (xl font, semibold)
#### H4 Header - Small header (lg font, semibold)
```

Headers automatically include appropriate spacing above and below for visual separation.

### Text Formatting

```markdown
**Bold text** - Renders as semibold font weight
*Italic text* - Renders in italics
`inline code` - Gray background with monospace font
```

### Links

Two formats are supported:

```markdown
[Link text](https://example.com) - Markdown-style links
https://example.com - Auto-linked URLs
```

Links render in blue with hover effects and open in new tabs.

### Lists

Both ordered and unordered lists are supported:

```markdown
Unordered lists:
- First item
- Second item
- Third item

Or with asterisks:
* First item
* Second item

Ordered lists:
1. First step
2. Second step
3. Third step
```

Lists have comfortable spacing between items (space-y-1) and proper margins from surrounding content.

### Code Blocks

For multi-line code:

```markdown
```
code here
multiple lines
```
```

Code blocks feature:
- Dark gray background
- Monospace font
- Horizontal scrolling for long lines
- Padding and rounded corners

### Blockquotes

```markdown
> This is a quoted text
> It renders with a left border and italic styling
```

Blockquotes have a gray left border and italic text for emphasis.

### Tables

Markdown tables with pipe separators:

```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

Tables feature:
- Header row with darker background
- Borders around all cells
- Horizontal scrolling for wide tables
- Automatic handling of separator rows

### Horizontal Rules

```markdown
---
```

Creates a horizontal line for visual separation between sections.

## Spacing and Layout

The renderer uses a spacing system optimized for readability:

- **No manual line breaks needed**: Block elements (headers, lists, paragraphs) handle their own spacing
- **Paragraph breaks**: Double newlines create new paragraphs with proper spacing
- **Consistent margins**: Elements have balanced top/bottom margins
- **No excessive whitespace**: Single newlines don't create extra space

## AI Agent Guidelines

When the AI agent generates responses, it should:

1. **Output markdown directly** - No need for code fence wrappers like ` ```markdown`
2. **Use headers to organize** - Break up long responses with appropriate headers
3. **Format data as tables** - When presenting comparative or structured data
4. **Use lists liberally** - For steps, options, or multiple points
5. **Emphasize with bold** - For important terms or key points
6. **Quote sources** - Use blockquotes for referenced text

## Technical Implementation

The message renderer (`MessageRenderer.tsx`) processes markdown in this order:

1. Escape HTML for security
2. Convert markdown links `[text](url)`
3. Auto-link standalone URLs
4. Process headers (H1-H4)
5. Convert bold and italic text
6. Process lists (ordered and unordered)
7. Handle code blocks and inline code
8. Process blockquotes
9. Render tables
10. Handle paragraph breaks

### CSS Classes Used

- Headers: Tailwind typography classes with specific margins
- Lists: `list-disc`/`list-decimal` with `ml-6` indentation
- Code: `bg-gray-700/800` backgrounds with `font-mono`
- Links: `text-blue-400 hover:text-blue-300 underline`
- Tables: `border-gray-600` with `overflow-x-auto` wrapper
- Blockquotes: `border-l-4 border-gray-500` with italic text

## Best Practices

1. **Keep formatting purposeful** - Don't over-format responses
2. **Use consistent header hierarchy** - Don't skip header levels
3. **Tables for structured data** - Better than trying to align with spaces
4. **Lists for multiple items** - Clearer than comma-separated text
5. **Code formatting for technical terms** - Helps distinguish commands/code
6. **Let spacing be automatic** - Don't try to manually control spacing with multiple newlines

## Example Response

```markdown
## Weather Update

The current weather in **New York** is:

### Conditions
- Temperature: `72°F`
- Humidity: 65%
- Wind: 10 mph NW

### 5-Day Forecast

| Day | High | Low | Conditions |
|-----|------|-----|------------|
| Mon | 75°F | 62°F | Sunny |
| Tue | 73°F | 60°F | Partly Cloudy |
| Wed | 71°F | 58°F | Rain |

> Weather data provided by OpenWeather API

For more details, visit [weather.com](https://weather.com).
```

This guide ensures consistent, readable formatting across all AI agent responses while maintaining clean visual presentation in the chat interface.
