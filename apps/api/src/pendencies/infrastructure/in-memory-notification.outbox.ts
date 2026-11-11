import { Injectable } from '@nestjs/common';
import type { Notification, NotificationOutbox } from '../application/notification-outbox.js';

@Injectable()
export class InMemoryNotificationOutbox implements NotificationOutbox {
  private readonly items: Notification[] = [];

  async publish(notification: Notification): Promise<void> {
    this.items.push(notification);
  }

  async list(role?: string): Promise<Notification[]> {
    return role ? this.items.filter((n) => n.role === role) : [...this.items];
  }
}
