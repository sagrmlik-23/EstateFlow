/**
 * Auth module barrel export.
 *
 * Re-exports all public types, functions, and utilities from the auth subsystem
 * so consumers can import from a single entry point:
 *
 *   import { generateToken, verifyToken, hasRole, canCreate, withTenantContext } from '@/lib/auth';
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type {
  UserRole,
  JwtPayload,
  AuthResult,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/types/auth';

export {
  USER_ROLES,
  USER_ROLE_HIERARCHY,
} from '@/types/auth';

// ─── Roles ─────────────────────────────────────────────────────────────────

export {
  hasRole,
  rolesAtOrBelow,
  canAssignRole,
} from './roles';

// ─── JWT ───────────────────────────────────────────────────────────────────

export {
  generateToken,
  verifyToken,
  refreshToken,
} from './jwt';

export type { JwtPayloadType } from './jwt';

// ─── Permissions ───────────────────────────────────────────────────────────

export {
  canCreate,
  canRead,
  canUpdate,
  canDelete,
  getAccessLevel,
  isOwnScope,
} from './permissions';

export type { Entity } from './permissions';
export { ALL_ENTITIES } from './permissions';

// ─── Tenant Context ────────────────────────────────────────────────────────

export {
  setTenantContext,
  resetTenantContext,
  withTenantContext,
} from './withTenantContext';

export type { TenantContext } from './withTenantContext';
