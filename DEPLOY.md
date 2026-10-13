# Deploying StockPulse

StockPulse is **one Node process**: the Express server serves the built app (`dist/`) and the API (`/api`). It also runs your
price alerts on a timer, so it needs a host that keeps a process running. On Vercel the API runs as serverless functions instead (option 4), without alerts or broker sign-in.

## What you need first

| Item | Where | Notes |
|---|---|---|
| Node 24 (or Docker) | nodejs.org | |
| `BREEZE_API_KEY`, `BREEZE_API_SECRET` | ICICI Direct Breeze portal | Optional: without them the app uses Yahoo (delayed) data |
| A static public IP | your host | ICICI requires the app's *Primary IP* to be the server's public IP. Set it on the portal |
| `NTFY_TOPIC` | any long random word | Optional: phone push for alerts, via the free ntfy app |

Put values in `.env` (copy `.env.example`) or in your host's environment settings. **Never commit `.env`**; it is git-ignored.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `BREEZE_API_KEY`, `BREEZE_API_SECRET` | none | ICICI Direct Breeze app credentials (server only, never sent to the browser) |
| `PORT` | 3001 | Port to listen on (hosts such as Render set it for you) |
| `ALERTS_FILE` | `data/alerts.json` | Where saved alerts are kept. Put it on a persistent disk |
| `NTFY_TOPIC`, `NTFY_SERVER` | off | Phone push for alerts |
| `STATIC_DIR` | `dist` | Folder with the built app |
| `CORS_ORIGIN` | any | Only needed when the app is hosted on a different address from the server |
| `RATE_LIMIT_PER_MIN` | 120 | Requests per minute per outside client |
| `RATE_LIMIT_LOCAL_PER_MIN` | 1200 | Same, for the machine running the server |
| `UPSTREAM_CONCURRENCY` | 4 | Requests in flight to each data provider |

The app finds the API at the same address when built with `VITE_API_BASE=/api` (the Docker and Render setups below do this).

## Option 1: your own computer (simplest, everything works)

```bash
npm install
cp .env.example .env        # then fill in BREEZE_API_KEY and BREEZE_API_SECRET
npm run build
npm start                   # http://localhost:3001  (the app and the API)
```

Keep the window open so alerts keep running. For a phone on the same Wi-Fi use `npm run dev:lan`.
On Windows, to start it at sign-in, create a Task Scheduler task that runs `npm start` in this folder.

## Option 2: Docker (any VPS, home server or NAS)

```bash
cp .env.example .env        # fill in your values
docker compose up -d --build
# open http://<server-address>:3001
```

Saved alerts live in the `stockpulse-data` volume and survive restarts. Update with `git pull && docker compose up -d --build`.

## Option 3: Render (hosted, has a web address)

1. Push this repository to GitHub (already done).
2. render.com > **New > Blueprint** > pick the repository. Render reads `render.yaml`.
3. Enter `BREEZE_API_KEY`, `BREEZE_API_SECRET` (and optionally `NTFY_TOPIC`) when asked.
4. After the first deploy open the address Render gives you. Use a plan with a persistent disk (the blueprint adds one) or saved
   alerts are lost on every restart.

Railway and Fly.io work the same way with the Dockerfile.

## Option 4: Vercel (no separate backend, no broker sign-in)

The `api/` folder runs the whole API as a Vercel serverless function next to the app, so **Vercel alone is enough** and nobody
has to sign in to a broker. Quotes, charts, the dashboard, lists, scans, IPOs and index data work with Yahoo Finance and NSE
data (delayed, and labelled that way).

1. vercel.com > **Add New Project** > import the repository. `vercel.json` sets the build (`VITE_API_BASE=/api`) and routes.
2. Click **Deploy**. No environment variables are required.
3. Open the address Vercel gives you and check `/api/health`.

What a serverless host cannot do, by nature (use option 1, 2 or 3 for these):
* **Server alerts and push notifications**: there is no always-on timer. The Alerts screen falls back to browser alerts
  that run while the tab is open.
* **ICICI Direct sign-in, live stream, portfolio, order books**: the sign-in lives in server memory, which a serverless
  function loses between requests, and these routes answer only on a machine you control anyway.
* Cached data and the NSE session are per function instance, so the first request after idle is slower.

If you later want alerts or the portfolio too, host the server (option 2 or 3) and point the Vercel frontend at it with
`VITE_API_BASE=https://your-server/api` plus `CORS_ORIGIN=https://your-app.vercel.app` on the server.

## What does not work from outside the server machine (by design)

Broker sign-in, portfolio, orders and positions, funds, diagnostics and the server alert list answer **only** on the machine
that runs the server; requests that arrive through a reverse proxy are refused too. From a phone or another computer you get
market data, charts, lists, the dashboard and IPOs, but not your account. To use your portfolio, open the app on the server
machine itself (for example through remote desktop or an SSH tunnel to `localhost:3001`).

## Is it safe to put on the internet?

The market-data routes have no password, only a rate limit. If you expose it publicly, put it behind your host's access control
(for example Cloudflare Access, or HTTP basic auth in a reverse proxy) so strangers cannot use your server's data quota.
The account routes are never reachable remotely, and nothing in the app places orders.

## Checks after deploying

* `https://your-address/api/health` returns `{"status":"ok"}`
* The home page loads and a refresh on any screen (for example `/?tab=ipo`) still works
* Settings shows the ICICI Direct panel; sign in once a day (the session expires overnight)
* Alerts screen: "Send test" reaches your phone when `NTFY_TOPIC` is set
