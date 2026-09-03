import { z } from "zod";

const postgresConfigSchema = z.object({
  connectionString: z
    .string()
    .url()
    .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://")),
  maxConnections: z.number().int().positive().optional(),
});

export type HallPostgresConfig = z.infer<typeof postgresConfigSchema>;

export function parseHallPostgresConfig(value: unknown): HallPostgresConfig {
  return postgresConfigSchema.parse(value);
}
