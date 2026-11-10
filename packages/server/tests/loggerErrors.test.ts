import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerOptions } from "../src/core/logger.js";

describe("server log entries", () => {
  it("record the message and stack of an error logged under the error key", () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const error = new Error("connection reset");
    pino({ ...loggerOptions, level: "info" }, stream).error({ error }, "PostgreSQL idle connection failed");
    const entry = JSON.parse(lines[0]);
    expect(entry.msg).toBe("PostgreSQL idle connection failed");
    expect(entry.error).toMatchObject({ type: "Error", message: "connection reset" });
    expect(entry.error.stack).toContain("connection reset");
    expect(entry.error.stack).toContain("loggerErrors.test.ts");
  });
});
