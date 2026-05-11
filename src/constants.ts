/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Session } from './types';

export const WEEKDAY_SESSIONS: Session[] = [
  { name: 'Morning', start: '07:00', end: '09:00' },
  { name: 'Evening', start: '18:00', end: '22:00' },
];

export const WEEKEND_SESSIONS: Session[] = [
  { name: 'Morning', start: '07:00', end: '13:00' },
  { name: 'Evening', start: '17:00', end: '23:00' },
];

export const RESIDENT_RATE = 100; // per 30 mins
export const GUEST_RATE = 200;    // per 30 mins
export const PADDLE_RATE = 25;    // per paddle

export const ADMIN_PIN = '9876';

export const AUTO_CANCEL_WARNING_MINS = 30;
export const AUTO_CANCEL_THRESHOLD_MINS = 60;
