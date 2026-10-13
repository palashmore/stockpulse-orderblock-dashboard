// Vercel serverless entry: the whole /api surface of the Express server runs as one function, so the app works on Vercel
// without a separate backend and without signing in to a broker (Yahoo and NSE data, delayed and labelled as such).
// Not available here by nature of serverless: the alert timer, the live broker stream and any saved broker session.
import { createApp } from '../server/app.js';

const { app } = createApp({ trustProxy: true, alertIntervalMs: 0 });

export default function handler(req, res) {
  return app(req, res);
}
