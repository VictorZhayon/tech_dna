// netlify/functions/analyze.js
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

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

function validateInputs({ name, answers }) {
  if (!name || typeof name !== 'string' || name.length < 2 || name.length > 80)
    return 'Invalid name';
  if (!Array.isArray(answers) || answers.length !== 40)
    return 'Invalid answers — expected exactly 40';
  for (const a of answers) {
    if (typeof a.q !== 'string' || typeof a.a !== 'string' || typeof a.letter !== 'string')
      return 'Malformed answer object';
    if (a.q.length > 300 || a.a.length > 200 || !['A','B','C','D'].includes(a.letter))
      return 'Answer content out of bounds';
  }
  return null;
}

// Native HTTPS request (no fetch dependency)
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
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Check API key is set
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY environment variable is not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const validationError = validateInputs(body);
  if (validationError) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: validationError }) };
  }

  const safeName = sanitize(body.name);
  const answersText = body.answers
    .map((a, i) => `Q${i+1}: ${sanitize(a.q)}\nAnswer ${sanitize(a.letter)}: ${sanitize(a.a)}`)
    .join('\n\n');

  const prompt = `You are TechDNA, an expert tech career analyst. ${safeName} has completed a 40-question psychological assessment. Analyse ALL answers holistically.

Answers:
${answersText}

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "primaryPath": "The single most fitting tech career path name",
  "secondaryPath": "A complementary second path worth exploring",
  "analysis": "A warm, personal, motivating 3-4 sentence paragraph explaining exactly why ${safeName} is naturally suited to their primary path. Reference specific patterns in their thinking and personality. Make it feel written just for them."
}`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    const response = await httpsPost(geminiUrl, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    console.log('Gemini status:', response.status);

    if (response.status !== 200) {
      console.error('Gemini error body:', response.body);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI service error', detail: response.status }) };
    }

    const data = JSON.parse(response.body);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    if (!result.primaryPath || !result.secondaryPath || !result.analysis) {
      throw new Error('Incomplete AI response');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        primaryPath: sanitize(result.primaryPath),
        secondaryPath: sanitize(result.secondaryPath),
        analysis: sanitize(result.analysis),
      }),
    };
  } catch (e) {
    console.error('analyze function error:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Analysis failed. Please try again.' }),
    };
  }
};