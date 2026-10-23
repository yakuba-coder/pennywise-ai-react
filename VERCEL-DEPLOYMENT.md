# Vercel deployment checklist

1. Upload the project contents to the root of a GitHub repository.
2. Import the repository in Vercel.
3. Confirm framework preset: **Vite**; build command: `npm run build`; output directory: `dist`.
4. Add `GEMINI_API_KEY` in Project Settings → Environment Variables. Optionally add `GEMINI_MODEL=gemini-2.5-flash`.
5. Redeploy after saving environment variables.
6. Open `/api/health`. It should return JSON with `ok: true`. `apiKeyConfigured` only confirms that an environment variable exists; it does not verify key validity or quota.
7. Open Pennywise AI and send a test message.

Do not put the Gemini key in React/Vite variables such as `VITE_GEMINI_API_KEY`. Variables prefixed with `VITE_` are exposed to browser code. The serverless API reads only `GEMINI_API_KEY`.

## Troubleshooting
- **404 on `/api/health` or `/api/gemini`:** make sure the `api` folder is at the repository root, not inside `src` or another nested folder; redeploy the latest commit.
- **503 from Gemini:** provider may be overloaded. This project retries temporary 503 responses up to two times. Persistent overload still requires waiting or using an available model.
- **401/403:** check API key and restrictions in Google AI Studio.
- **429:** check Gemini quota/rate limits.
- **Build error:** verify that the root `package.json` is committed and run `npm install` then `npm run build` locally.
