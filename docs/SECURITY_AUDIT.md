# Security Audit — 2026-02-17

10 significant issues identified in the todolist repository, ordered by severity.

---

## 1. Exposed API Keys in `.env` Files

**Severity**: Critical
**Files**: `.env`, `backend/.env`, `frontend/.env.local`

Real API keys are present in `.env` files (OpenAI, Anthropic, Brave Search, OpenWeather, JWT secret, SMTP credentials). If these have ever been committed to git history, they need to be **rotated immediately** and removed from history with `git filter-branch` or BFG.

**Remediation**:
- Rotate all exposed keys immediately
- Add `.env*` to `.gitignore` (verify it's not tracked)
- Use a secrets manager (AWS Secrets Manager, Vault, etc.) for production

---

## 2. Unrestricted CORS

**Severity**: Critical
**File**: `backend/app.py` (~line 175)

```python
allow_origins=["*"], allow_credentials=True
```

`allow_origins=["*"]` combined with `allow_credentials=True` allows any website to make authenticated requests to the API on behalf of users.

**Remediation**:
- Restrict to actual domains: `allow_origins=["https://todolist.nyc", "http://localhost:3141"]`
- Use environment-based CORS configuration

---

## 3. Hardcoded Test Account Bypass

**Severity**: Critical
**File**: `backend/auth.py` (~line 279)

`test@example.com` / `000000` bypasses all authentication in **any environment**, including production. Any attacker can log in as the test user and access application data.

**Remediation**:
- Gate behind an environment check:
  ```python
  if os.getenv("ENVIRONMENT") == "development" and email == "test@example.com" and code == "000000":
  ```
- Or remove entirely and use proper test fixtures

---

## 4. SSRF Vulnerability

**Severity**: High
**File**: `backend/app.py` (~line 291)

When a todo starts with `http://` or `https://`, the backend fetches the URL with `follow_redirects=True` and no validation. An attacker can use this to scan internal networks (e.g., `http://169.254.169.254` for cloud metadata, `http://localhost:xxxx`).

**Remediation**:
```python
from urllib.parse import urlparse
import ipaddress

def is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    try:
        ip = ipaddress.ip_address(parsed.hostname)
        return not ip.is_private and not ip.is_loopback
    except ValueError:
        return parsed.hostname not in ['localhost', '127.0.0.1']
```

---

## 5. No Rate Limiting on Auth Endpoints

**Severity**: High
**File**: `backend/app.py` (~line 226)

`/auth/signup` and `/auth/login` have no rate limiting. The 6-digit verification code (1M combinations) is brute-forceable without attempt tracking or lockout.

**Remediation**:
- Add rate limiting with `slowapi` or similar:
  ```python
  from slowapi import Limiter
  limiter = Limiter(key_func=get_remote_address)

  @app.post("/auth/login")
  @limiter.limit("5/minute")
  async def api_login(request: LoginRequest): ...
  ```
- Track failed verification attempts per email and lock after N failures

---

## 6. Verification Codes Logged to Stdout

**Severity**: High
**File**: `backend/auth.py` (~lines 158, 163, 206, 212)

Multiple `print(f"VERIFICATION CODE for {email}: {code}")` statements will leak codes in production logs.

**Remediation**:
- Remove `print` statements or gate to development:
  ```python
  if os.getenv("ENVIRONMENT") == "development":
      logger.debug(f"Verification code for {email}: {code}")
  ```

---

## 7. Missing Security Headers

**Severity**: High
**File**: `frontend/next.config.js`

No `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, or `Referrer-Policy` headers are configured. This leaves the app vulnerable to clickjacking, MIME sniffing, and downgrade attacks.

**Remediation**:
```javascript
// next.config.js
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }];
}
```

---

## 8. Error Details Leaked to Clients

**Severity**: Medium
**File**: `backend/auth.py` (~line 356)

```python
raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
```

Internal exception messages are returned to the client, giving attackers insight into backend internals.

**Remediation**:
```python
except Exception as e:
    logger.error(f"Error in login_user: {str(e)}", exc_info=True)
    raise HTTPException(status_code=500, detail="Login failed. Please try again.")
```

---

## 9. Timing Attack on Verification Codes

**Severity**: Medium
**File**: `backend/auth.py` (~line 313)

```python
if user.get("verification_code") != code:
```

Standard string comparison leaks timing information, allowing an attacker to infer correct digits.

**Remediation**:
```python
import secrets
if not secrets.compare_digest(str(user.get("verification_code", "")), str(code)):
    raise HTTPException(status_code=400, detail="Invalid verification code")
```

---

## 10. Auth Token in localStorage

**Severity**: Medium
**File**: `frontend/utils/api.ts` (~line 45)

JWT tokens stored in `localStorage` are accessible to any JavaScript on the page. A single XSS vulnerability (made more likely by the missing CSP header in issue #7) would allow full account takeover.

**Remediation**:
- Use `httpOnly` cookies for token storage (immune to XSS)
- If localStorage is required for offline/PWA support, implement a strict Content-Security-Policy to minimize XSS risk
