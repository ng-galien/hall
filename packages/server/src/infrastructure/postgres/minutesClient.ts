import { minutesDetailSchema, minutesSummarySchema } from "@hall/api-contract";
import { HallPostgresError, type PostgresCouncilRequest, type PostgresMinutes } from "@hall/postgres";
import { z } from "zod";
import type { MinutesClient } from "../../clients/minutesClient.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { DomainError } from "../../services/errors.js";

export function createPostgresMinutesClient({
  postgresMinutes,
  requestContext,
}: {
  postgresMinutes: PostgresMinutes;
  requestContext: RequestContextStore;
}): MinutesClient {
  function currentRequest(): PostgresCouncilRequest {
    const context = requestContext.current();
    if (!context?.principal) throw new Error("An authenticated request context is required for minutes storage");
    return {
      role: "hall_api_authenticated",
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        contactId: context.principal.contactId,
        roles: context.principal.roles,
      },
    };
  }
  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HallPostgresError && ["HV707", "HV712"].includes(error.sqlState)) {
        throw new DomainError("minutes_not_found", 404);
      }
      if (error instanceof HallPostgresError && /^HV7(0[1-9]|1[01])$/.test(error.sqlState)) {
        throw new DomainError("minutes_conflict", 409);
      }
      throw error;
    }
  }
  return {
    async list() {
      return z.array(minutesSummarySchema).parse(await call(() => postgresMinutes.list(currentRequest())));
    },
    async open(id) {
      const value = await call(() => postgresMinutes.open(currentRequest(), id));
      return value === null ? null : minutesDetailSchema.parse(value);
    },
    async updateDraft(id, input) {
      return minutesDetailSchema.parse(
        await call(() => postgresMinutes.updateDraft(currentRequest(), { id, ...input })),
      );
    },
    async generate(id, expectedVersion, content) {
      return minutesDetailSchema.parse(
        await call(() => postgresMinutes.generate(currentRequest(), { id, expectedVersion, content })),
      );
    },
    async content(id) {
      const document = await call(() => postgresMinutes.content(currentRequest(), id));
      return document?.content ?? null;
    },
  };
}
