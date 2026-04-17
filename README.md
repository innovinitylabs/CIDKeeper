# CIDKeeper

Backup and preserve NFTs before they disappear. CIDKeeper scans an Ethereum wallet via Alchemy, checks IPFS gateway health for primary assets, supports ZIP export with a manifest, and optional **pinning of existing IPFS CIDs** through the [4EVERLAND](https://www.4everland.org/) IPFS [Pinning Service API](https://docs.4everland.org/storage/4ever-pin/pinning-services-api) at `https://api.4everland.dev/pins` (no re-upload; the same CID is submitted to their pin queue).

**Note:** Pinning uses your **4EVERLAND pin access token** from [Pinning service](https://dashboard.4everland.org/bucket/pinning-service) (saved in the browser like Alchemy), or optionally `FOUR_EVERLAND_TOKEN` in `.env` on a server you control. Before each new pin, CIDKeeper calls the standard `GET /pins?cid=…` listing so CIDs that are already queued, pinning, or pinned are **not** posted again. During **Analyze CIDs**, the same check runs for each IPFS primary (not Arweave) when your 4EVERLAND pin token is sent with the request, so the grid can show **Pinned (4EVER)** / **Unpinned (4EVER)** next to gateway health. ZIP export and CID checks work with Alchemy alone.

**Live site:** deploy as you prefer; the UI can save **your own** Alchemy API key (and 4EVERLAND token for pinning) in the browser so you are not limited by shared free-tier quotas.

## Open source

Source and issues: [github.com/innovinitylabs/CIDKeeper](https://github.com/innovinitylabs/CIDKeeper). Contributions (bug reports, docs, pull requests) are welcome.

## Requirements

- **Node.js** 20 LTS or newer (includes `npm`). Check with `node -v` and `npm -v`.
- **Git** (to clone the repository).

On a **fresh Mac**: install [Node.js](https://nodejs.org/) (LTS) from the website, or use [Homebrew](https://brew.sh/) (`brew install node`), then install Git if needed (`brew install git`).

On a **fresh Windows PC**: install [Node.js](https://nodejs.org/) (LTS) and [Git for Windows](https://git-scm.com/download/win). Use **PowerShell** or **Git Bash** for the commands below.

## Run locally (from scratch)

1. **Clone the repository**

   ```bash
   git clone https://github.com/innovinitylabs/CIDKeeper.git
   cd CIDKeeper
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:

   - `ALCHEMY_API_KEY` — required for server routes to talk to Alchemy unless the client sends a key (see below).
   - `FOUR_EVERLAND_TOKEN` — optional server default for pinning; users normally paste their token in the UI instead. Without any token (browser or env), the pin route returns HTTP 501.
   - `NEXT_PUBLIC_SITE_URL` — recommended for production SEO metadata (canonical URL, Open Graph, sitemap, robots), for example `https://your-domain.tld`.

   Optional variables are documented in `.env.example`.

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Open the app** in a browser at [http://localhost:3000](http://localhost:3000).

### Using only browser-stored Alchemy key (optional)

The web UI can save an Alchemy key and a 4EVERLAND pin access token in **localStorage** and send them to your local `/api/*` routes. You can leave `ALCHEMY_API_KEY` empty in `.env` if you always paste an Alchemy key in the UI (not recommended for production servers you do not fully control). For pinning, either paste your 4EVERLAND token in the UI or set `FOUR_EVERLAND_TOKEN` in `.env`.

### Production build (local)

```bash
npm run build
npm run start
```

Then open [http://localhost:3000](http://localhost:3000) (default port 3000 unless you set `PORT`).

## Scripts

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `npm run dev`  | Next.js dev server with hot reload   |
| `npm run build`| Production build                     |
| `npm run start`| Serve the production build           |
| `npm run lint` | ESLint                               |
| `npm test`     | Node test runner for `lib/*.test.ts`|

## Stack

- [Next.js](https://nextjs.org/) (App Router)
- TypeScript, Tailwind CSS v4
- Alchemy (NFTs, transfers, RPC), 4EVERLAND pin API (optional IPFS pinning by CID)

## Contributing

1. Open an issue to describe the change or bug.
2. Fork the repo, create a branch, make focused commits.
3. Run `npm run lint` and `npm test` before opening a pull request.

## License

See [LICENSE](./LICENSE) in this repository.
