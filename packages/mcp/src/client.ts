import { sirenActionSchema } from "@hall/api-contract";
import { z } from "zod";
import { describeAction, type HallAction, hallActions } from "./actions.js";

const representationSchema = z.object({ actions: z.array(sirenActionSchema).optional() }).passthrough();
export const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  base64: z.string().max(34952536),
  mediaType: z.string().default("application/octet-stream"),
});
export type Upload = z.infer<typeof uploadSchema>;
const maximumBytes = 25 * 1024 * 1024;

export class WorkspaceClient {
  private readonly base: URL;
  constructor(
    baseUrl: string,
    private readonly session?: string,
    allowInternalHttp = false,
  ) {
    this.base = new URL(baseUrl);
    if (this.base.username || this.base.password || this.base.pathname !== "/" || this.base.search || this.base.hash)
      throw new Error("HALL_URL must be an origin without credentials or path");
    if (
      this.base.protocol !== "https:" &&
      !(allowInternalHttp && this.base.protocol === "http:") &&
      !(this.base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(this.base.hostname))
    )
      throw new Error("Hall requires HTTPS except on loopback");
  }

  private url(href: string): URL {
    const url = new URL(href, this.base);
    if (
      url.origin !== this.base.origin ||
      url.username ||
      url.password ||
      !/^\/api\/(resources|council-business|templates|settings|mail|mail-recipient-groups|council-meetings)(\/|$)/.test(
        url.pathname,
      )
    )
      throw new Error("Only workspace, configuration or mail URLs on the configured Hall instance are allowed");
    if (/%2f|%5c|%2e/i.test(url.pathname) || url.hash) throw new Error("Invalid workspace URL");
    return url;
  }

  private async request(href: string, init: RequestInit = {}, timeoutMs = 30000) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/vnd.siren+json, application/json");
    if (this.session) headers.set("Cookie", `hall_session=${encodeURIComponent(this.session)}`);
    const response = await fetch(this.url(href), {
      ...init,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const problem = await response.text();
      throw new Error(
        `Hall HTTP ${response.status}: ${problem.slice(0, 8000)}${response.status === 401 ? " Reconnect in a private terminal with hall-workspace-mcp login --url <Hall origin>." : ""}`,
      );
    }
    return response;
  }

  async read(href: string): Promise<unknown> {
    const response = await this.request(href);
    if (!response.headers.get("content-type")?.includes("json"))
      throw new Error("Use workspace_read_binary for binary content");
    const value: unknown = await response.json();
    return value;
  }

  async execute(href: string, name: HallAction, input: Record<string, unknown>, file?: Upload): Promise<unknown> {
    const entity = representationSchema.parse(await this.read(href));
    const action = entity.actions?.find((candidate) => candidate.name === name);
    if (!action)
      throw new Error(
        "Action unavailable in the current Hall representation. Refresh the resource and inspect its capabilities.",
      );
    const contextualInput = { ...input };
    for (const field of action.fields ?? []) {
      if (field.value === undefined) continue;
      if (
        field.type === "hidden" &&
        contextualInput[field.name] !== undefined &&
        contextualInput[field.name] !== field.value
      )
        throw new Error(`Conflicting action context: ${field.name}`);
      if (contextualInput[field.name] === undefined || field.type === "hidden")
        contextualInput[field.name] = field.value;
    }
    const parsed = hallActions[name].schema.parse(contextualInput);
    const description = describeAction(name);
    if (Boolean(file) !== description.fileRequired)
      throw new Error(description.fileRequired ? "This action requires a file" : "This action does not accept a file");
    let body: BodyInit | undefined;
    const headers = new Headers();
    if (file) {
      const bytes = Buffer.from(file.base64, "base64");
      if (bytes.length > maximumBytes || bytes.toString("base64") !== file.base64)
        throw new Error("File must be canonical base64, at most 25 MiB");
      const form = new FormData();
      for (const [key, value] of Object.entries(parsed)) if (value !== undefined) form.set(key, String(value));
      form.set("file", new Blob([bytes], { type: file.mediaType }), file.name);
      body = form;
    } else if (action.method !== "DELETE" && action.method !== "GET") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(parsed);
    }
    const response = await this.request(
      action.href,
      { method: action.method ?? "POST", headers, body },
      name === "mail.send" ? 90000 : 30000,
    );
    return response.status === 204 ? { success: true } : response.json();
  }

  async binary(href: string, offset: number, length: number) {
    const response = await this.request(href);
    if (Number(response.headers.get("content-length")) > maximumBytes)
      throw new Error("Binary exceeds 25 MiB transfer limit");
    if (!response.body) throw new Error("Empty binary response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maximumBytes) {
        throw new Error("Binary exceeds 25 MiB transfer limit");
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return {
      mediaType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      totalBytes: size,
      offset,
      nextOffset: Math.min(size, offset + length),
      base64: bytes.subarray(offset, offset + length).toString("base64"),
    };
  }
}
