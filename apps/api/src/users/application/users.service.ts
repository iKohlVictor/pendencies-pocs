import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { NotFoundError, required } from '../../shared/domain/domain-error.js';
import { createProfile, type Profile } from '../domain/profile.js';
import { createUser, type User } from '../domain/user.js';
import {
  PROFILE_REPOSITORY,
  USER_REPOSITORY,
  type ProfileRepository,
  type UserRepository,
} from '../domain/users.repository.js';

/** A user as the API returns it: with its profile (and therefore its roles) resolved. */
export interface UserView {
  id: string;
  name: string;
  profile: Profile;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  // --- profiles ---

  async createProfile(name: string | undefined, roles: unknown): Promise<Profile> {
    const profile = createProfile(await this.profiles.nextId(), name, roles);
    await this.profiles.save(profile);
    return profile;
  }

  listProfiles(): Promise<Profile[]> {
    return this.profiles.findAll();
  }

  getProfile(id: string): Promise<Profile> {
    return this.loadProfile(id);
  }

  // --- users ---

  async createUser(name: string | undefined, profileId: string | undefined): Promise<UserView> {
    const profile = await this.loadProfile(required('profileId', profileId));
    const user = createUser(await this.users.nextId(), name, profile.id);
    await this.users.save(user);
    return { id: user.id, name: user.name, profile };
  }

  async listUsers(profileId?: string): Promise<UserView[]> {
    const users = (await this.users.findAll()).filter((u) => !profileId || u.profileId === profileId);
    return Promise.all(users.map((user) => this.view(user)));
  }

  async getUser(id: string): Promise<UserView> {
    return this.view(await this.loadUser(id));
  }

  async assignProfile(userId: string, profileId: string | undefined): Promise<UserView> {
    const user = await this.loadUser(userId);
    const profile = await this.loadProfile(required('profileId', profileId));
    await this.users.save({ ...user, profileId: profile.id });
    return { id: user.id, name: user.name, profile };
  }

  /** Who is acting: the user's id plus the roles of their profile. Null if the user does not exist. */
  async resolveActor(userId: string): Promise<Actor | null> {
    const user = await this.users.findById(userId);
    if (!user) return null;
    const profile = await this.profiles.findById(user.profileId);
    return { id: user.id, roles: profile?.roles ?? [] };
  }

  private async view(user: User): Promise<UserView> {
    return { id: user.id, name: user.name, profile: await this.loadProfile(user.profileId) };
  }

  private async loadUser(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  private async loadProfile(id: string): Promise<Profile> {
    const profile = await this.profiles.findById(id);
    if (!profile) throw new NotFoundError('Profile', id);
    return profile;
  }
}
