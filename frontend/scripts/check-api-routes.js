#!/usr/bin/env node

/**
 * Utility script to check API route synchronization between backend and service worker
 * Run with: node scripts/check-api-routes.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking API Route Synchronization...\n');

// Read service worker
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const swContent = fs.readFileSync(swPath, 'utf8');

// Read backend (if available)
const backendPath = path.join(__dirname, '..', '..', 'backend', 'app.py');
let backendEndpoints = [];

if (fs.existsSync(backendPath)) {
  const backendContent = fs.readFileSync(backendPath, 'utf8');
  backendEndpoints = extractBackendEndpoints(backendContent);
  console.log('✅ Found backend/app.py');
} else {
  console.log('⚠️  Backend/app.py not found, using fallback endpoint list');
  backendEndpoints = [
    '/', '/auth/signup', '/auth/login', '/auth/logout', '/auth/me', '/auth/update-name',
    '/todos', '/health', '/categories', '/spaces', '/email/send-summary',
    '/email/scheduler-status', '/email/update-schedule', '/email/update-instructions',
    '/email/update-spaces', '/contact', '/chat', '/insights', '/journals', '/export'
  ];
}

// Extract service worker routes
const swRoutes = extractServiceWorkerRoutes(swContent);

// Get unique prefixes from backend endpoints
const requiredPrefixes = new Set();
backendEndpoints.forEach(endpoint => {
  if (endpoint === '/') return;
  const pathParts = endpoint.split('/').filter(part => part);
  if (pathParts.length > 0) {
    requiredPrefixes.add(pathParts[0]);
  }
});

console.log('\n📋 Analysis Results:');
console.log('==================');
console.log(`Backend endpoints found: ${backendEndpoints.length}`);
console.log(`Unique endpoint prefixes: ${Array.from(requiredPrefixes).length}`);
console.log(`Service worker routes: ${swRoutes.length}`);

console.log('\n🎯 Required Prefixes:', Array.from(requiredPrefixes).sort().join(', '));
console.log('🛠️  SW Routes:', swRoutes.sort().join(', '));

// Check for missing routes
const missingRoutes = [];
requiredPrefixes.forEach(prefix => {
  if (!swRoutes.includes(prefix)) {
    missingRoutes.push(prefix);
  }
});

// Check for extra routes
const extraRoutes = swRoutes.filter(route => !requiredPrefixes.has(route));

console.log('\n🚨 Issues Found:');
console.log('================');

if (missingRoutes.length > 0) {
  console.log(`❌ Missing routes: ${missingRoutes.join(', ')}`);
  console.log('\n📝 Add these to public/sw.js in BOTH isCapacitorLocal and isApi checks:');
  missingRoutes.forEach(route => {
    console.log(`   url.pathname.startsWith('/${route}') ||`);
  });
} else {
  console.log('✅ All required routes are present');
}

if (extraRoutes.length > 0) {
  console.log(`⚠️  Extra routes (not in backend): ${extraRoutes.join(', ')}`);
  console.log('   These might be intentional (like /todos, /journals) or outdated');
} else {
  console.log('✅ No extra routes found');
}

// Check cache version consistency
const staticCacheMatch = swContent.match(/STATIC_CACHE = 'todo-static-v(\d+)'/);
const apiCacheMatch = swContent.match(/API_CACHE = 'todo-api-v(\d+)'/);

if (staticCacheMatch && apiCacheMatch) {
  const staticVersion = parseInt(staticCacheMatch[1]);
  const apiVersion = parseInt(apiCacheMatch[1]);

  console.log(`\n📦 Cache Versions: static=v${staticVersion}, api=v${apiVersion}`);

  if (staticVersion !== apiVersion) {
    console.log('❌ Cache versions don\'t match!');
  } else {
    console.log('✅ Cache versions synchronized');
  }
} else {
  console.log('❌ Could not find cache version patterns');
}

// Summary
console.log('\n📊 Summary:');
console.log('===========');
if (missingRoutes.length === 0 && staticCacheMatch && apiCacheMatch) {
  console.log('✅ All checks passed! API routing is properly configured.');
} else {
  console.log('⚠️  Issues found that need attention.');
  process.exit(1);
}

/**
 * Extract backend endpoints from app.py content
 */
function extractBackendEndpoints(content) {
  const endpoints = [];
  const endpointRegex = /@app\.(get|post|put|delete)\("([^"]+)"\)/g;
  let match;

  while ((match = endpointRegex.exec(content)) !== null) {
    const endpoint = match[2];
    // Only include endpoints from main app.py, not dependencies
    if (!endpoint.includes('{') && !endpoint.includes('*') && !endpoint.includes('venv')) {
      endpoints.push(endpoint);
    }
  }

  return [...new Set(endpoints)]; // Remove duplicates
}

/**
 * Extract service worker routes from content
 */
function extractServiceWorkerRoutes(content) {
  const routes = [];
  const startsWithRegex = /url\.pathname\.startsWith\('\/([^']+)'\)/g;
  let match;

  while ((match = startsWithRegex.exec(content)) !== null) {
    routes.push(match[1]);
  }

  return [...new Set(routes)]; // Remove duplicates
}
