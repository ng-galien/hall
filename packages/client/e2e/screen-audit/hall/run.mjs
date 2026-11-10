import { runAudit } from "../engine/cli.mjs";
import { config } from "./config.mjs";

await runAudit(config);
