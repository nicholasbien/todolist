# iOS App Store Deployment Guide

This guide covers setting up and deploying the AI-Powered Todo List app to the iOS App Store using Capacitor.

## Prerequisites

### Required Tools
- **macOS**: Required for Xcode and iOS development
- **Xcode**: Latest version from Mac App Store
- **iOS Developer Account**: $99/year Apple Developer Program membership
- **CocoaPods**: `sudo gem install cocoapods`

### Installation Commands
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install CocoaPods (if not already installed)
sudo gem install cocoapods
```

## Project Setup

### 1. Build and Sync
```bash
cd frontend

# Build Next.js static export
npm run build

# Sync with iOS platform
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### 2. Xcode Configuration

#### App Identifier and Team
1. Open project in Xcode: `ios/App/App.xcworkspace`
2. Select "App" target in project navigator
3. Go to "Signing & Capabilities" tab
4. Set your Apple Developer Team
5. Verify Bundle Identifier: `com.todolistnyc.aitodo`

#### iOS Deployment Target
- Set minimum iOS version to **14.0** or higher
- This ensures compatibility with modern iOS features

#### App Icons
1. Navigate to `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
2. Add app icons for all required sizes:
   - 20x20, 29x29, 40x40, 58x58, 60x60, 76x76, 80x80, 87x87, 120x120, 152x152, 167x167, 180x180, 1024x1024

#### Launch Screen
1. Navigate to `ios/App/App/Base.lproj/LaunchScreen.storyboard`
2. Customize the launch screen to match your app branding
3. Use the same dark theme (#000000 background, #3b82f6 accent)

### 3. Info.plist Configuration

Add the following to `ios/App/App/Info.plist`:

```xml
<!-- App name -->
<key>CFBundleDisplayName</key>
<string>AI Todo List</string>

<!-- URL scheme for deep linking -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.todolistnyc.aitodo</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>aitodo</string>
        </array>
    </dict>
</array>

<!-- Network permissions -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>

<!-- Privacy descriptions -->
<key>NSCameraUsageDescription</key>
<string>This app needs access to camera to capture images for todos.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>This app needs access to photo library to attach images to todos.</string>

<!-- Status bar style -->
<key>UIStatusBarStyle</key>
<string>UIStatusBarStyleDarkContent</string>
<key>UIViewControllerBasedStatusBarAppearance</key>
<false/>
```

## Testing

### iOS Simulator Testing
```bash
# Build and run in simulator
npx cap run ios

# Run on specific simulator
npx cap run ios --target="iPhone 15 Pro"
```

### Physical Device Testing
1. Connect iPhone/iPad via USB
2. Select device in Xcode
3. Click Run button (⌘R)
4. Trust developer certificate on device

### Key Testing Areas
- [ ] App launches and loads web content
- [ ] Touch interactions work smoothly
- [ ] Keyboard behavior is appropriate
- [ ] Status bar styling is correct
- [ ] Offline functionality works
- [ ] Haptic feedback works (on device)
- [ ] Deep linking works (if implemented)

## App Store Submission

### 1. Prepare for Archive
```bash
# Ensure latest build is synced
npm run cap:build

# Open in Xcode
npm run cap:ios
```

### 2. Archive Build
1. In Xcode, select "Any iOS Device" as target
2. Go to Product → Archive
3. Wait for archive to complete
4. Distribute App → App Store Connect

### 3. App Store Connect Setup

#### App Information
- **Name**: AI-Powered Todo List
- **Bundle ID**: com.todolistnyc.aitodo
- **Category**: Productivity
- **Content Rating**: 4+

#### App Description
```
Transform your productivity with AI-powered task management.

KEY FEATURES:
• Smart AI task classification and categorization
• Multi-user collaborative spaces for teams
• Offline-first PWA architecture - works without internet
• Daily AI-generated email summaries with insights
• Intelligent chatbot for task assistance
• Real-time collaboration with team members
• Email verification authentication
• Dark theme optimized for iOS

PERFECT FOR:
✓ Teams collaborating on projects
✓ Individuals managing personal tasks
✓ Anyone who wants smarter todo organization
✓ Users who need offline functionality

The app combines the power of OpenAI's GPT models with a beautiful, responsive interface that works seamlessly across all your devices. Your data syncs automatically when back online, ensuring you never lose productivity.

Built with modern web technologies and wrapped in a native iOS experience using Capacitor.
```

#### Keywords
```
todo, task, productivity, AI, collaboration, offline, team, organize, smart, GPT
```

#### Screenshots Required
- iPhone 6.9": 2 screenshots (1320x2868)
- iPhone 6.7": 2 screenshots (1290x2796)
- iPhone 6.5": 2 screenshots (1284x2778)
- iPhone 5.5": 1 screenshot (1242x2208)
- iPad Pro (6th gen): 2 screenshots (2048x2732)
- iPad Pro (2nd gen): 2 screenshots (2048x2732)

### 4. Privacy Policy
Required URL: `https://todolist.nyc/privacy-policy`

Key points to include:
- Data collection practices
- OpenAI API usage
- Email handling
- Local storage usage
- Third-party services

### 5. Submission Checklist
- [ ] App builds and runs without crashes
- [ ] All required screenshots uploaded
- [ ] App description and keywords optimized
- [ ] Privacy policy URL provided
- [ ] App categories selected
- [ ] Content rating completed
- [ ] Pricing and availability set
- [ ] Review notes provided (optional)

## Common Issues and Solutions

### Build Errors
```bash
# Clean build folder
rm -rf ios/App/build/

# Clean Capacitor cache
npx cap clean ios

# Reinstall pods
cd ios/App && pod install

# Rebuild
npm run cap:build
```

### Performance Optimization
1. **Minimize bundle size**: Ensure Next.js build is optimized
2. **Optimize images**: Use WebP format where possible
3. **Enable compression**: Ensure server-side gzip compression
4. **Lazy loading**: Implement for non-critical resources

### App Store Review Guidelines
- Ensure app provides clear value over the web version
- Test all functionality thoroughly on device
- Provide clear app description and screenshots
- Include privacy policy and terms of service
- Follow iOS Human Interface Guidelines

## Maintenance and Updates

### Web-Only Updates
- Changes to web content (HTML, CSS, JS) are immediately available
- No App Store review required
- Users get updates instantly

### Native Updates
Required for:
- Capacitor plugin updates
- iOS-specific feature changes
- App metadata changes
- Icon or splash screen updates

### Update Process
1. Update web content and deploy
2. If native changes needed:
   ```bash
   npm run cap:build
   # Archive and submit to App Store
   ```

## Support and Resources

- **Capacitor Docs**: https://capacitorjs.com/docs/ios
- **App Store Guidelines**: https://developer.apple.com/app-store/review/guidelines/
- **iOS Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines/ios/

This setup provides a native iOS app that leverages your existing Next.js PWA while meeting App Store requirements and providing an optimal user experience.
