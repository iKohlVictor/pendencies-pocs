import { required } from '../../shared/domain/domain-error.js';

/** Someone who acts on events and pendencies. What they may do comes from their profile. */
export interface User {
  id: string;
  name: string;
  profileId: string;
}

export function createUser(id: string, name: string | undefined, profileId: string): User {
  return { id, name: required('name', name), profileId };
}
