// Vercel serverless function — emails a referral (referrer + the people they
// referred) to No Stain Turf via Resend. No npm deps (built-in fetch). Returns 503
// if RESEND_API_KEY is missing so the front-end falls back to formsubmit.co.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });

  let d = req.body;
  if (!d || typeof d === 'string') {
    try { d = JSON.parse(d || '{}'); } catch (e) { d = {}; }
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const referrer = (d.referrer_name && String(d.referrer_name).trim()) || 'Someone';
  const contact = (d.referrer_contact && String(d.referrer_contact).trim()) || '—';
  const people = Array.isArray(d.people) ? d.people : [];
  if (!people.length) return res.status(400).json({ error: 'No referrals provided' });

  const personCard = (p, i) => {
    const name = ((p.first || '') + ' ' + (p.last || '')).trim() || 'Referral';
    return '<div style="border:1px solid #e0ece0;border-radius:12px;padding:14px 16px;margin:0 0 10px;">' +
      '<div style="font:800 12px/1 sans-serif;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Referral ' + (i + 1) + '</div>' +
      '<div style="font:700 17px/1.3 sans-serif;color:#0f2417;">' + esc(name) + '</div>' +
      '<div style="font:500 14px/1.6 sans-serif;color:#0f2417;margin-top:4px;">📞 ' + esc(p.phone || '—') +
        (p.address && String(p.address).trim() ? '<br>📍 ' + esc(p.address) : '') + '</div>' +
    '</div>';
  };

  const html =
    '<div style="background:#f5f7fa;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">' +
      '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0ece0;">' +
        '<div style="background:#0f2417;padding:22px 24px;">' +
          '<div style="font:800 11px/1 sans-serif;letter-spacing:.14em;color:#8ea2c0;text-transform:uppercase;">New Referral</div>' +
          '<div style="font:900 23px/1.2 sans-serif;color:#fff;margin-top:6px;">' + esc(referrer) + ' referred ' + people.length + ' ' + (people.length === 1 ? 'person' : 'people') + '</div>' +
          '<div style="font:600 14px/1.4 sans-serif;color:#c7d0dd;margin-top:6px;">Reward when booked: ' + esc(referrer) + ' gets $50 off · they get $50 off their first cleaning</div>' +
        '</div>' +
        '<div style="padding:20px 24px;">' +
          '<div style="font:600 12px/1 sans-serif;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Referred by</div>' +
          '<div style="font:700 16px/1.4 sans-serif;color:#0f2417;">' + esc(referrer) + '</div>' +
          '<div style="font:500 14px/1.5 sans-serif;color:#2d7a3a;margin-bottom:18px;">' + esc(contact) + '</div>' +
          '<div style="font:600 12px/1 sans-serif;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Reach out to</div>' +
          people.map(personCard).join('') +
        '</div>' +
        '<div style="padding:14px 24px;background:#f7faf7;border-top:1px solid #e0ece0;font:500 13px/1.5 sans-serif;color:#64748b;">' +
          'Reach out to each person above. Once their first service is complete, credit ' + esc(referrer) + '’s $50-off reward.' +
        '</div>' +
      '</div>' +
    '</div>';

  const payload = {
    from: 'No Stain Turf <onboarding@resend.dev>',
    to: ['nostainturfcleaning@gmail.com'],
    subject: 'New Referral — ' + referrer + ' (' + people.length + ' ' + (people.length === 1 ? 'person' : 'people') + ')',
    html: html
  };

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
