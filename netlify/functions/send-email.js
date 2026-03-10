// netlify/functions/send-email.js
// Server-side proxy for EmailJS — credentials never exposed to client

const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY; // needed for server-side sends
const ALLOWED_ORIGIN      = process.env.ALLOWED_ORIGIN || '*';

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[&<>"'`]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;' }[c]))
    .trim();
}

function validateEmailPayload({ templateId, name, email, whatsapp, primaryPath, secondaryPath, aiResult }) {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!name || name.length < 2 || name.length > 80) return 'Invalid name';
  if (!email || !emailRegex.test(email) || email.length > 254) return 'Invalid email';
  if (!templateId || typeof templateId !== 'string') return 'Invalid templateId';
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const validationError = validateEmailPayload(body);
  if (validationError) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: validationError }) };
  }

  const templateParams = {
    user_name:      sanitize(body.name),
    user_email:     sanitize(body.email),
    user_whatsapp:  sanitize(body.whatsapp || ''),
    primary_path:   sanitize(body.primaryPath || ''),
    secondary_path: sanitize(body.secondaryPath || ''),
    ai_result:      sanitize(body.aiResult || ''),
  };

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  EMAILJS_SERVICE_ID,
        template_id: body.templateId,
        user_id:     EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: templateParams,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('EmailJS error:', err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Email service error' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (e) {
    console.error('send-email function error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email failed' }) };
  }
};
