# Project architecture and rules

This document identifies the current technical authorities in Hall and the rules for changing them.

## Architecture authorities

| Responsibility | Authority |
| --- | --- |
| Shared data contracts | `packages/contracts/src/` |
| Domain vocabulary, schemas, and pure policies | `packages/domain/src/` |
| HTTP and Siren contracts | `packages/api-contract/src/` |
| PostgreSQL schema, invariants, and stored operations | `packages/postgres/` |
| Server use cases and authorization | `packages/server/src/services/` and `packages/server/src/api/` |
| Persistent row decoding | `packages/server/src/repositories/` |
| Resource grammar and presentation compatibility | `packages/templating/src/` |
| Client features and pages | `packages/client/src/features/` and `packages/client/src/pages/` |
| Shared interface primitives | `packages/client/src/components/ui/` |
| Desktop composition | `packages/desktop/` and `packages/server/src/core/localServer.ts` |

The server is the only write authority. The client consumes HTTP and Siren representations and actions. Electron uses the public local-server entry point; it does not access SQL or database objects directly.

PostgreSQL owns durable invariants and transactional lifecycle changes. TypeScript services orchestrate those operations. The client presents state and available actions without recreating permissions or business policies.

Realtime messages are transient notifications. Clients reload HTTP and Siren projections after a message or reconnection. The current in-process bus does not provide cross-instance delivery.

## Change placement

1. Add a business variant to the domain union, boundary schema, and exhaustive policy.
2. Add an HTTP mutation through `ApiActionName`, command policy, authorization, audit resolution, route, and Siren action projection.
3. Put state-dependent business policy in the domain. Put transport capabilities in the Siren policy.
4. Decode stored rows at the repository boundary. Services must not consume unchecked SQL rows.
5. Put transactional orchestration in a service and atomic persistence operations in the repository or PostgreSQL package.
6. Extend shared reference and resource kinds at their canonical authority before updating exhaustive consumers.
7. Add rich-text directives to `@hall/templating` before adapting the client and server.

Do not create a second catalogue, policy, state machine, parser, or permission rule beside an existing authority.

## Code rules

- Model finite business cases with closed unions and exhaustive dispatch.
- Keep the internal TypeScript correlation cast inside `packages/domain/src/match.ts`.
- Validate external HTTP, database, filesystem, and local-storage data at its boundary.
- Remove obsolete fields end to end instead of preserving invented compatibility.
- Keep code, schemas, API identifiers, and technical prose in English. User-facing labels remain in French localization or templates.
- Use PostgreSQL for the shared server and an embedded PostgreSQL server for desktop local mode. Do not add SQLite paths.

## Interface rules

- Siren actions define what the user may do. The client does not infer permissions.
- Reuse components from `packages/client/src/components/ui/` and the existing workspace TreeView.
- Keep one owner for navigation, autosave, forms, mutations, and visual tokens.
- Give Playwright targets stable, function-based `data-testid` values.
- Do not locate functional controls by translated text, placeholders, titles, or ARIA labels.
- After a Playwright failure, rerun the focused scenario before the full suite.

## Verification

Before adding a module, find the existing union, policy, catalogue, or adapter that owns the concept. After a structural change, run the focused test and the applicable repository checks:

```sh
npm run check:requirements
npm run check:architecture
npm run typecheck
npm run lint
code-moniker check --report .
```

Update Code Moniker rules only when a durable authority or boundary changes.
