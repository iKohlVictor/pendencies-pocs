import { Injectable } from '@nestjs/common';
import { DEFAULT_PROFILES, type Profile } from '../domain/profile.js';
import type { User } from '../domain/user.js';
import type { ProfileRepository, UserRepository } from '../domain/users.repository.js';

class InMemoryStore<T extends { id: string }> {
  private readonly rows = new Map<string, T>();
  private sequence = 0;

  constructor(private readonly prefix: string) {}

  async nextId(): Promise<string> {
    this.sequence += 1;
    return `${this.prefix}-${this.sequence}`;
  }

  async findById(id: string): Promise<T | null> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }

  async findAll(): Promise<T[]> {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }

  async save(row: T): Promise<void> {
    this.rows.set(row.id, structuredClone(row));
  }

  /** Stores rows with ids `<prefix>-1..n`; the next generated id continues after them. */
  protected seed(rows: ReadonlyArray<Omit<T, 'id'>>): void {
    for (const row of rows) {
      this.sequence += 1;
      const id = `${this.prefix}-${this.sequence}`;
      this.rows.set(id, structuredClone({ ...row, id } as T));
    }
  }
}

/** Starts with the default profiles: PRF-1 Filial, PRF-2 Documentação, PRF-3 Programação. */
@Injectable()
export class InMemoryProfileRepository extends InMemoryStore<Profile> implements ProfileRepository {
  constructor() {
    super('PRF');
    this.seed(DEFAULT_PROFILES);
  }
}

@Injectable()
export class InMemoryUserRepository extends InMemoryStore<User> implements UserRepository {
  constructor() {
    super('USR');
  }
}
