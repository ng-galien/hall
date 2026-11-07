import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HallPostgresError, ProjectionValidationError, StatementTimeoutError } from "../src/errors.js";
import { callJson } from "../src/jsonCall.js";
import {
  defaultStatementTimeouts,
  documentStatementActions,
  PostgresTransactionManager,
  statementBudgetOf,
  statementTimeoutsFromEnvironment,
} from "../src/transaction.js";
import { postgresDescribe, testDatabaseUrl, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("PostgreSQL transaction authority", () => {
  const pool = new Pool({
    connectionString: testDatabaseUrl ?? "postgresql://unused:unused@127.0.0.1:1/unused",
    max: 1,
  });
  const transactions = new PostgresTransactionManager(pool);
  useFreshHallDatabase(pool);

  const context = {
    requestId: "request-42",
    actorId: "actor-7",
    action: "test.command",
    contactId: null,
  } as const;

  // @verifies-requirement HALL-TR-SCH-040
  it("joins calls made inside an ambient transaction and lets work that outlives it open its own", async () => {
    const backend = "SELECT pg_backend_pid() AS pid, txid_current()::text AS transaction";
    const read = () =>
      transactions.run(
        { role: "hall_api_authenticated", context },
        async (client) => (await client.query<{ pid: number; transaction: string }>(backend)).rows[0],
      );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let outliving: Promise<{ active: boolean; row: { pid: number; transaction: string } }> | undefined;
    const joined = await transactions.transaction({ role: "hall_api_authenticated", context }, async () => {
      outliving = gate.then(async () => ({ active: transactions.active(), row: await read() }));
      expect(transactions.active()).toBe(true);
      return [await read(), await read()];
    });
    expect(joined[0]).toEqual(joined[1]);
    release();
    const later = await outliving!;
    expect(later.active).toBe(false);
    expect(later.row.transaction).not.toBe(joined[0].transaction);
  });

  // @verifies-requirement HALL-TR-SCH-040
  it("waits for calls started without await before committing the ambient transaction", async () => {
    const backend = "SELECT txid_current()::text AS transaction";
    let unawaited: Promise<string> | undefined;
    const committed = await transactions.transaction({ role: "hall_api_authenticated", context }, async () => {
      const transaction = await transactions.run(
        { role: "hall_api_authenticated", context },
        async (client) => (await client.query<{ transaction: string }>(backend)).rows[0].transaction,
      );
      unawaited = transactions.run({ role: "hall_api_authenticated", context }, async (client) => {
        await client.query("SELECT pg_sleep(0.2)");
        return (await client.query<{ transaction: string }>(backend)).rows[0].transaction;
      });
      return transaction;
    });
    expect(await unawaited).toBe(committed);
  });

  // @verifies-requirement HALL-TR-SCH-040
  it("fails an ambient transaction that PostgreSQL rolled back after a swallowed error", async () => {
    await expect(
      transactions.transaction({ role: "hall_api_authenticated", context }, async () => {
        await transactions
          .run({ role: "hall_api_authenticated", context }, (client) => client.query("SELECT 1 / 0"))
          .catch(() => undefined);
        return "swallowed";
      }),
    ).rejects.toThrow("rolled the transaction back at COMMIT");
  });

  it("sets a closed role and transaction-local call context without leaking either", async () => {
    const sessionIdentity = await pool.query<{ current_user: string }>("SELECT current_user");

    const observed = await transactions.run({ role: "hall_api_authenticated", context }, async (client) => {
      const result = await client.query<{ current_user: string; context: Record<string, unknown> }>(
        "SELECT current_user, hall_api.call_context() AS context",
      );
      return result.rows[0];
    });

    expect(observed).toEqual({
      current_user: "hall_api_authenticated",
      context: {
        requestId: "request-42",
        actorId: "actor-7",
        action: "test.command",
        contactId: null,
        roles: [],
      },
    });
    const after = await pool.query<{ current_user: string; request_id: string | null }>(
      "SELECT current_user, nullif(current_setting('hall.request_id', true), '') AS request_id",
    );
    expect(after.rows[0]).toEqual({ current_user: sessionIdentity.rows[0].current_user, request_id: null });
  });

  it("denies direct runtime access to the private Hall schema", async () => {
    await expect(
      transactions.run({ role: "hall_api_authenticated", context }, async (client) =>
        client.query("SELECT count(*) FROM hall.audit_event"),
      ),
    ).rejects.toMatchObject({ sqlState: "42501" });
  });

  it("rolls back a command when its JSONB projection violates the boundary schema", async () => {
    await pool.query("CREATE TABLE hall.projection_probe (id integer PRIMARY KEY)");
    await pool.query(
      `CREATE FUNCTION hall_api.insert_projection_probe(probe_id integer)
       RETURNS void
       LANGUAGE sql
       SECURITY DEFINER
       SET search_path = pg_catalog, hall
       AS $function$
         INSERT INTO hall.projection_probe (id) VALUES (probe_id)
       $function$`,
    );
    await pool.query("GRANT EXECUTE ON FUNCTION hall_api.insert_projection_probe(integer) TO hall_api_authenticated");

    await expect(
      transactions.run({ role: "hall_api_authenticated", context }, async (client) => {
        await client.query("SELECT hall_api.insert_projection_probe(1)");
        return callJson(client, {
          text: "SELECT jsonb_build_object('accepted', 'not-a-boolean') AS payload",
          schema: z.object({ accepted: z.boolean() }),
        });
      }),
    ).rejects.toBeInstanceOf(ProjectionValidationError);

    const persisted = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM hall.projection_probe");
    expect(persisted.rows[0].count).toBe("0");
  });

  it("commits a successful audit atomically with its command", async () => {
    await pool.query("CREATE TABLE hall.command_probe (id integer PRIMARY KEY)");
    await pool.query(
      `CREATE FUNCTION hall_api.insert_command_probe(probe_id integer)
       RETURNS void
       LANGUAGE sql
       SECURITY DEFINER
       SET search_path = pg_catalog, hall
       AS $function$
         INSERT INTO hall.command_probe (id) VALUES (probe_id)
       $function$`,
    );
    await pool.query("GRANT EXECUTE ON FUNCTION hall_api.insert_command_probe(integer) TO hall_api_authenticated");

    await transactions.run(
      {
        role: "hall_api_authenticated",
        context,
        audit: { targetType: "probe", targetId: "1", outcome: "succeeded", details: { source: "test" } },
      },
      async (client) => client.query("SELECT hall_api.insert_command_probe(1)"),
    );

    const result = await pool.query<{ action: string; target_id: string; outcome: string; details: unknown }>(
      "SELECT action, target_id, outcome, details FROM hall.audit_event",
    );
    expect(result.rows).toEqual([
      { action: "test.command", target_id: "1", outcome: "succeeded", details: { source: "test" } },
    ]);
  });

  it("rolls the audit back when a deferred command invariant fails at commit", async () => {
    await pool.query("CREATE TABLE hall.audit_parent (id integer PRIMARY KEY)");
    await pool.query(
      `CREATE TABLE hall.audit_child (
         id integer PRIMARY KEY,
         parent_id integer NOT NULL REFERENCES hall.audit_parent(id) DEFERRABLE INITIALLY DEFERRED
       )`,
    );
    await pool.query(
      `CREATE FUNCTION hall_api.insert_audit_child(probe_id integer, parent_probe_id integer)
       RETURNS void
       LANGUAGE sql
       SECURITY DEFINER
       SET search_path = pg_catalog, hall
       AS $function$
         INSERT INTO hall.audit_child (id, parent_id) VALUES (probe_id, parent_probe_id)
       $function$`,
    );
    await pool.query(
      "GRANT EXECUTE ON FUNCTION hall_api.insert_audit_child(integer, integer) TO hall_api_authenticated",
    );

    await expect(
      transactions.run(
        {
          role: "hall_api_authenticated",
          context,
          audit: { targetType: "probe", targetId: "2", outcome: "succeeded" },
        },
        async (client) => client.query("SELECT hall_api.insert_audit_child(1, 404)"),
      ),
    ).rejects.toMatchObject({ sqlState: "23503" });

    const audit = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM hall.audit_event");
    expect(audit.rows[0].count).toBe("0");
  });

  it("retries a real serialization SQLSTATE without duplicating the audit", async () => {
    await pool.query("CREATE SEQUENCE hall.retry_attempt_sequence");
    await pool.query(
      `CREATE FUNCTION hall_api.retry_once()
       RETURNS integer
       LANGUAGE plpgsql
       SECURITY DEFINER
       SET search_path = pg_catalog, hall
       AS $function$
       DECLARE
         attempt integer := nextval('hall.retry_attempt_sequence');
       BEGIN
         IF attempt = 1 THEN
           RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'retry once';
         END IF;
         RETURN attempt;
       END
       $function$`,
    );
    await pool.query("GRANT EXECUTE ON FUNCTION hall_api.retry_once() TO hall_api_authenticated");

    const attempt = await transactions.run(
      {
        role: "hall_api_authenticated",
        context,
        audit: { targetType: "retry", targetId: null, outcome: "succeeded" },
      },
      async (client) => {
        const result = await client.query<{ attempt: number }>("SELECT hall_api.retry_once() AS attempt");
        return result.rows[0].attempt;
      },
    );

    expect(attempt).toBe(2);
    const audit = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM hall.audit_event");
    expect(audit.rows[0].count).toBe("1");
  });

  it("preserves native PostgreSQL diagnostics", async () => {
    await pool.query("CREATE TABLE hall.unique_probe (id integer CONSTRAINT unique_probe_id_unique UNIQUE)");
    await pool.query("INSERT INTO hall.unique_probe (id) VALUES (1)");
    await pool.query(
      `CREATE FUNCTION hall_api.insert_unique_probe(probe_id integer)
       RETURNS void
       LANGUAGE sql
       SECURITY DEFINER
       SET search_path = pg_catalog, hall
       AS $function$
         INSERT INTO hall.unique_probe (id) VALUES (probe_id)
       $function$`,
    );
    await pool.query("GRANT EXECUTE ON FUNCTION hall_api.insert_unique_probe(integer) TO hall_api_authenticated");

    const error = await transactions
      .run({ role: "hall_api_authenticated", context }, async (client) =>
        client.query("SELECT hall_api.insert_unique_probe(1)"),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HallPostgresError);
    expect(error).toMatchObject({
      code: "23505",
      sqlState: "23505",
      schema: "hall",
      table: "unique_probe",
      constraint: "unique_probe_id_unique",
    });
  });

  // @verifies-requirement HALL-TR-DST-040
  it("refuses a statement that exceeds its budget with a named timeout and lets a short one pass", async () => {
    const bounded = new PostgresTransactionManager(pool, { interactive: 300, document: 5_000 });

    const refused = await bounded
      .run({ role: "hall_api_authenticated", context }, async (client) => client.query("SELECT pg_sleep(2)"))
      .catch((caught: unknown) => caught);
    expect(refused).toBeInstanceOf(StatementTimeoutError);
    expect(refused).toMatchObject({ sqlState: "57014", budget: "interactive", timeoutMs: 300 });

    const short = await bounded.run({ role: "hall_api_authenticated", context }, async (client) => {
      const result = await client.query<{ timeout: string }>("SELECT current_setting('statement_timeout') AS timeout");
      return result.rows[0].timeout;
    });
    expect(short).toBe("300ms");

    const document = await bounded.run(
      { role: "hall_api_authenticated", context: { ...context, action: "minutes.generate" } },
      async (client) => {
        await client.query("SELECT pg_sleep(0.5)");
        const result = await client.query<{ timeout: string }>(
          "SELECT current_setting('statement_timeout') AS timeout",
        );
        return result.rows[0].timeout;
      },
    );
    expect(document).toBe("5s");
  });

  it("leaves no statement timeout on the pooled connection after the transaction", async () => {
    const single = new Pool({ connectionString: testDatabaseUrl, max: 1 });
    try {
      const bounded = new PostgresTransactionManager(single, { interactive: 300, document: 5_000 });
      const inside = await bounded.run({ role: "hall_api_authenticated", context }, async (client) => {
        const result = await client.query<{ pid: number; timeout: string }>(
          "SELECT pg_backend_pid() AS pid, current_setting('statement_timeout') AS timeout",
        );
        return result.rows[0];
      });
      await bounded
        .run({ role: "hall_api_authenticated", context }, async (client) => client.query("SELECT pg_sleep(2)"))
        .catch(() => undefined);
      const after = await single.query<{ pid: number; timeout: string }>(
        "SELECT pg_backend_pid() AS pid, current_setting('statement_timeout') AS timeout",
      );
      expect(inside.timeout).toBe("300ms");
      expect(after.rows[0]).toEqual({ pid: inside.pid, timeout: "0" });
    } finally {
      await single.end();
    }
  });
});

// @verifies-requirement HALL-TR-DST-040
describe("statement timeout configuration", () => {
  it("reads both budgets from the environment and keeps the defaults otherwise", () => {
    expect(statementTimeoutsFromEnvironment({})).toEqual(defaultStatementTimeouts);
    expect(
      statementTimeoutsFromEnvironment({ HALL_STATEMENT_TIMEOUT_MS: "20000", HALL_DOCUMENT_STATEMENT_TIMEOUT_MS: "0" }),
    ).toEqual({ interactive: 20_000, document: 0 });
    expect(() => statementTimeoutsFromEnvironment({ HALL_STATEMENT_TIMEOUT_MS: "15s" })).toThrow(
      "HALL_STATEMENT_TIMEOUT_MS must be a whole number of milliseconds",
    );
  });
});

// @verifies-requirement HALL-TR-DST-040
describe("statement budgets", () => {
  const documentActions = [
    "meeting.generate-notice",
    "council-business.import-bundle",
    "meeting.record-opening",
    "meeting.close",
    "decision.freeze",
    "minutes.generate",
    "resource.createDocument",
    "resource.replaceDocumentContent",
    "editorAsset.create",
  ];

  it("gives the document budget to exactly the document actions", () => {
    expect([...documentStatementActions].sort()).toEqual([...documentActions].sort());
    for (const action of documentActions) expect(statementBudgetOf(action)).toBe("document");
    for (const action of [
      "meeting.documents.read",
      "meeting.agenda.list",
      "ballot.confirm",
      "resource.readDocumentContent",
    ])
      expect(statementBudgetOf(action)).toBe("interactive");
  });

  it("names actions that the PostgreSQL adapters actually use", async () => {
    const directory = fileURLToPath(new URL("../src/", import.meta.url));
    const sources = (
      await Promise.all(
        (
          await readdir(directory)
        )
          .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "transaction.ts")
          .map((name) => readFile(join(directory, name), "utf8")),
      )
    ).join("\n");
    for (const action of documentActions) expect(sources, action).toContain(`"${action}"`);
  });
});
