import { z } from "zod";

/** Continuous presentation number; independent of the persisted ordering key. */
export const agendaNumberSchema = z.number().int().positive();
