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

/** Parses an ISO 8601 date-time and normalizes it to UTC (`toISOString`). */
export function parseDateTime(field: string, value: string | undefined): string {
  const text = required(field, value);
  const time = Date.parse(text);
  if (Number.isNaN(time)) throw new InvalidValueError(field, text, ['ISO 8601 date-time']);
  return new Date(time).toISOString();
}

export function required(field: string, value: string | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new MissingFieldError(field);
  return trimmed;
}

/** Creating something whose id is already taken. */
export class AlreadyExistsError extends DomainError {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} ${id} already exists`);
  }
}
