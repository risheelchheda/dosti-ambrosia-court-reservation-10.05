/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sport, 
  BookingStatus, 
  Booking, 
  Tab 
} from './types';
import { 
  RESIDENT_RATE, 
  GUEST_RATE, 
  PADDLE_RATE, 
  ADMIN_PIN, 
  AUTO_CANCEL_THRESHOLD_MINS 
} from './constants';
import { 
  getSessionsForDate, 
  getTimeSlots, 
  formatTimeSlot, 
  calculateDuration, 
  generateBookingId,
  isWeekend,
  isPastSlot,
  getTodayStr,
  canEditBooking,
  timeToMins,
  minsToTime
} from './utils';
import { motion, AnimatePresence } from 'motion/react';

// --- SVGs ---
const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-accent">
    <rect width="32" height="32" rx="4" fill="currentColor" fillOpacity="0.1" />
    <rect x="4" y="4" width="24" height="24" rx="2" stroke="currentColor" strokeWidth="2" />
    <line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
    <line x1="4" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const Sun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
);

const Moon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);

// --- Components ---

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Book');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastSubmission, setLastSubmission] = useState<Booking | null>(null);
  const [tick, setTick] = useState(0);

  // Refresh slots every minute for "Past" logic
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-cancel logic
  useEffect(() => {
    const runAutoCancelCheck = () => {
      const now = new Date();
      let changed = false;
      
      setBookings(prev => {
        const next = prev.map(booking => {
          if (booking.status !== BookingStatus.PENDING_PAYMENT) return booking;
          const elapsedMins = (now.getTime() - new Date(booking.createdAt).getTime()) / 1000 / 60;
          
          if (elapsedMins >= AUTO_CANCEL_THRESHOLD_MINS) {
            changed = true;
            addToast(`Booking ${booking.bookingId} auto-cancelled. Slot reopened.`, 'warning');
            return {
              ...booking,
              status: BookingStatus.CANCELLED,
              cancelReason: `Auto-cancelled: payment not received promptly`,
              cancelledAt: now.toISOString()
            };
          }
          return booking;
        });
        return changed ? next : prev;
      });
    };

    runAutoCancelCheck();
    const interval = setInterval(runAutoCancelCheck, 60000);
    return () => clearInterval(interval);
  }, []);

  // Clear last submission when switching tabs to ensure it only shows immediately after booking
  useEffect(() => {
    if (activeTab !== 'Book') {
      setLastSubmission(null);
    }
  }, [activeTab]);

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const addToast = (message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }].slice(-3));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const handleBooking = (data: Partial<Booking>) => {
    const newBooking: Booking = {
      ...data as any,
      bookingId: generateBookingId(bookings.length),
      status: BookingStatus.PENDING_PAYMENT,
      createdAt: new Date().toISOString()
    };
    setBookings(prev => [...prev, newBooking]);
    setLastSubmission(newBooking);
    addToast(`Booking ${newBooking.bookingId} reserved. Pay via UPI or Cash now.`, 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-white border-b border-accent/30 overflow-hidden">
        {/* Court Line Texture Overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-white dash-line" style={{ backgroundImage: 'linear-gradient(to bottom, white 50%, transparent 50%)', backgroundSize: '1px 8px' }} />
          <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-full bg-white" />
        </div>

        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/20">
              <Logo />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-display font-bold tracking-tight">
                Dosti Ambrosia Court Reservation
              </h1>
            </div>
          </div>
          <button 
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-md"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
        </div>

        {/* Nav Tabs */}
        <nav className="max-w-4xl mx-auto px-4 overflow-x-auto no-scrollbar">
          <div className="flex">
            {(['Book', 'My Bookings', 'Schedule', 'Admin', 'Rules'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-6 text-xs uppercase font-black tracking-widest transition-all relative flex-shrink-0
                  ${activeTab === tab 
                    ? 'text-white' 
                    : 'text-white/50 hover:text-white/80'}`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute bottom-0 left-4 right-4 h-1 bg-accent rounded-t-full shadow-[0_-4px_10px_rgba(141,198,63,0.5)]"
                  />
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'Book' && (
            <motion.div 
              key="book" 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <BookTab 
                onSubmit={handleBooking} 
                existingBookings={bookings} 
                lastSubmission={lastSubmission}
                addToast={addToast}
                tick={tick}
              />
            </motion.div>
          )}
          {activeTab === 'My Bookings' && (
            <motion.div 
              key="my-bookings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <MyBookingsTab bookings={bookings} setBookings={setBookings} addToast={addToast} />
            </motion.div>
          )}
          {activeTab === 'Schedule' && (
            <motion.div 
              key="schedule"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ScheduleTab bookings={bookings} tick={tick} onSlotClick={(d, s) => {
                setActiveTab('Book');
                // We'll need to pass this state to BookTab
              }} />
            </motion.div>
          )}
          {activeTab === 'Admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {!isAdminLoggedIn ? (
                <AdminLogin onLogin={() => setIsAdminLoggedIn(true)} />
              ) : (
                <AdminDashboard 
                  bookings={bookings} 
                  setBookings={setBookings} 
                  onLogout={() => setIsAdminLoggedIn(false)}
                  addToast={addToast}
                  setLastSubmission={setLastSubmission}
                />
              )}
            </motion.div>
          )}
          {activeTab === 'Rules' && (
            <motion.div 
              key="rules"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <RulesTab />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`p-4 rounded-lg shadow-lg border text-sm font-medium min-w-[240px]
                ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200' : ''}
                ${toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200' : ''}
                ${toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-200' : ''}
              `}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Sub-components (Simplified for token limit, would normally split files) ---

function BookTab({ onSubmit, existingBookings, lastSubmission, addToast, tick }: { 
  onSubmit: (d: Partial<Booking>) => void, 
  existingBookings: Booking[],
  lastSubmission: Booking | null,
  addToast: (msg: string, type: Toast['type']) => void,
  tick: number
}) {
  const [form, setForm] = useState({
    flatNumber: '',
    residentName: '',
    sport: Sport.PICKLEBALL,
    date: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    hasGuest: false,
    paddles: 0
  });

  const sessions = useMemo(() => getSessionsForDate(form.date), [form.date]);
  const allStartTimeSlots = useMemo(() => sessions.flatMap(s => {
    const slots = getTimeSlots(s);
    return slots.slice(0, -1); // Remove last slot because it's only an end time
  }), [sessions, tick]); // Added tick here

  // Check overlaps
  const isSlotBlocked = (date: string, start: string, end: string) => {
    if (!start || !end) return false;
    return existingBookings.some(b => {
      if (b.date !== date || b.status === BookingStatus.CANCELLED) return false;
      const bStart = b.startTime24;
      const bEnd = b.endTime24;
      // Overlap logic: (start1 < end2) && (end1 > start2)
      return (start < bEnd) && (end > bStart);
    });
  };

  const availableEndTimes = useMemo(() => {
    if (!form.startTime) return [];
    const session = sessions.find(s => form.startTime >= s.start && form.startTime < s.end);
    if (!session) return [];
    
    const slots = getTimeSlots(session);
    return slots.filter(time => {
      if (time <= form.startTime) return false;
      const duration = calculateDuration(form.startTime, time);
      if (duration > 120) return false;
      if (isSlotBlocked(form.date, form.startTime, time)) return false;
      return true;
    });
  }, [form.date, form.startTime, sessions, tick]); // Added tick here

  // Validation
  const isValid = useMemo(() => {
    if (!form.flatNumber || !form.residentName || !form.startTime || !form.endTime) return false;
    
    // Block submission if the selected start time is in the past
    // (defence against browser dev-tools manipulation)
    if (isPastSlot(form.startTime, form.date)) {
      return false;
    }

    // 1-hour gap rule
    const sameFlatSameDate = existingBookings.filter(b => 
      b.flatNumber === form.flatNumber.toUpperCase() && 
      b.date === form.date && 
      b.status !== BookingStatus.CANCELLED
    );
    
    if (sameFlatSameDate.length > 0) {
      const hasConflict = sameFlatSameDate.some(b => {
        const gapBefore = calculateDuration(b.endTime24, form.startTime);
        const gapAfter = calculateDuration(form.endTime, b.startTime24);
        return (gapBefore >= 0 && gapBefore < 60) || (gapAfter >= 0 && gapAfter < 60);
      });
      if (hasConflict) return false;
    }

    return true;
  }, [form, existingBookings]);

  // Costs
  const duration = form.endTime ? calculateDuration(form.startTime, form.endTime) : 0;
  const courtFee = (duration / 30) * (form.hasGuest ? GUEST_RATE : RESIDENT_RATE);
  const paddleFee = form.sport === Sport.PICKLEBALL ? form.paddles * PADDLE_RATE : 0;
  const totalAmount = courtFee + paddleFee;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPastSlot(form.startTime, form.date)) {
      // Final line of defence
      addToast('This slot is in the past and can no longer be booked.', 'error');
      return;
    }
    if (!isValid) return;
    onSubmit({
      ...form,
      flatNumber: form.flatNumber.toUpperCase(),
      duration,
      courtFee,
      paddleFee,
      totalAmount,
      startTime24: form.startTime,
      endTime24: form.endTime,
      startTimeDisplay: formatTimeSlot(form.startTime),
      endTimeDisplay: formatTimeSlot(form.endTime),
      paddles: form.sport === Sport.PICKLEBALL ? form.paddles : 0
    });
  };

  return (
    <div className="space-y-8">
      {lastSubmission ? (
        <PaymentWarning booking={lastSubmission} onClear={() => window.location.reload()} />
      ) : (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="flat-number" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Flat Number</label>
              <input 
                id="flat-number"
                type="text" 
                value={form.flatNumber}
                onChange={e => setForm(f => ({ ...f, flatNumber: e.target.value.toUpperCase() }))}
                placeholder="e.g. 1603"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="resident-name" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Resident Name</label>
              <input 
                id="resident-name"
                type="text" 
                value={form.residentName}
                onChange={e => setForm(f => ({ ...f, residentName: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-black uppercase tracking-[0.1em] text-text-muted">Select Sport</label>
            <div className="grid grid-cols-2 gap-4">
              {[Sport.PICKLEBALL, Sport.BADMINTON].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, sport: s, paddles: 0 }))}
                  aria-pressed={form.sport === s}
                  className={`group relative h-28 rounded-2xl border-2 transition-all p-4 text-left overflow-hidden
                    ${form.sport === s 
                      ? 'bg-primary border-primary shadow-xl scale-[1.02]' 
                      : 'bg-surface border-border-subtle hover:border-accent'}`}
                >
                  {/* Subtle Sport Theme Background Overlay */}
                  <div className={`absolute -right-4 -bottom-4 w-20 h-20 opacity-[0.03] transition-transform group-hover:scale-110 pointer-events-none rotate-12
                    ${form.sport === s ? 'text-white' : 'text-primary'}`}
                  >
                    <svg viewBox="0 0 100 100" fill="currentColor">
                      <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="2" fill="none" />
                      <path d="M10 50 Q50 10 90 50 T10 50" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </div>

                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                      <h4 className={`text-lg font-display font-bold leading-tight ${form.sport === s ? 'text-white' : 'text-text-main'}`}>
                        {s}
                      </h4>
                    </div>

                    {form.sport === s && (
                      <motion.div 
                        initial={{ scale: 0 }} 
                        animate={{ scale: 1 }} 
                        className="self-end bg-accent text-primary p-1.5 rounded-lg shadow-lg"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </motion.div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="booking-date" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Date</label>
            <input 
              id="booking-date"
              type="date" 
              min={new Date().toISOString().split('T')[0]}
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value, startTime: '', endTime: '' }))}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="start-time" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Start Time</label>
              <div className="relative">
                <select 
                  id="start-time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value, endTime: '' }))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none appearance-none disabled:opacity-50"
                  disabled={allStartTimeSlots.every(time => isPastSlot(time, form.date))}
                >
                  <option value="">Select Time</option>
                  {allStartTimeSlots.map(time => {
                    const isPast = isPastSlot(time, form.date);
                    
                    // Find next possible slot to check if this 30-min block is taken
                    const session = sessions.find(s => time >= s.start && time < s.end);
                    const slots = session ? getTimeSlots(session) : [];
                    const nextTime = slots[slots.indexOf(time) + 1] || time;
                    const isTaken = !isPast && isSlotBlocked(form.date, time, nextTime);
                    
                    return (
                      <option key={time} value={time} disabled={isPast || isTaken}>
                        {formatTimeSlot(time)} {isPast ? '(Past)' : (isTaken ? '(Taken)' : '')}
                      </option>
                    );
                  })}
                </select>
                {allStartTimeSlots.length > 0 && allStartTimeSlots.every(time => isPastSlot(time, form.date)) && (
                  <p className="text-[10px] text-rose-500 font-bold mt-1">No more slots available for today.</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="end-time" className="text-sm font-semibold uppercase tracking-wider text-slate-500">End Time</label>
              <select 
                id="end-time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                disabled={!form.startTime || isPastSlot(form.startTime, form.date)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none disabled:opacity-50 appearance-none"
              >
                <option value="">Select Time</option>
                {!isPastSlot(form.startTime, form.date) && availableEndTimes.map(time => (
                  <option key={time} value={time}>{formatTimeSlot(time)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <label htmlFor="guest-toggle" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">Non-Ambrosia Guest?</label>
            <button
              id="guest-toggle"
              type="button"
              onClick={() => setForm(f => ({ ...f, hasGuest: !f.hasGuest }))}
              aria-pressed={form.hasGuest}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.hasGuest ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.hasGuest ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {form.sport === Sport.PICKLEBALL && (
            <div className="space-y-2">
              <label htmlFor="paddle-count" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Paddle Rentals ({PADDLE_RATE} / paddle)</label>
              <div className="flex items-center gap-4">
                <button 
                  type="button" 
                  onClick={() => setForm(f => ({ ...f, paddles: Math.max(0, f.paddles - 1) }))}
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold"
                >-</button>
                <input
                  id="paddle-count"
                  type="number"
                  min="0"
                  max="4"
                  value={form.paddles}
                  readOnly
                  className="w-12 text-center bg-transparent font-bold text-lg outline-none"
                />
                <button 
                  type="button" 
                  onClick={() => setForm(f => ({ ...f, paddles: Math.min(4, f.paddles + 1) }))}
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold"
                >+</button>
              </div>
            </div>
          )}

          {/* Cost Summary */}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 space-y-2 border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
              <span>Court Fee ({duration} mins)</span>
              <span>₹{courtFee}</span>
            </div>
            {form.sport === Sport.PICKLEBALL && (
             <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Paddle Fee ({form.paddles} paddles)</span>
                <span>₹{paddleFee}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total</span>
              <span className="text-primary dark:text-accent">₹{totalAmount}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className="w-full py-4 bg-primary text-white font-display font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none"
          >
            Reserve Court
          </button>
        </form>
      )}
    </div>
  );
}

function PaymentWarning({ booking, onClear }: { booking: Booking, onClear: () => void }) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="space-y-8 py-2 animate-fadeAndSlideUp" ref={sectionRef}>
      <div className="bg-surface border-2 border-amber-500 shadow-2xl rounded-2xl p-8 relative overflow-hidden group">
        {/* Urgent Pulse Overlay */}
        <div className="absolute top-0 right-0 p-3">
          <div className="bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded animate-pulse tracking-widest">URGENT</div>
        </div>

        <div className="relative z-10 space-y-6">
          <h3 className="text-2xl md:text-3xl font-display font-bold text-amber-700 dark:text-amber-400 tracking-tight">
            ⚠ SLOT RESERVED! PLEASE PAY NOW
          </h3>
          
          <div className="space-y-4">
            <p className="text-lg md:text-xl font-medium leading-relaxed">
              Pay <span className="font-black text-emerald-700 dark:text-accent underline decoration-accent underline-offset-4 decoration-2">₹{booking.totalAmount}</span> via <strong className="font-black border-b-2 border-emerald-700 dark:border-accent">UPI or Cash</strong> to the Court Manager IMMEDIATELY to confirm your booking.
            </p>
            
            <div className="bg-rose-50 dark:bg-rose-950/30 p-5 rounded-xl border border-rose-100 dark:border-rose-900/50">
              <p className="text-rose-700 dark:text-rose-300 text-sm md:text-base font-bold">
                If payment is not received <span className="text-lg underline underline-offset-2 uppercase">immediately</span>, the slot <span className="uppercase underline underline-offset-2">will be re-opened</span> for other residents.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border-strong rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-divider">
          <div className="bg-primary text-white p-2 rounded-lg"><Logo /></div>
          <h4 className="text-xl font-display font-bold">Booking Details</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
          <DataRow label="Booking ID" value={booking.bookingId} />
          <DataRow label="Sport" value={booking.sport} />
          <DataRow label="Date" value={new Date(booking.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} />
          <DataRow label="Time Slot" value={`${booking.startTimeDisplay} – ${booking.endTimeDisplay}`} />
          <DataRow label="Court Usage" value={`${booking.duration} Minutes`} />
          <DataRow label="Total Amount" value={`₹${booking.totalAmount}`} isPrimary />
        </div>
      </div>

      <button 
        onClick={onClear}
        className="w-full py-5 bg-surface border-2 border-primary text-primary font-display font-black uppercase tracking-widest rounded-xl hover:bg-primary hover:text-white transition-all transform active:scale-95 shadow-lg"
      >
        Make Another Reservation
      </button>

      <p className="text-center text-text-faint text-xs font-medium">
        All bookings are subject to Dosti Ambrosia Society Rules & Regulations.
      </p>
    </div>
  );
}

function DataRow({ label, value, isPrimary }: { label: string, value: string, isPrimary?: boolean }) {
  return (
    <div className="flex justify-between items-end border-b border-divider pb-2 group hover:border-accent transition-colors">
      <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">{label}</span>
      <span className={`font-bold transition-all ${isPrimary ? 'text-2xl text-primary dark:text-accent font-display' : 'text-lg text-text-main group-hover:scale-105 origin-right'}`}>
        {value}
      </span>
    </div>
  );
}

function MyBookingsTab({ bookings, setBookings, addToast }: { 
  bookings: Booking[], 
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>,
  addToast: (msg: string, type: Toast['type']) => void
}) {
  const [flat, setFlat] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!flat) return [];
    return [...bookings].filter(b => b.flatNumber.toUpperCase() === flat.toUpperCase()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [flat, bookings]);

  // Fix 2: Event Delegation for My Bookings Actions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const bookingId = (btn.closest('[data-booking-id]') as HTMLElement)?.dataset.bookingId;
      if (!bookingId) return;

      if (action === 'edit-booking') {
        const b = bookings.find(x => x.bookingId === bookingId);
        if (b && canEditBooking(b) === 'allowed') {
          setEditingId(bookingId);
        }
      } else if (action === 'edit-cancel') {
        setEditingId(null);
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [bookings, filtered]);

  return (
    <div className="space-y-6" ref={containerRef} id="my-bookings-container">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 block">Enter Flat Number</label>
        <input 
          type="text"
          value={flat}
          onChange={e => {
            setFlat(e.target.value.toUpperCase());
            setEditingId(null);
          }}
          placeholder="e.g. 1603"
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        />
      </div>

      <div className="space-y-4">
        {flat && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">No bookings found for this flat.</div>
        )}
        {filtered.map(b => {
          const editState = canEditBooking(b);
          return (
            <div key={b.bookingId} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm" data-booking-id={b.bookingId}>
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-display font-bold text-lg">{b.sport}</h4>
                    <p className="text-xs text-slate-500">{b.bookingId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.editedAt && (
                      <span className="text-[9px] font-black uppercase tracking-tighter bg-slate-200 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">Edited</span>
                    )}
                    <StatusBadge status={b.status} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-slate-500">Date & Time</span>
                  <span className="text-right font-medium">
                    {new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {b.startTimeDisplay}
                  </span>
                  <span className="text-slate-500">Resident</span>
                  <span className="text-right font-medium">{b.residentName} ({b.flatNumber})</span>
                  <span className="text-slate-500">Total</span>
                  <span className="text-right font-bold text-primary dark:text-accent">₹{b.totalAmount}</span>
                </div>

                {editState !== 'none' && (
                  <div className="pt-2 border-t border-slate-50 dark:border-slate-800">
                    <button 
                      data-action="edit-booking"
                      disabled={editState === 'locked'}
                      title={editState === 'locked' ? 'Edits are locked within 2 hours of your slot' : ''}
                      className={`w-full py-2 border-2 border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold transition-all
                        ${editState === 'allowed' ? 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400' : 'opacity-45 cursor-not-allowed'}
                      `}
                    >
                      Edit Booking
                    </button>
                  </div>
                )}
              </div>

              {/* Edit Panel */}
              {editingId === b.bookingId && (
                <EditPanel 
                  booking={b} 
                  bookings={bookings}
                  onClose={() => setEditingId(null)}
                  onSave={(updated) => {
                    setBookings(prev => prev.map(x => x.bookingId === b.bookingId ? { ...x, ...updated } : x));
                    setEditingId(null);
                    addToast(`Booking ${b.bookingId} updated. New slot: ${new Date(updated.date!).toLocaleDateString('en-GB')}, ${formatTimeSlot(updated.startTime24!)}.`, 'success');
                  }}
                />
              )}

              {b.status === BookingStatus.PENDING_PAYMENT && (
                <div className="bg-amber-50 dark:bg-amber-950/30 px-5 py-3 border-t border-amber-100 dark:border-amber-900 text-xs font-bold text-amber-700 dark:text-amber-300 flex justify-between items-center">
                  <span>Unpaid — Pay ₹{b.totalAmount} via UPI or Cash to Court Manager now.</span>
                </div>
              )}
              {b.status === BookingStatus.CANCELLED && b.cancelReason && (
                <div className="bg-rose-50 dark:bg-rose-950/30 px-5 py-3 border-t border-rose-100 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400">
                  Reason: {b.cancelReason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditPanel({ booking, bookings, onClose, onSave }: {
  booking: Booking,
  bookings: Booking[],
  onClose: () => void,
  onSave: (data: Partial<Booking>) => void
}) {
  const [newDate, setNewDate] = useState(booking.date);
  const [newStart, setNewStart] = useState("");
  const [error, setError] = useState("");

  const sessions = useMemo(() => getSessionsForDate(newDate), [newDate]);
  
  const isSlotAvailable = (date: string, start: string, end: string, excludeId: string) => {
    return bookings.every(b => {
      if (b.bookingId === excludeId) return true;
      if (b.status === BookingStatus.CANCELLED) return true;
      if (b.date !== date) return true;
      // Overlap logic: (start1 < end2) && (end1 > start2)
      return !((start < b.endTime24) && (end > b.startTime24));
    });
  };

  const hasGapConflict = (date: string, start: string, end: string, excludeId: string) => {
    const flatBookings = bookings.filter(b => 
      b.flatNumber === booking.flatNumber && 
      b.date === date && 
      b.status !== BookingStatus.CANCELLED &&
      b.bookingId !== excludeId
    );
    return flatBookings.some(b => {
      const gapBefore = calculateDuration(b.endTime24, start);
      const gapAfter = calculateDuration(end, b.startTime24);
      return (gapBefore >= 0 && gapBefore < 60) || (gapAfter >= 0 && gapAfter < 60);
    });
  };

  const validStartOptions = useMemo(() => {
    return sessions.flatMap(s => {
      const slots = getTimeSlots(s);
      return slots.slice(0, -1).filter(time => {
        const isPast = isPastSlot(time, newDate);
        if (isPast) return false;

        const endMins = timeToMins(time) + booking.duration;
        const endTime24 = minsToTime(endMins);

        // Fits in session
        if (endTime24 > s.end) return false;

        // Is available
        if (!isSlotAvailable(newDate, time, endTime24, booking.bookingId)) return false;

        // Gap rule
        if (hasGapConflict(newDate, time, endTime24, booking.bookingId)) return false;

        return true;
      });
    });
  }, [newDate, sessions, booking]);

  const previewEnd = useMemo(() => {
    if (!newStart) return "--:--";
    return formatTimeSlot(minsToTime(timeToMins(newStart) + booking.duration));
  }, [newStart, booking.duration]);

  const handleSave = () => {
    if (canEditBooking(booking) === 'locked') {
      setError("Edits are locked within 2 hours of the slot.");
      return;
    }
    if (!newStart) return;

    const endTime24 = minsToTime(timeToMins(newStart) + booking.duration);
    
    // Final Validations
    if (newDate < getTodayStr()) { setError("Cannot pick past date."); return; }
    if (isPastSlot(newStart, newDate)) { setError("Slot is in the past."); return; }
    
    onSave({
      date: newDate,
      startTime24: newStart,
      endTime24: endTime24,
      startTimeDisplay: formatTimeSlot(newStart),
      endTimeDisplay: formatTimeSlot(endTime24),
      editedAt: new Date().toISOString()
    });
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-5 border-t border-slate-100 dark:border-slate-800 space-y-4" data-edit-panel={booking.bookingId}>
      {/* Read-Only Frozen */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-slate-400" /> Sport: {booking.sport}</span>
        <span className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-slate-400" /> Duration: {booking.duration} mins</span>
        <span className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-slate-400" /> Guest: {booking.hasGuest ? 'Yes' : 'No'}</span>
        <span className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-slate-400" /> Paddles: {booking.paddles}</span>
        <span className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-slate-400" /> Total: ₹{booking.totalAmount}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="edit-booking-date" className="text-[10px] font-bold uppercase text-slate-500">New Date</label>
          <input 
            id="edit-booking-date"
            type="date" 
            min={getTodayStr()}
            value={newDate}
            onChange={e => { setNewDate(e.target.value); setNewStart(""); setError(""); }}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="edit-start-time" className="text-[10px] font-bold uppercase text-slate-500">New Start Time</label>
          <select 
            id="edit-start-time"
            value={newStart}
            onChange={e => { setNewStart(e.target.value); setError(""); }}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none"
          >
            <option value="">Select Time</option>
            {validStartOptions.map(t => (
              <option key={t} value={t}>{formatTimeSlot(t)}</option>
            ))}
            {validStartOptions.length === 0 && <option value="" disabled>No available slots for this date</option>}
          </select>
        </div>
      </div>

      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-slate-500">End time: <span className="text-slate-900 dark:text-slate-100">{previewEnd}</span></span>
        {error && <span className="text-rose-500 font-bold animate-shake">{error}</span>}
      </div>

      <div className="flex gap-2">
        <button 
          onClick={handleSave}
          disabled={!newStart || !!error}
          className="flex-1 py-3 bg-primary text-white text-xs font-bold rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50"
        >
          Save Changes
        </button>
        <button 
          onClick={onClose}
          className="flex-1 py-3 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-xl uppercase tracking-widest active:scale-95 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const styles = {
    [BookingStatus.PENDING_PAYMENT]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    [BookingStatus.CONFIRMED]: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    [BookingStatus.CANCELLED]: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  return (
    <span className={`text-[10px] uppercase font-black px-2 py-1 rounded-md tracking-widest ${styles[status]}`}>
      {status}
    </span>
  );
}

function ScheduleTab({ bookings, onSlotClick, tick }: { bookings: Booking[], onSlotClick: (d: string, s: string) => void, tick: number }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const sessions = useMemo(() => getSessionsForDate(date), [date]);

  const getStatusAtTime = (time: string) => {
    const booking = bookings.find(b => 
      b.date === date && 
      b.status !== BookingStatus.CANCELLED &&
      time >= b.startTime24 && time < b.endTime24
    );
    return booking ? booking.status : null;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 block">Select Date</label>
        <input 
          type="date"
          value={date}
          min={new Date().toISOString().split('T')[0]}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none"
        />
      </div>

      <div className="space-y-8">
        {sessions.map(session => (
          <div key={session.name} className="space-y-3">
            <h3 className="font-display font-bold text-lg text-slate-500 uppercase tracking-widest">{session.name} Session</h3>
            <div className="grid grid-cols-1 gap-2">
              {getTimeSlots(session).slice(0, -1).map(time => {
                const status = getStatusAtTime(time);
                const isPast = !status && isPastSlot(time, date);
                
                return (
                  <button
                    key={time}
                    disabled={!!status || isPast}
                    onClick={() => onSlotClick(date, time)}
                    className={`p-4 rounded-xl border text-sm font-semibold flex justify-between items-center transition-all
                      ${!status && !isPast ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-accent' : ''}
                      ${status === BookingStatus.CONFIRMED ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : ''}
                      ${status === BookingStatus.PENDING_PAYMENT ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300' : ''}
                      ${isPast ? 'schedule-slot--past' : ''}
                    `}
                  >
                    <span className={isPast ? 'slot-time' : ''}>{formatTimeSlot(time)}</span>
                    <span className={`text-[10px] uppercase font-black opacity-60 tracking-widest ${isPast ? 'slot-label' : ''}`}>
                      {status || (isPast ? 'Time Passed' : 'Available')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-[10px] font-black uppercase tracking-[0.2em] opacity-60 pt-4">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Available</div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" /> Confirmed</div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Pending</div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" /> Time Passed</div>
      </div>
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="max-w-sm mx-auto space-y-6 text-center py-12">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">🔒</div>
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-bold">Admin</h2>
        <p className="text-slate-500 text-sm">Enter manager PIN to access dashboard</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input 
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value)}
          className={`w-full text-center text-3xl tracking-[1em] py-4 bg-white dark:bg-slate-900 rounded-2xl border-2 outline-none
            ${error ? 'border-rose-500 animate-shake' : 'border-slate-200 dark:border-slate-800 focus:border-primary'}
          `}
          maxLength={4}
          autoFocus
        />
        <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-bold">Access Dashboard</button>
      </form>
    </div>
  );
}

function AdminDashboard({ bookings, setBookings, onLogout, addToast, setLastSubmission }: { 
  bookings: Booking[], 
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>, 
  onLogout: () => void,
  addToast: (msg: string, type: Toast['type']) => void,
  setLastSubmission: React.Dispatch<React.SetStateAction<Booking | null>>
}) {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterSport, setFilterSport] = useState<Sport | 'All'>('All');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Fix 1: Event Delegation for Admin Actions
  useEffect(() => {
    const el = dashboardRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const bookingId = (btn.closest('[data-booking-id]') as HTMLElement)?.dataset.bookingId;
      if (!bookingId) return;

      if (action === 'confirm') {
        updateStatus(bookingId, BookingStatus.CONFIRMED);
      } else if (action === 'cancel') {
        setCancellingId(bookingId);
      } else if (action === 'cancel-confirm') {
        const select = el.querySelector(`[data-cancel-reason="${bookingId}"]`) as HTMLSelectElement;
        const reason = select?.value || "";
        updateStatus(bookingId, BookingStatus.CANCELLED, reason);
        setCancellingId(null);
      } else if (action === 'cancel-dismiss') {
        setCancellingId(null);
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [bookings]); // Re-attach when bookings change to ensure logic is fresh

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => b.date === today);
    return {
      total: todayBookings.length,
      pending: todayBookings.filter(b => b.status === BookingStatus.PENDING_PAYMENT).length,
      confirmed: todayBookings.filter(b => b.status === BookingStatus.CONFIRMED).length,
      revenue: todayBookings.filter(b => b.status === BookingStatus.CONFIRMED).reduce((acc, curr) => acc + curr.totalAmount, 0)
    };
  }, [bookings]);

  const grouped = useMemo(() => {
    const filtered = bookings.filter(b => {
      const matchDate = b.date === filterDate;
      const matchSport = filterSport === 'All' || b.sport === filterSport;
      return matchDate && matchSport;
    });

    const sortFn = (a: Booking, b: Booking) => a.startTime24.localeCompare(b.startTime24);

    return {
      pending: filtered.filter(b => b.status === BookingStatus.PENDING_PAYMENT).sort(sortFn),
      confirmed: filtered.filter(b => b.status === BookingStatus.CONFIRMED).sort(sortFn),
      cancelled: filtered.filter(b => b.status === BookingStatus.CANCELLED).sort(sortFn),
    };
  }, [bookings, filterDate, filterSport]);

  const updateStatus = (id: string, status: BookingStatus, reason?: string) => {
    setLastSubmission(null);
    setBookings(prev => prev.map(b => b.bookingId === id ? { 
      ...b, 
      status, 
      cancelReason: reason, 
      cancelledAt: status === BookingStatus.CANCELLED ? new Date().toISOString() : b.cancelledAt 
    } : b));
    
    if (status === BookingStatus.CANCELLED) {
      addToast(reason ? `Booking ${id} cancelled — ${reason}` : `Booking ${id} cancelled.`, 'warning');
    } else {
      addToast(`Booking ${id} ${status.toLowerCase()}.`, 'success');
    }
  };

  return (
    <div className="space-y-8" ref={dashboardRef} id="admin-bookings-container">
      <div className="flex justify-between items-center bg-surface border border-border-subtle p-4 rounded-xl shadow-sm">
        <h2 className="text-xl font-display font-bold">Manager Dashboard</h2>
        <button onClick={onLogout} className="text-xs font-black uppercase tracking-widest text-rose-500 hover:text-rose-600">Logout</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Bookings", val: stats.total },
          { label: "Pending", val: stats.pending, color: 'text-amber-600 dark:text-amber-400' },
          { label: "Confirmed", val: stats.confirmed, color: 'text-emerald-600 dark:text-accent' },
          { label: "Rev (Today)", val: `₹${stats.revenue}`, color: 'text-primary dark:text-accent' },
        ].map(s => (
          <div key={s.label} className="bg-surface p-5 rounded-2xl border border-divider shadow-sm">
            <p className="text-[10px] uppercase font-black tracking-widest text-text-faint mb-1">{s.label}</p>
            <p className={`text-2xl font-display font-black ${s.color || 'text-text-main'}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-slate-500">Date</label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="bg-transparent border-b border-slate-200 dark:border-slate-800 outline-none text-sm font-bold block" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-slate-500">Sport</label>
          <select value={filterSport} onChange={e => setFilterSport(e.target.value as any)} className="bg-transparent border-b border-slate-200 dark:border-slate-800 outline-none text-sm font-bold block">
            <option value="All">All Sports</option>
            <option value={Sport.PICKLEBALL}>Pickleball</option>
            <option value={Sport.BADMINTON}>Badminton</option>
          </select>
        </div>
      </div>

      <div className="space-y-12">
        {(['pending', 'confirmed', 'cancelled'] as const).map(group => (
          <div key={group} className="space-y-4">
            <h3 className="font-display font-bold uppercase tracking-widest text-slate-500 text-xs flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${group === 'pending' ? 'bg-amber-500' : group === 'confirmed' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {group.replace('_', ' ')} ({grouped[group].length})
            </h3>
            <div className="space-y-4">
              {grouped[group].length === 0 && <div className="text-xs text-slate-400 py-4 opacity-50">No {group} bookings.</div>}
              {grouped[group].map(b => (
                <div key={b.bookingId} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-bold">{b.residentName} ({b.flatNumber})</p>
                        <p className="text-[10px] text-slate-500">{b.bookingId} • {b.sport}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{b.startTimeDisplay}</p>
                        <p className="text-[10px] text-slate-500">{b.duration}m • ₹{b.totalAmount}</p>
                      </div>
                    </div>
                    {group === 'pending' && <p className="text-[12px] font-medium text-text-faint">{getAutoCancelTime(b.createdAt)}</p>}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-50 dark:border-slate-800" data-booking-id={b.bookingId}>
                      {group === 'pending' && (
                        <div className="flex gap-2">
                          <button data-action="confirm" className="flex-1 py-2 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-200 transition-all">Accept & Confirm</button>
                          <button data-action="cancel" className="flex-1 py-2 bg-rose-100 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-200 transition-all">Cancel</button>
                        </div>
                      )}
                      {group === 'confirmed' && (
                        <button data-action="cancel" className="w-full py-2 bg-rose-100 text-rose-700 text-xs font-bold rounded-lg">Cancel</button>
                      )}
                      
                      {/* Cancel Reason Panel */}
                      {cancellingId === b.bookingId && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3" data-cancel-panel={b.bookingId}>
                          <label className="text-[10px] font-bold uppercase text-slate-500">Reason (optional):</label>
                          <select data-cancel-reason={b.bookingId} className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none">
                            <option value="">-- Select reason --</option>
                            <option value="No-show">No-show</option>
                            <option value="Non-payment">Non-payment</option>
                            <option value="Rule violation">Rule violation</option>
                            <option value="Other">Other</option>
                          </select>
                          <div className="flex gap-2">
                            <button data-action="cancel-confirm" className="flex-1 py-2 bg-rose-500 text-white text-[10px] font-bold rounded uppercase tracking-wider">Confirm Cancel</button>
                            <button data-action="cancel-dismiss" className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded uppercase tracking-wider">Back</button>
                          </div>
                        </div>
                      )}

                      {group === 'cancelled' && (
                        <div className="space-y-1">
                          {b.cancelReason && <p className="text-[10px] italic text-rose-600 dark:text-rose-400">Reason: {b.cancelReason}</p>}
                          <p className="text-[10px] text-slate-500">Cancelled at: {new Date(b.cancelledAt!).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getAutoCancelTime(createdAtISO: string) {
  const cancelTime = new Date(
    new Date(createdAtISO).getTime() + 60 * 60 * 1000
  );
  let h = cancelTime.getHours();
  const m = cancelTime.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `Auto-cancels at ${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function RulesTab() {
  const sections = [
    { title: "1. Court Operating Hours", items: ["Weekdays: 7:00 AM – 9:00 AM, 6:00 PM – 10:00 PM", "Weekends & Bank Holidays: 7:00 AM – 1:00 PM, 5:00 PM – 11:00 PM", "Court operates only in the presence of the Court Manager."] },
    { title: "2. Charges", items: ["Court usage: ₹100 per 30-minute slot", "Non-Ambrosia guest rate: ₹200 per 30-minute slot", "Paddle rental (Pickleball): ₹25 per paddle, 1 ball included", "Fees are non-refundable and non-transferable"] },
    { title: "3. Booking Procedure", items: ["First-come, first-served", "Booking is reserved upon submission", "Booking is confirmed only upon receipt of full payment", "Payment via UPI or Cash to Court Manager", "All bookings are non-refundable and non-transferable"] },
    { title: "Booking Modifications", items: [
      "Only Confirmed bookings are eligible for modification. Pending Payment and Cancelled bookings cannot be modified.",
      "The \"Edit Booking\" option is available in the My Bookings tab on any Confirmed booking whose start time is MORE THAN 2 hours away. It is automatically disabled within 2 hours of the scheduled slot.",
      "A modification allows the resident to change the DATE and START TIME only. The system will automatically calculate the new end time based on the original booking duration.",
      "The following variables are FIXED and cannot be changed during a modification: Sport (Badminton / Pickleball), Duration, Guest status (Resident / Non-Ambrosia Guest), Paddle rental count, Total amount payable.",
      "Since all pricing variables remain unchanged, no additional payment is required for a modification. The original payment obligation applies to the revised slot.",
      "The new date and time must fall within a valid session window (Morning or Evening) for that day. Only available slots that accommodate the original duration are shown.",
      "The Management reserves the right to decline or reverse modifications at its discretion."
    ] },
    { title: "4. Payment Policy", items: ["Residents must pay immediately after booking via UPI or Cash to the Court Manager.", "If payment is not received promptly, the slot will be re-opened for other residents.", "Unpaid bookings remain subject to management action and system auto-cancel logic"] },
    { title: "5. Dress Code and Equipment", items: ["Non-marking sports footwear is MANDATORY", "Studded or inappropriate footwear is STRICTLY PROHIBITED", "Users must bring their own equipment", "Pickleball paddles available for rent"] },
    { title: "6. Court Usage Guidelines", items: ["Vacate the court immediately after slot completion", "Net is multi-purpose and adjustable", "Coaching / training requires prior management approval"] },
    { title: "7. Code of Conduct", items: ["Maintain discipline, decorum, and sportsmanship", "Loud, disruptive, or inappropriate behaviour is not allowed"] },
    { title: "8. Prohibited Activities", items: ["FOOD, SMOKING, AND ALCOHOL PROHIBITED", "Pets and unauthorised individuals not allowed in play area"] },
    { title: "9. Safety", items: ["Children below 5 years must be under adult supervision", "Exercise caution and follow safe playing practices"] },
    { title: "10. General Conditions", items: ["Follow Court Manager instructions", "Damage recovery from responsible person", "Management / Court Manager decisions are final and binding"] },
    { title: "11. Changes to Rules", items: ["These rules are subject to change as decided by Management", "Residents will be notified of updates", "Latest version displayed in app"] },
  ];

  return (
    <div className="space-y-8 animate-fadeAndSlideUp">
      <div className="bg-primary text-white p-8 rounded-2xl relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 opacity-10">
          <Logo />
        </div>
        <h2 className="text-3xl font-display font-bold">Standard Operating Procedures</h2>
        <p className="text-accent font-semibold tracking-widest text-xs uppercase opacity-80">Dosti Ambrosia Sports Club</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
        {sections.map((s, idx) => (
          <div key={idx} className="bg-surface border border-border-subtle p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-display font-bold text-lg mb-4 text-primary dark:text-accent border-b border-divider pb-2">{s.title}</h3>
            <ul className="space-y-2">
              {s.items.map((item, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-accent font-bold mt-1">•</span>
                  <span className={
                    item.includes('MANDATORY') || item.includes('PROHIBITED') || item.includes('STRICTLY') || item.includes('FOOD')
                    ? 'font-bold text-error' 
                    : 'text-text-secondary'
                  }>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      
      <div className="text-center text-text-faint text-xs font-medium border-t border-divider pt-8 pb-12">
        Last updated: April 2026 • © Dosti Ambrosia Management
      </div>
    </div>
  );
}

