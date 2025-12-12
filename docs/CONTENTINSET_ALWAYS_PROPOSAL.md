# Proposal: contentInset: 'always' with Scrolling Fix

**Date:** December 12, 2025
**Issue:** Choose optimal iOS safe area handling strategy
**Current Status:** Testing `contentInset: 'never'` + `env()` variables

---

## Why contentInset: 'always' Is Preferred

### Advantages

1. **✅ Automatic Safe Area Handling**
   - iOS automatically adds padding for notch/status bar
   - No need to calculate `env(safe-area-inset-top)` manually
   - Works reliably across all iOS devices (iPhone 11, 12, 13, 14, 15, etc.)
   - No dependency on buggy `env()` CSS variables

2. **✅ Prevents Content Scrolling Under Status Bar**
   - Content can't scroll up into the status bar area
   - Maintains proper visual hierarchy
   - Status bar always remains legible

3. **✅ Simpler Code**
   - Just use Tailwind padding: `pt-8`
   - No complex `calc()` expressions
   - No platform detection logic needed

### Disadvantages (Problems to Solve)

1. **❌ Unwanted Scrolling on Main App**
   - `contentInset: 'always'` adds automatic padding
   - Combined with `h-[100dvh]`, the total height exceeds viewport
   - Result: Vertical scrolling appears when it shouldn't

2. **❌ Dark Mode White Bars**
   - Some users report white areas at top/bottom in dark mode
   - May be a visual artifact of the automatic padding

---

## Research Findings

### The Scrolling Problem

