# Staging Environment

## Overview

The staging environment provides a production-like environment for testing changes before they reach production.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Feature   │────▶│   Staging    │────▶│  Production │
│   Branch    │     │   Branch     │     │   (main)    │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
   PR opened         Auto-deploy on       Auto-deploy on
   for review        push to staging      push to main
```

## URLs

| Environment | Frontend | Backend |
|-------------|----------|---------|
| Production | `https://todolist.railway.app` | `https://todolist-backend.railway.app` |
| Staging | Check Railway dashboard | Check Railway dashboard |

## Deployment Flow

1. **Development**: Work on feature branches
2. **Staging**: Merge feature branches to `openclaw-staging` branch
   - Automatically deploys to Railway staging environment
   - Test and validate changes
3. **Production**: Merge `openclaw-staging` to `main` branch
   - Automatically deploys to Railway production environment

## GitHub Secrets Required

### Staging-Specific Secrets

Create these in GitHub Settings > Secrets and variables > Actions:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `RAILWAY_STAGING_TOKEN` | Railway API token | Generate at https://railway.app/account/tokens |
| `RAILWAY_STAGING_PROJECT_ID` | Railway project ID | `railway status` or dashboard URL |
| `RAILWAY_STAGING_ENVIRONMENT` | Staging environment ID | `railway environment list` |
| `RAILWAY_STAGING_BACKEND_SERVICE` | Backend service ID | `railway service list` in staging env |
| `RAILWAY_STAGING_FRONTEND_SERVICE` | Frontend service ID | `railway service list` in staging env |
| `RAILWAY_STAGING_SCRIPTS_SERVICE` | Scripts service ID | `railway service list` in staging env |

### Fallback Strategy

The staging workflow uses fallback values:
- `RAILWAY_STAGING_TOKEN` → falls back to `RAILWAY_TOKEN` (production token works across environments)
- `RAILWAY_STAGING_PROJECT_ID` → falls back to `RAILWAY_PROJECT_ID`

Only the environment-specific secrets (SERVICE IDs and ENVIRONMENT ID) are strictly required.

## Railway Setup Steps

### 1. Create Staging Environment

```bash
# Login to Railway
railway login

# Navigate to project
cd /data/workspace/todolist
railway link

# Create staging environment
railway environment create staging
```

### 2. Create Staging Services

You have two options:

#### Option A: Create New Services (Recommended for isolation)

```bash
# Switch to staging environment
railway environment staging

# Create services (Railway will auto-detect from code)
railway up --service backend-staging
railway up --service frontend-staging
railway up --service scripts-staging
```

#### Option B: Use Same Services with Environment Variables

If you want to reuse the same services but with different env vars per environment, use Railway's environment-specific variables feature.

### 3. Configure Environment Variables

For each staging service, configure these variables (different from production):

**Backend (`backend-staging`):**
- `MONGODB_URL` - Use staging MongoDB instance
- `JWT_SECRET` - Different secret from production
- `OPENAI_API_KEY` - Can use same or different API key
- `FRONTEND_URL` - Staging frontend URL

**Frontend (`frontend-staging`):**
- `BACKEND_URL` - Staging backend URL
- `NODE_ENV` - `staging`

### 4. Get Service IDs

```bash
railway service list
```

Copy the service IDs and add them to GitHub secrets as:
- `RAILWAY_STAGING_BACKEND_SERVICE`
- `RAILWAY_STAGING_FRONTEND_SERVICE`
- `RAILWAY_STAGING_SCRIPTS_SERVICE`

### 5. Get Environment ID

```bash
railway environment list
```

Copy the staging environment ID to GitHub secret:
- `RAILWAY_STAGING_ENVIRONMENT`

## Testing Staging Deployments

### Manual Trigger

You can manually trigger a staging deployment from GitHub:
1. Go to Actions > Deploy to Staging
2. Click "Run workflow"
3. Select the `openclaw-staging` branch
4. Add a reason for the deployment

### Automatic Trigger

Push to the `openclaw-staging` branch:
```bash
git checkout openclaw-staging
git merge feature/my-new-feature
git push origin openclaw-staging
```

## Database Considerations

### Option 1: Separate Staging Database (Recommended)

Create a separate MongoDB instance for staging:
```bash
railway add --database mongo --environment staging
```

This provides complete isolation between staging and production data.

### Option 2: Same Database, Different Collections

Use environment-specific collection prefixes in the application code.

### Option 3: Database Copy Strategy

Periodically copy production data to staging for realistic testing:
```bash
# Use mongodump/mongorestore or Railway's backup features
```

## Best Practices

1. **Never use production data in staging** unless explicitly needed for debugging
2. **Use different API keys** for external services when possible
3. **Test the full deployment flow** in staging before production
4. **Keep staging branch close to main** - merge main into staging regularly
5. **Monitor staging deployment logs** for issues before production

## Troubleshooting

### Deployment Fails

Check these common issues:
1. Missing GitHub secrets (check `RAILWAY_STAGING_*` values)
2. Railway token expired or invalid
3. Service IDs changed (re-link services in Railway)

### Services Not Found

Run `railway service list` in the staging environment and verify the IDs match your GitHub secrets.

### Environment Variables Not Applied

Ensure environment variables are set specifically for the staging environment, not just as shared variables.

## Workflow Files

- **Production**: `.github/workflows/deploy.yml` - triggers on `main`
- **Staging**: `.github/workflows/deploy-staging.yml` - triggers on `openclaw-staging`
- **CI**: `.github/workflows/ci.yml` - runs on all PRs and pushes
