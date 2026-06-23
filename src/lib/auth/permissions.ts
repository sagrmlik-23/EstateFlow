/**
 * Fine-grained permission matrix for EstateFlow CRM.
 *
 * Defines CRUD access for every entity-role combination.
 *
 * Entities: leads, properties, deals, tasks, calls, messages,
 *           attendance, documents, reports, settings, users, billing
 *
 * Roles: super_admin > tenant_admin > sales_manager > agent > field_executive
 */

import type { UserRole } from './roles';

// ─── Entity type ───────────────────────────────────────────────────────────
export type Entity =
  | 'leads'
  | 'properties'
  | 'deals'
  | 'tasks'
  | 'calls'
  | 'messages'
  | 'attendance'
  | 'documents'
  | 'reports'
  | 'settings'
  | 'users'
  | 'billing'
  | 'expenses';

export const ALL_ENTITIES: readonly Entity[] = [
  'leads',
  'properties',
  'deals',
  'tasks',
  'calls',
  'messages',
  'attendance',
  'documents',
  'reports',
  'settings',
  'users',
  'billing',
  'expenses',
] as const;

// ─── Permission matrix ─────────────────────────────────────────────────────
// true = full CRUD access, 'own' = own records only, false = no access

type AccessLevel = true | 'own' | false;

interface PermissionEntry {
  create: AccessLevel;
  read: AccessLevel;
  update: AccessLevel;
  delete: AccessLevel;
}

type RolePermissions = Record<Entity, PermissionEntry>;

const PERMISSIONS: Record<UserRole, RolePermissions> = {
  // ── super_admin: everything ──────────────────────────────────────────────
  super_admin: buildFullPermissions(true),

  // ── tenant_admin: full access on own tenant, except delete users ────────
  tenant_admin: {
    leads:       { create: true, read: true, update: true, delete: true },
    properties:  { create: true, read: true, update: true, delete: true },
    deals:       { create: true, read: true, update: true, delete: true },
    tasks:       { create: true, read: true, update: true, delete: true },
    calls:       { create: true, read: true, update: true, delete: true },
    messages:    { create: true, read: true, update: true, delete: true },
    attendance:  { create: true, read: true, update: true, delete: true },
    documents:   { create: true, read: true, update: true, delete: true },
    reports:     { create: true, read: true, update: true, delete: false },
    settings:    { create: true, read: true, update: true, delete: false },
    users:       { create: true, read: true, update: true, delete: false }, // cannot delete users
    billing:     { create: false, read: true, update: false, delete: false },
    expenses:    { create: true, read: true, update: true, delete: true },
  },

  // ── sales_manager: CRUD on leads, read on reports ───────────────────────
  sales_manager: {
    leads:       { create: true, read: true, update: true, delete: true },
    properties:  { create: true, read: true, update: true, delete: true },
    deals:       { create: true, read: true, update: true, delete: true },
    tasks:       { create: true, read: true, update: true, delete: true },
    calls:       { create: true, read: true, update: true, delete: true },
    messages:    { create: true, read: true, update: true, delete: true },
    attendance:  { create: true, read: true, update: true, delete: false },
    documents:   { create: true, read: true, update: true, delete: true },
    reports:     { create: false, read: true, update: false, delete: false },
    settings:    { create: false, read: true, update: false, delete: false },
    users:       { create: false, read: true, update: false, delete: false },
    billing:     { create: false, read: false, update: false, delete: false },
    expenses:    { create: true, read: true, update: true, delete: false },
  },

  // ── agent: CR on leads (own), R on properties ───────────────────────────
  agent: {
    leads:       { create: true, read: 'own', update: 'own', delete: false },
    properties:  { create: false, read: true, update: false, delete: false },
    deals:       { create: false, read: 'own', update: 'own', delete: false },
    tasks:       { create: true, read: 'own', update: 'own', delete: false },
    calls:       { create: true, read: 'own', update: 'own', delete: false },
    messages:    { create: true, read: 'own', update: false, delete: false },
    attendance:  { create: 'own', read: 'own', update: 'own', delete: false },
    documents:   { create: true, read: 'own', update: false, delete: false },
    reports:     { create: false, read: false, update: false, delete: false },
    settings:    { create: false, read: false, update: false, delete: false },
    users:       { create: false, read: true, update: false, delete: false },
    billing:     { create: false, read: false, update: false, delete: false },
    expenses:    { create: true, read: 'own', update: false, delete: false },
  },

  // ── field_executive: CR on attendance (own only), R on leads (assigned) ─
  field_executive: {
    leads:       { create: false, read: 'own', update: 'own', delete: false },
    properties:  { create: false, read: true, update: false, delete: false },
    deals:       { create: false, read: false, update: false, delete: false },
    tasks:       { create: false, read: 'own', update: 'own', delete: false },
    calls:       { create: true, read: 'own', update: 'own', delete: false },
    messages:    { create: false, read: 'own', update: false, delete: false },
    attendance:  { create: 'own', read: 'own', update: 'own', delete: false },
    documents:   { create: false, read: false, update: false, delete: false },
    reports:     { create: false, read: false, update: false, delete: false },
    settings:    { create: false, read: false, update: false, delete: false },
    users:       { create: false, read: true, update: false, delete: false },
    billing:     { create: false, read: false, update: false, delete: false },
    expenses:    { create: true, read: 'own', update: false, delete: false },
  },
};

// ─── Helper ────────────────────────────────────────────────────────────────

function buildFullPermissions(level: true | 'own'): RolePermissions {
  const entry: PermissionEntry = {
    create: level,
    read: level,
    update: level,
    delete: level,
  };
  const perms = {} as RolePermissions;
  for (const entity of ALL_ENTITIES) {
    perms[entity] = { ...entry };
  }
  return perms;
}

// ─── Permission check functions ────────────────────────────────────────────

/**
 * Check if a role can create records for the given entity.
 */
export function canCreate(role: UserRole, entity: Entity): boolean {
  return resolveAccess(PERMISSIONS[role]?.[entity]?.create);
}

/**
 * Check if a role can read records for the given entity.
 */
export function canRead(role: UserRole, entity: Entity): boolean {
  return resolveAccess(PERMISSIONS[role]?.[entity]?.read);
}

/**
 * Check if a role can update records for the given entity.
 */
export function canUpdate(role: UserRole, entity: Entity): boolean {
  return resolveAccess(PERMISSIONS[role]?.[entity]?.update);
}

/**
 * Check if a role can delete records for the given entity.
 */
export function canDelete(role: UserRole, entity: Entity): boolean {
  return resolveAccess(PERMISSIONS[role]?.[entity]?.delete);
}

/**
 * Return the raw access level for a role + entity + operation.
 * Useful when the caller needs to distinguish 'own' vs 'all'.
 */
export function getAccessLevel(
  role: UserRole,
  entity: Entity,
  operation: 'create' | 'read' | 'update' | 'delete',
): AccessLevel {
  return PERMISSIONS[role]?.[entity]?.[operation] ?? false;
}

/**
 * Check whether the access level implies 'own' scope only.
 */
export function isOwnScope(role: UserRole, entity: Entity, operation: 'create' | 'read' | 'update' | 'delete'): boolean {
  return PERMISSIONS[role]?.[entity]?.[operation] === 'own';
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function resolveAccess(level: AccessLevel | undefined): boolean {
  // Both `true` and `'own'` grant permission; only `false` denies it.
  if (level === undefined) return false;
  return level !== false;
}
