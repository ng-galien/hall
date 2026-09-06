import { createHash, randomBytes } from "node:crypto";
import type { ApiRole, ApiUser } from "@hall/api-contract";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { UnitOfWork } from "../repositories/contracts.js";
import type { SecurityRepository, StoredUser } from "../repositories/securityRepository.js";
import { permissionsForRoles, principalForUser } from "../security/authorization.js";
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
  return { ...safeUser, permissions: permissionsForRoles(user.roles) };
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
    councilMemberId: string | null;
  }): Promise<ApiUser>;
  assignRoles(userId: string, roles: ApiRole[]): Promise<ApiUser>;
  disableUser(userId: string): Promise<ApiUser>;
}

export function createAuthService({
  securityRepository,
  directoryClient,
  unitOfWork,
  requestContext,
}: {
  securityRepository: SecurityRepository;
  directoryClient: DirectoryClient;
  unitOfWork: UnitOfWork;
  requestContext: RequestContextStore;
}): AuthService {
  const validateCouncilMember = async (councilMemberId: string | null) => {
    if (!councilMemberId) return;
    if (!(await directoryClient.openCouncilMember(councilMemberId))) {
      throw new DomainError("council_member_not_found", 404);
    }
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
            councilMemberId: null,
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
      const storedSession = await unitOfWork.execute(() =>
        securityRepository.createSession(user.id, hashSessionToken(token), expiresAt),
      );
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
      await validateCouncilMember(input.councilMemberId);
      const passwordHash = await hashPassword(input.password);
      const created = await unitOfWork.execute(() => securityRepository.createUser({ ...input, passwordHash }));
      return publicUserWithProtection(created, securityRepository);
    },
    assignRoles(userId, roles) {
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
