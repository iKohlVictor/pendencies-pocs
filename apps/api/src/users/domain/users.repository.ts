import type { Profile } from './profile.js';
import type { User } from './user.js';

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface ProfileRepository {
  nextId(): Promise<string>;
  findById(id: string): Promise<Profile | null>;
  findAll(): Promise<Profile[]>;
  save(profile: Profile): Promise<void>;
}

export interface UserRepository {
  nextId(): Promise<string>;
  findById(id: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  save(user: User): Promise<void>;
}
