# Changelog

All notable changes to Rancang.ai Studio are documented in this file, starting from v0.2.4.

## [v0.2.8] - 2026-11-27

### Added
- **Global Interface Language Toggle (`ID | EN`, default `ID`):** Added `LocaleProvider` and `LanguageToggle` across the application top bar (`AppShell`), landing page (`/`), and auth pages (`/login`, `/register`) with `localStorage` persistence and live translation across navigation, Studio, Workspace, Library, Models, Profile, Auth, and Documentation.
- **AI Output Language Selector (`Indonesia | English`):** Users can now choose whether AI interviews and generated specification documents are written in Indonesian or English directly in the Studio composer, transmitted via `X-Rancang-Output-Lang` and enforced in document/interview prompts.
- **Professional Documentation Revamp (`/docs`):** Rebuilt the documentation page into a 3-column reader (grouped sidebar navigation, readable prose with structured steps/tables/callouts/copyable AI agent starter prompt and prev/next navigation, plus sticky right-hand "On this page" TOC with scroll-spy), instant search filter, and full `ID | EN` bilingual coverage while preserving all `#panduan-*` deep links.

### Fixed
- **Strict Managed Model Whitelist Enforcement:** Fixed an issue where secondary or legacy active credentials with `allowed_models_json = NULL` leaked unfiltered models into Bawaan Rancang.ai even after the admin whitelisted models on their primary connection. Also surfaced all active owner credentials inside the Admin panel so legacy connections can be whitelisted or removed cleanly.
- **Hide Provider Names in Managed Model Picker:** Unified the top-bar switcher and Managed Rancang.ai card to display only whitelisted model IDs under **Bawaan Rancang.ai** without exposing internal provider or connection names to admin or member pickers.
- **Clicking Completed Documents During Live Batch Generation:** Fixed a race condition where `autoFollow` yanked selection back to the currently-writing document and stale empty document caches blocked opening finished documents while a batch was still running.

## [v0.2.7] - 2026-11-27

### Added
- **User Profile & Password-Later Settings (`/profile`):**
  - Added `GET`/`PATCH /api/v1/account/profile` and `POST /api/v1/account/password` plus the `/profile` page linked from the sidebar and footer account block.
  - Users can update their display name and email address with uniqueness validation and live sidebar refresh.
  - Accounts without a password yet (such as Google OAuth signups or the seeded local owner) can set a password directly from `/profile` without requiring a current password while preserving `authProvider`; accounts with an existing password verify their current password before changing it.
- **Admin Managed Model Whitelist (migration `005_managed_model_whitelist.sql`):**
  - Added nullable `provider_credentials.allowed_models_json` column and owner-only `PATCH /api/v1/settings/credentials?id=...` endpoint.
  - Admins can now search and pick an explicit whitelist of allowed model IDs per managed connection directly inside `/models`, automatically filtering the Bawaan Rancang.ai model picker and enforcing the whitelist on runtime calls for all users.

### Changed
- **Rewritten Login & Register UI (`/login`, `/register`):** Replaced the generic centered card with an asymmetric architectural drafting-desk split layout featuring a notched spec dossier (`01 PRD` to `06 Memori`), 1-click mode switcher (`Masuk` / `Daftar`), password length indicator on registration, and mobile-first fold priority in both light and Deep Slate Dusk themes.

## [v0.2.6] - 2026-11-27

