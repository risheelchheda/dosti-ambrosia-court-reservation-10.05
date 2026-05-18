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
  isPastSlot,
  getTodayStr,
  canEditBooking,
  timeToMins,
  minsToTime
} from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './supabase';

// ─── Row → Booking mapper (snake_case DB → camelCase TS) ─────────────────────
const mapRow = (row: any): Booking => ({
  bookingId:        row.booking_id,
  flatNumber:       row.flat_number,
  residentName:     row.resident_name,
  sport:            row.sport as Sport,
  date:             row.date,
  startTime24:      row.start_time24,
  endTime24:        row.end_time24,
  startTimeDisplay: row.start_time_display,
  endTimeDisplay:   row.end_time_display,
  duration:         row.duration,
  hasGuest:         row.has_guest,
  paddles:          row.paddles,
  playerCount:      row.player_count,
  players:          row.players ?? [],
  courtFee:         row.court_fee,
  paddleFee:        row.paddle_fee,
  totalAmount:      row.total_amount,
  status:           row.status as BookingStatus,
  createdAt:        row.created_at,
  cancelReason:     row.cancel_reason,
  cancelledAt:      row.cancelled_at,
  editedAt:         row.edited_at,
});

// ─── SVGs ─────────────────────────────────────────────────────────────────────
const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-accent">
    <rect width="32" height="32" rx="4" fill="currentColor" fillOpacity="0.1" />
    <rect x="4" y="4" width="24" height="24" rx="2" stroke="currentColor" strokeWidth="2" />
    <line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
    <line x1="4" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const Sun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const Moon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error';
}

// ─── Helper: fetch all bookings from Supabase ─────────────────────────────────
const fetchBookings = async (): Promise<Booking[]> => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchBookings error:', error); return []; }
  return (data ?? []).map(mapRow);
};

