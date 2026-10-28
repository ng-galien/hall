import { makePdf } from "./files.mjs";

/**
 * The seed API client. On a server without development access and without any account,
 * signInAsFirstAdministrator creates the first administrator and the seed then runs as them.
 */
export function createSeedApi(baseUrl) {
  function unwrapRepresentation(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.class)) return payload;
    if (Array.isArray(payload.properties?.items)) return payload.properties.items;
    if (payload.class.some((name) => name.endsWith("-collection")) && Array.isArray(payload.entities)) {
      return payload.entities.map((entity) => entity.properties);
    }
    return payload.properties ?? payload;
  }

  let sessionCookie = null;
  let signedInEmail = null;

  async function request(method, path, body) {
    const init = { method, headers: sessionCookie ? { Cookie: sessionCookie } : {} };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : unwrapRepresentation(await response.json());
  }
  const get = (path) => request("GET", path);

  async function signInAsFirstAdministrator(administrator, password) {
    const status = await get("/auth/status");
    if (status.developmentAccess || !status.bootstrapRequired) return false;
    const response = await fetch(`${baseUrl}/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...administrator, password }),
    });
    if (!response.ok) throw new Error(`POST /auth/bootstrap -> ${response.status} ${await response.text()}`);
    const cookie = response.headers.get("set-cookie");
    if (!cookie) throw new Error("POST /auth/bootstrap n’a pas ouvert de session");
    sessionCookie = cookie.split(";", 1)[0];
    signedInEmail = administrator.email;
    return true;
  }
  const post = (path, body) => request("POST", path, body);
  const put = (path, body) => request("PUT", path, body);
  const patch = (path, body) => request("PATCH", path, body);

  async function setResourceTags(resource, tags) {
    if (tags.length === 0) return resource;
    const editable = ["text", "remote", "spreadsheet", "geographic", "event"].includes(resource.kind);
    return patch(`/resources/${resource.id}/metadata`, {
      path: resource.path,
      name: resource.name,
      tags,
      editing: editable ? { kind: "autosave", enabled: resource.autosaveEnabled } : { kind: "fixed" },
    });
  }

  async function createWorkspaceResource(input, tags = []) {
    return setResourceTags(await post("/resources", input), tags);
  }

  async function createGeographicResource({ name, path, tags = [], view, layers, hallLayer }) {
    const created = await createWorkspaceResource({ kind: "geographic", name, path }, tags);
    if (!view && !layers && !hallLayer) return created;
    return put(`/resources/${created.id}/content`, {
      kind: "geographic",
      expectedVersion: created.version,
      document: {
        ...created.document,
        ...(view ? { view } : {}),
        ...(layers ? { layers } : {}),
        ...(hallLayer ? { hallLayer } : {}),
      },
    });
  }

  async function uploadDocument({ title, fileName, folderPath = "", tags = [], content, mediaType }) {
    const form = new FormData();
    form.set("name", title);
    form.set("path", folderPath);
    form.set("file", new File([content], fileName, { type: mediaType }));
    return setResourceTags(await request("POST", "/resources/documents", form), tags);
  }

  async function importSpreadsheet({ title, fileName, folderPath = "", content, mediaType }) {
    const form = new FormData();
    form.set("name", title);
    form.set("path", folderPath);
    form.set("file", new File([content], fileName, { type: mediaType }));
    return request("POST", "/resources/spreadsheets/import", form);
  }

  async function uploadPdf({ title, fileName, folderPath = "", tags = [], lines }) {
    return uploadDocument({
      title,
      fileName,
      folderPath,
      tags,
      content: makePdf(title, lines),
      mediaType: "application/pdf",
    });
  }

  return {
    get,
    signInAsFirstAdministrator,
    get signedInEmail() {
      return signedInEmail;
    },
    post,
    put,
    patch,
    createWorkspaceResource,
    createGeographicResource,
    uploadDocument,
    uploadPdf,
    importSpreadsheet,
  };
}
