import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr);

const forbidden = result.stdout
  .split("\0")
  .filter(Boolean)
  .filter(
    (path) =>
      path.startsWith("local-imports/") ||
      path.startsWith("docs/operations/") ||
      /(?:^|\/)\.env(?:\.|$)|\.(?:dump|backup|pgdump|sql\.gz)$/i.test(path),
  );

if (forbidden.length > 0) {
  throw new Error(`Private artifacts are tracked by Git:\n${forbidden.join("\n")}`);
}
console.log("Public artifact inventory OK: no private database dump, local import or operations journal is tracked");
