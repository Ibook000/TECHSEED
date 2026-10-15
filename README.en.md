# TECHSEED

**An AI-assisted recruitment workflow for student clubs and campus organizations.** TECHSEED helps teams collect applications, run structured interviews, review AI-generated feedback, and manage admission decisions in one place. AI scores are advisory; administrators make the final decisions.

[简体中文](README.md) · **English**

[![CI](https://github.com/Ibook000/TECHSEED/actions/workflows/ci.yml/badge.svg)](https://github.com/Ibook000/TECHSEED/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Ibook000/TECHSEED/actions/workflows/codeql.yml/badge.svg)](https://github.com/Ibook000/TECHSEED/actions/workflows/codeql.yml)

## Screenshots

### Recruitment home

![TECHSEED recruitment home page](public/screenshots/home.png)

### Application form and AI screening

![TECHSEED application form](public/screenshots/application-form.png)

## Features

- **Applicant portal:** accessible application flow, resumable multi-turn AI interviews, application status lookup, and admission-group QR codes.
- **Admin console:** recruitment batches, searchable and sortable candidate lists, review notes, AI feedback, manual admission decisions, status history, CSV export, and dashboards. Dashboard cards filter the candidate list, and group QR codes can be managed separately for each batch.
- **AI providers:** any OpenAI-compatible Chat Completions endpoint, including DeepSeek, Qwen, and Ollama. Supports multiple keys, a fallback provider, and a built-in heuristic assessment when the model is unavailable.
- **Security controls:** password hashing, signed admin sessions, per-applicant access credentials, rate limits, input limits, and security headers.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Backend | Node.js, Express |
| Storage | Local JSON database |
| AI | OpenAI-compatible API with a heuristic fallback |

The default database is designed for a **single application instance**. Before using multiple instances or handling high application volume, migrate to a shared database and shared rate-limit storage.

## Quick start

### Requirements

- Node.js 22.12 or later
- npm

### Run locally

```bash
npm ci
cp .env.example .env
```

Before the first run, edit `.env` and set a unique `ADMIN_DEFAULT_PASSWORD` (12–128 characters). Passwords are checked exactly as entered, including leading and trailing spaces; a password cannot consist only of whitespace. Then start the development server:

```bash
npm run dev
```

Open <http://localhost:3000>. The admin console is at <http://localhost:3000/admin>. The server creates `data/db.json` on first startup; this runtime data is excluded from version control.

### Local demo

To preview the admin console and the recruitment workflow with synthetic records:

```bash
npm run demo
```

The demo listens on `127.0.0.1:3000` and uses a separate `.demo-data/` directory. It does not read or modify the production `data/` database. On first run it creates fictional applicants, interviews, and review records. The admin username is `admin`; a random initial password is printed on first run and saved to `.demo-data/.admin-password`. The launcher ignores AI provider settings from `.env`. A fresh demo database uses local heuristic scoring and makes no model API calls by default; external requests are made only if you configure a provider in the demo admin console.

All sample records are clearly marked as synthetic. Never put real applicant information into the demo database. To reset the demo, stop the server and remove the entire `.demo-data/` directory. Do not use it as a production data directory.

Useful commands:

```bash
npm test        # Run scoring, privacy, review, route-parameter, and Express route tests
npm run lint    # TypeScript type check
npm run audit   # Check dependency advisories
npm run build   # Build the frontend and production server
npm run start   # Start the production build
npm run backup  # Create a database snapshot
```

## Tests

The current unit tests cover score validation and grade boundaries, evidence-based heuristic scoring, empty-interview rejection, identifier redaction, admin password policy, manual-review decision validation, route-parameter normalization, and Express route smoke tests. HTTP routes, database migrations, and deployment environments still need broader integration coverage before using real applicant data.

## AI configuration

AI integration is optional. Without provider keys, TECHSEED uses its built-in heuristic assessment. To enable an external provider, configure `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` in `.env`, or configure the provider in the admin console.

When an external model is used, the service sends interview answers and relevant application context for question generation or assessment. It attempts to redact registered identity values from free-text answers, but this cannot guarantee removal of every identifying detail. Do not use real applicant data in demos or development, and tell applicants how their information is processed before collecting it.

`VITE_ORGANIZATION_NAME` controls the organization name shown in the frontend. It is a public build-time value; never put API keys or other secrets in variables prefixed with `VITE_`.

## Docker Compose

Docker Compose is the recommended deployment path for a single instance. Configure `.env` with a strong `ADMIN_DEFAULT_PASSWORD`, then run:

```bash
docker compose up -d --build
```

The service is published on `127.0.0.1:3000` by default. Put it behind an HTTPS reverse proxy for remote access. Compose stores the database in a named volume; use `docker compose exec app npm run backup` for a snapshot. Do not remove the volume when upgrading.

## Contributing and security

Issues and pull requests are welcome. See [Contributing](CONTRIBUTING.md) before making changes. Please report security issues privately; see [Security](SECURITY.md). Never include real applicant records, passwords, API keys, access tokens, `.env` files, or database backups in issues or pull requests.
