import { expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

const administrator = { email: "admin@example.fr", displayName: "Admin", password: "Admin-password-2026!" };
const managerPassword = "Manager-password-2026!";

type Action = { name: string; fields?: Array<{ name: string; options?: Array<{ value: string }> }> };
const offeredRoles = (actions: Action[] | undefined, name: string) =>
  actions
    ?.find((action) => action.name === name)
    ?.fields?.find((field) => field.name === "roles")
    ?.options?.map((option) => option.value);

// @verifies-requirement HALL-FR-USR-110
it("lets only an administrator give or withdraw the administrator role", async () => {
  const { rawAgent } = await createTestServer({ devAutoLogin: false });
  await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);
  const secondAdministrator = await rawAgent
    .post("/api/users")
    .send({
      email: "second-admin@example.fr",
      displayName: "Second administrator",
      password: "Second-admin-password-2026!",
      roles: ["administrator"],
      contactId: null,
    })
    .expect(201);
  const administratorId: string = secondAdministrator.body.properties.id;
  const role = await rawAgent
    .post("/api/roles")
    .send({
      name: "Gestion des comptes",
      revision: 0,
      grants: [
        { access: "read", condition: "always" },
        { access: "user.list", condition: "always" },
        { access: "user.manage", condition: "always" },
      ],
    })
    .expect(201);
  const managerRole: string = role.body.id ?? role.body.properties.id;
  const manager = await rawAgent
    .post("/api/users")
    .send({
      email: "manager@example.fr",
      displayName: "Manager",
      password: managerPassword,
      roles: [managerRole],
      contactId: null,
    })
    .expect(201);
  const managerId: string = manager.body.properties.id;
  const administratorUsers = await rawAgent.get("/api/users").expect(200);
  expect(offeredRoles(administratorUsers.body.actions, "user.create")).toContain("administrator");

  const signIn = async (email: string, password: string) => {
    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent.post("/api/auth/login").send({ email, password }).expect(200);
  };
  await signIn("manager@example.fr", managerPassword);
  const managerAgent = rawAgent;

  const users = await managerAgent.get("/api/users").expect(200);
  const creatable = offeredRoles(users.body.actions, "user.create");
  expect(creatable).toEqual(expect.arrayContaining(["clerk", "contributor", managerRole]));
  expect(creatable).not.toContain("administrator");
  const administratorAccount = await managerAgent.get(`/api/users/${administratorId}`).expect(200);
  expect(offeredRoles(administratorAccount.body.actions, "user.assign-role")).not.toContain("administrator");

  const refusedCreation = await managerAgent
    .post("/api/users")
    .send({
      email: "self-made@example.fr",
      displayName: "Self made",
      password: "Self-made-password-2026!",
      roles: ["administrator"],
      contactId: null,
    })
    .expect(403);
  expect(refusedCreation.body.code).toBe("administrator_role_requires_administrator");
  const refusedSelfPromotion = await managerAgent
    .put(`/api/users/${managerId}/roles`)
    .send({ roles: [managerRole, "administrator"] })
    .expect(403);
  expect(refusedSelfPromotion.body.code).toBe("administrator_role_requires_administrator");
  const refusedWithdrawal = await managerAgent
    .put(`/api/users/${administratorId}/roles`)
    .send({ roles: ["clerk"] })
    .expect(403);
  expect(refusedWithdrawal.body.code).toBe("administrator_role_requires_administrator");
  expect((await managerAgent.get(`/api/users/${administratorId}`).expect(200)).body.properties.roles).toEqual([
    "administrator",
  ]);
  expect((await managerAgent.get(`/api/users/${managerId}`).expect(200)).body.properties.roles).toEqual([managerRole]);
  expect(
    (await managerAgent.get("/api/users").expect(200)).body.entities.map(
      (entity: { properties: { email: string } }) => entity.properties.email,
    ),
  ).not.toContain("self-made@example.fr");

  const created = await managerAgent
    .post("/api/users")
    .send({
      email: "contributor@example.fr",
      displayName: "Contributor",
      password: "Contributor-password-2026!",
      roles: ["contributor"],
      contactId: null,
    })
    .expect(201);
  await managerAgent
    .put(`/api/users/${created.body.properties.id}/roles`)
    .send({ roles: ["clerk"] })
    .expect(200);
  await managerAgent
    .put(`/api/users/${administratorId}/roles`)
    .send({ roles: ["administrator", "clerk"] })
    .expect(200);

  await signIn(administrator.email, administrator.password);
  await rawAgent
    .put(`/api/users/${managerId}/roles`)
    .send({ roles: [managerRole, "administrator"] })
    .expect(200);
  await rawAgent
    .put(`/api/users/${managerId}/roles`)
    .send({ roles: [managerRole] })
    .expect(200);
});
