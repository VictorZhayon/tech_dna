# 🧬 TechDNA — Discover Your Tech Path

An AI-powered career discovery quiz that reveals where you naturally belong in tech — no experience needed.

---

## What It Does

Users answer 40 plain-language questions about how they think, work, and what excites them. A Gemini AI model analyses their responses and returns a personalised tech career recommendation with a written explanation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (single file) |
| Fonts | Playfair Display + Plus Jakarta Sans (Google Fonts) |
| AI Analysis | Google Gemini via `/api/analyze` |
| Email Delivery | EmailJS (results + follow-up templates) |
| Progress Saving | Browser `localStorage` (24hr expiry) |
| Deployment | Vercel (serverless API routes) |

---

## Project Structure

```
techdna/
├── index.html        # Entire frontend
├── api/
│   ├── analyze.js    # Gemini AI analysis endpoint
│   └── send-email.js # EmailJS dispatch endpoint
└── README.md
```

---

## API Endpoints

### `POST /api/analyze`
Sends answers to Gemini and returns a career result.

```json
// Request
{ "name": "Amara", "answers": [...], "extraInfo": "" }

// Response
{ "primaryPath": "Software Development", "secondaryPath": "UI/UX Design", "analysis": "..." }
```

### `POST /api/send-email`
Fires two emails on submission — an instant results email and a follow-up — via EmailJS. Failure does not affect the results screen.

---

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `EMAILJS_SERVICE_ID` | EmailJS service ID |
| `EMAILJS_PUBLIC_KEY` | EmailJS public key |
| `EMAILJS_PRIVATE_KEY` | EmailJS private key |

---

## Key Behaviours

- **Progress saving** — quiz state is saved after every answer and restored on return (expires after 24 hours)
- **Rate limiting** — blocks resubmission within 10 minutes per session
- **Input sanitisation** — strips HTML, emoji, and control characters from all user text before API calls
- **Q41** — a final purchase-intent question used for lead qualification, not scored by the AI

---

## Deploy

```bash
npm i -g vercel
vercel
```

Set environment variables in the Vercel project dashboard before going live.

---

*Built by Victor.*
