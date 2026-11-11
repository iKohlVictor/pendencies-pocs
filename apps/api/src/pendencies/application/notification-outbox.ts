import type { Role } from '../../shared/domain/roles.js';

export interface Notification {
  at: string;
  pendencyId: string;
  role: Role;
  message: string;
}

/** Port for delivering "your turn" notices. In real life: a queue or an outbox table. */
export interface NotificationOutbox {
  publish(notification: Notification): Promise<void>;
  list(role?: string): Promise<Notification[]>;
}

export const NOTIFICATION_OUTBOX = Symbol('NotificationOutbox');
