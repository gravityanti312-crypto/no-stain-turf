// Vercel serverless function — emails each quote lead to TurfGlow via Resend.
// No npm dependencies (uses built-in fetch), so the site stays a zero-config
// static deploy. If RESEND_API_KEY isn't set, returns 503 and the front-end
// falls back to formsubmit.co so a lead is never lost.
//
// The site sends two emails per lead: "started" as soon as contact info is in
// (so you can call right away), then "finished" with the yard details.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });

  // Body is normally parsed by Vercel; handle the string case defensively.
  let d = req.body;
  if (!d || typeof d === 'string') {
    try { d = JSON.parse(d || '{}'); } catch (e) { d = {}; }
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const val = (s) => (s && String(s).trim()) ? esc(s) : '—';
  const digits = String(d.phone || '').replace(/\D/g, '');

  const name = String(d.name || '').trim() || 'New customer';
  const started = /started/i.test(d.lead_status || '');

  const row = (label, value) =>
    '<tr>' +
      '<td style="padding:9px 14px;border-top:1px solid #eaf1ea;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#64748b;white-space:nowrap;vertical-align:top;text-transform:uppercase;letter-spacing:.04em;">' + label + '</td>' +
      '<td style="padding:9px 14px;border-top:1px solid #eaf1ea;font:500 15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f2a1b;">' + value + '</td>' +
    '</tr>';

  const phoneCell = digits.length === 10
    ? '<a href="tel:' + digits + '" style="color:#23804b;font-weight:700;">' + esc(d.phone) + '</a>'
    : val(d.phone);
  const earthCell = d.google_earth
    ? '<a href="' + esc(d.google_earth) + '" style="color:#23804b;font-weight:700;">Open their yard in Google Earth</a>'
    : '—';

  const html =
    '<div style="background:#eef0f3;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">' +
      '<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0ece0;">' +
        '<div style="background:#0f2a1b;padding:22px 24px;">' +
          '<div style="font:800 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;color:#85cc7e;text-transform:uppercase;">' +
            (started ? 'New lead — call now' : 'Quote details') + '</div>' +
          '<div style="font:900 24px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;margin-top:6px;">' + esc(name) + '</div>' +
          '<div style="font:600 15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#cfdccf;margin-top:4px;">' +
            esc(d.turf_size || 'Size not picked yet') + (d.best_time_to_call ? ' &middot; call: ' + esc(d.best_time_to_call) : '') + '</div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
          row('Phone', phoneCell) +
          row('Address', val(d.address)) +
          row('Measure', earthCell) +
          row('Email', val(d.email)) +
          row('Turf size', val(d.turf_size)) +
          row('Pets', val(d.pets)) +
          row('Smell', val(d.smell)) +
          row('Condition', val(d.condition)) +
          row('Where', val(d.turf_location)) +
          row('Recommend', val(d.recommended_service)) +
          row('Clicked', val(d.clicked_service)) +
          row('Plan interest', val(d.plan_interest)) +
          row('Best time', val(d.best_time_to_call)) +
          row('Code', val(d.referral_or_promo_code)) +
          row('Heard via', val(d.heard_about_us)) +
          row('Texts OK?', val(d.texts_ok)) +
          row('Notes', val(d.notes)) +
          row('Submitted', val(d.submitted)) +
        '</table>' +
      '</div>' +
    '</div>';

  const payload = {
    from: 'TurfGlow Cleaning <onboarding@resend.dev>',
    to: ['turfglowaz@gmail.com'],
    subject: String(d._subject || ((started ? 'New lead — call now: ' : 'Quote details: ') + name)).slice(0, 200),
    html: html
  };
  if (d.email && String(d.email).trim()) payload.reply_to = String(d.email).trim();

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'Resend send failed', detail: detail });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
