# Spliit — Self-Hosted Couples Expense Tracker

A private, self-hosted expense tracker for two people. Fork of the open-source [Spliit](https://github.com/spliit-app/spliit) project, extended with self-hosting infrastructure and a few features built for a couple sharing all finances.

**Live repo:** [github.com/madytekt/spliit](https://github.com/madytekt/spliit)

---

## The problem

Apps like Splitwise and Splid are convenient, but they come with trade-offs: your financial data lives on someone else's server, they show ads, they can change pricing or shut down, and you have no control over how your data is stored or retained. For two people sharing all expenses, that's a lot of sensitive data to hand over to a third party indefinitely.

This project solves that by running everything privately. No cloud service sees the data. No public URL exists. Just two phones and a server that belongs to us.

---

## How it works

The app runs 24/7 on a cloud VPS (Oracle Cloud Free Tier — ARM-based, always free). It is completely invisible to the public internet: there is no domain name, no open port, nothing for a scanner to find.

Access works through [Tailscale](https://tailscale.com/), a private network overlay that connects only our enrolled devices (two phones, two laptops). When you open the app from an enrolled device, it loads instantly with no login prompt — because being on the private network is the authentication. The app is also installable as a PWA (Progressive Web App), so it sits on the home screen like any native app.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Oracle Cloud Free Tier ARM VPS                 │
│  4 OCPU / 24 GB RAM / 200 GB disk — always $0   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Docker Compose                          │   │
│  │  • Next.js app  (port 3000, localhost)   │   │
│  │  • PostgreSQL   (port 5432, localhost)   │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  Tailscale daemon                               │
│  • `tailscale serve` → HTTPS on port 443        │
│  • No public port exposed                       │
└─────────────────────────────────────────────────┘
         ▲                        ▲
         │  Tailscale WireGuard   │
    iPhone / Android         Laptop
    (PWA on home screen)
```

- **Oracle Cloud Free Tier** — ARM VPS, genuinely free forever, always on.
- **Docker Compose** — Next.js app container + PostgreSQL container. Data persists in a named volume.
- **Tailscale** — Creates an encrypted WireGuard tunnel between enrolled devices and the server. `tailscale serve` terminates HTTPS at the server; no certificate management needed.
- **GitHub fork → build on server** — Source is cloned directly on the VPS. `docker compose up --build` to deploy updates.
- **Google Sheets sync** — A nightly Google Apps Script job exports all expenses to a shared spreadsheet: one tab per group, an All tab combining everything, and a Sync Log. Useful as a human-readable backup and for ad-hoc spreadsheet analysis.
- **Encrypted backups** — Nightly database backups (planned).

---

## What this fork adds

The upstream Spliit project already handles the hard parts (see below). This fork adds:

| Feature | Description |
|---|---|
| **Delete Group** | A confirmation dialog that fully deletes a group and all its data in a single cascade. Upstream Spliit has no delete option. |
| **Google Sheets sync** | Nightly export of all expenses to a shared Google Sheet. One tab per group, one combined tab, one sync log tab. |
| **Self-hosting runbook** | Docker Compose setup, Tailscale configuration, Oracle Cloud provisioning guide — everything needed to reproduce this exact setup. |

---

## Why fork Spliit instead of building from scratch

Spliit already ships a well-tested core:

- Expense CRUD with descriptions, categories, and dates
- Split math: equal, exact amounts, percentages, shares
- Debt simplification and settlement tracking
- Multi-currency per expense (original amount + conversion rate stored separately)
- Receipt scanning via OpenAI Vision
- PWA manifest and service worker
- tRPC API, Prisma migrations, shadcn/ui component library

Rebuilding all of that would take months and introduce bugs in the math that matters most (money). Forking and extending it took days. The fork stays close to upstream so that future Spliit improvements can be merged in with minimal conflict.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| API | tRPC |
| Database ORM | Prisma → PostgreSQL |
| UI | TailwindCSS + shadcn/ui |
| Deployment | Docker Compose |
| Private networking | Tailscale |

---

## Setup overview

This is not a step-by-step tutorial, but here is the shape of the setup:

1. **Clone the repo** on your server (or locally for development).
2. **Create `container.env`** with database credentials (`POSTGRES_PASSWORD`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`). This file is gitignored and never committed.
3. **Start the stack:**
   ```bash
   docker compose --env-file container.env up -d
   ```
4. **Install Tailscale** on the server, then expose the app over your private network:
   ```bash
   tailscale serve --bg 3000
   ```
5. **Access the app** from any enrolled device at `https://<your-device-name>.ts.net`.
6. **Install as PWA** — in your mobile browser, tap "Add to Home Screen".

Optional: configure `OPENAI_API_KEY` to enable receipt scanning, and S3 credentials to enable expense photo attachments. See the upstream Spliit docs for details on those opt-in features.

---

## License

MIT — same as the upstream Spliit project. See [LICENSE](./LICENSE).

Upstream project: [github.com/spliit-app/spliit](https://github.com/spliit-app/spliit) by [Sebastien Castiel](https://github.com/scastiel) and contributors.
