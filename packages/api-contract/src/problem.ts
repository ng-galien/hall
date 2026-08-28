import { z } from "zod";

export const PROBLEM_MEDIA_TYPE = "application/problem+json" as const;

export interface ProblemDetails<TCode extends string = string> {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: TCode;
  requestId?: string;
  errors?: unknown[];
}

export const problemDetailsSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.string().min(1),
    requestId: z.string().optional(),
    errors: z.array(z.unknown()).optional(),
  })
  .passthrough();
