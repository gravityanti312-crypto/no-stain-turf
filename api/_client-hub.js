// Shared by api/quote.js and api/quote-photos.js (the leading _ means Vercel
// doesn't make this file a page of its own).
//
// Forwards website quotes to Client Hub, TurfGlow's own customer app, server to
// server. The key (WEBSITE_LEADS_KEY) lives only in Vercel's settings for this
// project and for Client Hub, never in this public repo. If the key is missing
// or Client Hub doesn't answer, the quote still goes out by email as before.

const CLIENT_HUB_URL = 'https://client-hub-ryguy.vercel.app/api/website/turfglow';

async function sendToClientHub(path, body) {
  const key = process.env.WEBSITE_LEADS_KEY;
  if (!key) return { skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(CLIENT_HUB_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-client-hub-key': key },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    return r.ok ? j : { error: r.status + ' ' + (j.error || '') };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Only accept posts from this site's own pages.
function fromOwnSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host = '';
  try { host = new URL(origin).host; } catch (e) {}
  return host === req.headers.host;
}

function readJson(req) {
  let d = req.body;
  if (!d || typeof d === 'string') { try { d = JSON.parse(d || '{}'); } catch (e) { d = {}; } }
  return d && typeof d === 'object' ? d : {};
}

module.exports = { sendToClientHub, fromOwnSite, readJson };
