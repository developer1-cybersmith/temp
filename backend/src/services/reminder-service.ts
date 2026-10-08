import { cloudClient as baileysAdapter } from './whatsapp-cloud-client.js';

interface ScheduledReminder {
  userId: string;
  jid: string;
  customerName: string;
  service: string;
  bookingTime: Date;
  timers: NodeJS.Timeout[];
}

/**
 * ReminderService — schedules WhatsApp reminders before appointments.
 * Inspired by the n8n ReminderAgent workflow.
 * 
 * Sends reminders at:
 * - 2 hours before appointment
 * - 1 hour before appointment
 */
export class ReminderService {
  private reminders = new Map<string, ScheduledReminder>();

  /** Schedule 2h and 1h reminders for a booked appointment */
  scheduleReminders(
    userId: string,
    jid: string,
    customerName: string,
    service: string,
    bookingTimeIso: string
  ): void {
    const bookingTime = new Date(bookingTimeIso);
    if (isNaN(bookingTime.getTime())) {
      console.error(`❌ Invalid booking time: ${bookingTimeIso}`);
      return;
    }

    const now = Date.now();
    const timers: NodeJS.Timeout[] = [];
    const key = `${userId}:${jid}:${bookingTimeIso}`;

    // Cancel any existing reminders for this appointment
    this.cancelReminders(key);

    // 2-hour reminder
    const twoHoursBefore = bookingTime.getTime() - 2 * 60 * 60 * 1000;
    if (twoHoursBefore > now) {
      const delay = twoHoursBefore - now;
      const timer = setTimeout(async () => {
        try {
          const msg = `Hey ${customerName}, just a reminder that your ${service} appointment is in 2 hours. See you then! In case of any changes, just text us.`;
          await baileysAdapter.sendMessage(userId, jid, msg);
          console.log(`⏰ [Reminder] 2h reminder sent to ${customerName}`);
        } catch (err: any) {
          console.error(`[Reminder] Failed to send reminder:`, err.message);
        }
      }, delay);
      timers.push(timer);
      console.log(`⏰ [Reminder] 2h reminder scheduled for ${customerName} (in ${Math.round(delay / 60000)}min)`);
    }

    // 1-hour reminder
    const oneHourBefore = bookingTime.getTime() - 1 * 60 * 60 * 1000;
    if (oneHourBefore > now) {
      const delay = oneHourBefore - now;
      const timer = setTimeout(async () => {
        try {
          const msg = `Hi ${customerName}, your ${service} appointment is in 1 hour. Looking forward to seeing you!`;
          await baileysAdapter.sendMessage(userId, jid, msg);
          console.log(`⏰ [Reminder] 1h reminder sent to ${customerName}`);
        } catch (err: any) {
          console.error(`[Reminder] Failed to send reminder:`, err.message);
        }
      }, delay);
      timers.push(timer);
      console.log(`⏰ [Reminder] 1h reminder scheduled for ${customerName} (in ${Math.round(delay / 60000)}min)`);
    }

    if (timers.length > 0) {
      this.reminders.set(key, {
        userId,
        jid,
        customerName,
        service,
        bookingTime,
        timers,
      });
    }
  }

  /** Cancel scheduled reminders */
  cancelReminders(key: string): void {
    const reminder = this.reminders.get(key);
    if (reminder) {
      reminder.timers.forEach(t => clearTimeout(t));
      this.reminders.delete(key);
    }
  }

  /** Get number of active reminders */
  get activeCount(): number {
    return this.reminders.size;
  }
}

export const reminderService = new ReminderService();
