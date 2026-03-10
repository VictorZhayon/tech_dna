// netlify/functions/analyze.js
// Server-side proxy for Gemini API — key never exposed to client

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Strict input sanitizer
function sanitize(str) {
  if (typeof str !== 'string') return '';
  // Strip HTML tags and dangerous characters
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[&<>"'`]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;' }[c]))
    .trim();
}

// Validate inputs server-side (second layer after client)
function validateInputs({ name, answers }) {
  if (!name || typeof name !== 'string' || name.length < 2 || name.length > 80) {
    return 'Invalid name';
  }
  if (!Array.isArray(answers) || answers.length !== 40) {
    return 'Invalid answers — expected exactly 40';
  }
  for (const a of answers) {
    if (typeof a.q !== 'string' || typeof a.a !== 'string' || typeof a.letter !== 'string') {
      return 'Malformed answer object';
    }
    if (a.q.length > 300 || a.a.length > 200 || !['A','B','C','D'].includes(a.letter)) {
      return 'Answer content out of bounds';
    }
  }
  return null;
}

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS header
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Gemini error:', err);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI service error' }) };
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    // Validate Gemini response shape
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
    console.error('analyze function error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Analysis failed. Please try again.' }),
    };
  }
};
