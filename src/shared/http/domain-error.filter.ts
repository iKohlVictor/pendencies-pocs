import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { TransitionError } from 'machine-flow';
import {
  ActionDeniedError,
  ConcurrencyError,
  DomainError,
  MissingFieldError,
  NotFoundError,
} from '../domain/domain-error.js';

/** The lib's error codes translated to HTTP, in one place, for every workflow. */
const STATUS_BY_CODE: Record<TransitionError['code'], HttpStatus> = {
  FORBIDDEN: HttpStatus.FORBIDDEN, // wrong role for this step
  GUARD_FAILED: HttpStatus.UNPROCESSABLE_ENTITY, // data does not allow it
  INVALID_EVENT: HttpStatus.CONFLICT, // action does not exist in the current state
  FINAL_STATE: HttpStatus.CONFLICT, // workflow already finished
  UNKNOWN_STATE: HttpStatus.INTERNAL_SERVER_ERROR, // corrupted data
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = toHttp(error);
    response.status(status).json({ statusCode: status, error: error.name, message: error.message, ...body });
  }
}

function toHttp(error: DomainError): { status: HttpStatus; body?: object } {
  if (error instanceof ActionDeniedError) {
    return { status: STATUS_BY_CODE[error.reason.code], body: { reason: error.reason } };
  }
  if (error instanceof NotFoundError) return { status: HttpStatus.NOT_FOUND };
  if (error instanceof MissingFieldError) {
    return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { field: error.field } };
  }
  if (error instanceof ConcurrencyError) return { status: HttpStatus.CONFLICT };
  return { status: HttpStatus.BAD_REQUEST };
}
