# SPLIT

Co-op debugging where each player is half-blind and one shared agent sees everything.

**Live:** https://split-c6t9.onrender.com
**Repo:** [your GitHub repo link]

## How it works
- One bug, two roles. The **logs** player sees runtime values. The **source** player sees code.
- Role filtering happens on the **server**. The logs side never receives source, and the source side never receives runtime values.
- A shared agent answers only with what the asking role can see. Anything else gets a fixed lock refusal.
- Either player can request a fix. The agent returns a diff, and **both** players must approve it.

## Built together
Built in trmi by Benjamin (@BenCoy09) and [brother's name]. We prompted and approved the agent's changes in the same room.

## Run locally
npm install, then `npm run dev` (API) and `npm run dev:web` (web).
Set AGENT_PROVIDER, AGENT_MODEL and AGENT_API_KEY in your environment. Never commit keys.

## What it does not do
- Rooms live in memory and are lost on restart. No database, no accounts.
- The patch test run is simulated against a known-good fix.
- The free Render instance sleeps, so the first load can take about a minute.
