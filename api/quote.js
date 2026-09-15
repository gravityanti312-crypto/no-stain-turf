// Vercel serverless function for TurfGlow website quotes. No npm dependencies.
//
// The site posts here twice per lead:
//   1. "Started the quote"  — as soon as contact info is in (the call-now alert)
//   2. "Finished the quote" — with the yard details
//
// On a finished quote this creates ONE lead in Housecall Pro (Job Inbox → API Leads)
// when HOUSECALL_PRO_API_KEY is set (Housecall Pro MAX plan). It also emails the
// details through Resend when RESEND_API_KEY is set. The response always says
// whether the email went out (email_sent); if not, the browser falls back to
// formsubmit.co so a lead is never lost. Keys live only in Vercel env vars —
// never in the public repo.

const HCP_URL = 'https://api.housecallpro.com/leads';
const TO_EMAIL = 'turfglowaz@gmail.com';

const withTimeout = (ms) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

function parseAddress(full) {
  const m = String(full || '').match(/^(.*),\s*([^,]+),\s*AZ,\s*(\d{5})$/);
  if (!m) return null;
  return { street: m[1].trim(), city: m[2].trim(), state: 'AZ', zip: m[3] };
}

function leadNote(d) {
  const lines = [
    'Online quote from the TurfGlow website',
    '',
    'Turf size: ' + (d.turf_size || '—'),
    'Pets: ' + (d.pets || '—'),
    'Smell: ' + (d.smell || '—'),
    'Condition: ' + (d.condition || '—'),
    'Where: ' + (d.turf_location || '—'),
    'Recommended: ' + (d.recommended_service || '—'),
    'Clicked on site: ' + (d.clicked_service || '—'),
    'Plan interest: ' + (d.plan_interest || '—'),
    'Best time to call: ' + (d.best_time_to_call || '—'),
    'Photos: ' + (d.photos || 'None') + (d.photos && !/^none/i.test(d.photos) ? ' (see the TurfGlowAZ email)' : ''),
    'Referral/promo code: ' + (d.referral_or_promo_code || '—'),
    'Heard about us: ' + (d.heard_about_us || '—'),
    'OK to text: ' + (d.texts_ok || '—'),
    'Notes: ' + (d.notes || '—'),
    '',
    'Measure the yard: ' + (d.google_earth || '—'),
    'Submitted: ' + (d.submitted || '—')
  ];
  return lines.join('\n').slice(0, 5000);
}

