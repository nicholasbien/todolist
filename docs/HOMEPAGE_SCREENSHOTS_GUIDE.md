# Homepage Screenshots Guide

This guide documents how to capture screenshots of the todolist.nyc app using Playwright MCP and add them to the homepage.

## Overview

The homepage displays three feature screenshots in a responsive grid layout:
1. **Tasks View** - Smart task categorization
2. **AI Assistant** - AI-powered daily planning
3. **Journal Entry** - Integrated daily journal

## Prerequisites

- Playwright MCP server configured in Claude Code
- Development server running on `http://localhost:3141`
- Test account credentials: `test@example.com` with code `000000`

## Taking Screenshots with Playwright MCP

### 1. Navigate to the App

```javascript
// Navigate to localhost
await browser_navigate({ url: "http://localhost:3141" });
```

### 2. Log In with Test Account

```javascript
// Click login, enter test email, get code, log in
await browser_click({ element: "Login link", ref: "..." });
await browser_type({ element: "Email input", ref: "...", text: "test@example.com" });
await browser_click({ element: "Send Code button", ref: "..." });
await browser_type({ element: "Code input", ref: "...", text: "000000" });
await browser_click({ element: "Login button", ref: "..." });
```

### 3. Screenshot #1: Tasks View

The tasks view shows AI-powered categorization of todos.

```javascript
// Wait for tasks to load
await browser_wait_for({ text: "Tasks" });

// Take screenshot
await browser_take_screenshot({
  filename: "tasks-view.png"
});
```

**Result**: Screenshot saved to `.playwright-mcp/homepage-screenshots/tasks-view.png`

### 4. Screenshot #2: AI Assistant Response

The assistant screenshot shows a user question and the AI's response.

```javascript
// Navigate to Assistant tab
await browser_click({ element: "Assistant tab", ref: "..." });

// Ask a question
await browser_type({
  element: "Chat input",
  ref: "...",
  text: "What should I focus on today?"
});
await browser_click({ element: "Send button", ref: "..." });

// Wait for response to appear (adjust wait time as needed)
await browser_wait_for({ time: 5 });

// Scroll up to see question and start of response (if needed)
await browser_evaluate({
  function: "() => { const chatContainer = document.querySelector('[class*=\"overflow-y-auto\"]'); if (chatContainer) chatContainer.scrollTop = 0; }"
});

// Take screenshot
await browser_take_screenshot({
  filename: "assistant-response.png"
});
```

**Result**: Screenshot shows user question "What should I focus on today?" and the AI's prioritized recommendations.

### 5. Screenshot #3: Journal Entry

The journal screenshot shows the daily journal interface with sample content.

```javascript
// Navigate to Journal tab
await browser_click({ element: "Journal tab", ref: "..." });

// Wait for journal to load
await browser_wait_for({ text: "Journal" });

// Type a journal entry (or use existing saved entry)
await browser_type({
  element: "Journal textarea",
  ref: "...",
  text: "Productive day today! Completed 3 tasks and made good progress on the machine learning project. Feeling energized and ready for tomorrow's challenges."
});

// Click Save
await browser_click({ element: "Save button", ref: "..." });

// Take screenshot
await browser_take_screenshot({
  filename: "journal-entry.png"
});
```

**Result**: Screenshot saved to `.playwright-mcp/homepage-screenshots/journal-entry.png`

## Copying Screenshots to Frontend

After taking screenshots, copy them from the Playwright working directory to the frontend public folder:

```bash
# Copy all screenshots
cp .playwright-mcp/homepage-screenshots/*.png frontend/public/screenshots/

# Or copy individually
cp .playwright-mcp/homepage-screenshots/tasks-view.png frontend/public/screenshots/
cp .playwright-mcp/homepage-screenshots/assistant-response.png frontend/public/screenshots/
cp .playwright-mcp/homepage-screenshots/journal-entry.png frontend/public/screenshots/
```

## Adding Screenshots to Homepage

### Location
Edit `frontend/pages/home.tsx` to add the screenshots section.

### Responsive Grid Layout

The screenshots are displayed in a responsive grid:
- **Desktop (lg)**: 3 columns
- **Tablet (md)**: 2 columns
- **Mobile**: 1 column (stacked)

### Code

