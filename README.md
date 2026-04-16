# CIDKeeper

Backup and preserve NFTs before they disappear. CIDKeeper scans an Ethereum wallet via Alchemy, checks IPFS gateway health for primary assets, supports ZIP export with a manifest, and optional re-pinning through web3.storage.

**Live site:** deploy as you prefer; the UI can use **your own** Alchemy and web3.storage credentials (stored in the browser) so you are not limited by shared free-tier quotas.

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
   - `WEB3STORAGE_TOKEN` — optional; only needed for the pin API route if you do not send a token from the browser.

   Optional variables are documented in `.env.example`.

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Open the app** in a browser at [http://localhost:3000](http://localhost:3000).

### Using only browser-stored keys (optional)

The web UI can save Alchemy and web3.storage keys in **localStorage** and send them to your local `/api/*` routes. You can leave `ALCHEMY_API_KEY` / `WEB3STORAGE_TOKEN` empty in `.env` for local experiments if you always use keys from the UI (not recommended for production servers you do not fully control).

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
- Alchemy (NFTs, transfers, RPC), web3.storage (optional pin flow)

## Contributing

1. Open an issue to describe the change or bug.
2. Fork the repo, create a branch, make focused commits.
3. Run `npm run lint` and `npm test` before opening a pull request.

## License

See [LICENSE](./LICENSE) in this repository.
