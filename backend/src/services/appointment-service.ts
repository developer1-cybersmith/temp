import { SupabaseClient } from '@supabase/supabase-js';

interface WorkingHoursDay {
  enabled: boolean;
  start: string; // "10:00"
  end: string;   // "19:00"
}

interface WorkingHours {
  [day: string]: WorkingHoursDay;
}

interface WorkingHoursConfig {
  hours: WorkingHours;
  slotDurationMinutes: number;
}

interface BookedSlot {
  start: Date;
  end: Date;
}

interface SlotAvailability {
  available: boolean;
  reason?: string;
}

interface BookingResult {
  success: boolean;
  alternatives?: string[];
  message: string;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday:    { enabled: true,  start: '10:00', end: '19:00' },
  tuesday:   { enabled: true,  start: '10:00', end: '19:00' },
  wednesday: { enabled: true,  start: '10:00', end: '19:00' },
  thursday:  { enabled: true,  start: '10:00', end: '19:00' },
  friday:    { enabled: true,  start: '10:00', end: '19:00' },
  saturday:  { enabled: true,  start: '10:00', end: '19:00' },
  sunday:    { enabled: false, start: '10:00', end: '19:00' },
};

const DEFAULT_SLOT_DURATION = 30;

/**
 * Convert a Date to IST by returning a Date whose **UTC** fields
 * (getUTCDay, getUTCHours, etc.) equal the IST wall-clock values.
 *
 * The old implementation `new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))`
 * is broken: the string is re-parsed in the *system* timezone, so on a UTC
 * server the resulting getDay()/getHours() reflect UTC, not IST -- causing
 * wrong day-of-week detection (e.g. Saturday misidentified as Sunday when the
 * IST time crosses midnight relative to UTC).
 */
function toIST(date: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    parts[p.type] = p.value;
  }
  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,   // hour12:false may return "24" for midnight
    Number(parts.minute),
    Number(parts.second),
  ));
}

