import { councilDecisionDetailSchema, councilDecisionSummarySchema } from "@hall/api-contract";
import { HallPostgresError, type PostgresCouncilRequest, type PostgresCouncilDecisions } from "@hall/postgres";
import { z } from "zod";
import type { CouncilDecisionClient } from "../../clients/councilDecisionClient.js";
import type { RequestContextStore } from "../../security/requestContext.js";
import { DomainError } from "../../services/errors.js";

export function createPostgresCouncilDecisionClient({
  postgresCouncilDecisions,
  requestContext,
}: {
  postgresCouncilDecisions: PostgresCouncilDecisions;
  requestContext: RequestContextStore;
}): CouncilDecisionClient {
  function currentRequest(): PostgresCouncilRequest {
    const context = requestContext.current();
    if (!context?.principal)
      throw new Error("An authenticated request context is required for councilDecision storage");
    return {
      role: "hall_api_authenticated",
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        councilMemberId: context.principal.councilMemberId,
        roles: context.principal.roles,
      },
    };
  }
  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HallPostgresError && ["HV737"].includes(error.sqlState)) {
        throw new DomainError("council_decision_not_found", 404);
      }
      if (error instanceof HallPostgresError && /^HV73[0-8]$/.test(error.sqlState)) {
        throw new DomainError("council_decision_conflict", 409);
      }
      throw error;
    }
  }
  return {
    async list() {
      return z
        .array(councilDecisionSummarySchema)
        .parse(await call(() => postgresCouncilDecisions.list(currentRequest())));
    },
    async open(id) {
      const value = await call(() => postgresCouncilDecisions.open(currentRequest(), id));
      return value === null ? null : councilDecisionDetailSchema.parse(value);
    },
    async updateDraft(id, input) {
      return councilDecisionDetailSchema.parse(
        await call(() => postgresCouncilDecisions.updateDraft(currentRequest(), { id, ...input })),
      );
    },
    async freeze(id, expectedVersion, content) {
      return councilDecisionDetailSchema.parse(
        await call(() => postgresCouncilDecisions.freeze(currentRequest(), { id, expectedVersion, content })),
      );
    },
    async content(id) {
      const document = await call(() => postgresCouncilDecisions.content(currentRequest(), id));
      return document?.content ?? null;
    },
  };
}
