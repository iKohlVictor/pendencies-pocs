import { InvalidValueError, MissingFieldError, required } from '../../shared/domain/domain-error.js';
import { ROLE, type Role } from '../../shared/domain/roles.js';

/**
 * A profile groups the roles the workflows check. Users point to one profile,
 * so changing a profile's roles changes what all its users may do.
 */
export interface Profile {
  id: string;
  name: string;
  roles: Role[];
}

const ALL_ROLES = Object.values(ROLE) as readonly Role[];

export const isRole = (value: unknown): value is Role => ALL_ROLES.includes(value as Role);

export function createProfile(id: string, name: string | undefined, roles: unknown): Profile {
  return { id, name: required('name', name), roles: parseRoles(roles) };
}

function parseRoles(roles: unknown): Role[] {
  if (!Array.isArray(roles) || roles.length === 0) throw new MissingFieldError('roles');
  const unknown = roles.find((role) => !isRole(role));
  if (unknown !== undefined) throw new InvalidValueError('roles', String(unknown), ALL_ROLES);
  return [...new Set(roles as Role[])];
}

/** Profiles that exist from the start, one per role of the workflows. */
export const DEFAULT_PROFILES: ReadonlyArray<Omit<Profile, 'id'>> = [
  { name: 'Filial', roles: [ROLE.branch] },
  { name: 'Análise de documentação', roles: [ROLE.documentationAnalysis] },
  { name: 'Programação de pagamento', roles: [ROLE.paymentScheduling] },
];
