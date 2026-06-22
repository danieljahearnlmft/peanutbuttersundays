# Jelly — chat backend (Cloudflare Worker)

Jelly is the guardrailed chat assistant for the Peanut Butter Sundays website.
This Worker is the **backend**: it receives chat messages from the static widget
on the site, calls the DeepSeek API, and returns a reply. The DeepSeek API key
lives only in the Worker's secrets — never in the browser.

The frontend widget lives with the site (`/css/jelly.css`, `/js/jelly.js`).

## Files

- `wrangler.jsonc` — Worker config (name, entry point, compatibility date).
- `src/index.js` — the Worker. CORS, input sanitizing, guardrails, DeepSeek call.
- `.dev.vars.example` — template for local secrets. Copy to `.dev.vars`.

## Prerequisites

- Node.js installed (so `npx` is available).
- A DeepSeek API key.

## Local development

1. Copy the secrets template and paste your key:

   ```sh
   cp .dev.vars.example .dev.vars
   # then edit .dev.vars and set DEEPSEEK_API_KEY=sk-...
   ```

   `.dev.vars` is gitignored and is read automatically by `wrangler dev`.

2. Run the Worker locally:

   ```sh
   npx wrangler dev
   ```

   This serves the Worker at `http://localhost:8787`. To test the widget
   against it locally, temporarily point `JELLY_ENDPOINT` in `/js/jelly.js` at
   that URL.

## Deploy

1. Log in to Cloudflare (one time per machine):

   ```sh
   npx wrangler login
   ```

2. Store the DeepSeek key as a production secret (one time, or when it rotates):

   ```sh
   npx wrangler secret put DEEPSEEK_API_KEY
   ```

3. Deploy:

   ```sh
   npx wrangler deploy
   ```

After deploy, the live URL is printed and will look like:

```
https://jelly.<your-subdomain>.workers.dev
```

Paste that URL into `JELLY_ENDPOINT` at the top of `/js/jelly.js` so the site
widget talks to the deployed Worker.

## Notes

- Allowed origins are listed in `src/index.js` (`ALLOWED_ORIGINS`). Add any new
  production domains there.
- The system prompt and `PBS_KNOWLEDGE` (mission + FAQ) live in `src/index.js`.
  Search for `[TODO` and replace the placeholders with real PBS content.
