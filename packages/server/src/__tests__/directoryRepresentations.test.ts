import { expect, it } from "vitest";
import { createPostgresHttpTestServer, createTestServer, domainBody } from "./testServer.js";

// @verifies-requirement HALL-FR-DIR-120
// @verifies-requirement HALL-FR-DIR-140
it("keeps dated contact memberships readable after committee and representation updates and closure", async () => {
  const { rawAgent } = await createTestServer();
  const contact = domainBody(
    await rawAgent.post("/api/contacts").send({ firstName: "Camille", lastName: "Externe" }).expect(201),
  );
  for (const [collection, role] of [
    ["council-committees", "member"],
    ["council-delegations", "primary"],
  ] as const) {
    const base = `/api/${collection}`;
    const entity = domainBody(
      await rawAgent.post(base).send({ name: "Instance", description: "Initiale" }).expect(201),
    );
    const path = `${base}/${entity.id}`;
    expect(
      domainBody(await rawAgent.put(path).send({ name: "Instance renommée", description: "Actualisée" }).expect(200)),
    ).toMatchObject({ name: "Instance renommée", description: "Actualisée" });
    const membership = domainBody(
      await rawAgent
        .post(`${path}/memberships`)
        .send({ contactId: contact.id, role, startedOn: "2026-01-01" })
        .expect(201),
    );
    expect(domainBody(await rawAgent.get(`${path}/memberships/${membership.id}`).expect(200))).toMatchObject({
      contactId: contact.id,
      endedOn: null,
    });
    await rawAgent.post(`${path}/memberships/${membership.id}/end`).send({ endedOn: "2026-05-01" }).expect(200);
    expect(domainBody(await rawAgent.get(`${path}/memberships/${membership.id}`).expect(200)).endedOn).toBe(
      "2026-05-01",
    );
    const next = domainBody(
      await rawAgent
        .post(`${path}/memberships`)
        .send({ contactId: contact.id, role, startedOn: "2026-06-01" })
        .expect(201),
    );
    await rawAgent.post(`${path}/archive`).send({}).expect(200);
    expect(domainBody(await rawAgent.get(`${path}/memberships/${next.id}`).expect(200)).endedOn).not.toBeNull();
    expect(domainBody(await rawAgent.get(base).expect(200))).toEqual([]);
    expect(domainBody(await rawAgent.get(`${base}?includeArchived=true`).expect(200))).toEqual([
      expect.objectContaining({ id: entity.id, name: "Instance renommée" }),
    ]);
    const missing = "00000000-0000-4000-8000-000000000098";
    await rawAgent.get(`${base}/${missing}`).expect(404);
    await rawAgent.get(`${path}/memberships/${missing}`).expect(404);
  }
});

it("serves contact-based committees and external representations with global unique council ranks", async () => {
  const server = await createPostgresHttpTestServer({ devAutoLogin: false });
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
  await createMember(5, "councillor", 2);
  await createMember(4, "councillor", 2, 409);
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
    expect((await call(`/council-committees/${committee.id}/memberships/${membership.id}`)).properties.role).toBe(role);
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
  expect(
    (await server.pool.query("SELECT action FROM hall.audit_event WHERE action='delegation.create'")).rows,
  ).toHaveLength(1);
  await server.pool.query(`INSERT INTO hall.council_term(id,expected_member_count,started_on,ended_on)
      VALUES ('00000000-0000-4000-8000-000000000002',8,'2020-01-01','2025-01-01');`);
  await server.pool.query(
    `INSERT INTO hall.council_member(contact,council_term,role,rank,term_started_on,term_ended_on)
      VALUES ($1,'00000000-0000-4000-8000-000000000002','councillor',0,'2020-01-01','2025-01-01')`,
    [contacts[6].id],
  );
  expect(
    (await server.pool.query("SELECT count(*)::integer AS count FROM hall.council_member WHERE rank=0")).rows,
  ).toEqual([{ count: 2 }]);
}, 30000);

it("preserves contact edits and archive visibility through real HTTP clients", async () => {
  const { rawAgent } = await createTestServer();
  const contact = domainBody(
    await rawAgent.post("/api/contacts").send({ firstName: "Élise", lastName: "Test" }).expect(201),
  );
  const url = `/api/contacts/${contact.id}`;
  expect(domainBody(await rawAgent.get(url).expect(200))).toMatchObject({ firstName: "Élise", archivedAt: null });
  const input = { firstName: "Élise", lastName: "Updated", email: "ELISE@example.fr", notes: "Contact conservé" };
  expect(domainBody(await rawAgent.put(url).send(input).expect(200))).toMatchObject({
    lastName: "Updated",
    email: "elise@example.fr",
  });
  expect(domainBody(await rawAgent.get(url).expect(200)).notes).toBe("Contact conservé");
  expect(domainBody(await rawAgent.post(`${url}/archive`).send({}).expect(200)).archivedAt).not.toBeNull();
  expect(domainBody(await rawAgent.get("/api/contacts").expect(200))).toEqual([]);
  expect(domainBody(await rawAgent.get("/api/contacts?includeArchived=true").expect(200))).toEqual([
    expect.objectContaining({ id: contact.id, lastName: "Updated" }),
  ]);
  await rawAgent.put(url).send(input).expect(409);
  await rawAgent.get("/api/contacts/00000000-0000-4000-8000-000000000099").expect(404);
});

it("retrieves the configured council term and preserves an active mandate when archive is refused", async () => {
  const { rawAgent } = await createTestServer({ expectedCouncilMemberCount: null });
  expect(domainBody(await rawAgent.get("/api/council-terms").expect(200))).toEqual([]);
  const term = domainBody(await rawAgent.put("/api/council-terms").send({ expectedMemberCount: 2 }).expect(200));
  expect(domainBody(await rawAgent.get("/api/council-terms").expect(200))).toEqual([term]);
  const contact = domainBody(
    await rawAgent.post("/api/contacts").send({ firstName: "Mayor", lastName: "Test" }).expect(201),
  );
  await rawAgent
    .post("/api/council-members")
    .send({ contactId: contact.id, role: "mayor", termStartedOn: "2026-03-22" })
    .expect(201);
  const representation = await rawAgent.get(`/api/contacts/${contact.id}`).expect(200);
  expect(representation.body.actions.map((action: { name: string }) => action.name)).not.toContain("contact.archive");
  await rawAgent.post(`/api/contacts/${contact.id}/archive`).send({}).expect(409);
  expect(domainBody(await rawAgent.get(`/api/contacts/${contact.id}`).expect(200)).archivedAt).toBeNull();
  await rawAgent.put("/api/council-terms").send({ expectedMemberCount: 0 }).expect(400);
  expect(domainBody(await rawAgent.get("/api/council-terms").expect(200))).toEqual([term]);
});
