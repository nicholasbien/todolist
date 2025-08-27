# Capacitor Integration Example

This document shows how to integrate Capacitor features into your React components for enhanced iOS functionality.

## Basic Integration

### 1. Import the Hook
```typescript
import useCapacitor from '../hooks/useCapacitor';
```

### 2. Use in Component
```typescript
export default function AIToDoListApp() {
  const { isNative, platform, networkStatus, triggerHapticFeedback, shareContent } = useCapacitor();

  // Example: Add haptic feedback to button interactions
  const handleTodoAdd = async () => {
    if (isNative) {
      await triggerHapticFeedback('light');
    }
    // ... existing todo add logic
  };

  // Example: Enable native sharing
  const handleShareTodo = async (todo: any) => {
    const shareText = `Check out my todo: ${todo.text}`;
    const shareUrl = `${window.location.origin}/?todo=${todo._id}`;

    await shareContent('Todo Item', shareText, shareUrl);
  };

  // Example: Show network status (useful for offline indicator)
  if (!networkStatus.connected && isNative) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <strong>Offline Mode:</strong> Changes will sync when you're back online.
      </div>
    );
  }

  return (
    <div>
      {/* Your existing UI */}
      {isNative && platform === 'ios' && (
        <div className="text-sm text-gray-500 mb-2">
          Running on iOS app
        </div>
      )}
    </div>
  );
}
```

## Advanced Features

### 3. Status Bar Integration
```typescript
// In _app.tsx or main component
import { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

useEffect(() => {
  const setStatusBar = async () => {
    if (Capacitor.isNativePlatform()) {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#000000' });
    }
  };

  setStatusBar();
}, []);
```

### 4. Keyboard Handling
```typescript
import { Keyboard } from '@capacitor/keyboard';

useEffect(() => {
  if (Capacitor.isNativePlatform()) {
    // Listen for keyboard events
    Keyboard.addListener('keyboardWillShow', (info) => {
      // Adjust UI for keyboard
      document.body.style.paddingBottom = `${info.keyboardHeight}px`;
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.style.paddingBottom = '0px';
    });

    // Clean up listeners
    return () => {
      Keyboard.removeAllListeners();
    };
  }
}, []);
```

### 5. Network Status Monitoring
```typescript
import { Network } from '@capacitor/network';

const [isOnline, setIsOnline] = useState(true);

useEffect(() => {
  const handleNetworkChange = (status: any) => {
    setIsOnline(status.connected);

    if (status.connected) {
      // Trigger sync when back online
      syncOfflineData();
    }
  };

  if (Capacitor.isNativePlatform()) {
    Network.addListener('networkStatusChange', handleNetworkChange);

    // Get initial status
    Network.getStatus().then(setIsOnline);
  }
}, []);
```

## iOS-Specific Enhancements

### 6. Safe Area Support
```css
/* Add to globals.css for iOS safe areas */
@supports (padding: max(0px)) {
  .ios-safe-area-top {
    padding-top: max(20px, env(safe-area-inset-top));
  }

  .ios-safe-area-bottom {
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
}
```

### 7. iOS-Specific Styling
```typescript
// Detect iOS and apply specific styles
const isiOS = Capacitor.getPlatform() === 'ios';

<div className={`
  ${isiOS ? 'ios-safe-area-top' : ''}
  bg-black text-white min-h-screen
`}>
  {/* Your content */}
</div>
```

### 8. Deep Linking Support
```typescript
// In _app.tsx
import { App } from '@capacitor/app';

useEffect(() => {
  if (Capacitor.isNativePlatform()) {
    App.addListener('appUrlOpen', (data) => {
      // Handle deep link
      const url = new URL(data.url);
      const todoId = url.searchParams.get('todo');

      if (todoId) {
        // Navigate to specific todo
        router.push(`/?highlight=${todoId}`);
      }
    });
  }
}, []);
```

## Testing on iOS

### Development Testing
```bash
# Build and sync
npm run cap:build

# Open in Xcode
npm run cap:ios

# Or run directly on simulator
npx cap run ios --target="iPhone 15 Pro"
```

### Features to Test
1. **Touch Interactions**: Ensure smooth scrolling and tapping
2. **Keyboard**: Input fields should behave properly
3. **Status Bar**: Should match app theme
4. **Haptic Feedback**: Test on physical device
5. **Network Handling**: Test offline/online transitions
6. **Sharing**: Test native share functionality
7. **Deep Links**: Test URL scheme handling

## Performance Considerations

### Bundle Size Optimization
```javascript
// Use dynamic imports for Capacitor plugins
const loadCapacitorFeatures = async () => {
  if (Capacitor.isNativePlatform()) {
    const { Haptics } = await import('@capacitor/haptics');
    const { Share } = await import('@capacitor/share');
    // Use plugins...
  }
};
```

### Memory Management
```typescript
// Clean up listeners and resources
useEffect(() => {
  return () => {
    if (Capacitor.isNativePlatform()) {
      Network.removeAllListeners();
      Keyboard.removeAllListeners();
      App.removeAllListeners();
    }
  };
}, []);
```

This integration approach maintains your existing web functionality while adding native iOS enhancements that improve the user experience when running as an app.
