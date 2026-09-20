# TRUST in Hall

Hall currently uses TRUST through progressive adoption. Bootstrap is mandatory. Unknowns are clarified with inline missions and Procedures. A reusable Procedure is published only after the method has been exercised in Hall.

TRUST's [software production methods guide](http://127.0.0.1:4176/docs/guides/software-methods) defines the general method. Hall documentation records only project-specific entry points.

| Subject | Authority |
| --- | --- |
| Expected behavior | [`requirements/catalog.json`](../requirements/catalog.json) |
| Architecture and code rules | [Project architecture and rules](project.md) |
| Verification and scripts | [Development and verification](development.md) |
| Product decisions | The user, recorded in the requirement catalogue |

The current sequence is:

1. Run bootstrap and read the relevant requirements, authorities, and constraints.
2. Clarify unknowns without deciding on the user's behalf.
3. Record accepted decisions in the requirement catalogue.
4. Compose delivery from the actual owners, contracts, invariants, and tests.
5. Publish a shared Procedure only after the method has been validated in Hall.

The published Procedures currently used by Hall are `hall-work-bootstrap@0.1.3` and `hall-municipality-clarification@0.1.0`.

Plans, states, Results, reports, and pending decisions remain in TRUST. They are not copied into repository Markdown or `.trust`. A TRUST Operation owns its execution; Hall does not create scripts for individual TRUST missions.

Run only a Check URI supplied by TRUST:

```sh
npm run trust:run -- '<trust-supplied-check-uri>' --json
```

The project command loads the Runner configuration. The TRUST MCP remains the authority for Procedures, Plans, and Results.
