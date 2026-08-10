# SoundCloud account on GitHub Pages

GitHub Pages serves only static files, so it cannot hold a SoundCloud client
secret or exchange OAuth codes. Aurora's existing `aurora-relay` Cloudflare
Worker includes a `SoundCloudAccount` Durable Object for that server-side work.

The flow keeps credentials separated:

1. Pages asks the Worker for an OAuth authorization URL.
2. The Worker stores the PKCE verifier and state nonce in Durable Object storage.
3. SoundCloud returns to the Worker, which exchanges the code using the client
   secret and stores the rotating refresh token.
4. The Worker redirects to Pages with a random Console token in the URL
   **fragment**. Fragments are not sent to GitHub's server.
5. Pages presents that token to the Worker when loading account data. SoundCloud
   access and refresh tokens never enter the browser.

## One-time setup

First rotate any client secret that has been shared in screenshots, chat, logs,
or source control.

Deploy the Worker once to create `aurora-relay` and its Durable Objects:

```bash
bun install
bun run worker:deploy
```

Wrangler prints the public Worker origin, conventionally:

```text
https://aurora-relay.<your-workers-subdomain>.workers.dev
```

In the SoundCloud application settings, use this exact Redirect URI:

```text
https://aurora-relay.<your-workers-subdomain>.workers.dev/api/soundcloud/callback
```

Store the production configuration in Cloudflare. Wrangler prompts for each
value without writing it to the repository:

```bash
bunx wrangler secret put SOUNDCLOUD_CLIENT_ID --config worker/wrangler.toml
bunx wrangler secret put SOUNDCLOUD_CLIENT_SECRET --config worker/wrangler.toml
bunx wrangler secret put SOUNDCLOUD_REDIRECT_URI --config worker/wrangler.toml
bunx wrangler secret put SOUNDCLOUD_CONSOLE_URL --config worker/wrangler.toml
bunx wrangler secret put SOUNDCLOUD_ALLOWED_ORIGIN --config worker/wrangler.toml
```

Use these values for the last three prompts:

```text
SOUNDCLOUD_REDIRECT_URI=https://aurora-relay.<your-workers-subdomain>.workers.dev/api/soundcloud/callback
SOUNDCLOUD_CONSOLE_URL=https://geoffsee.github.io/aurora/controls/
SOUNDCLOUD_ALLOWED_ORIGIN=https://geoffsee.github.io
```

Finally, set the public Worker origin as a GitHub Actions repository variable
(this is an endpoint, not a secret):

```bash
gh variable set SOUNDCLOUD_API_URL \
  --body 'https://aurora-relay.<your-workers-subdomain>.workers.dev'
```

Run the Pages deployment again. Its build replaces the Console's
`aurora-soundcloud-api` meta value with that repository variable. Open the
deployed Console and select **Connect SoundCloud**.

## Local Worker development

Create `worker/.dev.vars` (gitignored) with the same five values, using the
local Wrangler callback URL, then run:

```bash
bun run worker:dev
```

Do not prefix these variables with `VITE_` or place them in frontend build
configuration. The client secret and SoundCloud tokens belong only in the
Worker runtime.
