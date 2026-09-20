import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { startLocalHttpServer } from "../core/localServer.js";

it("allows deletion from one editable business but refuses a shared document until dissociated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-document-delete-"));
  const server = await startLocalHttpServer({ dataDirectory: directory });
  try {
    const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
      method: "POST",
      headers: { origin: server.url, "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@delete.test",
        displayName: "Admin",
        password: "Delete-test-password-2026!",
      }),
    });
    expect(bootstrap.status).toBe(201);
    const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
    const call = (path: string, method = "GET", body?: unknown) =>
      fetch(`${server.url}/api${path}`, {
        method,
        headers: { cookie, origin: server.url, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const form = new FormData();
    form.set("file", new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "piece.pdf");
    form.set("path", "seed");
    const upload = await fetch(`${server.url}/api/resources/documents`, {
      method: "POST",
      headers: { cookie, origin: server.url },
      body: form,
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    const id = (await upload.json()).properties.id;
    const names = (entity: { actions?: { name: string }[] }) => (entity.actions ?? []).map((action) => action.name);
    expect(names(await (await call(`/resources/${id}`)).json())).toContain("resource.delete");
    const created = await call("/council-business", "POST", {
      path: "seed",
      name: "Affaire",
      reportName: "Rapport",
      reportContent: "Rapport",
    });
    expect(created.status).toBe(201);
    const businessId = (await created.json()).properties.id;
    expect((await call(`/council-business/${businessId}/resources`, "POST", { resourceId: id })).status).toBe(201);
    expect(names(await (await call(`/resources/${id}`)).json())).toContain("resource.delete");
    const second = await call("/council-business", "POST", {
      path: "seed",
      name: "Autre affaire",
      reportName: "Rapport",
      reportContent: "Rapport",
    });
    expect(second.status).toBe(201);
    const secondBusinessId = (await second.json()).properties.id;
    expect((await call(`/council-business/${secondBusinessId}/resources`, "POST", { resourceId: id })).status).toBe(
      201,
    );
    expect(names(await (await call(`/resources/${id}`)).json())).not.toContain("resource.delete");
    expect((await call(`/resources/${id}`, "DELETE")).status).toBe(409);
    expect((await call(`/resources/${id}`)).status).toBe(200);
    expect(
      (await call(`/council-business/${secondBusinessId}/resources/dissociate`, "POST", { resourceId: id })).status,
    ).toBe(200);
    expect(names(await (await call(`/resources/${id}`)).json())).toContain("resource.delete");
    expect((await call(`/resources/${id}`, "DELETE")).status).toBe(204);
    expect((await call(`/resources/${id}`)).status).toBe(404);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
