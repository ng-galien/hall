# Editor acceptance tests

The maintained Playwright baseline covers the Editor Lab against the real React application, HTTP server, and SQLite repositories. The runner creates a new temporary database and document directory for every invocation, sets a dedicated API token, allocates two free loopback ports, and removes the temporary data when Playwright exits. It never opens an interactive browser profile or uses the development database.

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

`municipal-workflow.spec.ts` and `navigation-and-settings.spec.ts` are retained as legacy scenarios but are excluded from the maintained baseline. They must be realigned with the current domain and UI contracts before being re-enabled. The active Chromium project runs only `markdown-editor.spec.ts`.
