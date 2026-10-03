# Student Attendance AI Insights

A Next.js App Router application with TypeScript, local student lookup, deterministic attendance metrics, and backend-only Grok insights. The original Excel files and earlier JSON exports are preserved.

## Setup

Use Node.js 20.9 or later and npm.

```sh
npm install
npm run convert
```

Copy `.env.example` to `.env.local`, then set `XAI_API_KEY` and `XAI_MODEL`. Do not prefix these with `NEXT_PUBLIC_`. Never commit `.env.local`. No API key is required for local search and calculations; the interface explains when AI is unavailable.

```dotenv
XAI_API_KEY=your-private-key
XAI_MODEL=grok-4.6
ATTENDANCE_THRESHOLD=75
```

Choose a model available to your xAI account. Restart the server after changing environment variables. The threshold must be a finite number from 0 to 100. It is an analytical threshold, not an institutional attendance rule. Average status categories remain fixed at Strong ≥85, Satisfactory ≥75 and <85, and Attendance Risk <75; subject alerts use the configurable threshold. Highest and lowest subject ties are retained.

```sh
npm run dev
```

Open http://127.0.0.1:3000. Search `RA2411026010476` for the supplied third-year example. Email/registration lookups are exact and case-insensitive; names use case-insensitive partial matching. A registration prefix identifies the year automatically; a conflicting explicit year filter returns no match. Multiple matches require selection, with at most 25 candidate names/registrations returned per search. Refine broad searches to see other candidates.

## Conversion

```sh
npm run convert
```

The reusable `scripts/convert.ts` reads both original `.xlsx` files from the project root with ExcelJS and writes `data/second_year_students.json` and `data/third_year_students.json`. It checks the two-row header layout, skips blank rows, converts numeric attendance strings, and validates all records before writing either output. It requires 1,000 records per file, unique registrations across both files, unique emails within each file (case-insensitive), correct prefixes, required fields/subjects, and numeric attendance from 0–100. Validation failures report the source and issue without silently dropping students.

The source workbooks have no recorded snapshot date. `snapshotDate` therefore defaults to the conversion date (UTC), used as an import snapshot label, not a claim about when attendance was measured. Set `SNAPSHOT_DATE=YYYY-MM-DD` in the shell to supply a confirmed source date; the conversion CLI does not load `.env.local`. Re-running conversion uses the current date unless overridden. The data is synthetic and never real-time.

## Architecture and API

- `lib/conversion.ts`: Excel extraction and validation.
- `lib/data.ts`: `server-only` imports of the two datasets. They are never imported into the client or served under `public/`.
- `lib/attendance.ts`: local search, metrics, threshold and status logic.
- `lib/service.ts`: resolves zero, one or multiple matches before any AI call.
- `lib/grok.ts`: allowlisted single-student payload, strict system prompt, 20-second timeout, bounded response parsing, and nonfatal provider fallback.
- `app/api/student-insight/route.ts`: validated POST requests, 4 KB input limit, same-origin browser check, no-store responses, rate limiting.
- `app/page.tsx`: responsive search, candidate selection, student/subject cards, metrics and AI/fallback states.

`POST /api/student-insight` accepts `{"query":"RA2411026010476"}` and an optional `year` (`2nd Year` or `3rd Year`). A match returns `kind: student`, student, metrics, threshold, aiInsight, aiError, snapshotDate and isRealTime. Ambiguity returns `kind: candidates`; errors return `kind: error`. No match returns HTTP 404 and never invokes Grok. A provider error returns HTTP 200 with the matched record and metrics, `aiInsight: null`, and a clear `aiError`.

Only the selected student's name, registration, year, snapshot date, attendance, metrics and threshold are sent to xAI. Emails and other records are excluded by explicit field selection. No tools, external search, or conversation history are supplied. The UI always shows authoritative local metrics; generated prose cannot change them. A strict prompt reduces unsupported claims but cannot mathematically guarantee model factuality; interpret the prose against the displayed source metrics.

Uses `POST https://api.x.ai/v1/responses`, Bearer authentication, `store: false`, and output-message text extraction, verified against the [official Responses API documentation](https://docs.x.ai/developers/rest-api-reference/inference/responses) on September 10, 2026. xAI recommends Responses for new integrations in its [Chat Completions documentation](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions). A live provider check requires your configured key and model.

## Verification and production

```sh
npm run test
npm run lint
npm run typecheck
npm run build
npm start
```

Tests cover both actual workbooks, a merged-header fixture with blank/numeric-string/invalid rows, record counts, duplicates, prefixes, value ranges, exact and partial search, ambiguity/no-match behavior, calculations and ties, provider success/error/missing configuration, request data minimization, and rate limiting. Provider requests in tests are mocked and incur no API cost.

The endpoint uses a global per-process limit of 30 requests/minute without trusting caller-controlled forwarded IPs. This provides a bounded local/single-instance budget; for multiple instances use an edge or shared-store limiter and authentication appropriate to your deployment. The app binds to loopback for local use. It does not implement user authentication. Before making actual student records accessible beyond a trusted environment, add access controls. The two complete datasets have no public endpoint; search is deliberately bounded but is not a substitute for authentication. Keep secrets in your hosting environment and use a Node-compatible Next.js host for deployment.