/** Format "14:30" -> "2:30 PM" */
function formatTimeDisplay(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Parse "10:00" into total minutes from midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * If a datetime string has no timezone offset (e.g. "2026-04-12T15:00:00"),
 * append "+05:30" so it is interpreted as IST instead of the server's local TZ.
 * Strings that already contain a timezone indicator (Z, +, or - after the time)
 * are returned unchanged.
 */
function ensureISTOffset(dateTimeIso: string): string {
  // Already has timezone info (ends with Z, +HH:MM, or -HH:MM)
  if (/[Zz]$/.test(dateTimeIso) || /[+-]\d{2}:\d{2}$/.test(dateTimeIso)) {
    return dateTimeIso;
  }
  return `${dateTimeIso}+05:30`;
}

/** Convert total minutes to "HH:MM" */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export class AppointmentService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Fetch working hours and slot duration for a user.
   * Returns defaults if not configured.
   */
  async getWorkingHours(userId: string): Promise<WorkingHoursConfig> {
    const { data, error } = await this.supabase
      .from('wb_users')
      .select('working_hours, slot_duration_minutes')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return { hours: DEFAULT_WORKING_HOURS, slotDurationMinutes: DEFAULT_SLOT_DURATION };
    }

    return {
      hours: data.working_hours || DEFAULT_WORKING_HOURS,
      slotDurationMinutes: data.slot_duration_minutes || DEFAULT_SLOT_DURATION,
    };
  }

  /**
   * Get all booked appointment slots for a user on a specific date.
   * @param date - Date string in "YYYY-MM-DD" format
   */
  async getBookedSlots(userId: string, date: string): Promise<BookedSlot[]> {
    const dayStart = `${date}T00:00:00+05:30`;
    const dayEnd = `${date}T23:59:59+05:30`;

    const { data, error } = await this.supabase
      .from('wb_tasks')
      .select('appointment_time, title')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .gte('appointment_time', dayStart)
      .lte('appointment_time', dayEnd);

    if (error || !data) {
      return [];
    }

    const config = await this.getWorkingHours(userId);
    const slotMs = config.slotDurationMinutes * 60 * 1000;

    return data
      .filter((row: any) => row.appointment_time)
      .map((row: any) => {
        const start = new Date(row.appointment_time);
        const end = new Date(start.getTime() + slotMs);
        return { start, end };
      });
  }

  /**
   * Get available time slots for a user on a specific date.
   * @param date - Date string in "YYYY-MM-DD" format
   * @returns Array of available time strings like ["10:00", "10:30", ...]
   */
  async getAvailableSlots(userId: string, date: string): Promise<string[]> {
    const config = await this.getWorkingHours(userId);

    // Determine day of week in IST
    const dateObj = new Date(`${date}T12:00:00+05:30`);
    const istDate = toIST(dateObj);
    const dayName = DAY_NAMES[istDate.getUTCDay()];
    const dayConfig = config.hours[dayName];

    if (!dayConfig || !dayConfig.enabled) {
      return [];
    }

    // Generate all possible slots
    const startMinutes = timeToMinutes(dayConfig.start);
    const endMinutes = timeToMinutes(dayConfig.end);
    const slotDuration = config.slotDurationMinutes;

    const allSlots: string[] = [];
    for (let m = startMinutes; m + slotDuration <= endMinutes; m += slotDuration) {
      allSlots.push(minutesToTime(m));
    }

    // Subtract booked slots
    const bookedSlots = await this.getBookedSlots(userId, date);

    const available = allSlots.filter((slotTime) => {
      const slotStart = new Date(`${date}T${slotTime}:00+05:30`);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

      // Check if this slot overlaps with any booked slot
      return !bookedSlots.some((booked) =>
        slotStart < booked.end && slotEnd > booked.start
      );
    });

    return available;
  }

  /**
   * Check if a specific time slot is available.
   * @param dateTimeIso - ISO datetime string
   */
  async isSlotAvailable(userId: string, dateTimeIso: string): Promise<SlotAvailability> {
    // Ensure the datetime is interpreted in IST if no timezone is specified.
    // Without this, `new Date('2026-04-11T21:00:00')` on a UTC server would be
    // interpreted as UTC, which is Apr 12 02:30 IST -- shifting the day.
    dateTimeIso = ensureISTOffset(dateTimeIso);

    const requestedDate = new Date(dateTimeIso);
    if (isNaN(requestedDate.getTime())) {
      return { available: false, reason: 'Invalid date/time format' };
    }

    const istDate = toIST(requestedDate);
    const dayName = DAY_NAMES[istDate.getUTCDay()];

    const config = await this.getWorkingHours(userId);
    const dayConfig = config.hours[dayName];

    // Check if day is enabled
    if (!dayConfig || !dayConfig.enabled) {
      return { available: false, reason: `We are closed on ${dayName}s` };
    }

    // Check if within working hours
    const requestedMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
    const startMinutes = timeToMinutes(dayConfig.start);
    const endMinutes = timeToMinutes(dayConfig.end);

    if (requestedMinutes < startMinutes || requestedMinutes + config.slotDurationMinutes > endMinutes) {
      return {
        available: false,
        reason: `Outside working hours. We are available from ${formatTimeDisplay(dayConfig.start)} to ${formatTimeDisplay(dayConfig.end)}`,
      };
    }

    // Check if slot overlaps with existing bookings
    const dateStr = dateTimeIso.split('T')[0];
    const bookedSlots = await this.getBookedSlots(userId, dateStr);
    const slotMs = config.slotDurationMinutes * 60 * 1000;
    const slotEnd = new Date(requestedDate.getTime() + slotMs);

    const hasConflict = bookedSlots.some(
      (booked) => requestedDate < booked.end && slotEnd > booked.start
    );

    if (hasConflict) {
      return { available: false, reason: 'This time slot is already booked' };
    }

    return { available: true };
  }

  /**
   * Book an appointment slot.
   */
  async bookSlot(
    userId: string,
    params: {
      customerName: string;
      service: string;
      dateTimeIso: string;
      conversationId?: string;
    }
  ): Promise<BookingResult> {
    const { customerName, service, conversationId } = params;
    const dateTimeIso = ensureISTOffset(params.dateTimeIso);

    // Check availability
    const availability = await this.isSlotAvailable(userId, dateTimeIso);

    if (!availability.available) {
      const alternatives = await this.suggestAlternatives(userId, dateTimeIso);
      console.log(`[Appointment] Booking failed for ${customerName}: ${availability.reason}`);

      const message = alternatives.length > 0
        ? `${availability.reason}. Next available: ${alternatives.join(', ')}`
        : `${availability.reason}. No available slots found in the next few days.`;

      return {
        success: false,
        alternatives,
        message,
      };
    }

    // Insert the appointment
    const dateStr = dateTimeIso.split('T')[0];
    const istForTitle = toIST(new Date(dateTimeIso));
    const formattedTime = formatTimeDisplay(
      `${istForTitle.getUTCHours().toString().padStart(2, '0')}:${istForTitle.getUTCMinutes().toString().padStart(2, '0')}`
    );
    const title = `📅 Appointment: ${customerName} — ${service} at ${formattedTime}`;

    const insertData: any = {
      user_id: userId,
      title,
      due_date: dateStr,
      appointment_time: dateTimeIso,
      is_completed: false,
    };

    if (conversationId) {
      insertData.conversation_id = conversationId;
    }

    const { error } = await this.supabase.from('wb_tasks').insert(insertData);

    if (error) {
      console.log(`[Appointment] Failed to book for ${customerName}:`, error.message);
      return {
        success: false,
        message: 'Failed to save the appointment. Please try again.',
      };
    }

    const istDate = toIST(new Date(dateTimeIso));
    const timeDisplay = formatTimeDisplay(
      `${istDate.getUTCHours().toString().padStart(2, '0')}:${istDate.getUTCMinutes().toString().padStart(2, '0')}`
    );

    console.log(`[Appointment] Booked: ${customerName} for ${service} on ${dateStr} at ${timeDisplay}`);

    return {
      success: true,
      message: `Appointment booked for ${customerName} — ${service} on ${dateStr} at ${timeDisplay}`,
    };
  }

  /**
   * Suggest alternative available slots closest to the requested time.
   * Looks up to 3 days ahead if the requested day is closed or fully booked.
   * @param count - Number of alternatives to return (default 3)
   */
  async suggestAlternatives(userId: string, dateTimeIso: string, count: number = 3): Promise<string[]> {
    const requestedDate = new Date(dateTimeIso);
    const istDate = toIST(requestedDate);
    const requestedMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

    // Try the requested date, then up to 3 days ahead
    for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
      const checkDate = new Date(`${dateTimeIso.split('T')[0]}T12:00:00+05:30`);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const checkDateStr = checkDate.toISOString().split('T')[0];

      const availableSlots = await this.getAvailableSlots(userId, checkDateStr);

      if (availableSlots.length === 0) {
        continue;
      }

      // Determine the display day name (capitalized)
      const checkIst = toIST(checkDate);
      const dayName = DAY_NAMES[checkIst.getUTCDay()];
      const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);

      // Sort by proximity to requested time
      const sorted = [...availableSlots].sort((a, b) => {
        const diffA = Math.abs(timeToMinutes(a) - requestedMinutes);
        const diffB = Math.abs(timeToMinutes(b) - requestedMinutes);
        return diffA - diffB;
      });

      // Return top N formatted with day name: "Monday 10:00 AM"
      return sorted.slice(0, count).map((slot) => `${dayLabel} ${formatTimeDisplay(slot)}`);
    }

    return [];
  }
}
