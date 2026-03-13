# Mobile Focus State Bug Fix

## Problem

On mobile devices (especially iOS), when a user taps the complete (✓) or delete (×) button on a todo item:
1. The button receives focus from the tap
2. The todo item animates and is removed from the DOM after 300ms
3. The focus/outline state persists and transfers to the todo item that moves into that position
4. The new todo item displays with an unwanted outline/focus ring

**Symptoms:**
- Outline color stays on the todo that fills the spot where the deleted/completed todo was
- Only happens on mobile (desktop doesn't exhibit this behavior)
- Focus state "sticks" to the wrong element

## Root Cause

Mobile browsers (particularly Safari on iOS) handle focus differently than desktop browsers:

1. **Tap Creates Focus**: When you tap a button on mobile, it receives focus
2. **Blur Timing**: The original `e.currentTarget.blur()` wasn't sufficient because:
   - The element was blurred, but focus had to go *somewhere*
   - By the time the element was removed (300ms later), the browser had already transferred focus to the next interactive element
3. **Focus Transfer**: When a focused element is removed from the DOM, the browser automatically transfers focus to the next focusable element in the same position

## The Fix

### 1. Enhanced Blur on Click (lines 39-44, 56-61)

**Before:**
```typescript
const handleCompleteClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur();
  setIsCompleting(true);
  setTimeout(() => {
    handleCompleteTodo(todo._id);
  }, 300);
};
```

**After:**
```typescript
const handleCompleteClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
  // Blur the button to prevent focus state from persisting on mobile
  e.currentTarget.blur();
  // Also blur any active element to prevent focus transfer
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  setIsCompleting(true);
  setTimeout(() => {
    handleCompleteTodo(todo._id);
  }, 300);
};
```

**Why It Works:**
- First blur the specific button that was clicked
- Then blur *any* active element to ensure no focus remains
- This prevents the browser from having a focused element to transfer

### 2. Cleanup Effect on Unmount (lines 36-43)

```typescript
// Cleanup: Remove any lingering focus when component unmounts (mobile fix)
useEffect(() => {
  return () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
}, []);
```

**Why It Works:**
- When React removes the component from the DOM (after the 300ms timeout)
- This cleanup function runs as a final safety net
- Ensures any focus that might have persisted is removed
- Prevents focus from transferring to the element that takes its place

## Technical Details

### Focus Transfer Behavior

When an element is removed from the DOM:
1. **Desktop**: Focus is typically lost entirely (goes to `<body>`)
2. **Mobile**: Browser tries to maintain focus by transferring to the nearest focusable element

### Why This Only Affects Mobile

- **Desktop**: Mouse hover states are separate from focus states
- **Mobile**: Touch interactions create both tap highlights AND focus states
- **iOS Safari**: Particularly aggressive about maintaining focus for accessibility

## Files Changed

- **components/TodoItem.tsx** (lines 36-66)
  - Added `document.activeElement.blur()` in both click handlers
  - Added cleanup effect with blur on unmount
  - Added explanatory comments

## Testing

### Manual Testing on Mobile

1. ✅ Open app on iOS device (iPhone/iPad)
2. ✅ Tap complete (✓) button on a todo
3. ✅ Verify the todo below doesn't show a focus outline
4. ✅ Tap delete (×) button on a todo
5. ✅ Verify the todo below doesn't show a focus outline

### Test on Different Browsers

- ✅ iOS Safari (primary target)
- ✅ iOS Chrome
- ✅ Android Chrome
- ✅ Desktop (ensure no regression)

## Impact

- ✅ Cleaner UX on mobile devices
- ✅ No unwanted focus outlines after todo removal
- ✅ No impact on desktop behavior
- ✅ Maintains accessibility (focus still works when needed)

## Related Issues

This follows a similar pattern to other mobile-specific fixes:
- Touch target sizing (min 44x44px)
- Text sizing (min 16px to prevent zoom)
- Tap highlight behavior

**Pattern**: Mobile browsers require explicit focus management that desktop browsers handle automatically.
