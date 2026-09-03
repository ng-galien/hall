import type { PoolClient, QueryResultRow } from "pg";
import type { ZodType } from "zod";
import { ProjectionValidationError } from "./errors.js";

type JsonCall<Row> = Readonly<{
  text: string;
  values?: readonly unknown[];
  schema: ZodType<Row>;
}>;

type PayloadRow = QueryResultRow & { payload: unknown };

export async function callJson<Row>(client: PoolClient, call: JsonCall<Row>): Promise<Row> {
  const result = await client.query<PayloadRow>(call.text, call.values ? [...call.values] : []);
  if (result.rowCount !== 1) {
    throw new ProjectionValidationError(`PostgreSQL JSON call returned ${result.rowCount ?? 0} rows instead of one`);
  }
  if (!Object.hasOwn(result.rows[0], "payload")) {
    throw new ProjectionValidationError("PostgreSQL JSON call did not return a payload column");
  }

  const parsed = call.schema.safeParse(result.rows[0].payload);
  if (!parsed.success) {
    throw new ProjectionValidationError(
      "PostgreSQL JSON projection does not satisfy its boundary schema",
      parsed.error,
    );
  }
  return parsed.data;
}
