/**
 * Role hierarchy and utility functions for EstateFlow CRM.
 *
 * Role hierarchy (highest to lowest):
 *   super_admin > tenant_admin > sales_manager > agent > field_executive
 */

import type { UserRole } from '@/types/auth';
import { USER_ROLE_HIERARCHY } from '@/types/auth';

export type { UserRole } from '@/types/auth';
export { USER_ROLES, USER_ROLE_HIERARCHY } from '@/types/auth';

/**
 * Check if `role` has equal or higher rank than `minimum`.
 *
 * @example
 *   hasRole('agent', 'field_executive') // true
 *   hasRole('agent', 'sales_manager')   // false
 */
export function hasRole(role: UserRole, minimum: UserRole): boolean {
  return (USER_ROLE_HIERARCHY[role] ?? 0) >= (USER_ROLE_HIERARCHY[minimum] ?? 0);
}

/**
 * Return all roles that are equal to or lower than `role` in the hierarchy.
 * Useful for scoping queries (e.g., "show users with roles at or below mine").
 */
export function rolesAtOrBelow(role: UserRole): UserRole[] {
  const threshold = USER_ROLE_HIERARCHY[role] ?? 0;
  return (Object.entries(USER_ROLE_HIERARCHY) as [UserRole, number][])
    .filter(([, rank]) => rank <= threshold)
    .map(([r]) => r);
}

/**
 * Return true if `assignerRole` is allowed to assign `targetRole` to another user.
 * A user can only assign roles strictly below their own rank.
 */
export function canAssignRole(assignerRole: UserRole, targetRole: UserRole): boolean {
  return (USER_ROLE_HIERARCHY[assignerRole] ?? 0) > (USER_ROLE_HIERARCHY[targetRole] ?? 0);
}
