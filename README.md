# Runner Body Pain Guide

An interactive 3D anatomy web app for marathon runners. Connects to your 
Strava account to personalise injury risk predictions based on your actual 
training data.

🔗 **Live app:** https://bodypain-guide.vercel.app

---

## What it does

- 3D interactive body model — click any zone to explore injury risk
- Connects to your Strava to analyse last 90 days of runs
- Personalised risk engine across 25+ muscle groups
- Risk calibrated to your experience level (lifetime km)
- Severity-based guidance: causes, short-term relief, prevention
- Floating risk beacon shows your top injuries ranked by severity

---

## Using the live app with your own Strava

1. Go to **https://bodypain-guide.vercel.app**
2. Click **Connect Strava** in the sidebar
3. Log in to Strava and allow permissions
4. Your last 90 days of runs are analysed automatically
5. Risk scores update based on your personal training load

Your data never leaves your browser — nothing is stored on any server.

---

## Running your own instance

If you want a fully independent deployment:

### Prerequisites
- Node.js 18+ (https://nodejs.org)
- A Vercel account (https://vercel.com) — free
- A Strava account with API access

### 1. Clone the repo
```bash
git clone https://github.com/Sugs23/running-bodypain-guide.git
cd running-bodypain-guide
npm install
```

### 2. Register a Strava API app
1. Go to https://www.strava.com/settings/api
2. Create an app — note your **Client ID** and **Client Secret**
3. Set Authorization Callback Domain to `localhost` for local dev

### 3. Set up environment variables
Create a `.env.local` file in the project root:
STRAVA_CLIENT_SECRET=your_secret_here

### 4. Update the redirect URI
In `src/hooks/useStrava.js`, update line 12:
```javascript
const REDIRECT_URI = 'http://localhost:3000/auth/callback'
```

In `api/strava-token.js`, update line 15:
```javascript
client_id: YOUR_CLIENT_ID,
```

### 5. Run locally
```bash
npx vercel dev
```
Open http://localhost:3000

### 6. Deploy to Vercel
```bash
npx vercel --prod
```
Add `STRAVA_CLIENT_SECRET` in Vercel dashboard → Settings → Environment Variables.
Update Strava callback domain to your Vercel URL.

---

## Stack
React · Three.js · React Three Fiber · Vercel · Strava OAuth API

## About
Personal project built during marathon training to solve a real problem.
Designed and shipped end-to-end — product decisions, data architecture,
risk engine logic, UX and deployment all by me.
Built using AI-assisted development (Claude by Anthropic).

## License
MIT © Sugandh Sinha