// Vercel serverless function: photos from the quote's thank-you screen.
//
// The browser asks here for one-time upload links (one per photo). This asks
// Client Hub, which makes the links; the customer's phone then sends each photo
// straight to Client Hub's private photo storage. Photos still go out by email
// too (formsubmit), so nothing is lost if this doesn't work.

const { sendToClientHub, fromOwnSite, readJson } = require('./_client-hub');

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!fromOwnSite(req)) return res.status(403).json({ error: 'Forbidden' });

  const d = readJson(req);
  const quoteId = String(d.quote_id || '');
  const types = Array.isArray(d.types) ? d.types.slice(0, 4).map((t) => (TYPES.includes(t) ? t : 'image/jpeg')) : [];
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(quoteId) || types.length === 0) {
    return res.status(400).json({ error: 'Missing quote_id or photos' });
  }

  const app = await sendToClientHub('/photos', { quote_id: quoteId, types: types });
  if (!app || !app.ok || !Array.isArray(app.uploads)) {
    if (app && app.error) console.error('Client Hub photo links failed:', app.error);
    return res.status(502).json({ error: 'Photos can’t be saved right now' });
  }
  return res.status(200).json({ ok: true, uploads: app.uploads });
};
