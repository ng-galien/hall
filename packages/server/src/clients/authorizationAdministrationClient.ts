import type {
  AuthorizationConfiguration,
  AuthorizationRole,
  AuthorizationRoleInput,
  AuthorizationRoleOption,
} from "@hall/api-contract";

/** Administrative role policy; decisions and durable grants belong to PostgreSQL. */
export interface AuthorizationAdministrationClient {
  roleOptions(): Promise<AuthorizationRoleOption[]>;
  configuration(): Promise<AuthorizationConfiguration>;
  saveRole(id: string, input: AuthorizationRoleInput): Promise<AuthorizationRole>;
  deleteRole(id: string, revision: number): Promise<AuthorizationRole>;
  requiresPersonalWorkspace(roles: readonly string[]): Promise<boolean>;
}
