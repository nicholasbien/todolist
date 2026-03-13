#!/usr/bin/env node

/**
 * Helper script to switch Capacitor between development and production modes
 * Run with: node scripts/capacitor-dev-mode.js [dev|prod]
 *
 * For production, set CAPACITOR_PROD_URL to your deployed frontend URL.
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'capacitor.config.ts');
const prodUrl = process.env.CAPACITOR_PROD_URL || 'https://your-domain.com';

function updateConfig(mode) {
  const configContent = fs.readFileSync(configPath, 'utf8');

  if (mode === 'dev') {
    // Switch to development mode (local dev server)
    const updatedContent = configContent
      .replace(/url: 'https?:\/\/[^']+',/, `// url: '${prodUrl}',`)
      .replace(/\/\/ url: 'http:\/\/localhost:3141',/, 'url: \'http://localhost:3141\',');

    fs.writeFileSync(configPath, updatedContent);
    console.log('Switched to DEVELOPMENT mode');
    console.log('   - Loading from http://localhost:3141');
    console.log('   - Make sure your dev server is running!');
    console.log('   - Service worker will work from localhost');

  } else if (mode === 'prod') {
    // Switch to production mode (live site)
    const updatedContent = configContent
      .replace(/\/\/ url: 'https?:\/\/[^']+',/, `url: '${prodUrl}',`)
      .replace(/url: 'http:\/\/localhost:3141',/, '// url: \'http://localhost:3141\',');

    fs.writeFileSync(configPath, updatedContent);
    console.log('Switched to PRODUCTION mode');
    console.log(`   - Loading from ${prodUrl}`);
    console.log('   - Service worker will work from live site');

  } else {
    console.log('Usage: node scripts/capacitor-dev-mode.js [dev|prod]');
    console.log('');
    console.log('dev  - Load from http://localhost:3141 (for development)');
    console.log(`prod - Load from ${prodUrl} (for production)`);
    console.log('');
    console.log('Set CAPACITOR_PROD_URL env var to configure the production URL.');
    process.exit(1);
  }
}

const mode = process.argv[2];
updateConfig(mode);

console.log('');
console.log('Next steps:');
console.log('1. npx cap sync ios');
console.log('2. npx cap open ios');
console.log('3. Build and run in Xcode');
console.log('4. Check Safari Web Inspector for service worker status');
