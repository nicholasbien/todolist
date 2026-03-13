# Mobile Access via Tailscale

Access your local dev server from your phone (or any device) using [Tailscale](https://tailscale.com), a zero-config mesh VPN.

## Prerequisites

1. **Tailscale installed on your computer** (the machine running the dev servers)
   - [Download for macOS/Windows/Linux](https://tailscale.com/download)
2. **Tailscale installed on your phone**
   - [iOS App Store](https://apps.apple.com/app/tailscale/id1470499037) / [Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn)
3. Both devices logged into the **same Tailscale account** (or shared via Tailscale ACLs)

## Step 1: Find your Tailscale IP

After installing and connecting Tailscale on your computer, find your machine's Tailscale IP:

```bash
tailscale ip -4
# Example output: 100.64.1.42
```

You can also find it in the Tailscale app menu or at [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines).

## Step 2: Configure the backend

The backend already binds to `0.0.0.0` by default (see `backend/app.py`), so it accepts connections from any interface including Tailscale.

Add your Tailscale origin to the CORS allowed list. Set the `CORS_ORIGINS` environment variable before starting the backend:

```bash
export CORS_ORIGINS="http://localhost:3141,http://100.64.1.42:3141,https://app.todolist.nyc,capacitor://localhost,ionic://localhost"
```

Replace `100.64.1.42` with your actual Tailscale IP.

Then start the backend as usual:

```bash
cd backend && source venv/bin/activate && python app.py
# Runs on http://0.0.0.0:8141
```

## Step 3: Configure the frontend

Tell the frontend where to find the backend using your Tailscale IP, and bind the dev server to all interfaces:

```bash
# frontend/.env.local
BACKEND_URL=http://100.64.1.42:8141
NEXT_PUBLIC_BACKEND_URL=http://100.64.1.42:8141
```

Start the frontend bound to all interfaces:

```bash
cd frontend && npx next dev -p 3141 -H 0.0.0.0
# Or: npm run dev -- -H 0.0.0.0
```

## Step 4: Connect from your phone

1. Open Tailscale on your phone and confirm it's connected
2. Navigate to `http://100.64.1.42:3141` in your phone's browser (use your actual Tailscale IP)
3. Log in with `test@example.com` / `000000` (the dev test account)

## Step 5: Install as a PWA (optional)

For a native app experience:

- **iOS Safari**: Tap the Share button, then "Add to Home Screen"
- **Android Chrome**: Tap the three-dot menu, then "Add to Home screen" or "Install app"

The app works offline after installation thanks to the service worker.

## Troubleshooting

### "CORS error" in browser console
Make sure your `CORS_ORIGINS` includes `http://<your-tailscale-ip>:3141`. Restart the backend after changing environment variables.

### Phone can't reach the server
- Verify both devices show as "Connected" in Tailscale
- Try pinging your computer's Tailscale IP from your phone: most Tailscale apps show connectivity status
- Check that no firewall is blocking ports 3141/8141 on your computer

### Service worker or streaming issues
The `NEXT_PUBLIC_BACKEND_URL` must point to the Tailscale IP so that client-side SSE streaming (used by the AI assistant) can reach the backend directly. If you only set `BACKEND_URL` (server-side), the browser won't be able to open the EventSource connection.

## MagicDNS (optional)

If you enable [MagicDNS](https://tailscale.com/kb/1081/magicdns) in your Tailscale admin console, you can use your machine's hostname instead of the IP:

```
http://my-laptop:3141
```

This is easier to remember and type on mobile.