**Source:** [How to Prevent content displayed above the safe area when scrolled in iOS app build using capacitor? · Discussion #3234](https://github.com/ionic-team/capacitor/discussions/3234)

> "After adding `contentInset: "automatic"`, layout is properly laid, but when scrolling up, the scrolled content is displayed in the status bar since iPhone has a transparent status bar."

**Key Insight:** Even with `contentInset: 'always'`, content CAN scroll into safe areas if the container isn't properly constrained.

### 100dvh Height Issues

**Source:** [100vh problem with iOS Safari - DEV Community](https://dev.to/maciejtrzcinski/100vh-problem-with-ios-safari-3ge9)

> "On iOS 100vh is always the full height of the viewport, even if the footer shows."

**Key Insight:** Using `100dvh` gives us the true viewport height, but `contentInset: 'always'` adds EXTRA padding on top of that, causing overflow.

### Preventing Body Scroll on iOS

**Source:** [How To Prevent Scrolling The Page On iOS Safari 15 - PQINA](https://pqina.nl/blog/how-to-prevent-scrolling-the-page-on-ios-safari)

**Key Insight:** Setting `overflow: hidden` on body doesn't work on Mobile Safari. Need different approach.

---

## Proposed Solutions

### Solution A: Subtract Safe Area from Height (Recommended)

**Concept:** Account for the automatic padding by reducing container height.

**Implementation:**

```tsx
// AIToDoListApp.tsx
return (
  <div
    className="flex flex-col max-w-md mx-auto"
    style={{
      height: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
    }}
  >
    {/* Header - contentInset:'always' adds safe area padding automatically */}
    <div className="flex-shrink-0 pl-4 pr-2 pt-8">
      {/* ... header content ... */}
    </div>
    {/* Rest of app */}
  </div>
);
```

**How It Works:**
- `contentInset: 'always'` adds ~59px top padding automatically
- We subtract that from 100dvh so total height = viewport
- Formula: `100dvh - 59px (top) - 34px (bottom) = available height`
- iOS applies padding automatically, content fits perfectly

**Pros:**
- ✅ No scrolling (height is precisely calculated)
- ✅ Works with `contentInset: 'always'`
- ✅ Uses standard `env()` variables (widely supported)
- ✅ Web unaffected (env() = 0, so height = 100dvh)

**Cons:**
- ⚠️ Relies on `env()` variables working (may be buggy in Capacitor)
- ⚠️ Slightly more complex than fixed height

**Browser Support:** 85%+ (modern browsers, iOS 11+)

---

### Solution B: Use iOS-Specific Height with -webkit-fill-available

**Concept:** Use Apple's proprietary height value that accounts for safe areas.

**Implementation:**

```css
/* globals.css */
#__next {
  height: 100vh; /* Fallback */
  height: -webkit-fill-available; /* iOS Safari */
}
```

```tsx
// AIToDoListApp.tsx - simplified
<div className="h-full flex flex-col max-w-md mx-auto overflow-hidden">
  <div className="flex-shrink-0 pl-4 pr-2 pt-8">
    {/* header */}
  </div>
  {/* rest of app */}
</div>
```

**How It Works:**
- `-webkit-fill-available` tells iOS to use viewport minus safe areas
- `contentInset: 'always'` adds padding
- Total height fits perfectly within visible area

**Pros:**
- ✅ Native iOS solution
- ✅ Simple implementation
- ✅ Works reliably on iOS Safari

**Cons:**
- ❌ Only works on Apple devices
- ❌ Non-standard CSS
- ❌ Doesn't help Android

---

### Solution C: Fixed Positioning with Overflow Control

**Concept:** Make the main container `position: fixed` to prevent any scrolling.

**Implementation:**

```tsx
// AIToDoListApp.tsx
return (
  <div className="fixed inset-0 flex flex-col max-w-md mx-auto overflow-hidden">
    <div className="flex-shrink-0 pl-4 pr-2 pt-8">
      {/* header */}
    </div>
    <div className="flex-1 overflow-y-auto">
      {/* scrollable content */}
    </div>
  </div>
);
```

**How It Works:**
- `position: fixed` with `inset-0` fills viewport
- `contentInset: 'always'` adds safe area padding
- `overflow-hidden` on container prevents any scroll
- Only the inner content area scrolls

**Pros:**
- ✅ Guaranteed no body scroll
- ✅ Works across all browsers
- ✅ Explicit control over scroll behavior

**Cons:**
- ⚠️ Changes positioning model (may affect other layouts)
- ⚠️ Need to test with modals/overlays

---

### Solution D: Remove contentInset + Use Safe Area Plugin

**Concept:** Give up on `contentInset: 'always'`, use community plugin instead.

**Implementation:**

1. Install plugin: `npm install @capacitor-community/safe-area`
2. Set `contentInset: 'never'`
3. Use plugin's CSS variables

```tsx
<div
  className="flex flex-col max-w-md mx-auto"
  style={{
    height: '100dvh',
    paddingTop: 'var(--saf-area-inset-top)',
    paddingBottom: 'var(--saf-area-inset-bottom)'
  }}
>
  <div className="flex-shrink-0 pl-4 pr-2 pt-8">
    {/* header */}
  </div>
</div>
```

**Pros:**
- ✅ Community-supported solution
- ✅ Custom CSS variables that work reliably
- ✅ Cross-platform (Android + iOS)

**Cons:**
- ❌ Additional dependency
- ❌ We already tried this and abandoned it
- ❌ Doesn't prevent scrolling into status bar

---

## Comparison Matrix

| Solution | Complexity | Reliability | iOS-Only | Prevents Scroll Under Status Bar | Uses contentInset: 'always' |
|----------|-----------|-------------|----------|-----------------------------------|----------------------------|
| **A: Subtract Safe Area** | Medium | Medium (relies on env()) | No | ✅ Yes | ✅ Yes |
| **B: -webkit-fill-available** | Low | High (on iOS) | Yes | ✅ Yes | ✅ Yes |
| **C: Fixed Position** | Low | High | No | ✅ Yes | ✅ Yes |
| **D: Safe Area Plugin** | Medium | High | No | ❌ No | ❌ No |

---

## Recommended Approach

### Primary Recommendation: **Solution C (Fixed Positioning)**

**Why:**
1. ✅ **Most reliable** - doesn't depend on buggy `env()` variables
2. ✅ **Cross-browser** - works on iOS and web
3. ✅ **Simple** - just change positioning model
4. ✅ **Works with contentInset: 'always'** - automatic safe area handling
5. ✅ **Explicit control** - we decide what scrolls and what doesn't

**Implementation:**

```tsx
// AIToDoListApp.tsx (line ~947)
return (
  <div className="fixed inset-0 flex flex-col max-w-md mx-auto bg-background overflow-hidden">
    {/* Header - contentInset:'always' adds safe area padding automatically */}
    <div className="flex-shrink-0 pl-4 pr-2 pt-8">
      <div className="flex justify-between items-center mb-1" onClick={handleScrollToTop}>
        <h1 className="text-xl font-bold mr-4">
          <Link href="/home" className="hover:text-accent transition-colors">
            todolist.nyc
          </Link>
        </h1>
        <SpaceDropdown
          spaces={sortedSpaces}
          activeSpace={activeSpace}
          onSpaceSelect={handleSpaceSelect}
          onCreateSpace={handleCreateSpace}
        />
        <Link href="/settings">
          <Settings className="w-5 h-5 text-gray-100 cursor-pointer hover:text-accent transition-colors" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-gray-800 mb-2">
        {/* ... tabs ... */}
      </div>
    </div>

    {/* Main content area - this scrolls */}
    <div className="flex-1 overflow-hidden">
      <SwipeableViews
        index={tabIndex}
        onChangeIndex={setTabIndex}
        className="h-full"
        containerStyle={{ height: '100%' }}
      >
        {/* Tab panels */}
      </SwipeableViews>
    </div>
  </div>
);
```

**capacitor.config.ts:**
```typescript
ios: {
  contentInset: 'always', // Auto-handles safe area padding
  allowsLinkPreview: false,
  scrollEnabled: true, // Enable for info pages (home/privacy/terms)
  backgroundColor: '#000000',
  limitsNavigationsToAppBoundDomains: true
},
```

**Expected Result:**
- **iOS:** Header gets automatic safe area padding (~59px), no scrolling under status bar, content area scrolls independently
- **Web:** Same layout, env() = 0 so no extra padding, works identically

---

### Secondary Recommendation: **Solution A (Subtract Safe Area)**

If Solution C causes issues with existing layout, fall back to this:

```tsx
<div
  className="flex flex-col max-w-md mx-auto overflow-hidden"
  style={{
    height: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
  }}
>
  <div className="flex-shrink-0 pl-4 pr-2 pt-8">
    {/* header */}
  </div>
  {/* rest */}
</div>
```

**Caveat:** Only use if `env()` variables work reliably in production.

---

## Testing Plan

### Phase 1: Local Testing
1. Set `contentInset: 'always'` in capacitor.config.ts
2. Implement Solution C (fixed positioning)
3. Comment out production URL in capacitor.config.ts
4. Run `npm run cap:build` and rebuild in Xcode
5. Test on iPhone 15:
   - ✅ No scrolling on main app page
   - ✅ Header doesn't overlap notch/status bar
   - ✅ Content can't scroll under status bar
   - ✅ Info pages (home/privacy/terms) still scroll properly

### Phase 2: Production Testing
1. Commit changes to main
2. Wait for Railway deploy
3. Test iOS app (loads from production URL)
4. Verify same behavior as local testing

### Phase 3: Edge Case Testing
- Test with keyboard open (does height adjust properly?)
- Test modal/overlay behavior (Settings page, space dropdown)
- Test on older iPhones (iPhone 11, 12, 13)
- Test rotation (landscape mode)

---

## Rollback Plan

If Solution C causes layout issues:

1. **Immediate rollback:**
   ```tsx
   // Revert to current implementation
   <div className="h-screen h-[100dvh] overflow-hidden flex flex-col max-w-md mx-auto">
   ```

2. **Try Solution A** (subtract safe area from height)

3. **Final fallback:** Keep `contentInset: 'never'` and wait for current test results

---

## Related Issues

### Dark Mode White Bars

**Issue:** Some users report white areas at top/bottom with `contentInset: 'always'` in dark mode.

**Potential Fix:**
```typescript
// capacitor.config.ts
ios: {
  contentInset: 'always',
  backgroundColor: '#000000', // Already set ✅
}
```

We already have `backgroundColor: '#000000'`, so this shouldn't be an issue.

---

## References

### Official Documentation
- [Capacitor Configuration | Capacitor Docs](https://capacitorjs.com/docs/config)

### Community Issues
- [How to Prevent content displayed above the safe area when scrolled · Discussion #3234](https://github.com/ionic-team/capacitor/discussions/3234)
- [How can i fix the overlay with statusbar or navbar? · Issue #1947](https://github.com/ionic-team/capacitor/issues/1947)
- [App doesn't extend to full screen/use safe area inset for Notch - Ionic Forum](https://forum.ionicframework.com/t/app-doesnt-extend-to-full-screen-use-safe-area-inset-for-notch/213384)

### iOS Safari Issues
- [100vh problem with iOS Safari - DEV Community](https://dev.to/maciejtrzcinski/100vh-problem-with-ios-safari-3ge9)
- [How To Prevent Scrolling The Page On iOS Safari 15 - PQINA](https://pqina.nl/blog/how-to-prevent-scrolling-the-page-on-ios-safari)
- [Prevent overscroll/bounce in iOS MobileSafari (CSS only) – Bram.us](https://www.bram.us/2016/05/02/prevent-overscroll-bounce-in-ios-mobilesafari-pure-css/)

---

## Next Steps

1. **Wait for current test results** (commit 006d53e with `contentInset: 'never'`)
2. **If env() returns 0:** Implement Solution C immediately
3. **If env() works:** Still consider Solution C for better reliability
4. **Document final solution** in CLAUDE.md and close investigation

---

**Proposal Status:** Ready for implementation pending test results
**Recommended Solution:** Solution C (Fixed Positioning with contentInset: 'always')
**Last Updated:** December 12, 2025
