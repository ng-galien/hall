import { expect, it } from "vitest";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("purge of expired sessions and finished password links", () => {
  const pool = createTestPool();
  useFreshHallDatabase(pool);

  async function account(email: string): Promise<string> {
    return (
      await pool.query<{ id: string }>(
        "SELECT hall_api.create_app_user($1, 'Compte', 'hash', NULL, ARRAY['contributor']) ->> 'id' AS id",
        [email],
      )
    ).rows[0].id;
  }

  async function tokenHashes(table: "app_session" | "account_password_link"): Promise<string[]> {
    return (
      await pool.query<{ token_hash: string }>(`SELECT token_hash FROM hall.${table} ORDER BY token_hash`)
    ).rows.map(({ token_hash }) => token_hash);
  }

  // @verifies-requirement HALL-TR-SCH-030
  it("opening a session deletes the expired sessions of every account and keeps the valid ones", async () => {
    const first = await account("premier@example.test");
    const second = await account("second@example.test");
    await pool.query(
      `INSERT INTO hall.app_session (user_id, token_hash, created_at, expires_at) VALUES
        ($1, 'expired-first', now() - interval '20 days', now() - interval '1 second'),
        ($2, 'expired-second', now() - interval '20 days', now() - interval '6 days'),
        ($1, 'valid-first', now() - interval '1 day', now() + interval '1 minute'),
        ($2, 'valid-second', now(), now() + interval '13 days')`,
      [first, second],
    );

    await pool.query("SELECT hall_api.create_app_session($1, 'new-session', now() + interval '14 days')", [first]);

    expect(await tokenHashes("app_session")).toEqual(["new-session", "valid-first", "valid-second"]);
    expect(
      (await pool.query("SELECT hall_api.find_app_session('valid-second') ->> 'user_id' AS user_id")).rows[0].user_id,
    ).toBe(second);
  });

  // @verifies-requirement HALL-FR-USR-080
  it("issuing a link deletes the used, superseded and expired links of every account issued over an hour before", async () => {
    const first = await account("premier@example.test");
    const second = await account("second@example.test");
    const issued = "2026-11-12T12:00:00Z";
    await pool.query(
      `INSERT INTO hall.account_password_link (user_id, purpose, token_hash, issued_at, expires_at, ended_at) VALUES
        ($1, 'recovery', 'used-old', $3::timestamptz - interval '3 hours', $3::timestamptz - interval '2 hours',
          $3::timestamptz - interval '170 minutes'),
        ($2, 'recovery', 'expired-old', $3::timestamptz - interval '2 hours', $3::timestamptz - interval '1 hour', NULL),
        ($2, 'invitation', 'superseded-old', $3::timestamptz - interval '2 days', $3::timestamptz + interval '5 days',
          $3::timestamptz - interval '1 day'),
        ($1, 'recovery', 'used-recent', $3::timestamptz - interval '20 minutes', $3::timestamptz + interval '40 minutes',
          $3::timestamptz - interval '10 minutes'),
        ($2, 'invitation', 'open-invitation', $3::timestamptz - interval '3 days', $3::timestamptz + interval '4 days', NULL)`,
      [first, second, issued],
    );

    expect(
      (
        await pool.query("SELECT hall_api.issue_account_password_link($1, 'recovery', 'new-link', $2) ->> 'outcome' AS outcome", [
          first,
          issued,
        ])
      ).rows[0].outcome,
    ).toBe("issued");

    // A finished link issued within the hour stays counted by the limit of three links per hour.
    expect(await tokenHashes("account_password_link")).toEqual(["new-link", "open-invitation", "used-recent"]);
    expect(
      (
        await pool.query("SELECT hall_api.open_account_password_link('open-invitation', $1) ->> 'user_id' AS id", [
          issued,
        ])
      ).rows[0].id,
    ).toBe(second);
  });
});
