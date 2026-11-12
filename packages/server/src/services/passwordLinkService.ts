import { randomBytes } from "node:crypto";
import type { AccountMailKind, ApiPasswordLink, PasswordLinkPurpose } from "@hall/api-contract";
import { z } from "zod";
import type { Clock } from "../core/clock.js";
import type { ServerConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import type { UnitOfWork } from "../repositories/contracts.js";
import type { SecurityRepository, StoredUser } from "../repositories/securityRepository.js";
import { hashPassword } from "../security/password.js";
import { type AccountMailContent, type AccountMailContext, accountMailMessages } from "./accountMailMessages.js";
import { hashSessionToken } from "./authService.js";
import { type EmailTransport, type EmailTransportResult, emailPayloadSchema } from "./emailTransport.js";
import { DomainError } from "./errors.js";

export type PasswordLinkDelivery = "sent" | "failed" | "unknown" | "too_frequent" | "inactive" | "not_found";

const outcomeOf = (result: EmailTransportResult) =>
  result.status === "accepted"
    ? ({ outcome: "sent", failureCode: null } as const)
    : ({ outcome: result.status === "failed" ? "failed" : "unknown", failureCode: result.code } as const);

/** The path of the link screen in the client; the secret stays in the fragment, which no request carries. */
export const PASSWORD_LINK_PATH = "/app/password-link";

// @implements-requirement HALL-FR-USR-080
// @implements-requirement HALL-FR-USR-090
/**
 * Issues, opens and completes the single-use password links, and submits the account emails through the injected
 * transport. Neither a link nor a password is logged, audited or stored in clear. A recovery request sends nothing
 * for an unknown or disabled address. An account email can run after the response, so that its duration reveals
 * nothing; its failures are only logged, without content.
 */
export function createPasswordLinkService({
  securityRepository,
  emailTransport,
  unitOfWork,
  clock,
  config,
}: {
  securityRepository: SecurityRepository;
  emailTransport: EmailTransport;
  unitOfWork: UnitOfWork;
  clock: Clock;
  config: ServerConfig;
}) {
  const deliver = async (
    user: { id: string; email: string },
    kind: AccountMailKind,
    content: (context: AccountMailContext) => AccountMailContent | null,
    displayName: string,
  ) => {
    let result: EmailTransportResult;
    try {
      const sender = await securityRepository.accountMailSender();
      const message = content({
        displayName,
        email: user.email,
        communeName: sender.communeName,
        timeZone: sender.timeZone,
      });
      const payload = emailPayloadSchema.safeParse({
        senderAddress: sender.senderAddress,
        replyToAddress: sender.replyToAddress,
        recipients: [{ kind: "to", address: user.email }],
        attachments: [],
        ...message,
      });
      if (!message) result = { status: "failed", code: "public_origin_not_configured" };
      else if (!payload.success)
        result = {
          status: "failed",
          code: z.email().safeParse(sender.senderAddress).success ? "invalid_email_payload" : "missing_sender",
        };
      else result = await emailTransport.send(payload.data);
    } catch {
      result = { status: "unknown", code: "transport_submission_uncertain" };
    }
    const { outcome, failureCode } = outcomeOf(result);
    await unitOfWork.execute(() =>
      securityRepository.recordAccountMail(user.id, { kind, outcome, failureCode, sentAt: clock.now() }),
    );
    if (outcome !== "sent") logger.warn({ userId: user.id, kind, outcome, failureCode }, "Account email not sent");
    return outcome;
  };

  const linkAddress = (token: string) =>
    config.publicOrigin ? `${config.publicOrigin}${PASSWORD_LINK_PATH}#${token}` : null;

  const sendLink = async (userId: string, purpose: PasswordLinkPurpose): Promise<PasswordLinkDelivery> => {
    const token = randomBytes(32).toString("base64url");
    const issued = await unitOfWork.execute(() =>
      securityRepository.issuePasswordLink(userId, purpose, hashSessionToken(token), clock.now()),
    );
    if (issued.outcome !== "issued") return issued.outcome;
    const link = linkAddress(token);
    return deliver(
      { id: userId, email: issued.email },
      purpose,
      (context) => (link ? accountMailMessages[purpose]({ ...context, link }) : null),
      issued.displayName,
    );
  };

  const unusable = () => new DomainError("password_link_unusable", 410);

  const service = {
    sendLink,
    async requestRecovery(email: string) {
      const user = await securityRepository.findUserByEmail(email);
      if (user?.status !== "active") return;
      await sendLink(user.id, "recovery");
    },
    async notifyPasswordChanged(user: Pick<StoredUser, "id" | "email" | "displayName">) {
      const changedAt = clock.now();
      await deliver(
        user,
        "password-changed",
        (context) => accountMailMessages["password-changed"]({ ...context, changedAt }),
        user.displayName,
      );
    },
    inBackground(operation: () => Promise<unknown>) {
      void operation().catch((error: unknown) =>
        logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "Account email task failed"),
      );
    },
    async open(token: string): Promise<ApiPasswordLink> {
      const link = await securityRepository.openPasswordLink(hashSessionToken(token), clock.now());
      if (!link) throw unusable();
      return { purpose: link.purpose, email: link.email };
    },
    async complete(token: string, newPassword: string) {
      if (!(await securityRepository.openPasswordLink(hashSessionToken(token), clock.now()))) throw unusable();
      const passwordHash = await hashPassword(newPassword);
      const user = await unitOfWork.execute(async () => {
        const completed = await securityRepository.completePasswordLink(
          hashSessionToken(token),
          passwordHash,
          clock.now(),
        );
        if (!completed) throw unusable();
        return completed;
      });
      service.inBackground(() => service.notifyPasswordChanged(user));
      return user;
    },
  };
  return service;
}

export type PasswordLinkService = ReturnType<typeof createPasswordLinkService>;
