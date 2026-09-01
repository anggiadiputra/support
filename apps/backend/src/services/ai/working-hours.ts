/**
 * Working Hours Helper Service
 *
 * Provides utilities to check if the current time falls within
 * configured working hours for AI chatbot availability.
 */

// ============================================================================
// Types
// ============================================================================

export interface DaySchedule {
  start: string; // "09:00" format (HH:mm)
  end: string; // "17:00" format (HH:mm)
}

export interface WorkingHours {
  monday?: DaySchedule | null;
  tuesday?: DaySchedule | null;
  wednesday?: DaySchedule | null;
  thursday?: DaySchedule | null;
  friday?: DaySchedule | null;
  saturday?: DaySchedule | null;
  sunday?: DaySchedule | null;
}

// Day names as they appear in WorkingHours interface
type DayName = keyof WorkingHours;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the current day name in the specified timezone
 * @param timezone - IANA timezone string (e.g., "Asia/Jakarta")
 * @returns Day name in lowercase (monday, tuesday, etc.)
 */
export function getDayName(timezone: string): DayName {
  const now = new Date();

  // Use Intl.DateTimeFormat to get the weekday in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timezone,
  });

  const dayName = formatter.format(now).toLowerCase() as DayName;
  return dayName;
}

/**
 * Get the current time in HH:mm format for the specified timezone
 * @param timezone - IANA timezone string (e.g., "Asia/Jakarta")
 * @returns Time string in "HH:mm" format
 */
export function getCurrentTime(timezone: string): string {
  const now = new Date();

  // Get hours and minutes in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });

  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';

  return `${hour}:${minute}`;
}

/**
 * Convert time string "HH:mm" to minutes since midnight
 * @param time - Time string in "HH:mm" format
 * @returns Minutes since midnight (0-1439)
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if a time falls within a given range
 * Handles overnight ranges (e.g., 22:00 to 06:00)
 *
 * @param currentTime - Current time in "HH:mm" format
 * @param start - Start time in "HH:mm" format
 * @param end - End time in "HH:mm" format
 * @returns true if currentTime is within the range
 */
export function isTimeInRange(currentTime: string, start: string, end: string): boolean {
  const current = timeToMinutes(currentTime);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  // Normal range (e.g., 09:00 to 17:00)
  if (startMinutes <= endMinutes) {
    return current >= startMinutes && current < endMinutes;
  }

  // Overnight range (e.g., 22:00 to 06:00)
  // Current time is valid if it's after start OR before end
  return current >= startMinutes || current < endMinutes;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Check if current time is within working hours
 *
 * @param workingHours - The working hours config (can be null/undefined = always available)
 * @param timezone - IANA timezone string (e.g., "Asia/Jakarta")
 * @returns true if AI should respond (within working hours or no config), false if outside working hours
 *
 * @example
 * // AI always available (no config)
 * isWithinWorkingHours(null, "Asia/Jakarta") // true
 *
 * @example
 * // Check against working hours
 * const hours: WorkingHours = {
 *   monday: { start: "09:00", end: "17:00" },
 *   tuesday: { start: "09:00", end: "17:00" },
 *   // ... other days
 *   sunday: null // Day off
 * };
 * isWithinWorkingHours(hours, "Asia/Jakarta")
 */
export function isWithinWorkingHours(
  workingHours: WorkingHours | null | undefined,
  timezone: string
): boolean {
  // If no working hours config, AI is always available
  if (!workingHours) {
    return true;
  }

  // Get current day and time in the specified timezone
  const dayName = getDayName(timezone);
  const currentTime = getCurrentTime(timezone);

  // Get today's schedule
  const todaySchedule = workingHours[dayName];

  // If today is null or undefined, it's a day off
  if (!todaySchedule) {
    return false;
  }

  // Check if current time is within the working hours range
  return isTimeInRange(currentTime, todaySchedule.start, todaySchedule.end);
}
