/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEEKDAY_SESSIONS, WEEKEND_SESSIONS } from './constants';
import { Session } from './types';

export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

export function getSessionsForDate(dateStr: string): Session[] {
  return isWeekend(dateStr) ? WEEKEND_SESSIONS : WEEKDAY_SESSIONS;
}

export function getTimeSlots(session: Session): string[] {
  const slots: string[] = [];
  let current = session.start;
  
  while (current < session.end) {
    slots.push(current);
    const [h, m] = current.split(':').map(Number);
    let nextM = m + 30;
    let nextH = h;
    if (nextM >= 60) {
      nextM = 0;
      nextH += 1;
    }
    current = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
  }
  slots.push(session.end); // To allow it as a possible end time
  return slots;
}

export function formatTimeSlot(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function calculateDuration(start: string, end: string): number {
  return timeToMins(end) - timeToMins(start);
}

export function timeToMins(time24: string): number {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
}

export function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isPastSlot(slotTime: string, dateStr: string): boolean {
  /*
    Returns true if the given slot start time has already
    passed on the given date in local device time.

    slotTime — "HH:MM" 24-hour string (e.g. "18:00")
    dateStr  — "YYYY-MM-DD" string (e.g. "2026-05-10")

    Rules:
      - If dateStr is NOT today → always return false
        (future or past calendar dates are irrelevant)
      - If dateStr IS today → return true if slotTime
        is strictly BEFORE the current local time
        (current hour:minute, ignoring seconds)
  */
  const today = new Date();
  const todayStr = getTodayStr();

  if (dateStr !== todayStr) return false;

  const nowMins = today.getHours() * 60 + today.getMinutes();
  const slotMins = timeToMins(slotTime);

  return slotMins < nowMins;
}

export function getTodayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

export function canEditBooking(booking: any): 'allowed' | 'locked' | 'none' {
  /*
    Returns:
      'allowed' — edit enabled  (> 120 mins before slot start)
      'locked'  — edit disabled (≤ 120 mins before slot start,
                                 or slot is in the past)
      'none'    — no edit button (not Confirmed)
  */
  if (booking.status !== 'Confirmed') return 'none';

  const [yr, mo, dy] = booking.date.split('-').map(Number);
  const [hr, mn]     = booking.startTime24.split(':').map(Number);
  const slotStart    = new Date(yr, mo - 1, dy, hr, mn, 0);
  const diffMins     = (slotStart.getTime() - new Date().getTime()) / 60000;

  if (diffMins > 120) return 'allowed';
  return 'locked';  // covers both ≤120 mins and past slots
}

export function generateBookingId(index: number): string {
  const year = new Date().getFullYear();
  return `DA-${year}-${String(index + 1).padStart(3, '0')}`;
}
