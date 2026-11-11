import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { type EmailTransportResult, emailPayloadSchema } from "../../services/emailTransport.js";
import { submitThroughOutlook } from "./outlookCom.js";
import { loadOutlookBinding } from "./outlookEdgeBinding.js";

const requestSchema = z.object({
  deadline: z.number().finite(),
  payload: emailPayloadSchema.extend({
    attachments: z.array(z.object({ fileName: z.string(), content: z.string().base64() })),
  }),
});

async function run(requestPath: string): Promise<void> {
  let result: EmailTransportResult;
  try {
    const request = requestSchema.parse(JSON.parse(await readFile(requestPath, "utf8")));
    const payload = emailPayloadSchema.parse({
      ...request.payload,
      attachments: request.payload.attachments.map((file) => ({
        ...file,
        content: Buffer.from(file.content, "base64"),
      })),
    });
    if (Date.now() >= request.deadline) result = { status: "failed", code: "outlook_request_expired" };
    else result = await submitThroughOutlook(loadOutlookBinding(), payload, request.deadline);
  } catch {
    result = { status: "failed", code: "outlook_unavailable" };
  }
  const destination = join(dirname(requestPath), "result.json");
  await writeFile(`${destination}.tmp`, JSON.stringify(result), { encoding: "utf8", flag: "wx" });
  await rename(`${destination}.tmp`, destination);
}

const requestPath = process.argv[2];
if (requestPath) await run(requestPath);
process.exit(0);
