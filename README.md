# AI HealthMate Companion

AI HealthMate is a wellness-education web application with a dashboard, vitals tracker, report and symptom explanation, AI chat, diet and sleep planning, hydration tracking, history, and a wellness command center. It is not a medical diagnostic tool and does not replace a qualified healthcare professional.

## Requirements
- Node.js 20 or newer
- A Google Gemini API key for AI-backed features

## Run locally
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to your own API key. Do not commit real API keys.
3. Start the development server: `npm run dev`
4. Open the local URL printed in the terminal (usually `http://localhost:3000`).

## Build and type-check
- `npm run lint` checks TypeScript.
- `npm run build` builds the frontend for deployment.

## Deploy to Vercel
1. Push this project to your own GitHub repository.
2. Import the repository into Vercel.
3. In **Project Settings → Environment Variables**, add `GEMINI_API_KEY` with your own Google AI Studio key for Production and Preview as needed.
4. Use the default build command `npm run build`; output directory is `dist`.
5. Deploy, then test `/api/health` and each AI feature.

The `api/[...path].ts` serverless function routes `/api/*` requests to the Express app. AI features will return a helpful error until `GEMINI_API_KEY` is configured. Vercel's request size and execution limits apply; use small, clear report images.

## Data and privacy
Selected vitals, hydration, sleep, history, and preferences are stored in the current browser's `localStorage`. They are not automatically synced across devices and may be lost if browser data is cleared. Avoid entering real sensitive medical information in a demo.

## Voice assistant
Voice input/output uses browser Web Speech APIs where supported. Chrome or Edge generally offer the best support; microphone permission and a secure HTTPS origin are required for deployed use.

## Health safety
AI-generated content is educational only. It may be inaccurate or incomplete. Do not use it to diagnose or treat a condition or change medication. Seek qualified medical advice; for urgent symptoms, contact local emergency services.
