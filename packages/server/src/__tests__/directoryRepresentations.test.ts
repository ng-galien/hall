import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { startLocalHttpServer } from "../core/localServer.js";

it("serves contact-based committees and external representations with global unique council ranks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-directory-representations-"));
  const server = await startLocalHttpServer({ dataDirectory: directory });
  try {
    let cookie = "";
    const call = async (path: string, method = "GET", body?: unknown, expected = 200) => {
      const response = await fetch(`${server.url}/api${path}`, {
        method,
        headers: { origin: server.url, cookie, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie")!.split(";", 1)[0];
      const value = await response.json();
      expect(response.status, JSON.stringify(value)).toBe(expected);
      return value;
    };
    await call(
      "/auth/bootstrap",
      "POST",
      { email: "admin@test.fr", displayName: "Admin", password: "Admin-test-password-2026!" },
      201,
    );
    await call("/council-terms", "PUT", { expectedMemberCount: 8 });
    const contacts: { id: string }[] = [];
    for (const name of ["Mayor", "Deputy", "Councillor", "External", "CandidateOne", "CandidateTwo", "Later"]) {
      contacts.push((await call("/contacts", "POST", { firstName: name, lastName: "Test" }, 201)).properties);
    }
    const createMember = (index: number, role: string, rank: number | null, expected = 201) =>
      call(
        "/council-members",
        "POST",
        { contactId: contacts[index].id, role, rank, termStartedOn: "2026-03-20" },
        expected,
      );
    const mayor = (await createMember(0, "mayor", 0)).properties;
    const deputy = (await createMember(1, "deputyMayor", 1)).properties;
    const ordinary = (await createMember(2, "councillor", null)).properties;
    expect([mayor.rank, deputy.rank, ordinary.rank]).toEqual([0, 1, null]);
    await createMember(4, "councillor", 1, 409);
    await call(
      `/council-members/${mayor.id}`,
      "PUT",
      { role: "mayor", rank: 1, termStartedOn: "2026-03-20", termEndedOn: null },
      409,
    );
    const kept = await call(`/council-members/${mayor.id}`, "PUT", {
      role: "mayor",
      termStartedOn: "2026-03-20",
      termEndedOn: null,
    });
    expect(kept.properties.rank).toBe(0);
    const results = await Promise.all(
      [4, 5].map(async (index) => {
        const response = await fetch(`${server.url}/api/council-members`, {
          method: "POST",
          headers: { origin: server.url, cookie, "content-type": "application/json" },
          body: JSON.stringify({
            contactId: contacts[index].id,
            role: "councillor",
            rank: 2,
            termStartedOn: "2026-03-20",
          }),
        });
        return response.status;
      }),
    );
    expect(results.sort()).toEqual([201, 409]);
    const committee = (await call("/council-committees", "POST", { name: "Internal", description: "Contacts" }, 201))
      .properties;
    const internal = (
      await call(
        `/council-committees/${committee.id}/memberships`,
        "POST",
        { contactId: contacts[3].id, role: "member", startedOn: "2020-01-01" },
        201,
      )
    ).properties;
    expect(internal.contactId).toBe(contacts[3].id);
    expect(internal).not.toHaveProperty("councilMemberId");
    const elected = (
      await call(
        `/council-committees/${committee.id}/memberships`,
        "POST",
        { contactId: contacts[2].id, role: "member", startedOn: "2020-01-01" },
        201,
      )
    ).properties;
    await call(`/council-members/${ordinary.id}`, "PUT", {
      role: "councillor",
      rank: null,
      termStartedOn: "2026-03-20",
      termEndedOn: "2026-09-01",
    });
    expect((await call(`/council-committees/${committee.id}/memberships/${elected.id}`)).properties.endedOn).toBeNull();
    for (const [index, role] of [
      [0, "rapporteur"],
      [1, "primary"],
      [6, "alternate"],
    ] as const) {
      const membership = (
        await call(
          `/council-committees/${committee.id}/memberships`,
          "POST",
          { contactId: contacts[index].id, role, startedOn: "2026-03-20" },
          201,
        )
      ).properties;
      expect((await call(`/council-committees/${committee.id}/memberships/${membership.id}`)).properties.role).toBe(
        role,
      );
      const updated = await call(`/council-committees/${committee.id}/memberships/${membership.id}`, "PUT", {
        role,
        startedOn: "2026-03-21",
        endedOn: null,
      });
      expect(updated.properties.role).toBe(role);
    }
    const delegationResponse = await call(
      "/council-delegations",
      "POST",
      { name: "External body", description: "Representation" },
      201,
    );
    const delegation = delegationResponse.properties;
    expect(delegationResponse.actions.map((action: { name: string }) => action.name)).toContain(
      "delegation.add-membership",
    );
    const memberships = [];
    for (const [index, role] of [
      [0, "primary"],
      [3, "primary"],
      [1, "alternate"],
      [2, "alternate"],
    ] as const)
      memberships.push(
        (
          await call(
            `/council-delegations/${delegation.id}/memberships`,
            "POST",
            { contactId: contacts[index].id, role, startedOn: "2020-01-01" },
            201,
          )
        ).properties,
      );
    expect((await call(`/council-delegations/${delegation.id}/memberships`)).entities).toHaveLength(4);
    await call(
      `/council-delegations/${delegation.id}/memberships`,
      "POST",
      { contactId: contacts[0].id, role: "alternate", startedOn: "2026-01-01" },
      409,
    );
    await call(
      `/council-delegations/${delegation.id}/memberships`,
      "POST",
      { contactId: "00000000-0000-4000-8000-000000000001", role: "primary", startedOn: "2026-01-01" },
      404,
    );
    const changed = await call(`/council-delegations/${delegation.id}/memberships/${memberships[0].id}`, "PUT", {
      role: "alternate",
      startedOn: "2020-01-01",
      endedOn: null,
    });
    expect(changed.properties.role).toBe("alternate");
    await call(`/council-delegations/${delegation.id}/memberships/${memberships[0].id}/end`, "POST", {
      endedOn: "2025-01-01",
    });
    await call(`/council-delegations/${delegation.id}/archive`, "POST", {});
    expect((await call(`/council-delegations/${delegation.id}`)).properties.archivedAt).not.toBeNull();
    await server.close();
    const db = new PGlite(directory);
    try {
      expect(
        (await db.query("SELECT action FROM hall.audit_event WHERE action='delegation.create'")).rows,
      ).toHaveLength(1);
      await db.exec(`INSERT INTO hall.council_term(id,expected_member_count,started_on,ended_on)
        VALUES ('00000000-0000-4000-8000-000000000002',8,'2020-01-01','2025-01-01');`);
      await db.query(
        `INSERT INTO hall.council_member(contact,council_term,role,rank,term_started_on,term_ended_on)
        VALUES ($1,'00000000-0000-4000-8000-000000000002','councillor',0,'2020-01-01','2025-01-01')`,
        [contacts[6].id],
      );
      expect((await db.query("SELECT count(*)::integer AS count FROM hall.council_member WHERE rank=0")).rows).toEqual([
        { count: 2 },
      ]);
    } finally {
      await db.close();
    }
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