async function createHcpLead(d, key) {
  const digits = String(d.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const parts = String(d.name || '').trim().split(/\s+/);
  const first = parts.shift() || 'Website';
  const last = parts.join(' ') || 'Lead';
  const addr = parseAddress(d.address);
  const note = leadNote(d);
  const tags = ['Website quote'];
  if (d.recommended_service) tags.push(String(d.recommended_service));

  const customer = { first_name: first, last_name: last, mobile_number: digits, lead_source: 'Website', tags: tags };
  if (d.email) customer.email = String(d.email).trim();
  if (addr) customer.addresses = [addr];

  const full = { customer: customer, lead_source: 'Website', note: note, tags: tags };
  if (addr) full.address = addr;

  // Fallback without lead_source/tags in case the account rejects an unknown source name.
  const minimal = { customer: { first_name: first, last_name: last, mobile_number: digits }, note: note };
  if (d.email) minimal.customer.email = customer.email;
  if (addr) { minimal.customer.addresses = [addr]; minimal.address = addr; }

  let lastErr = '';
  for (const body of [full, minimal]) {
    const t = withTimeout(10000);
    try {
      const r = await fetch(HCP_URL, {
        method: 'POST',
        headers: { 'Authorization': 'Token ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: t.signal
      });
      const text = await r.text();
      if (r.ok) {
        let j = {}; try { j = JSON.parse(text); } catch (e) {}
        return { id: j.id || null, number: j.number || null };
      }
      lastErr = r.status + ' ' + text.slice(0, 300);
      if (r.status !== 400 && r.status !== 422) break;   // auth/plan errors won't be fixed by retrying
    } catch (e) {
      lastErr = String((e && e.message) || e);
      break;
    } finally { t.done(); }
  }
  return { error: lastErr };
}

async function sendEmail(d, key) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const val = (s) => (s && String(s).trim()) ? esc(s) : '—';
  const digits = String(d.phone || '').replace(/\D/g, '');
  const name = String(d.name || '').trim() || 'New customer';
  const started = /started/i.test(d.lead_status || '');
  const row = (label, value) =>
    '<tr><td style="padding:9px 14px;border-top:1px solid #eaf1ea;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#64748b;white-space:nowrap;vertical-align:top;text-transform:uppercase;letter-spacing:.04em;">' + label + '</td>' +
    '<td style="padding:9px 14px;border-top:1px solid #eaf1ea;font:500 15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f2a1b;">' + value + '</td></tr>';
  const phoneCell = digits.length >= 10 ? '<a href="tel:' + digits.slice(-10) + '" style="color:#23804b;font-weight:700;">' + esc(d.phone) + '</a>' : val(d.phone);
  const earthCell = d.google_earth ? '<a href="' + esc(d.google_earth) + '" style="color:#23804b;font-weight:700;">Open their yard in Google Earth</a>' : '—';
  const html =
    '<div style="background:#eef0f3;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;"><div style="max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0ece0;">' +
    '<div style="background:#0f2a1b;padding:22px 24px;"><div style="font:800 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;color:#85cc7e;text-transform:uppercase;">' + (started ? 'New lead — call now' : 'Quote details') + '</div>' +
    '<div style="font:900 24px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;margin-top:6px;">' + esc(name) + '</div>' +
    '<div style="font:600 15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#cfdccf;margin-top:4px;">' + esc(d.turf_size || 'Size not picked yet') + '</div></div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    row('Phone', phoneCell) + row('Address', val(d.address)) + row('Measure', earthCell) + row('Email', val(d.email)) +
    row('Turf size', val(d.turf_size)) + row('Pets', val(d.pets)) + row('Smell', val(d.smell)) + row('Condition', val(d.condition)) +
    row('Where', val(d.turf_location)) + row('Photos', val(d.photos)) + row('Recommend', val(d.recommended_service)) + row('Clicked', val(d.clicked_service)) +
    row('Plan interest', val(d.plan_interest)) + row('Best time', val(d.best_time_to_call)) + row('Code', val(d.referral_or_promo_code)) +
    row('Heard via', val(d.heard_about_us)) + row('Texts OK?', val(d.texts_ok)) + row('Notes', val(d.notes)) + row('Submitted', val(d.submitted)) +
    '</table></div></div>';
  const payload = {
    from: 'TurfGlow Cleaning <onboarding@resend.dev>',
    to: [TO_EMAIL],
    subject: String(d._subject || ((started ? 'New lead — call now: ' : 'Quote details: ') + name)).slice(0, 200),
    html: html
  };
  if (d.email && String(d.email).trim()) payload.reply_to = String(d.email).trim();
  const t = withTimeout(10000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: t.signal
    });
    return r.ok;
  } catch (e) { return false; } finally { t.done(); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only accept posts from this site's own pages.
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' });
  }

  let d = req.body;
  if (!d || typeof d === 'string') { try { d = JSON.parse(d || '{}'); } catch (e) { d = {}; } }
  const digits = String(d.phone || '').replace(/\D/g, '');
  if (!String(d.name || '').trim() || digits.length < 10 || JSON.stringify(d).length > 20000) {
    return res.status(400).json({ error: 'Missing name or phone' });
  }

  const finished = /finished/i.test(d.lead_status || '');
  const hcpKey = process.env.HOUSECALL_PRO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  const [hcp, emailSent] = await Promise.all([
    finished && hcpKey ? createHcpLead(d, hcpKey) : Promise.resolve(null),
    !d.skip_email && resendKey ? sendEmail(d, resendKey) : Promise.resolve(false)
  ]);

  if (hcp && hcp.error) console.error('Housecall Pro lead failed:', hcp.error);
  return res.status(200).json({
    ok: true,
    email_sent: !!emailSent,
    housecall_pro: finished ? (hcpKey ? (hcp && hcp.id ? 'created' : 'failed') : 'not_configured') : 'skipped_until_finished',
    housecall_pro_lead_id: hcp && hcp.id ? hcp.id : null
  });
};
