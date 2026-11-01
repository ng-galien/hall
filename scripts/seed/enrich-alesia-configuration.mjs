import { parseArgs } from "node:util";
import { createSeedApi } from "./data/common/api.mjs";
import { enrichAlesiaConfiguration } from "./data/datasets/alesia/configuration.mjs";

const { values } = parseArgs({ options: { api: { type: "string" } }, strict: true, allowPositionals: false });
if (!values.api)
  throw new Error("Specify --api for the already identified local demonstration; this command never resets data");
const target = new URL(values.api);
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  target.username ||
  target.password ||
  target.pathname !== "/api" ||
  target.search ||
  target.hash
)
  throw new Error("An explicit local demonstration API origin is required");
const api = createSeedApi(target.href);
if (!(await api.get("/auth/status")).developmentAccess)
  throw new Error("The target must be the local demonstration with development access");
console.log(JSON.stringify(await enrichAlesiaConfiguration(api)));