```tsx
{/* Screenshots Section */}
<section className="mb-16">
  <h2 className="text-3xl font-bold text-center text-gray-100 mb-12">
    See It in Action
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
    {/* Tasks Screenshot */}
    <div className="rounded-lg overflow-hidden border border-gray-800 shadow-xl hover:shadow-2xl transition-shadow">
      <img
        src="/screenshots/tasks-view.png"
        alt="Smart task management with AI categorization"
        className="w-full h-auto"
      />
      <div className="p-4 bg-gray-900">
        <p className="text-sm text-gray-300">Smart task categorization</p>
      </div>
    </div>

    {/* Assistant Screenshot */}
    <div className="rounded-lg overflow-hidden border border-gray-800 shadow-xl hover:shadow-2xl transition-shadow">
      <img
        src="/screenshots/assistant-response.png"
        alt="AI Assistant providing personalized recommendations"
        className="w-full h-auto"
      />
      <div className="p-4 bg-gray-900">
        <p className="text-sm text-gray-300">AI-powered daily planning</p>
      </div>
    </div>

    {/* Journal Screenshot */}
    <div className="rounded-lg overflow-hidden border border-gray-800 shadow-xl hover:shadow-2xl transition-shadow">
      <img
        src="/screenshots/journal-entry.png"
        alt="Integrated daily journal"
        className="w-full h-auto"
      />
      <div className="p-4 bg-gray-900">
        <p className="text-sm text-gray-300">Integrated daily journal</p>
      </div>
    </div>
  </div>
</section>
```

## Styling Details

### Container Features
- **Border**: Gray-800 border for definition
- **Rounded corners**: `rounded-lg` for modern look
- **Shadow**: `shadow-xl` that increases to `shadow-2xl` on hover
- **Transition**: Smooth shadow transition on hover

### Image Styling
- **Responsive**: `w-full h-auto` maintains aspect ratio
- **Overflow**: Hidden to respect rounded corners

### Caption Styling
- **Background**: Dark gray-900 for contrast
- **Padding**: `p-4` for comfortable spacing
- **Text**: Small gray-300 text for subtle description

## Playwright MCP Scrolling

Playwright MCP supports scrolling via JavaScript evaluation:

```javascript
// Scroll to top
await browser_evaluate({
  function: "() => { window.scrollTo(0, 0); }"
});

// Scroll to specific position
await browser_evaluate({
  function: "() => { window.scrollTo(0, 500); }"
});

// Scroll element into view
await browser_evaluate({
  element: "Chat message",
  ref: "...",
  function: "(element) => { element.scrollIntoView(); }"
});
```

## Tips for Better Screenshots

### 1. Wait for Content
Always wait for content to load before taking screenshots:
```javascript
await browser_wait_for({ text: "Expected content", time: 5 });
```

### 2. Clean Data
Use the test account or create sample data that looks good in screenshots:
- 3-5 tasks with varied categories
- A thoughtful journal entry
- An interesting assistant query with a detailed response

### 3. Scroll Positioning
For long responses, scroll to show the most relevant part:
- Assistant: Show question + beginning of response
- Journal: Show entry text clearly
- Tasks: Show multiple categorized tasks

### 4. Consistent Timing
Take screenshots at similar times of day for consistent UI appearance.

## Committing Changes

After adding screenshots to the homepage:

```bash
# Stage changes
git add frontend/pages/home.tsx
git add frontend/public/screenshots/*.png

# Commit
git commit -m "Add homepage screenshots with responsive grid layout"

# Push to branch
git push origin nicholas/homepage
```

## File Structure

```
frontend/
├── pages/
│   └── home.tsx                 # Homepage with screenshot grid
└── public/
    └── screenshots/
        ├── tasks-view.png        # Tasks with AI categorization
        ├── assistant-response.png # AI assistant conversation
        └── journal-entry.png     # Daily journal entry

.playwright-mcp/
└── homepage-screenshots/        # Playwright working directory
    ├── tasks-view.png
    ├── assistant-response.png
    └── journal-entry.png
```

## Troubleshooting

### Screenshots Too Large
Playwright saves high-resolution screenshots. They display responsively on the page with `w-full h-auto`.

### Assistant Response Too Long
Scroll up to show the user's question and the beginning of the AI response:
```javascript
await browser_evaluate({
  function: "() => { const chatContainer = document.querySelector('[class*=\"overflow-y-auto\"]'); if (chatContainer) chatContainer.scrollTop = 0; }"
});
```

### Service Worker Caching
If screenshots don't update, clear the service worker cache:
1. Open DevTools → Application → Service Workers
2. Click "Unregister"
3. Hard refresh (Cmd+Shift+R)

### Journal Autosave Issues
If the journal has autosave bugs causing infinite loops, manually save before taking screenshots.

## Next Steps

- Update screenshots periodically as features evolve
- Consider adding more screenshots for mobile/tablet views
- Add captions that highlight specific features shown in each screenshot
- Test responsiveness on different screen sizes

---

**Last Updated**: 2025-12-11
**Branch**: nicholas/homepage
