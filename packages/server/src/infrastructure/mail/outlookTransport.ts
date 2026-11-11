import type { ServerConfig } from "../../core/config.js";
import { type EmailTransport, emailPayloadSchema } from "../../services/emailTransport.js";
import { submitInOutlookSession } from "./outlookSession.js";

// @implements-requirement HALL-FR-EML-070
export function createEmailTransport({ config }: { config: ServerConfig }): EmailTransport {
  return {
    async send(input) {
      if (config.emailTransport !== "outlook") return { status: "failed", code: "transport_not_configured" };
      if (process.platform !== "win32") return { status: "failed", code: "outlook_requires_windows" };
      if (process.versions.electron) return { status: "failed", code: "outlook_requires_node_runtime" };
      const parsed = emailPayloadSchema.safeParse(input);
      if (!parsed.success) return { status: "failed", code: "invalid_email_payload" };
      return submitInOutlookSession(parsed.data, config.emailTransportTimeoutMs ?? 60_000);
    },
  };
}
