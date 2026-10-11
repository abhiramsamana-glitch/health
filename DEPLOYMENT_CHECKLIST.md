# Vercel deployment checklist

## Before deployment
- [ ] Push the extracted project to a GitHub repository.
- [ ] In Vercel, import that repository.
- [ ] Confirm Build Command is `npm run build`.
- [ ] Confirm Output Directory is `public` (configured in `vercel.json`).
- [ ] Add `GEMINI_API_KEY` under Project Settings → Environment Variables. Never paste the key into source code or commit it.
- [ ] Redeploy after adding or changing environment variables.

## After deployment
- [ ] Open the site and verify the Dashboard loads.
- [ ] Open `https://YOUR-DOMAIN/api/health`; expected JSON includes `"status":"ok"`.
- [ ] Test AI Assistant with a simple general wellness question.
- [ ] Test Report Analysis using a small sample text report first, then a small clear image.
- [ ] Test symptom review, vitals analysis, diet planning, and sleep planning.
- [ ] Check browser DevTools Console and Vercel Runtime Logs for errors.
- [ ] Confirm saved entries persist after refresh in the same browser. `localStorage` data does not sync across devices.

## If deployment fails
- Build error: open Vercel Deployment → Build Logs and find the first error.
- AI returns a key error: confirm `GEMINI_API_KEY` is configured for the deployed environment, then redeploy.
- API returns 404: confirm `api/[...path].ts` is in the repository and redeploy.
- API times out or returns a provider error: check Vercel Runtime Logs and the Gemini API key/model access.
- Large image upload fails: use a smaller image or paste report text; serverless platforms impose request-body limits.

## Important
A ZIP cannot guarantee a successful deployment in every Vercel account because environment variables, provider access, and platform limits vary. Test the deployed URL before the expo. This app is educational and must not be presented as a clinical diagnostic system.