export default function App() {
  const [activeTab, setActiveTab]           = useState<Tab>('Book');
  const [bookings, setBookings]             = useState<Booking[]>([]);
  const [isLoading, setIsLoading]           = useState(true);
  const [theme, setTheme]                   = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [toasts, setToasts]                 = useState<Toast[]>([]);
  const [lastSubmission, setLastSubmission] = useState<Booking | null>(null);
  const [tick, setTick]                     = useState(0);

  // ── Real-time Supabase listener ───────────────────────────────────────────
  useEffect(() => {
    // Initial load
    fetchBookings().then(data => { setBookings(data); setIsLoading(false); });

    // Subscribe to any change and re-fetch
    const channel = supabase
      .channel('bookings-all-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings().then(setBookings);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Minute tick for "past slot" logic ────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Auto-cancel pending bookings older than threshold ────────────────────
  useEffect(() => {
    const runCheck = async () => {
      const now = new Date();
      const toCancel = bookings.filter(b => {
        if (b.status !== BookingStatus.PENDING_PAYMENT) return false;
        const elapsed = (now.getTime() - new Date(b.createdAt).getTime()) / 60000;
        return elapsed >= AUTO_CANCEL_THRESHOLD_MINS;
      });
      for (const b of toCancel) {
        await supabase.from('bookings').update({
          status: BookingStatus.CANCELLED,
          cancel_reason: 'Auto-cancelled: payment not received promptly',
          cancelled_at: now.toISOString(),
        }).eq('booking_id', b.bookingId);
        addToast(`Booking ${b.bookingId} auto-cancelled. Slot reopened.`, 'warning');
      }
    };
    runCheck();
    const interval = setInterval(runCheck, 60000);
    return () => clearInterval(interval);
  }, [bookings]);

  // ── Clear lastSubmission when leaving Book tab ───────────────────────────
  useEffect(() => {
    if (activeTab !== 'Book') setLastSubmission(null);
  }, [activeTab]);

  // ── Theme ────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const addToast = (message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }].slice(-3));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  // ── Create booking ───────────────────────────────────────────────────────
  const handleBooking = async (data: Partial<Booking>) => {
    const bookingId = generateBookingId(bookings.length);
    const row = {
      booking_id:         bookingId,
      flat_number:        data.flatNumber!,
      resident_name:      data.residentName!,
      sport:              data.sport!,
      date:               data.date!,
      start_time24:       data.startTime24!,
      end_time24:         data.endTime24!,
      start_time_display: data.startTimeDisplay!,
      end_time_display:   data.endTimeDisplay!,
      duration:           data.duration!,
      has_guest:          data.hasGuest ?? false,
      paddles:            data.paddles ?? 0,
      player_count:       data.playerCount ?? 1,
      players:            data.players ?? [],
      court_fee:          data.courtFee ?? 0,
      paddle_fee:         data.paddleFee ?? 0,
      total_amount:       data.totalAmount ?? 0,
      status:             BookingStatus.PENDING_PAYMENT,
    };

    const { data: inserted, error } = await supabase
      .from('bookings')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      addToast('Failed to reserve slot. Please try again.', 'error');
      return;
    }
    const newBooking = mapRow(inserted);
    setLastSubmission(newBooking);
    addToast(`Booking ${bookingId} reserved. Pay via UPI or Cash now.`, 'success');
  };

  // ── Update booking (used by Admin + EditPanel) ───────────────────────────
  const updateBooking = async (bookingId: string, updates: Partial<Booking>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.status      !== undefined) dbUpdates.status        = updates.status;
    if (updates.cancelReason !== undefined) dbUpdates.cancel_reason = updates.cancelReason;
    if (updates.cancelledAt !== undefined) dbUpdates.cancelled_at  = updates.cancelledAt;
    if (updates.editedAt    !== undefined) dbUpdates.edited_at     = updates.editedAt;
    if (updates.date        !== undefined) dbUpdates.date          = updates.date;
    if (updates.startTime24 !== undefined) dbUpdates.start_time24  = updates.startTime24;
    if (updates.endTime24   !== undefined) dbUpdates.end_time24    = updates.endTime24;
    if (updates.startTimeDisplay !== undefined) dbUpdates.start_time_display = updates.startTimeDisplay;
    if (updates.endTimeDisplay   !== undefined) dbUpdates.end_time_display   = updates.endTimeDisplay;

    const { error } = await supabase
      .from('bookings')
      .update(dbUpdates)
      .eq('booking_id', bookingId);

    if (error) {
      console.error('Update error:', error);
      addToast('Failed to update booking.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="text-5xl animate-bounce">🏸</div>
        <p className="text-primary font-black uppercase tracking-widest text-sm">Loading Court Data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-white border-b border-accent/30 overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-white" style={{ backgroundImage: 'linear-gradient(to bottom, white 50%, transparent 50%)', backgroundSize: '1px 8px' }} />
          <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-full bg-white" />
        </div>
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/20"><Logo /></div>
            <h1 className="text-xl md:text-2xl font-display font-bold tracking-tight">Dosti Ambrosia Court Reservation</h1>
          </div>
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-md" aria-label="Toggle theme">
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
        </div>
        <nav className="max-w-4xl mx-auto px-4 overflow-x-auto no-scrollbar">
          <div className="flex">
            {(['Book', 'My Bookings', 'Schedule', 'Admin', 'Rules'] as Tab[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`py-4 px-6 text-xs uppercase font-black tracking-widest transition-all relative flex-shrink-0 ${activeTab === tab ? 'text-white' : 'text-white/50 hover:text-white/80'}`}>
                {tab}
                {activeTab === tab && <motion.div layoutId="activeTab" className="absolute bottom-0 left-4 right-4 h-1 bg-accent rounded-t-full shadow-[0_-4px_10px_rgba(141,198,63,0.5)]" />}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'Book' && (
            <motion.div key="book" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <BookTab onSubmit={handleBooking} existingBookings={bookings} lastSubmission={lastSubmission} addToast={addToast} tick={tick} />
            </motion.div>
          )}
          {activeTab === 'My Bookings' && (
            <motion.div key="my-bookings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <MyBookingsTab bookings={bookings} onUpdate={updateBooking} addToast={addToast} />
            </motion.div>
          )}
          {activeTab === 'Schedule' && (
            <motion.div key="schedule" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <ScheduleTab bookings={bookings} tick={tick} onSlotClick={() => setActiveTab('Book')} />
            </motion.div>
          )}
          {activeTab === 'Admin' && (
            <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {!isAdminLoggedIn
                ? <AdminLogin onLogin={() => setIsAdminLoggedIn(true)} />
                : <AdminDashboard bookings={bookings} onUpdate={updateBooking} onLogout={() => setIsAdminLoggedIn(false)} addToast={addToast} setLastSubmission={setLastSubmission} />
              }
            </motion.div>
          )}
          {activeTab === 'Rules' && (
            <motion.div key="rules" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <RulesTab />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div key={toast.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className={`p-4 rounded-lg shadow-lg border text-sm font-medium min-w-[240px]
                ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200' : ''}
                ${toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200' : ''}
                ${toast.type === 'error'   ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-200' : ''}
              `}>{toast.message}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BookTab
// ─────────────────────────────────────────────────────────────────────────────
function BookTab({ onSubmit, existingBookings, lastSubmission, addToast, tick }: {
  onSubmit: (d: Partial<Booking>) => Promise<void>,
  existingBookings: Booking[],
  lastSubmission: Booking | null,
  addToast: (msg: string, type: Toast['type']) => void,
  tick: number
}) {
  const [form, setForm] = useState({
    flatNumber: '', residentName: '', sport: Sport.PICKLEBALL,
    date: getTodayStr(), startTime: '', endTime: '',
    hasGuest: false, paddles: 0, playerCount: 1, playerNames: ['']
  });

  useEffect(() => {
    setForm(f => { const n = [...f.playerNames]; n[0] = f.residentName; return { ...f, playerNames: n }; });
  }, [form.residentName]);

  const handlePlayerCountChange = (count: number) => {
    setForm(f => {
      const names = [...f.playerNames];
      while (names.length < count) names.push('');
      names.length = count;
      return { ...f, playerCount: count, playerNames: names };
    });
  };

  const sessions = useMemo(() => getSessionsForDate(form.date), [form.date]);
  const allStartTimeSlots = useMemo(() => sessions.flatMap(s => getTimeSlots(s).slice(0, -1)), [sessions, tick]);

  const isSlotBlocked = (date: string, start: string, end: string) =>
    existingBookings.some(b => b.date === date && b.status !== BookingStatus.CANCELLED && start < b.endTime24 && end > b.startTime24);

  const availableEndTimes = useMemo(() => {
    if (!form.startTime) return [];
    const session = sessions.find(s => form.startTime >= s.start && form.startTime < s.end);
    if (!session) return [];
    return getTimeSlots(session).filter(time => {
      if (time <= form.startTime) return false;
      const dur = calculateDuration(form.startTime, time);
      return dur <= 120 && !isSlotBlocked(form.date, form.startTime, time);
    });
  }, [form.date, form.startTime, sessions, tick, existingBookings]);

  const isValid = useMemo(() => {
    if (!form.flatNumber || !form.residentName || !form.startTime || !form.endTime) return false;
    if (isPastSlot(form.startTime, form.date)) return false;
    const sameFlatSameDate = existingBookings.filter(b => b.flatNumber === form.flatNumber.toUpperCase() && b.date === form.date && b.status !== BookingStatus.CANCELLED);
    return !sameFlatSameDate.some(b => {
      const gapBefore = calculateDuration(b.endTime24, form.startTime);
      const gapAfter  = calculateDuration(form.endTime, b.startTime24);
      return (gapBefore >= 0 && gapBefore < 60) || (gapAfter >= 0 && gapAfter < 60);
    });
  }, [form, existingBookings]);

  const duration    = form.endTime ? calculateDuration(form.startTime, form.endTime) : 0;
  const courtFee    = (duration / 30) * (form.hasGuest ? GUEST_RATE : RESIDENT_RATE);
  const paddleFee   = form.sport === Sport.PICKLEBALL ? form.paddles * PADDLE_RATE : 0;
  const totalAmount = courtFee + paddleFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nowHour = new Date().getHours();
  if (nowHour < 7 || nowHour >= 22) {
    addToast('Bookings can only be made between 7:00 AM and 10:00 PM.', 'error');
    return;
  }
    if (isPastSlot(form.startTime, form.date)) { addToast('This slot is in the past.', 'error'); return; }
    if (!isValid) return;
    const players = form.playerNames.map((name, i) => ({ slot: i + 1, name: name.trim() || (i === 0 ? form.residentName : `Guest ${i + 1}`) }));
    await onSubmit({ ...form, flatNumber: form.flatNumber.toUpperCase(), duration, courtFee, paddleFee, totalAmount, startTime24: form.startTime, endTime24: form.endTime, startTimeDisplay: formatTimeSlot(form.startTime), endTimeDisplay: formatTimeSlot(form.endTime), paddles: form.sport === Sport.PICKLEBALL ? form.paddles : 0, playerCount: form.playerCount, players });
  };

  return (
    <div className="space-y-8">
      {lastSubmission ? (
        <PaymentWarning booking={lastSubmission} onClear={() => window.location.reload()} />
      ) : (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Flat Number</label>
              <input type="text" value={form.flatNumber} onChange={e => setForm(f => ({ ...f, flatNumber: e.target.value.toUpperCase() }))} placeholder="e.g. 1603" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Resident Name</label>
              <input type="text" value={form.residentName} onChange={e => setForm(f => ({ ...f, residentName: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all" required />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-black uppercase tracking-[0.1em] text-text-muted">Select Sport</label>
            <div className="grid grid-cols-2 gap-4">
              {[Sport.PICKLEBALL, Sport.BADMINTON].map(s => (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, sport: s, paddles: 0 }))}
                  className={`h-28 rounded-2xl border-2 transition-all p-4 text-left font-display font-bold text-lg ${form.sport === s ? 'bg-primary text-white border-primary shadow-xl scale-[1.02]' : 'bg-surface border-border-subtle hover:border-accent'}`}>
                  {s}
                  {form.sport === s && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-2 inline-block bg-accent text-primary p-1.5 rounded-lg shadow-lg"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></motion.div>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Date</label>
            <input type="date" min={getTodayStr()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, startTime: '', endTime: '' }))} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Start Time</label>
              <select value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value, endTime: '' }))} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none appearance-none">
                <option value="">Select Time</option>
                {allStartTimeSlots.map(time => {
                  const isPast = isPastSlot(time, form.date);
                  const session = sessions.find(s => time >= s.start && time < s.end);
                  const slots = session ? getTimeSlots(session) : [];
                  const nextTime = slots[slots.indexOf(time) + 1] || time;
                  const isTaken = !isPast && isSlotBlocked(form.date, time, nextTime);
                  return <option key={time} value={time} disabled={isPast || isTaken}>{formatTimeSlot(time)}{isPast ? ' (Past)' : isTaken ? ' (Taken)' : ''}</option>;
                })}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">End Time</label>
              <select value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} disabled={!form.startTime || isPastSlot(form.startTime, form.date)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none disabled:opacity-50 appearance-none">
                <option value="">Select Time</option>
                {availableEndTimes.map(time => <option key={time} value={time}>{formatTimeSlot(time)}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <label className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">Non-Ambrosia Guest?</label>
            <button type="button" onClick={() => setForm(f => ({ ...f, hasGuest: !f.hasGuest }))} className={`w-12 h-6 rounded-full transition-colors relative ${form.hasGuest ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.hasGuest ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Number of Players</label>
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => handlePlayerCountChange(Math.max(1, form.playerCount - 1))} className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold">-</button>
                <span className="w-12 text-center font-bold text-lg">{form.playerCount}</span>
                <button type="button" onClick={() => handlePlayerCountChange(Math.min(8, form.playerCount + 1))} className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold">+</button>
              </div>
            </div>
            <div className="space-y-3 pl-2 border-l-2 border-slate-100 dark:border-slate-800">
              {form.playerNames.map((name, i) => (
                <div key={i} className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{i === 0 ? 'Player 1 (You)' : `Player ${i + 1}`}</label>
                  <input type="text" value={name} onChange={e => { const n = [...form.playerNames]; n[i] = e.target.value; setForm(f => ({ ...f, playerNames: n })); }} placeholder={i === 0 ? form.residentName : `Guest ${i + 1}`}
                    className={`w-full text-sm rounded-lg px-3 py-2 outline-none border transition-all ${i === 0 ? 'bg-slate-50 dark:bg-slate-900 border-dashed border-slate-300 dark:border-slate-700 font-medium' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-primary'}`} />
                </div>
              ))}
            </div>
          </div>

          {form.sport === Sport.PICKLEBALL && (
            <div className="space-y-2">
              <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Paddle Rentals (₹{PADDLE_RATE}/paddle)</label>
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => setForm(f => ({ ...f, paddles: Math.max(0, f.paddles - 1) }))} className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold">-</button>
                <span className="w-12 text-center font-bold text-lg">{form.paddles}</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, paddles: Math.min(4, f.paddles + 1) }))} className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold">+</button>
              </div>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 space-y-2 border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400"><span>Court Fee ({duration} mins)</span><span>₹{courtFee}</span></div>
            {form.sport === Sport.PICKLEBALL && <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400"><span>Paddle Fee ({form.paddles} paddles)</span><span>₹{paddleFee}</span></div>}
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200 dark:border-slate-800"><span>Total</span><span className="text-primary dark:text-accent">₹{totalAmount}</span></div>
          </div>

          <button type="submit" disabled={!isValid} className="w-full py-4 bg-primary text-white font-display font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none">Reserve Court</button>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentWarning
// ─────────────────────────────────────────────────────────────────────────────
function PaymentWarning({ booking, onClear }: { booking: Booking, onClear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);

  return (
    <div className="space-y-8 py-2" ref={ref}>
      <div className="bg-surface border border-border-strong rounded-2xl shadow-lg p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-divider">
          <div className="bg-primary text-white p-2 rounded-lg"><Logo /></div>
          <h4 className="text-xl font-display font-bold">Booking Details</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
          <DataRow label="Booking ID"  value={booking.bookingId} />
          <DataRow label="Sport"       value={booking.sport} />
          <DataRow label="Date"        value={new Date(booking.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} />
          <DataRow label="Time Slot"   value={`${booking.startTimeDisplay} – ${booking.endTimeDisplay}`} />
          <DataRow label="Duration"    value={`${booking.duration} Minutes`} />
          <DataRow label="Total"       value={`₹${booking.totalAmount}`} isPrimary />
        </div>
        <PaymentDisclaimer booking={booking} />
      </div>
      <button onClick={onClear} className="w-full py-5 bg-surface border-2 border-primary text-primary font-display font-black uppercase tracking-widest rounded-xl hover:bg-primary hover:text-white transition-all active:scale-95 shadow-lg">Make Another Reservation</button>
    </div>
  );
}

function PaymentDisclaimer({ booking }: { booking: Booking }) {
  if (booking.status !== BookingStatus.PENDING_PAYMENT) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
      <p className="font-bold text-amber-800 dark:text-amber-300">⚠ Slot Reserved — Payment Required</p>
      <p className="text-sm text-amber-700 dark:text-amber-400">Pay ₹{booking.totalAmount} via UPI or Cash to the Court Manager immediately to confirm your booking.</p>
      <p className="text-xs text-amber-600">Unpaid slots are released after {AUTO_CANCEL_THRESHOLD_MINS} minutes.</p>
    </motion.div>
  );
}

function DataRow({ label, value, isPrimary }: { label: string, value: string, isPrimary?: boolean }) {
  return (
    <div className="flex justify-between items-end border-b border-divider pb-2">
      <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">{label}</span>
      <span className={`font-bold ${isPrimary ? 'text-2xl text-primary dark:text-accent font-display' : 'text-lg text-text-main'}`}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MyBookingsTab
// ─────────────────────────────────────────────────────────────────────────────
function MyBookingsTab({ bookings, onUpdate, addToast }: {
  bookings: Booking[],
  onUpdate: (id: string, updates: Partial<Booking>) => Promise<void>,
  addToast: (msg: string, type: Toast['type']) => void
}) {
  const [flat, setFlat]           = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!flat) return [];
    return [...bookings].filter(b => b.flatNumber.toUpperCase() === flat.toUpperCase()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [flat, bookings]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 block">Enter Flat Number</label>
        <input type="text" value={flat} onChange={e => { setFlat(e.target.value.toUpperCase()); setEditingId(null); }} placeholder="e.g. 1603" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition-all" />
      </div>
      <div className="space-y-4">
        {flat && filtered.length === 0 && <div className="text-center py-12 text-slate-500">No bookings found for this flat.</div>}
        {filtered.map(b => {
          const editState = canEditBooking(b);
          return (
            <div key={b.bookingId} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div><h4 className="font-display font-bold text-lg">{b.sport}</h4><p className="text-xs text-slate-500">{b.bookingId}</p></div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-slate-500">Date & Time</span><span className="text-right font-medium">{new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {b.startTimeDisplay}</span>
                  <span className="text-slate-500">Resident</span><span className="text-right font-medium">{b.residentName} ({b.flatNumber})</span>
                  <span className="text-slate-500">Players</span><span className="text-right text-xs"><span className="font-bold">{b.playerCount}</span> — {b.players?.map((p: any) => p.name).join(', ')}</span>
                  <span className="text-slate-500">Total</span><span className="text-right font-bold text-primary dark:text-accent">₹{b.totalAmount}</span>
                </div>
                {editState !== 'none' && (
                  <div className="pt-2 border-t border-slate-50 dark:border-slate-800">
                    <button onClick={() => editState === 'allowed' && setEditingId(b.bookingId)} disabled={editState === 'locked'} className={`w-full py-2 border-2 border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold transition-all ${editState === 'allowed' ? 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400' : 'opacity-45 cursor-not-allowed'}`}>
                      {editState === 'locked' ? 'Edits locked (< 2 hrs)' : 'Edit Booking'}
                    </button>
                  </div>
                )}
              </div>
              {editingId === b.bookingId && (
                <EditPanel booking={b} bookings={bookings} onClose={() => setEditingId(null)} onSave={async (updates) => {
                  await onUpdate(b.bookingId, updates);
                  setEditingId(null);
                  addToast(`Booking ${b.bookingId} updated.`, 'success');
                }} />
              )}
              <div className="px-5 pb-5"><PaymentDisclaimer booking={b} /></div>
              {b.status === BookingStatus.CANCELLED && b.cancelReason && (
                <div className="bg-rose-50 dark:bg-rose-950/30 px-5 py-3 border-t border-rose-100 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400">Reason: {b.cancelReason}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditPanel
// ─────────────────────────────────────────────────────────────────────────────
function EditPanel({ booking, bookings, onClose, onSave }: {
  booking: Booking, bookings: Booking[],
  onClose: () => void, onSave: (data: Partial<Booking>) => Promise<void>
}) {
  const [newDate, setNewDate] = useState(booking.date);
  const [newStart, setNewStart] = useState('');
  const [error, setError] = useState('');

  const sessions = useMemo(() => getSessionsForDate(newDate), [newDate]);

  const validStartOptions = useMemo(() => sessions.flatMap(s => {
    return getTimeSlots(s).slice(0, -1).filter(time => {
      if (isPastSlot(time, newDate)) return false;
      const endTime24 = minsToTime(timeToMins(time) + booking.duration);
      if (endTime24 > s.end) return false;
      const conflict = bookings.some(b => b.bookingId !== booking.bookingId && b.status !== BookingStatus.CANCELLED && b.date === newDate && time < b.endTime24 && endTime24 > b.startTime24);
      return !conflict;
    });
  }), [newDate, sessions, booking, bookings]);

  const previewEnd = useMemo(() => newStart ? formatTimeSlot(minsToTime(timeToMins(newStart) + booking.duration)) : '--:--', [newStart, booking.duration]);

  const handleSave = async () => {
    if (!newStart) return;
    if (newDate < getTodayStr()) { setError('Cannot pick a past date.'); return; }
    if (isPastSlot(newStart, newDate)) { setError('Slot is in the past.'); return; }
    const endTime24 = minsToTime(timeToMins(newStart) + booking.duration);
    await onSave({ date: newDate, startTime24: newStart, endTime24, startTimeDisplay: formatTimeSlot(newStart), endTimeDisplay: formatTimeSlot(endTime24), editedAt: new Date().toISOString() });
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-500">New Date</label>
          <input type="date" min={getTodayStr()} value={newDate} onChange={e => { setNewDate(e.target.value); setNewStart(''); setError(''); }} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-500">New Start Time</label>
          <select value={newStart} onChange={e => { setNewStart(e.target.value); setError(''); }} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none">
            <option value="">Select Time</option>
            {validStartOptions.map(t => <option key={t} value={t}>{formatTimeSlot(t)}</option>)}
            {validStartOptions.length === 0 && <option disabled>No slots available</option>}
          </select>
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-slate-500">End time: <span className="text-slate-900 dark:text-slate-100">{previewEnd}</span></span>
        {error && <span className="text-rose-500 font-bold">{error}</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!newStart || !!error} className="flex-1 py-3 bg-primary text-white text-xs font-bold rounded-xl uppercase tracking-widest disabled:opacity-50">Save Changes</button>
        <button onClick={onClose} className="flex-1 py-3 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-600 text-xs font-bold rounded-xl uppercase tracking-widest">Cancel</button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const styles = {
    [BookingStatus.PENDING_PAYMENT]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    [BookingStatus.CONFIRMED]:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    [BookingStatus.CANCELLED]:       'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  return <span className={`text-[10px] uppercase font-black px-2 py-1 rounded-md tracking-widest ${styles[status]}`}>{status}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleTab
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleTab({ bookings, onSlotClick, tick }: { bookings: Booking[], onSlotClick: (d: string, s: string) => void, tick: number }) {
  const [date, setDate] = useState(getTodayStr());
  const sessions = useMemo(() => getSessionsForDate(date), [date]);

  const getStatusAtTime = (time: string) => {
    const b = bookings.find(b => b.date === date && b.status !== BookingStatus.CANCELLED && time >= b.startTime24 && time < b.endTime24);
    return b ? b.status : null;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 block">Select Date</label>
        <input type="date" value={date} min={getTodayStr()} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none" />
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
                  <button key={time} disabled={!!status || isPast} onClick={() => onSlotClick(date, time)}
                    className={`p-4 rounded-xl border text-sm font-semibold flex justify-between items-center transition-all
                      ${!status && !isPast ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-accent' : ''}
                      ${status === BookingStatus.CONFIRMED       ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-800' : ''}
                      ${status === BookingStatus.PENDING_PAYMENT ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800' : ''}
                      ${isPast ? 'schedule-slot--past' : ''}`}>
                    <span>{formatTimeSlot(time)}</span>
                    <span className="text-[10px] uppercase font-black opacity-60 tracking-widest">{status || (isPast ? 'Time Passed' : 'Available')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminLogin
// ─────────────────────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin]     = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) { onLogin(); }
    else { setError(true); setTimeout(() => setError(false), 2000); }
  };

  return (
    <div className="max-w-sm mx-auto space-y-6 text-center py-12">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary text-3xl">🔒</div>
      <div className="space-y-2"><h2 className="text-2xl font-display font-bold">Admin</h2><p className="text-slate-500 text-sm">Enter manager PIN</p></div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="password" value={pin} onChange={e => setPin(e.target.value)} className={`w-full text-center text-3xl tracking-[1em] py-4 bg-white dark:bg-slate-900 rounded-2xl border-2 outline-none ${error ? 'border-rose-500 animate-shake' : 'border-slate-200 dark:border-slate-800 focus:border-primary'}`} maxLength={4} autoFocus />
        <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-bold">Access Dashboard</button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminDashboard
// ─────────────────────────────────────────────────────────────────────────────
function AdminDashboard({ bookings, onUpdate, onLogout, addToast, setLastSubmission }: {
  bookings: Booking[],
  onUpdate: (id: string, updates: Partial<Booking>) => Promise<void>,
  onLogout: () => void,
  addToast: (msg: string, type: Toast['type']) => void,
  setLastSubmission: React.Dispatch<React.SetStateAction<Booking | null>>
}) {
  const [filterDate, setFilterDate]   = useState(getTodayStr());
  const [filterSport, setFilterSport] = useState<Sport | 'All'>('All');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const stats = useMemo(() => {
    const today = getTodayStr();
    const tb = bookings.filter(b => b.date === today);
    return {
      total:     tb.length,
      pending:   tb.filter(b => b.status === BookingStatus.PENDING_PAYMENT).length,
      confirmed: tb.filter(b => b.status === BookingStatus.CONFIRMED).length,
      revenue:   tb.filter(b => b.status === BookingStatus.CONFIRMED).reduce((s, b) => s + b.totalAmount, 0),
    };
  }, [bookings]);

  const grouped = useMemo(() => {
    const filtered = bookings.filter(b => b.date === filterDate && (filterSport === 'All' || b.sport === filterSport));
    const sort = (a: Booking, b: Booking) => a.startTime24.localeCompare(b.startTime24);
    return {
      pending:   filtered.filter(b => b.status === BookingStatus.PENDING_PAYMENT).sort(sort),
      confirmed: filtered.filter(b => b.status === BookingStatus.CONFIRMED).sort(sort),
      cancelled: filtered.filter(b => b.status === BookingStatus.CANCELLED).sort(sort),
    };
  }, [bookings, filterDate, filterSport]);

  const updateStatus = async (bookingId: string, status: BookingStatus, reason?: string) => {
    setLastSubmission(null);
    await onUpdate(bookingId, {
      status,
      ...(reason ? { cancelReason: reason } : {}),
      ...(status === BookingStatus.CANCELLED ? { cancelledAt: new Date().toISOString() } : {}),
    });
    addToast(status === BookingStatus.CANCELLED ? `Booking ${bookingId} cancelled.` : `Booking ${bookingId} confirmed.`, status === BookingStatus.CANCELLED ? 'warning' : 'success');
    setCancellingId(null);
    setCancelReason('');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-surface border border-border-subtle p-4 rounded-xl shadow-sm">
        <h2 className="text-xl font-display font-bold">Manager Dashboard</h2>
        <button onClick={onLogout} className="text-xs font-black uppercase tracking-widest text-rose-500 hover:text-rose-600">Logout</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Bookings", val: stats.total },
          { label: 'Pending',   val: stats.pending,   color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Confirmed', val: stats.confirmed, color: 'text-emerald-600 dark:text-accent' },
          { label: 'Revenue',   val: `₹${stats.revenue}`, color: 'text-primary dark:text-accent' },
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
              {group} ({grouped[group].length})
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
                        <p className="text-[10px] text-slate-500 font-medium">Players: {b.playerCount} — {b.players?.map((p: any) => p.name).join(', ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{b.startTimeDisplay}</p>
                        <p className="text-[10px] text-slate-500">{b.duration}m • ₹{b.totalAmount}</p>
                      </div>
                    </div>
                    {group === 'pending' && <p className="text-[12px] font-medium text-text-faint">{getAutoCancelTime(b.createdAt)}</p>}

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                      {group === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus(b.bookingId, BookingStatus.CONFIRMED)} className="flex-1 py-2 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-200 transition-all">Accept & Confirm</button>
                          <button onClick={() => { setCancellingId(b.bookingId); setCancelReason(''); }} className="flex-1 py-2 bg-rose-100 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-200 transition-all">Cancel</button>
                        </div>
                      )}
                      {group === 'confirmed' && (
                        <button onClick={() => { setCancellingId(b.bookingId); setCancelReason(''); }} className="w-full py-2 bg-rose-100 text-rose-700 text-xs font-bold rounded-lg">Cancel</button>
                      )}
                      {cancellingId === b.bookingId && (
                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Reason (optional):</label>
                          <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none">
                            <option value="">-- Select reason --</option>
                            <option value="No-show">No-show</option>
                            <option value="Non-payment">Non-payment</option>
                            <option value="Rule violation">Rule violation</option>
                            <option value="Other">Other</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => updateStatus(b.bookingId, BookingStatus.CANCELLED, cancelReason)} className="flex-1 py-2 bg-rose-500 text-white text-[10px] font-bold rounded uppercase tracking-wider">Confirm Cancel</button>
                            <button onClick={() => { setCancellingId(null); setCancelReason(''); }} className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 text-[10px] font-bold rounded uppercase tracking-wider">Back</button>
                          </div>
                        </div>
                      )}
                      {group === 'cancelled' && b.cancelReason && (
                        <p className="text-[10px] italic text-rose-600 dark:text-rose-400">Reason: {b.cancelReason}</p>
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
  const t = new Date(new Date(createdAtISO).getTime() + AUTO_CANCEL_THRESHOLD_MINS * 60 * 1000);
  let h = t.getHours(); const m = t.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `Auto-cancels in 6 hrs at ${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RulesTab (unchanged content)
// ─────────────────────────────────────────────────────────────────────────────
function RulesTab() {
  const sections = [
    { title: "1. Court Operating Hours", items: ["Weekdays: 7:00 AM – 9:00 AM, 6:00 PM – 10:00 PM", "Weekends & Bank Holidays: 7:00 AM – 1:00 PM, 5:00 PM – 11:00 PM"] },
    { title: "2. Charges", items: ["Court usage: ₹100 per 30-minute slot", "Non-Ambrosia guest rate: ₹200 per 30-minute slot", "Paddle rental (Pickleball): ₹25 per paddle", "Fees are non-refundable"] },
    { title: "3. Booking Procedure", items: ["First-come, first-served", "Confirmed only upon receipt of full payment", "Payment via UPI or Cash to Court Manager"] },
    { title: "4. AUTO-CANCELLATION POLICY", items: ["Payment must be completed within 30 minutes", "Unpaid slots are automatically re-opened", "Cancelled bookings cannot be reinstated"] },
    { title: "5. BOOKING MODIFICATIONS", items: ["Date/time can be changed if slot is > 2 hours away", "Sport, duration, and amounts cannot be changed", "Modifications locked within 2 hours of slot"] },
    { title: "6. Dress Code", items: ["Non-marking sports footwear is MANDATORY", "Studded footwear is STRICTLY PROHIBITED"] },
    { title: "7. Code of Conduct", items: ["Maintain discipline and sportsmanship", "FOOD, SMOKING, AND ALCOHOL PROHIBITED", "Management decisions are final and binding"] },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-primary text-white p-8 rounded-2xl">
        <h2 className="text-3xl font-display font-bold">Standard Operating Procedures</h2>
        <p className="text-accent font-semibold tracking-widest text-xs uppercase opacity-80">Dosti Ambrosia Sports Club</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
        {sections.map((s, idx) => (
          <div key={idx} className="bg-surface border border-border-subtle p-6 rounded-2xl shadow-sm">
            <h3 className="font-display font-bold text-lg mb-4 text-primary dark:text-accent border-b border-divider pb-2">{s.title}</h3>
            <ul className="space-y-2">
              {s.items.map((item, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-accent font-bold mt-1">•</span>
                  <span className={item.includes('MANDATORY') || item.includes('PROHIBITED') || item.includes('STRICTLY') ? 'font-bold text-error' : 'text-text-secondary'}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="text-center text-text-faint text-xs font-medium border-t border-divider pt-8 pb-12">Last updated: April 2026 • © Dosti Ambrosia Management</div>
    </div>
  );
}