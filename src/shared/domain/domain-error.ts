import type { TransitionError } from 'machine-flow';

/** Base class for everything the domain can refuse. Mapped to HTTP at the edge. */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} ${id} not found`);
  }
}

/** A state machine refused the action. Carries the lib's typed error as-is. */
export class ActionDeniedError extends DomainError {
  constructor(
    public readonly entity: string,
    public readonly id: string,
    public readonly reason: TransitionError,
  ) {
    super(`Action denied on ${entity} ${id}: ${reason.code}`);
  }
}

export class MissingFieldError extends DomainError {
  constructor(public readonly field: string) {
    super(`Field "${field}" is required`);
  }
}

/** A field came with a value outside the allowed set (e.g. an unknown type). */
export class InvalidValueError extends DomainError {
  constructor(
    public readonly field: string,
    public readonly value: string | undefined,
    public readonly allowed: readonly string[],
  ) {
    super(`Field "${field}" must be one of: ${allowed.join(', ')}`);
  }
}

/** Someone else changed the record between our read and our write. */
export class ConcurrencyError extends DomainError {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} ${id} was modified concurrently`);
  }
}

export function required(field: string, value: string | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new MissingFieldError(field);
  return trimmed;
}
