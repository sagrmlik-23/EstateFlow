/**
 * Auth type definitions for EstateFlow CRM
 *
 * UserRole — hierarchical role system for multi-tenant access control.
 * JwtPayload — shape of the signed JWT token.
 * AuthResult — result returned by the authenticate middleware.
 */

export type UserRole =
  | 'super_admin'
  | 'tenant_admin'
  | 'sales_manager'
  | 'agent'
  | 'field_executive';

export const USER_ROLES: readonly UserRole[] = [
  'super_admin',
  'tenant_admin',
  'sales_manager',
  'agent',
  'field_executive',
] as const;

export const USER_ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 100,
  tenant_admin: 80,
  sales_manager: 60,
  agent: 40,
  field_executive: 20,
};

export interface JwtPayload {
  userId: string;
  role: UserRole;
  tenantId: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  userId: string;
  role: UserRole;
  tenantId: string;
  sessionId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    tenantId: string;
  };
}

export interface RegisterRequest {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
}

export interface RegisterResponse {
  token: string;
  tenantId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    tenantId: string;
  };
}
