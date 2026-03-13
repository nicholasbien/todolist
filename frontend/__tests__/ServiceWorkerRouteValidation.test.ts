/**
 * Automated validation to ensure service worker routes stay synchronized with backend endpoints
 * This test helps prevent the "Missing Route Syndrome" where new backend endpoints
 * are added but not included in the service worker's route whitelist.
 */

import fs from 'fs';
import path from 'path';

describe('Service Worker Route Synchronization', () => {
  let serviceWorkerContent: string;
  let backendEndpoints: string[];
  let serviceWorkerRoutes: string[];

  beforeAll(() => {
    // Read service worker file
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    serviceWorkerContent = fs.readFileSync(swPath, 'utf8');

    // Extract backend endpoints from backend/app.py
    const backendPath = path.join(process.cwd(), '..', 'backend', 'app.py');
    if (fs.existsSync(backendPath)) {
      const backendContent = fs.readFileSync(backendPath, 'utf8');
      backendEndpoints = extractBackendEndpoints(backendContent);
    } else {
      // Fallback: known endpoints as of 2025-11-30
      backendEndpoints = [
        '/',
        '/auth/signup',
        '/auth/login',
        '/auth/logout',
        '/auth/me',
        '/auth/update-name',
        '/todos',
        '/health',
        '/categories',
        '/spaces',
        '/email/send-summary',
        '/email/scheduler-status',
        '/email/update-schedule',
        '/email/update-instructions',
        '/email/update-spaces',
        '/contact',
        '/agent/stream',
        '/insights',
        '/journals',
        '/export'
      ];
    }

    // Extract service worker routes
    serviceWorkerRoutes = extractServiceWorkerRoutes(serviceWorkerContent);
  });

  test('service worker includes all required API endpoint prefixes', () => {
    // Get unique prefixes from backend endpoints (first path segment)
    const requiredPrefixes = new Set<string>();

    backendEndpoints.forEach(endpoint => {
      if (endpoint === '/') return; // Skip root

      const pathParts = endpoint.split('/').filter(part => part);
      if (pathParts.length > 0) {
        requiredPrefixes.add(pathParts[0]);
      }
    });

    // Check that all required prefixes are in service worker routes
    const missingRoutes: string[] = [];
    requiredPrefixes.forEach(prefix => {
      if (!serviceWorkerRoutes.includes(prefix)) {
        missingRoutes.push(prefix);
      }
    });

    if (missingRoutes.length > 0) {
      throw new Error(`Missing service worker routes for endpoints: ${missingRoutes.join(', ')}\n\n` +
           `Add these to the API_ROUTES array in public/sw.js:\n` +
           missingRoutes.map(route => `'/${route}'`).join(', '));
    }

    expect(missingRoutes).toHaveLength(0);
  });

  test('isCapacitorLocal and isApi both use isApiPath (single source of truth)', () => {
    // After the refactor, both checks use isApiPath() — no duplicated route lists
    expect(serviceWorkerContent).toContain('isApiPath(url.pathname)');

    // The old duplicated startsWith chains should be gone
    const capacitorRoutes = extractRoutesFromSection(serviceWorkerContent, 'isCapacitorLocal');
    const apiRoutes = extractRoutesFromSection(serviceWorkerContent, 'isApi');

    // With isApiPath(), there are no inline startsWith calls in these sections
    expect(capacitorRoutes).toHaveLength(0);
    expect(apiRoutes).toHaveLength(0);
  });

  test('API_ROUTES array is the single source of truth', () => {
    const apiRoutesArray = extractApiRoutesArray(serviceWorkerContent);
    expect(apiRoutesArray.length).toBeGreaterThan(0);

    // Verify critical routes are in the array
    const criticalPrefixes = ['todos', 'categories', 'spaces', 'journals', 'auth', 'agent'];
    for (const prefix of criticalPrefixes) {
      expect(apiRoutesArray).toContain(prefix);
    }
  });

  test('service worker cache version is valid', () => {
    const staticCacheMatch = serviceWorkerContent.match(/STATIC_CACHE = 'todo-static-v(\d+)'/);

    expect(staticCacheMatch).toBeTruthy();

    if (staticCacheMatch) {
      const staticVersion = parseInt(staticCacheMatch[1]);
      expect(staticVersion).toBeGreaterThan(0);
    }

    // API_CACHE has been removed — all caching uses IndexedDB
    expect(serviceWorkerContent).not.toContain('API_CACHE');
  });

  test('all current endpoints are properly routed', () => {
    // These are the endpoints that should definitely be routed through service worker
    const criticalEndpoints = [
      'todos',
      'categories',
      'spaces',
      'journals',
      'insights',
      'agent',
      'auth',
      'email',
      'contact',
      'export'
    ];

    const missingCritical = criticalEndpoints.filter(endpoint =>
      !serviceWorkerRoutes.includes(endpoint)
    );

    if (missingCritical.length > 0) {
      throw new Error(`Critical endpoints missing from service worker routes: ${missingCritical.join(', ')}`);
    }

    expect(missingCritical).toHaveLength(0);
  });
});

/**
 * Extract backend endpoints from app.py content
 */
function extractBackendEndpoints(content: string): string[] {
  const endpoints: string[] = [];

  // Match @app.get("/path") and @app.post("/path") patterns
  const endpointRegex = /@app\.(get|post|put|delete)\("([^"]+)"\)/g;
  let match;

  while ((match = endpointRegex.exec(content)) !== null) {
    const endpoint = match[2];
    // Only include endpoints from main app.py, not from dependencies
    if (!endpoint.includes('{') && !endpoint.includes('*')) {
      endpoints.push(endpoint);
    }
  }

  return [...new Set(endpoints)]; // Remove duplicates
}

/**
 * Extract service worker routes from the API_ROUTES array (single source of truth)
 */
function extractServiceWorkerRoutes(content: string): string[] {
  return extractApiRoutesArray(content);
}

/**
 * Parse the API_ROUTES array from sw.js
 */
function extractApiRoutesArray(content: string): string[] {
  const match = content.match(/const API_ROUTES\s*=\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  const routes: string[] = [];
  const routeRegex = /'\/([^']+)'/g;
  let routeMatch;
  while ((routeMatch = routeRegex.exec(match[1])) !== null) {
    routes.push(routeMatch[1]);
  }
  return [...new Set(routes)];
}

/**
 * Extract routes from a specific section (isCapacitorLocal or isApi)
 */
function extractRoutesFromSection(content: string, sectionName: string): string[] {
  const routes: string[] = [];

  // Find the section
  const sectionRegex = new RegExp(`const ${sectionName}[\\s\\S]*?;`, 'g');
  const sectionMatch = sectionRegex.exec(content);

  if (sectionMatch) {
    const section = sectionMatch[0];
    const startsWithRegex = /url\.pathname\.startsWith\('\/([^']+)'\)/g;
    let match;

    while ((match = startsWithRegex.exec(section)) !== null) {
      routes.push(match[1]);
    }
  }

  return routes;
}
