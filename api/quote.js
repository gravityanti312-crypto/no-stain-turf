// Vercel serverless function — emails the full quote to TurfGlow via Resend.
// No npm dependencies (uses built-in fetch), so the site stays a zero-config
// static deploy. If RESEND_API_KEY isn't set, returns 503 and the front-end
// falls back to formsubmit.co so a lead is never lost.

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

  const name = `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'New customer';
  const service = d.service_type || 'Turf Cleaning';
  const total = d.estimated_total || 'Custom Quote';

  const row = (label, value) =>
    '<tr>' +
      '<td style="padding:9px 14px;border-top:1px solid #eaf1ea;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#64748b;white-space:nowrap;vertical-align:top;text-transform:uppercase;letter-spacing:.04em;">' + label + '</td>' +
      '<td style="padding:9px 14px;border-top:1px solid #eaf1ea;font:500 15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f2417;">' + value + '</td>' +
    '</tr>';

  const html =
    '<div style="background:#eef0f3;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">' +
      '<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0ece0;">' +
        '<div style="background:#0f2417;padding:22px 24px;">' +
          '<div style="font:800 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;color:#a3e635;text-transform:uppercase;">New Booking Request</div>' +
          '<div style="font:900 24px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;margin-top:6px;">' + esc(name) + '</div>' +
          '<div style="font:600 15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#cbd5e1;margin-top:4px;">' + esc(service) + ' &middot; <span style="color:#4ade80;">' + esc(total) + '</span></div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
          row('Phone', val(d.phone)) +
          row('Email', val(d.email)) +
          row('Address', val(d.address)) +
          row('City / ZIP', (val(d.city) + ' ' + (d.zip ? esc(d.zip) : '')).trim()) +
          row('Turf area', val(d.turf_area)) +
          row('Turf location', val(d.turf_details)) +
          row('Service', val(d.service_type)) +
          row('Add-ons', val(d.addons)) +
          row('Est. total', '<strong>' + esc(total) + '</strong>') +
          row('Promo code', val(d.promo_code)) +
          row('Heard via', val(d.hear_about_us)) +
          row('Texts OK?', (d.marketing_opt_in ? 'Yes' : 'No')) +
          row('Notes', val(d.notes)) +
        '</table>' +
        '<div style="padding:16px 24px;background:#f7faf7;border-top:1px solid #e0ece0;font:500 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#64748b;">' +
          'They’re picking an appointment time in Square now. Reply to this email to reach the customer directly.' +
        '</div>' +
      '</div>' +
    '</div>';

  const payload = {
    from: 'TurfGlow Cleaning <onboarding@resend.dev>',
    to: ['nostainturfcleaning@gmail.com'],
    subject: 'New Booking — ' + name + ' · ' + service + ' (' + total + ')',
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
