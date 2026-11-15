import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { makePdf } from "./files.mjs";

/**
 * The seed API client. On a server without development access and without any account,
 * signInAsFirstAdministrator creates the first administrator and the seed then runs as them.
 * `signIn` returns a client that acts as another account of the dataset.
 */
export function createSeedApi(baseUrl, session = {}) {
  function unwrapRepresentation(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.class)) return payload;
    if (Array.isArray(payload.properties?.items)) return payload.properties.items;
    if (payload.class.some((name) => name.endsWith("-collection")) && Array.isArray(payload.entities)) {
      return payload.entities.map((entity) => entity.properties);
    }
    return payload.properties ?? payload;
  }

  let sessionCookie = session.sessionCookie ?? null;
  let signedInEmail = session.email ?? null;

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
  const remove = (path) => request("DELETE", path);

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

  async function uploadFile({ title, file, folderPath = "", tags = [] }) {
    return uploadDocument({
      title,
      fileName: basename(fileURLToPath(file)),
      folderPath,
      tags,
      content: readFileSync(file),
      mediaType: mediaTypeOf(fileURLToPath(file)),
    });
  }

  async function uploadEditorAsset({ ownerId, title, fileName, content, mediaType }) {
    const form = new FormData();
    form.set("ownerKind", "textResourceContent");
    form.set("ownerId", ownerId);
    form.set("title", title);
    form.set("file", new File([content], fileName, { type: mediaType }));
    return request("POST", "/resources/editor-assets", form);
  }

  async function updateText(resourceId, build) {
    const current = await get(`/resources/${resourceId}`);
    return put(`/resources/${resourceId}/content`, {
      kind: "text",
      expectedVersion: current.version,
      content: typeof build === "function" ? build(current.content) : build,
    });
  }

  async function updateFolder(fullPath, { color, tags = [] }) {
    const folder = (await get("/resources/catalog")).find(
      (resource) => resource.kind === "folder" && resource.fullPath === fullPath,
    );
    if (!folder) throw new Error(`Dossier introuvable : ${fullPath}`);
    return patch(`/resources/${folder.id}/metadata`, {
      path: folder.path,
      name: folder.name,
      tags,
      ...(color ? { color } : {}),
      editing: { kind: "fixed" },
    });
  }

  async function importGeographicLayer({ name, path = "", fileName, content, geographicResourceId }) {
    const form = new FormData();
    form.set("name", name);
    form.set("path", path);
    if (geographicResourceId) form.set("geographicResourceId", geographicResourceId);
    form.set("file", new File([content], fileName, { type: "application/geo+json" }));
    return request("POST", "/resources/geographic-layers/import", form);
  }

  async function importMunicipalProperty({ label, list }) {
    const form = new FormData();
    form.set("label", label);
    form.set("list", list);
    return request("POST", "/resources/geographic-layers/municipal-property/import", form);
  }

  async function createDrawingNote(mapId, elementId) {
    return post(`/resources/${mapId}/feature-notes`, { elementId });
  }

  async function signIn(email, password) {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(`POST /auth/login -> ${response.status} ${await response.text()}`);
    const cookie = response.headers.get("set-cookie");
    if (!cookie) throw new Error(`POST /auth/login n’a pas ouvert de session pour ${email}`);
    return createSeedApi(baseUrl, { sessionCookie: cookie.split(";", 1)[0], email });
  }

  return {
    baseUrl,
    get,
    signInAsFirstAdministrator,
    get signedInEmail() {
      return signedInEmail;
    },
    post,
    put,
    patch,
    remove,
    createWorkspaceResource,
    createGeographicResource,
    uploadDocument,
    uploadPdf,
    uploadFile,
    uploadEditorAsset,
    updateText,
    updateFolder,
    importSpreadsheet,
    importGeographicLayer,
    importMunicipalProperty,
    createDrawingNote,
    signIn,
  };
}

const mediaTypes = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".geojson": "application/geo+json",
};
export function mediaTypeOf(path) {
  const type = mediaTypes[extname(path).toLowerCase()];
  if (!type) throw new Error(`Type de fichier non pris en charge par le chargeur : ${path}`);
  return type;
}
