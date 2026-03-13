# Theme Colors Reference

This document lists all the locations where colors need to be updated when changing the app's theme.

## PWA/Mobile Appearance

### Status Bar and App Theme
- **File**: `/frontend/pages/_document.tsx`
- **Lines**: 9, 15-17
- **Colors to change**:
  - `apple-mobile-web-app-status-bar-style` - Controls iOS status bar appearance
    - `black-translucent`: Transparent with white text (current)
    - `default`: Light background with dark text
    - `black`: Dark background with white text
  - `msapplication-TileColor` - Windows tile color (currently `#000000`)
  - `theme-color` - Browser theme color (currently `#000000`)

### PWA Manifest
- **File**: `/frontend/public/manifest.json`
- **Lines**: 7-8
- **Colors to change**:
  - `background_color` - App background when loading (currently `#000000`)
  - `theme_color` - System UI theme color (currently `#000000`)

## CSS Custom Properties (Primary Theme System)

### Main Theme Variables
- **File**: `/frontend/styles/globals.css`
- **Location**: CSS custom properties in `:root` selector
- **Variables** (if using CSS custom properties):
  - `--background` - Main background color
  - `--foreground` - Main text color
  - `--surface` - Card/surface background
  - `--muted` - Muted text and borders
  - `--accent` - Primary accent color
  - `--accent-light` - Lighter accent variant
  - `--accent-dark` - Darker accent variant

## Tailwind CSS Classes (Current Implementation)

The app currently uses direct Tailwind classes. Here are the main color patterns used:

### Background Colors
- `bg-black` - Main dark background
- `bg-gray-900` - Cards, surfaces, secondary backgrounds
- `bg-gray-800` - Interactive elements, hover states
- `bg-gray-700` - Deeper hover states

### Text Colors
- `text-foreground` - Primary text (maps to CSS custom property)
- `text-gray-100` - Primary white/light text
- `text-gray-300` - Secondary light text
- `text-gray-400` - Muted/tertiary text
- `text-muted` - Muted text (maps to CSS custom property)

### Border Colors
- `border-gray-800` - Primary borders
- `border-gray-700` - Secondary borders
- `border-muted` - Muted borders (maps to CSS custom property)

### Accent Colors
- `bg-accent` - Primary accent background
- `text-accent` - Accent text color
- `bg-accent-light` - Lighter accent variant
- `bg-accent-dark` - Darker accent variant
- `focus:ring-accent` - Focus ring color

### Status Colors
- `text-green-400` - Success/completed states
- `bg-green-600` - Success backgrounds
- `text-yellow-400` - Warning/pending states
- `text-red-400` - Error/high priority states
- `bg-red-500` - Error backgrounds
- `text-purple-400` - Special states (completion rate)

## Component-Specific Color Usage

### InsightsComponent.tsx
- **Overview cards**: `bg-gray-900`, `border-gray-800`
- **Stat values**: `text-accent`, `text-green-400`, `text-yellow-400`, `text-purple-400`
- **Charts**: `bg-accent`, `bg-green-600`
- **Progress bars**: `bg-gray-800`, `bg-accent`

### TodoChatbot.tsx
- **User messages**: `bg-accent`, `text-foreground`
- **Assistant messages**: `bg-gray-800`, `text-gray-100`, `border-gray-700`
- **Input area**: `bg-gray-900`, `border-gray-700`

### AuthForm.tsx
- **Backgrounds**: `bg-background`, `bg-surface`
- **Text**: `text-foreground`, `text-muted`
- **Input fields**: `bg-background`, `border-muted`
- **Verification code**: `text-foreground` (was `text-black` - fixed)

## How to Change Theme

### Option 1: Update CSS Custom Properties (Recommended)
1. Modify `/frontend/styles/globals.css` custom properties
2. Components using semantic classes (`text-foreground`, `bg-accent`) will update automatically

### Option 2: Global Find/Replace Tailwind Classes
1. Find all instances of current color classes
2. Replace with new color values
3. Test across all components

### Key Files to Update for Complete Theme Change
1. `/frontend/pages/_document.tsx` - PWA appearance
2. `/frontend/public/manifest.json` - PWA manifest
3. `/frontend/styles/globals.css` - CSS custom properties
4. All component files using direct Tailwind color classes

## Testing Checklist
When changing themes, test:
- [ ] Desktop appearance
- [ ] Mobile web appearance
- [ ] PWA on iOS (status bar, splash screen)
- [ ] PWA on Android
- [ ] All components (Todo, Chat, Insights, Journal, Auth)
- [ ] Focus states and hover effects
- [ ] Text contrast and readability
- [ ] Border visibility

## Common Issues
- **Status bar visibility**: Ensure `apple-mobile-web-app-status-bar-style` matches your theme darkness
- **Text contrast**: Verify all text has sufficient contrast against backgrounds
- **PWA integration**: Test theme-color appears correctly in browser tab/PWA chrome
- **Focus rings**: Ensure focus indicators are visible on new background colors
