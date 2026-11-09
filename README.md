# Lebanon Supermarket Price Comparison System

University Computer Science capstone. Mobile-first application to browse registered products, compare **branch-specific** supermarket prices, build shopping lists and eventually process receipts and evaluate grocery/travel costs.

**Latest iPhone check:** the owner confirmed successful testing of the corrected
Product Details and Supermarkets headers and approved complete T02 on 2026-11-07.
See [final owner acceptance](docs/t02cde-verification.md#2026-11-07--final-owner-acceptance).

> **Current state:** T01, T02 and all of T03 (A/B/C) are complete and owner-accepted. T03-C mobile authentication, shopping lists and basket results passed final physical-iPhone acceptance on 2026-11-09. Next: T04 two-supermarket optimization, then T05 routing/fuel and T06 receipt OCR; none has started. See [T03-C acceptance and verification](docs/t03c-verification.md), [roadmap](docs/roadmap.md), and [database instructions](database/README.md).

Final T02 cleanup now configures strict SQL mode and UTC on every application
pool checkout. Current cleanup checks pass: 31 backend tests, 31 mobile tests and
6 live API checks, plus package typechecks/build and Expo compatibility. See
[final cleanup](docs/t02-final-cleanup.md) for results, repository preparation and
confirmed owner/iPhone acceptance. T02-F's historical findings and future proposals
remain in [the audit](docs/t02f-audit.md). T03-A now extends the backend only.

## Documentation
- [`AGENTS.md`](AGENTS.md): coding-agent rules
- [`docs/requirements.md`](docs/requirements.md): exact 28 submitted requirements and rationales
- [`docs/architecture.md`](docs/architecture.md): technical architecture
- [`docs/frontend.md`](docs/frontend.md): screen hierarchy and requirement/button mapping
- [`docs/database.md`](docs/database.md): implemented catalog schema and later proposed entities
- [`database/README.md`](database/README.md): migration/seed execution and database verification
- [`docs/api.md`](docs/api.md): initial REST contracts
- [`docs/roadmap.md`](docs/roadmap.md): milestones and first Codex task
- [`docs/decisions.md`](docs/decisions.md): confirmed/open architecture choices
- [`docs/t02f-audit.md`](docs/t02f-audit.md): system audit, query plans, security findings and T03 approval proposals

## Intended stack
React Native + Expo + TypeScript; Node.js + Express + TypeScript; MySQL (WAMP locally); future free OCR option and Google Maps (subject to usage/cost validation).

## Prerequisites
Use Node.js 24 LTS and npm (development environment: Node 24.11.1, npm 11.6.2), WampServer 3.4.0 with MySQL 8.4.7, phpMyAdmin, and Expo Go on your iPhone. PHP/Apache serve phpMyAdmin; Express runs separately.

The mobile project uses Expo SDK 58 with its supported React Native version. Use an SDK 58-compatible Expo Go client; store availability can lag the SDK release. See [Expo Go version guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) and the [SDK migration record](docs/expo-sdk-58-migration.md). No global CLI installation is needed.

## Install and configure (PowerShell)
Both packages have generated lockfiles. Use `npm ci` for reproducible installs. Create local environment files only if they do not already exist; preserve existing credentials.

From the repository root:

```powershell
cd backend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
cd ..\mobile
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
cd ..
```

Start WAMP and confirm its MySQL service is running on **3306**. Open local phpMyAdmin and select the MySQL instance on that port (not another MySQL/MariaDB instance). In its SQL editor, paste `database/setup/01-local-database.sql`, replace the password placeholder with a password you choose locally, and execute it as the local administrator. Do not save or share SQL containing that password. This creates only the database and a loopback-only application user with SELECT/INSERT/UPDATE/DELETE privileges on this database. Future migrations use an administrator separately. Do not change root credentials or MySQL network exposure. If the user already exists, inspect its host and grants instead of overwriting it.

Edit `backend/.env`: set `DB_PASSWORD` to that same password; keep `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=supermarket_comparison`, `DB_USER=supermarket_app`. Empty passwords deliberately make database health unavailable. The example uses `HOST=0.0.0.0` so the phone can reach Express on the LAN; without a local environment file the backend binds only to loopback. Never forward MySQL or Express ports through your router.

Run `ipconfig` and find the computer's active Wi-Fi/Ethernet IPv4 address. In `mobile/.env`, replace the example address with it, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api`. This URL is public configuration, never a place for passwords. The shared `mobile/services/api.ts` handles all API calls. Explore, product detail/comparison and supermarket screens retrieve real backend data. Preserve existing environment files when already configured.

## Run (two PowerShell terminals)
Backend, starting at repository root:

```powershell
cd backend
npm run dev
```

Expo, starting at repository root in another terminal:

```powershell
cd mobile
npm start
```

Put the iPhone and PC on the same trusted network, allow Expo Go local-network permission, and scan the Expo QR code with the iPhone Camera to open Expo Go. Check that all five tabs open. Restart Expo with `npm start -- --clear` after changing its environment file. Windows cannot launch the iOS simulator; use the physical iPhone. If Expo Go reports an SDK mismatch, follow the linked official version guidance; do not install arbitrary SDK versions independently of React Native.

## Verify (PowerShell)
From the repository root, with the backend running:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod http://127.0.0.1:3000/api/health/db
cd backend
npm test
npm run typecheck
npm run build
# Optional production launch after stopping the development server:
npm start
```

In a separate terminal from the root:

```powershell
cd mobile
npm run typecheck
npx expo install --check
```

Health must return `status=ok` with `message=Backend is running`; database health must return `status=ok, database=connected` after setup. A database failure returns HTTP 503 (`Invoke-RestMethod` reports an HTTP error), with only `status=error, database=unavailable`. Automated database-health tests inject successful/failed checkers and do not require MySQL. Open `http://YOUR_PC_IPV4:3000/api/health` in iPhone Safari to verify LAN connectivity separately from Expo.

WAMP MySQL uses port **3306**, confirmed by the owner. The backend default, environment example, and local DB_PORT now match that port. Configure the dedicated account password locally before testing database health.

## Troubleshooting
- **MySQL connection refused / database unavailable:** start WAMP MySQL; verify port 3306 and the selected phpMyAdmin server. Confirm the database, local account, password and database-specific grants. Restart Express after editing `.env`.
- **Missing environment variables:** create each `.env` from its example in the correct directory. Express starts without a DB password but database health stays unavailable. Use the package-directory commands above so dotenv finds the backend file.
- **Phone cannot reach Express:** use the PC IPv4 rather than `localhost`, keep both devices on the same network, and verify `HOST=0.0.0.0`. Guest Wi-Fi/client isolation or a VPN can block peer connections.
- **Windows Firewall:** allow Node/Expo on the trusted Private network when prompted. If a rule is needed, limit inbound TCP 3000 (API) and 8081 (Metro) to the local subnet on the Private profile. Do not disable the firewall or open MySQL port 3306.
- **Browser CORS:** `CORS_ORIGINS` is a comma-separated list of exact browser origins, initially `http://localhost:8081`. Add the actual LAN browser origin if needed. Native Expo requests have no browser Origin and are allowed. CORS is not authentication or a firewall.
- **Address already in use:** stop the previous process with Ctrl+C or select another backend `PORT` and update the mobile URL.

## Implementation boundaries
`mobile/app/` contains the five tabs plus catalog, list/editor/picker and basket screens. Profile handles authentication; native sessions use Expo SecureStore. `mobile/services/` holds the shared HTTP client, contract readers and session/request controllers; `mobile/hooks/` owns focused loads and mutations. Backend health/catalog/auth/shopping-list/basket modules remain unchanged in T03-C. No new migration is required. Multi-store optimization and OCR remain deferred. Run mobile tests after installing both packages: `npm test` and `npm run typecheck:tests` in `mobile/`. Device acceptance is in [T03-C verification](docs/t03c-verification.md).

## Security
Do not commit credentials, `.env`, unredacted personal receipts or database dumps containing user data.
