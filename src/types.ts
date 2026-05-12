/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Sport {
  PICKLEBALL = 'Pickleball',
  BADMINTON = 'Badminton',
}

export enum BookingStatus {
  PENDING_PAYMENT = 'Pending Payment',
  CONFIRMED = 'Confirmed',
  CANCELLED = 'Cancelled',
}

export interface Booking {
  bookingId: string;
  flatNumber: string;
  residentName: string;
  sport: Sport;
  date: string;
  startTime24: string;
  endTime24: string;
  startTimeDisplay: string;
  endTimeDisplay: string;
  duration: number;
  hasGuest: boolean;
  paddles: number;
  playerCount: number;        
  players: { slot: number; name: string }[]; 
  courtFee: number;
  paddleFee: number;
  totalAmount: number;
  status: BookingStatus;
  createdAt: string;
  cancelReason?: string;
  cancelledAt?: string;
  editedAt?: string;
}

export interface Session {
  name: string;
  start: string; // 24h HH:mm
  end: string;
}

export type Tab = 'Book' | 'My Bookings' | 'Schedule' | 'Admin' | 'Rules';
