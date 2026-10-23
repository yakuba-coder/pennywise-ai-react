# Pennywise AI — React + Tailwind Edition

A personal finance dashboard MVP inspired by the earlier Pennywise project. This version uses React, Vite, Tailwind CSS, and a Vercel serverless API route for Google Gemini. Financial records entered/imported in the dashboard are stored in the browser's localStorage. **They are not automatically sent to the AI chat**; the chat only receives messages that the user types into it.

## Features in this version
- Responsive dashboard with expense totals, category chart, weekly illustrative chart, and recent transactions.
- Add and delete transactions.
- Import a CSV with merchant/description and amount columns; date and category are optional.
- Search/filter transactions and export the current filtered list to CSV.
- Category budget limits and a suggested budget split.
- Savings goals and progress tracking.
- Local summary insights and a separate Pennywise AI chat page/section.
- Dark appearance toggle.
- Server-side Gemini API integration; 503 overload responses are retried up to two times after the first attempt.
- Safe `/api/health` endpoint that reports whether an API key is configured without revealing it.

## Tech stack
- React + Vite
- Tailwind CSS (Vite plugin) plus custom CSS for the Pennywise design
- Recharts for charts; Lucide React for icons
- Node.js serverless functions on Vercel (`api/gemini.js`, `api/health.js`)
- Google Gemini API

## Run locally
1. Install Node.js LTS.
2. Extract this ZIP and open the folder in VS Code.
3. Open the terminal in the project folder and run:
   ```bash
   npm install
   npm run dev
   ```
4. Vite starts a local frontend, usually at `http://localhost:5173`. The AI route requires Vercel's serverless environment, so test the deployed API or run with Vercel CLI if you have it installed.

## Deploy to Vercel
1. Push the contents of this folder to a GitHub repository. The `package.json`, `index.html`, `src/`, and `api/` folders must be in the repository root.
2. Import that repository into Vercel.
3. Use the Vite framework preset; build command `npm run build`; output directory `dist`.
4. In Vercel → Project Settings → Environment Variables, add:
   - `GEMINI_API_KEY` = your Google AI Studio Gemini API key
   - `GEMINI_MODEL` = `gemini-2.5-flash` (optional; defaults to this value)
5. Redeploy after adding/changing variables.
6. Test `https://YOUR-DEPLOYMENT.vercel.app/api/health`. It should return JSON and `apiKeyConfigured: true` when the variable is present. Then test the AI chat.

## Security and privacy notes
- Never commit `.env`, API keys, or credentials. `.env.example` is a template only.
- The dashboard stores transaction data in browser localStorage. It is not encrypted storage; avoid using a shared/public computer for sensitive information.
- Dashboard transactions are not automatically attached to AI requests. The AI service receives only the text typed in the chat and the recent chat messages.
- AI responses can be wrong. Pennywise AI is informational and is not a substitute for professional financial advice.

## Important scope notes
- The weekly chart currently uses illustrative sample values and is labelled accordingly; it is not derived from transaction history yet.
- Sample transactions are fictional starter data. Delete or replace them with your own test data.
- This is a hackathon MVP, not a bank-connected application. It does not connect to banks, initiate payments, or verify financial transactions.
