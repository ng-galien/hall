import { createHash, randomBytes } from "node:crypto";
import type { ApiRole, ApiUser } from "@hall/api-contract";
import type { AuthorizationAdministrationClient } from "../clients/authorizationAdministrationClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { UnitOfWork } from "../repositories/contracts.js";
import type { SecurityRepository, StoredUser } from "../repositories/securityRepository.js";
import { principalForUser } from "../security/authorization.js";
import { generatePassphrase } from "../security/passphrase.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import type { RequestContextStore } from "../security/requestContext.js";
import { DomainError } from "./errors.js";

const sessionDurationMs = 12 * 60 * 60 * 1000;
const dummyPasswordHash = `scrypt$32768$8$1$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(32).toString("base64")}`;

export const SESSION_COOKIE_NAME = "hall_session";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(user: StoredUser): ApiUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function publicUserWithProtection(user: StoredUser, securityRepository: SecurityRepository): Promise<ApiUser> {
  const protectedFromDisable =
    user.status === "active" &&
    user.roles.includes("administrator") &&
    (await securityRepository.countActiveAdministrators()) === 1;
  return { ...publicUser(user), protectedFromDisable };
}

export interface AuthenticatedSession {
  sessionId: string;
  user: ApiUser;
}

export interface AuthService {
  bootstrapRequired(): Promise<boolean>;
  bootstrap(input: { email: string; displayName: string; password: string }): Promise<ApiUser>;
  login(email: string, password: string): Promise<{ token: string; session: AuthenticatedSession }>;
  authenticate(token: string): Promise<AuthenticatedSession | null>;
  logout(sessionId: string): Promise<void>;
  listUsers(): Promise<ApiUser[]>;
  getUser(userId: string): Promise<ApiUser>;
  createUser(input: {
    email: string;
    displayName: string;
    password: string;
    roles: ApiRole[];
    contactId: string | null;
  }): Promise<ApiUser>;
  assignRoles(userId: string, roles: ApiRole[]): Promise<ApiUser>;
  updateUser(userId: string, input: { email: string; displayName: string; contactId: string | null }): Promise<ApiUser>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  resetPassword(userId: string, newPassword: string): Promise<void>;
  disableUser(userId: string): Promise<ApiUser>;
  reactivateUser(userId: string): Promise<{ user: ApiUser; passphrase: string }>;
  endCouncillorAccess(contactId: string): Promise<void>;
}

