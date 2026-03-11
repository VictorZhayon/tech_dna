// netlify/functions/send-email.js
const https = require('https');

const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const ALLOWED_ORIGIN      = process.env.ALLOWED_ORIGIN || '*';

const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;'}[c]))
    .trim();
}

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!body.name || body.name.length < 2) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid name' }) };
  if (!body.email || !emailRegex.test(body.email)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
  if (!body.templateId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing templateId' }) };

  try {
    const response = await httpsPost('https://api.emailjs.com/api/v1.0/email/send', {
      service_id:  EMAILJS_SERVICE_ID,
      template_id: body.templateId,
      user_id:     EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        user_name:       sanitize(body.name),
        user_email:      sanitize(body.email),
        user_whatsapp:   sanitize(body.whatsapp || ''),
        primary_path:    sanitize(body.primaryPath || ''),
        secondary_path:  sanitize(body.secondaryPath || ''),
        ai_result:       sanitize(body.aiResult || ''),
        course_interest: sanitize(body.courseInterest || 'Not answered'),
      },
    });

    console.log('EmailJS status:', response.status, response.body);

    if (response.status !== 200) {
      console.error('EmailJS error:', response.body);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Email service error' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (e) {
    console.error('send-email error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email failed' }) };
  }
};
