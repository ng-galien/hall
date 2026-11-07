import { describe, expect, it, vi } from "vitest";
import { isSafeExternalUrl } from "../../desktop/src/externalUrl.js";
import { createTestServer, domainBody } from "../src/__tests__/testServer.js";
import { requestHostAllowed } from "../src/api/accessControl.js";

const admin = { email: "admin@example.test", displayName: "Admin", password: "Password-long-2026!" };

describe("review security corrections", () => {
  it("rejects rebinding and forwarded automatic administrator access", async () => {
    const { rawAgent } = await createTestServer();
    await rawAgent.get("/api/auth/session").set("Host", "attacker.example:3100").expect(403);
    await rawAgent.get("/api/auth/session").set("X-Forwarded-For", "100.1.2.3").expect(403);
    await rawAgent.get("/api/auth/session").expect(200);
    expect(
      requestHostAllowed(
        { host: "attacker.example", origin: "http://attacker.example" },
        { host: "127.0.0.1", port: 3100, database: { kind: "postgres", url: "test" }, devAutoLogin: true },
      ),
    ).toBe(false);
  });
  it("requires the setup token for proxied loopback installation", async () => {
    const token = "setup-token-at-least-24-characters";
    const { rawAgent } = await createTestServer({
      devAutoLogin: false,
      config: { behindTlsProxy: true, bootstrapToken: token },
    });
    expect(domainBody(await rawAgent.get("/api/auth/status").expect(200))).toMatchObject({
      bootstrapTokenRequired: true,
    });
    await rawAgent.post("/api/auth/bootstrap").send(admin).expect(403);
    await rawAgent
      .post("/api/auth/bootstrap")
      .send({ ...admin, setupToken: token })
      .expect(201);
  });
  it("does not allow a forwarded bootstrap without configured token", async () => {
    const { rawAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").set("Forwarded", "for=100.1.2.3").send(admin).expect(403);
  });
  it("reports failed database checks instead of a healthy service", async () => {
    const { rawAgent, container } = await createTestServer({ config: { version: "candidate:test" } });
    expect((await rawAgent.get("/api/health").expect(200)).body).toEqual({ status: "ok", version: "candidate:test" });
    vi.spyOn(container.cradle.postgresClient, "health").mockRejectedValueOnce(new Error("unreachable"));
    expect((await rawAgent.get("/api/health").expect(503)).body).toEqual({
      status: "unavailable",
      version: "candidate:test",
    });
  });
  it("preserves UTF-8 multipart filenames", async () => {
    const { rawAgent } = await createTestServer();
    const name = "TRUST — Corpus · été.pdf";
    const response = await rawAgent
      .post("/api/resources/documents")
      .attach("file", Buffer.from("%PDF-1.7\ncontent"), { filename: name, contentType: "application/pdf" })
      .expect(201);
    expect(domainBody(response).name).toBe(name);
  });
  it("rejects unsafe remote-resource protocols at the HTTP boundary", async () => {
    const { rawAgent } = await createTestServer();
    for (const url of ["file://server/share", "search-ms:query=secret", "javascript:alert(1)"]) {
      await rawAgent
        .post("/api/resources")
        .send({ kind: "remote", path: "", name: "Unsafe", target: { kind: "url", url } })
        .expect(400);
    }
    await rawAgent
      .post("/api/resources")
      .send({ kind: "remote", path: "", name: "Safe", target: { kind: "url", url: "https://example.com" } })
      .expect(201);
  });
  it("publishes security headers without blocking the same-origin native document viewer", async () => {
    const { rawAgent } = await createTestServer();
    const response = await rawAgent.get("/api/health").expect(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("same-origin");
    expect(response.headers["content-security-policy"]).toContain("object-src 'self' blob:");
  });
  it.each([
    "file://server/share",
    "search-ms:query=secret",
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://user:pass@example.com",
  ])("refuses external desktop URL %s", (value) => expect(isSafeExternalUrl(value)).toBe(false));
  it.each(["https://example.com/path", "http://localhost:3100", "mailto:mairie@example.fr"])(
    "allows documented external URL %s",
    (value) => expect(isSafeExternalUrl(value)).toBe(true),
  );
});
