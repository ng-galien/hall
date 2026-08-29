# Browser acceptance tests

The Playwright suite drives the real React application against the real HTTP server and SQLite repositories. The runner creates a new temporary database and document directory for every invocation, sets a dedicated API token, allocates two free loopback ports, and removes the temporary data when Playwright exits. It never opens an interactive browser profile or uses the development database.

Install the Chromium runtime once after installing dependencies:

```sh
npx playwright install chromium
```

Run the browser suite from the repository root:

```sh
npm run test:e2e
```

Run the complete static, unit, integration, build, and browser checks:

```sh
npm run quality:e2e
```

`MAIRIE_E2E_SERVER_PORT` and `MAIRIE_E2E_CLIENT_PORT` may be set when CI requires fixed ports. Playwright keeps traces, screenshots, and videos only for failures under `packages/client/test-results`; HTML reports are generated in CI under `packages/client/playwright-report`.

Retries are deliberately disabled because the real server owns mutable SQLite state for the duration of a run. A failure is reported against its original deterministic database instead of being retried against partially written data.

The municipal workflow covers the commands currently available in the UI: creating and reading council members, classified resources, council business prepared for the agenda, draft council decisions, and meetings, followed by meeting scheduling, attendance, officers, public and secret ballots, immutable participation evidence, meeting closure, quorum failure, and reconvening. No council-business deletion command is exposed by the current React application, so the suite does not manufacture a deletion path outside the product contract.