### Added
- **Hybrid Auth (Google OAuth 2.0 + Manual Sign-Up/Sign-In for piloting):**
  - Native PKCE + CSRF state Google OAuth routes (`GET /api/v1/auth/google`, `GET /api/v1/auth/google/callback`) and public capability endpoint (`GET /api/v1/auth/providers`) controlled by `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (or `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`). When unconfigured, the Google button stays hidden cleanly without dead controls.
  - Verified Google accounts automatically sign in or register as `member` (preserving `owner` role if an admin signs in with their owner email) with idempotent `user_settings` provisioning.
  - Manual email + password registration remains immediately active without email OTP for piloting (minimum 8-character password), with show/hide password toggles and OAuth error feedback on `/login` and `/register`.
- **Server-side cloud auth gate & account identity in sidebar:**
  - `src/app/(app)/layout.tsx` now checks `getSession()` on the server and redirects unauthenticated visitors to `/login` when `AUTH_MODE=cloud`.
  - Sidebar footer displays the active signed-in user's name, email, and `admin` badge for `owner` accounts instead of a hardcoded `local` label.
- **Local Admin password CLI (`scripts/set-admin-password.mjs`):** Added a helper script to set or rotate the local `owner` account's email and scrypt password directly in SQLite before enabling `AUTH_MODE=cloud`.

## [v0.2.5] - 2026-11-27

### Added
- **Two-mode model settings (Admin-managed vs Session-Only BYOK):** Users can now choose between **Bawaan Rancang.ai** (server-managed OpenAI-compatible models) or **API Key Sendiri (BYOK)** stored strictly in browser `sessionStorage`.
- **Owner UI management for Managed Rancang.ai:** Admin accounts (`role = 'owner'`) can add, test, refresh model lists, set defaults, and remove OpenAI-compatible managed connections directly from `/models` (encrypted AES-256-GCM in SQLite), automatically powering Bawaan Rancang.ai for all users without editing `.env`. `MANAGED_*` env vars remain supported as a fallback.
- **Role-scoped API guards:** Exposed `user.role` in session state and enforced `owner`-only permissions (`403 Forbidden` for `member`) on credential and preset mutations (`/api/v1/settings/credentials`, `/api/v1/settings/presets`), while `GET /api/v1/settings/managed` returns only public model metadata and `isOwner` (`Cache-Control: no-store`, zero key/URL leaks).
- **Least-exposure session BYOK headers:** Added runtime model header parsing (`X-Rancang-Model-Mode`, `X-Rancang-Byok-Key`, `X-Rancang-Byok-Base-Url`, `X-Rancang-Model-Id`, `X-Rancang-Reasoning-Effort`) attached exclusively to LLM execution endpoints (`/interview`, `/documents/generate-all`, `/documents/[type]`) and never persisted to SQLite.
- **Transparent BYOK security guidance & Base URL shortcuts:** Added factual security explanation directly inside `/models` (recommending scoped API keys with spending limits and explaining session-only storage + automatic wipe on tab close/logout) plus 1-click Base URL shortcuts (OpenAI, Kenari, OpenRouter, Ollama).

### Changed
- **2-step BYOK model fetch UX:** Reordered the BYOK setup flow so users enter Base URL + API Key, click **Muat daftar model** first, and select from a searchable dropdown containing all models returned by the provider key (with manual Model ID kept discreetly as a fallback for gateways without `/v1/models`).
- **Unified OpenAI-Compatible connection flow:** Removed the redundant separate `OpenAI` provider choice on `/models` so both Admin Managed connections and user BYOK share one OpenAI-Compatible flow.
- **Cross-mode top-bar model switcher:** Updated `AppShell` dropdown to group active `BYOK sesi` and `Bawaan Rancang.ai` models for both owners and members, with a compact `BYOK` indicator when a session key is active, and wired `signOut` in `Rail` to clear session BYOK keys immediately.

## [v0.2.4] - 2026-11-27

### Added
- **Studio launch choice (Interview vs Direct Generation):** Clicking **Mulai merancang** in `/studio` now prompts the user to start with a guided interview or generate the 6 core specification documents directly from the project detail, with a dynamic hint based on detail length.
- **Context-aware generation prompts:** Document generation prompts now explicitly distinguish between direct-from-description runs (treating project title and description as the primary brief and flagging open assumptions) and interviewed runs (prioritizing founder interview answers).
- **Non-SSE batch snapshot endpoint:** Added `GET /api/v1/projects/:projectId/documents/generate-stream?snapshot=1` returning plain JSON batch state to eliminate proxy/tunnel buffering delays on refresh or route switches.
- **Document conceptual guides:** Added guides for PRD and the five core supporting specification documents in `/docs` with a direct link from `/studio` and each document header.
- **Top-bar interactive model switcher:** Replaced the static model link in the top bar with a live switcher loading cached model catalogs from active provider connections alongside saved presets.
- **Project-grouped Library:** Updated `/library` to group saved snapshots by project first instead of listing every document flatly, while keeping legacy unlinked items accessible.

### Changed
- **Unified 2-step project workspace:** Merged the separate `Tulis` step into `Dokumen` (`1. Wawancara` -> `2. Dokumen`), keeping live batch generation, formatted Markdown streaming, preview, inline editing, and version history inside one surface. Legacy `/projects/[id]/write` and `?mode=write` links redirect automatically to `?mode=documents`.
- **Deep Slate Dusk dark mode & Antislop UI polish:** Replaced the near-black charcoal dark theme with a softer WCAG AA verified Deep Slate Dusk palette (`#161d29` canvas, `#1c2433` sidebar, `#222c3d` surface, `#6c7f9c` strong border), harmonized Mermaid dark theme colors, softened badges/buttons/tabs/rail, replaced the 4-card template grid on `/studio` with a 2-column editorial index, and unified connected model rows in `/models`.
- **Compact collapsible AI agent guide:** Replaced the large duplicate AI agent CTA banner inside the document preview with a compact 1-line collapsible guide referencing the existing top-bar Export and Copy menus plus the recommended 6-document reading order.

### Fixed
- **Streaming format & refresh sync:** Live batch generation now renders formatted GFM Markdown via `MarkdownRenderer` (deferring Mermaid SVG rendering until completion) and syncs immediately via JSON snapshot plus SSE with automatic fallback polling, preventing stuck `Antre` states after refresh or navigation.
- **Stale document counts:** Updated remaining `7`-document labels (`Tujuh dokumen`, `0/7`) across Studio cards, project workspace header, and Document Studio sidebar to reflect the 6 core documents.

### Removed
- **Wireframe from active workspace flow:** Removed Wireframe from active 6-document generation, navigation counters, and workspace tabs while keeping historical database snapshots intact.