// @implements-requirement HALL-FR-DIR-150 (provisionCouncillor: the folder and the account live in two transactions,
// ordered to fail on the safe side: the idempotent folder is provisioned first, then the role is recorded; a retry
// reuses the folder. PostgreSQL refuses a contact without an active mandate.)
// @implements-requirement HALL-FR-DIR-160 (endCouncillorAccess)
// @implements-requirement HALL-FR-USR-020 (reactivateUser; the revocation is disableUser, audited as user.revoke-access)
export function createAuthService({
  securityRepository,
  authorizationAdministrationClient,
  directoryClient,
  resourcesClient,
  unitOfWork,
  requestContext,
}: {
  securityRepository: SecurityRepository;
  authorizationAdministrationClient: AuthorizationAdministrationClient;
  directoryClient: DirectoryClient;
  resourcesClient: ResourcesClient;
  unitOfWork: UnitOfWork;
  requestContext: RequestContextStore;
}): AuthService {
  const validateContact = async (contactId: string | null) => {
    if (!contactId) return;
    if (!(await directoryClient.openContact(contactId))) {
      throw new DomainError("contact_not_found", 404);
    }
  };

  const provisionCouncillor = async (roles: readonly ApiRole[], contactId: string | null) => {
    if (!(await authorizationAdministrationClient.requiresPersonalWorkspace(roles))) return;
    if (!contactId) throw new DomainError("councillor_requires_active_member", 422);
    await resourcesClient.provisionPersonalWorkspace(contactId);
  };

  const replacePassword = async (userId: string, newPassword: string, currentPassword?: string) => {
    const user = await securityRepository.findUserById(userId);
    if (!user) throw new DomainError("user_not_found", 404);
    if (currentPassword !== undefined && !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new DomainError("invalid_current_password", 400);
    }
    const passwordHash = await hashPassword(newPassword);
    await unitOfWork.execute(async () => {
      if (!(await securityRepository.updatePassword(userId, user.passwordHash, passwordHash))) {
        throw new DomainError("conflict", 409);
      }
    });
  };

  return {
    async bootstrapRequired() {
      return (await securityRepository.countUsers()) === 0;
    },
    async bootstrap(input) {
      if ((await securityRepository.countUsers()) !== 0) throw new DomainError("bootstrap_unavailable", 409);
      const passwordHash = await hashPassword(input.password);
      return unitOfWork.execute(async () => {
        if ((await securityRepository.countUsers()) !== 0) throw new DomainError("bootstrap_unavailable", 409);
        const user = publicUser(
          await securityRepository.createUser({
            email: input.email,
            displayName: input.displayName,
            passwordHash,
            roles: ["administrator"],
            contactId: null,
          }),
        );
        requestContext.setPrincipal(principalForUser(user));
        return user;
      });
    },
    async login(email, password) {
      const user = await securityRepository.findUserByEmail(email);
      const passwordMatches = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash);
      if (user?.status !== "active" || !passwordMatches) {
        throw new DomainError("invalid_credentials", 401);
      }
      requestContext.setPrincipal(principalForUser(publicUser(user)));
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + sessionDurationMs).toISOString();
      const storedSession = await unitOfWork.execute(async () => {
        const current = await securityRepository.lockUserForAuthentication(user.id);
        if (current?.status !== "active" || current.passwordHash !== user.passwordHash) {
          throw new DomainError("invalid_credentials", 401);
        }
        return securityRepository.createSession(user.id, hashSessionToken(token), expiresAt);
      });
      return {
        token,
        session: { sessionId: storedSession.id, user: publicUser(user) },
      };
    },
    async authenticate(token) {
      const storedSession = await securityRepository.findSession(hashSessionToken(token));
      if (!storedSession) return null;
      const user = await securityRepository.findUserById(storedSession.userId);
      if (user?.status !== "active") return null;
      return { sessionId: storedSession.id, user: publicUser(user) };
    },
    logout(sessionId) {
      return unitOfWork.execute(() => securityRepository.deleteSession(sessionId));
    },
    async listUsers() {
      const users = await securityRepository.listUsers();
      const activeAdministratorCount = await securityRepository.countActiveAdministrators();
      return users.map((user) => ({
        ...publicUser(user),
        protectedFromDisable:
          user.status === "active" && user.roles.includes("administrator") && activeAdministratorCount === 1,
      }));
    },
    async getUser(userId) {
      const user = await securityRepository.findUserById(userId);
      if (!user) throw new DomainError("user_not_found", 404);
      return publicUserWithProtection(user, securityRepository);
    },
    async createUser(input) {
      await validateContact(input.contactId);
      await provisionCouncillor(input.roles, input.contactId);
      const passwordHash = await hashPassword(input.password);
      const created = await unitOfWork.execute(() => securityRepository.createUser({ ...input, passwordHash }));
      return publicUserWithProtection(created, securityRepository);
    },
    async updateUser(userId, input) {
      await validateContact(input.contactId);
      const current = await securityRepository.findUserById(userId);
      if (!current) throw new DomainError("user_not_found", 404);
      if (current.contactId !== input.contactId) await provisionCouncillor(current.roles, input.contactId);
      return unitOfWork.execute(async () => {
        const user = await securityRepository.updateUser(userId, input);
        if (!user) throw new DomainError("user_not_found", 404);
        return publicUserWithProtection(user, securityRepository);
      });
    },
    changePassword: (userId, currentPassword, newPassword) => replacePassword(userId, newPassword, currentPassword),
    resetPassword: (userId, newPassword) => replacePassword(userId, newPassword),
    async assignRoles(userId, roles) {
      const target = await securityRepository.findUserById(userId);
      if (!target) throw new DomainError("user_not_found", 404);
      await provisionCouncillor(roles, target.contactId);
      return unitOfWork.execute(async () => {
        await securityRepository.lockAdministratorInvariant();
        const current = await securityRepository.findUserById(userId);
        if (!current) throw new DomainError("user_not_found", 404);
        if (
          current.status === "active" &&
          current.roles.includes("administrator") &&
          !roles.includes("administrator") &&
          (await securityRepository.countActiveAdministrators()) === 1
        ) {
          throw new DomainError("last_administrator_required", 409);
        }
        const updated = await securityRepository.setRoles(userId, roles);
        if (!updated) throw new DomainError("user_not_found", 404);
        return publicUserWithProtection(updated, securityRepository);
      });
    },
    async endCouncillorAccess(contactId) {
      const accounts = (await securityRepository.listUsers()).filter(
        (user) => user.contactId === contactId && user.status === "active" && user.roles.includes("councillor"),
      );
      for (const account of accounts) {
        await this.disableUser(account.id).catch((error: unknown) => {
          if (error instanceof DomainError && error.code === "last_administrator_required") return;
          throw error;
        });
      }
    },
    async reactivateUser(userId) {
      const target = await securityRepository.findUserById(userId);
      if (!target) throw new DomainError("user_not_found", 404);
      if (target.status !== "disabled") throw new DomainError("conflict", 409);
      await provisionCouncillor(target.roles, target.contactId);
      const passphrase = generatePassphrase();
      const passwordHash = await hashPassword(passphrase);
      return unitOfWork.execute(async () => {
        const reactivated = await securityRepository.reactivateUser(userId, passwordHash);
        if (!reactivated) throw new DomainError("conflict", 409);
        return { user: await publicUserWithProtection(reactivated, securityRepository), passphrase };
      });
    },
    disableUser(userId) {
      return unitOfWork.execute(async () => {
        await securityRepository.lockAdministratorInvariant();
        const current = await securityRepository.findUserById(userId);
        if (!current) throw new DomainError("user_not_found", 404);
        if (
          current.status === "active" &&
          current.roles.includes("administrator") &&
          (await securityRepository.countActiveAdministrators()) === 1
        ) {
          throw new DomainError("last_administrator_required", 409);
        }
        const updated = await securityRepository.disableUser(userId);
        if (!updated) throw new DomainError("user_not_found", 404);
        return publicUserWithProtection(updated, securityRepository);
      });
    },
  };
}

export function principalForSession(session: AuthenticatedSession) {
  return principalForUser(session.user);
}
