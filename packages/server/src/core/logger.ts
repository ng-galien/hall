import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";

const file = process.env.HALL_LOG_FILE;
if (file) mkdirSync(dirname(file), { recursive: true, mode: 0o700 });

export const loggerOptions: pino.LoggerOptions = {
  level: process.env.NODE_ENV === "test" ? "silent" : (process.env.LOG_LEVEL ?? "info"),
  serializers: { error: pino.stdSerializers.err },
};

export const logger = pino(
  loggerOptions,
  file
    ? pino.multistream([
        { stream: process.stdout },
        { stream: pino.destination({ dest: file, sync: false, mode: 0o600 }) },
      ])
    : process.stdout,
);
