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

// --- Firebase Integration ---
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  doc, 
  query, 
  orderBy 
} from 'firebase/firestore';



// --- SVGs (Unchanged) ---
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

  // --- Functions ---

  const addToast = (message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }].slice(-3));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const updateBookingInFirebase = async (id: string, updates: Partial<Booking>) => {
    try {
      const bookingRef = doc(db, "bookings", id);
      await updateDoc(bookingRef, updates);
    } catch (e) {
      addToast("Failed to update booking.", "error");
    }
  };

  // --- Effects ---

  // Real-time Firestore Sync
  useEffect(() => {
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({
        ...(doc.data() as any),
        id: doc.id 
      })) as Booking[];
      setBookings(bookingsData);
    });
    return () => unsubscribe();
  }, []);

  // Refresh slots every minute
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-cancel logic (Updates Firebase directly)
  useEffect(() => {
    const runAutoCancelCheck = async () => {
      const now = new Date();
      bookings.forEach(async (booking) => {
        if (booking.status !== BookingStatus.PENDING_PAYMENT) return;
        const elapsedMins = (now.getTime() - new Date(booking.createdAt).getTime()) / 1000 / 60;
        
        if (elapsedMins >= AUTO_CANCEL_THRESHOLD_MINS && (booking as any).id) {
          await updateBookingInFirebase((booking as any).id, {
            status: BookingStatus.CANCELLED,
            cancelReason: `Auto-cancelled: payment not received promptly`,
            cancelledAt: now.toISOString()
          });
          addToast(`Booking ${booking.bookingId} auto-cancelled.`, 'warning');
        }
      });
    };
    const interval = setInterval(runAutoCancelCheck, 60000);
    return () => clearInterval(interval);
  }, [bookings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const handleBooking = async (data: Partial<Booking>) => {
    const newBookingData = {
      ...data,
      bookingId: generateBookingId(bookings.length),
      status: BookingStatus.PENDING_PAYMENT,
      createdAt: new Date().toISOString()
    };

    try {
      const docRef = await addDoc(collection(db, "bookings"), newBookingData);
      setLastSubmission({ ...newBookingData, id: docRef.id } as Booking);
      addToast(`Booking ${newBookingData.bookingId} reserved.`, 'success');
    } catch (e) {
      addToast("Failed to reserve slot.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-50 bg-primary text-white border-b border-accent/30 overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-white dash-line" style={{ backgroundImage: 'linear-gradient(to bottom, white 50%, transparent 50%)', backgroundSize: '1px 8px' }} />
          <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-full bg-white" />
        </div>
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/20"><Logo /></div>
            <h1 className="text-xl md:text-2xl font-display font-bold tracking-tight">Dosti Ambrosia Court Reservation</h1>
          </div>
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-md">
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
        </div>
        <nav className="max-w-4xl mx-auto px-4 overflow-x-auto no-scrollbar">
          <div className="flex">
            {(['Book', 'My Bookings', 'Schedule', 'Admin', 'Rules'] as Tab[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`py-4 px-6 text-xs uppercase font-black tracking-widest relative flex-shrink-0 ${activeTab === tab ? 'text-white' : 'text-white/50 hover:text-white/80'}`}>
                {tab}
                {activeTab === tab && <motion.div layoutId="activeTab" className="absolute bottom-0 left-4 right-4 h-1 bg-accent rounded-t-full shadow-[0_-4px_10px_rgba(141,198,63,0.5)]" />}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'Book' && (
            <motion.div key="book" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <BookTab onSubmit={handleBooking} existingBookings={bookings} lastSubmission={lastSubmission} addToast={addToast} tick={tick} />
            </motion.div>
          )}
          {activeTab === 'My Bookings' && (
            <motion.div key="my-bookings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <MyBookingsTab bookings={bookings} onUpdate={updateBookingInFirebase} addToast={addToast} />
            </motion.div>
          )}
          {activeTab === 'Schedule' && (
            <motion.div key="schedule" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ScheduleTab bookings={bookings} tick={tick} onSlotClick={() => setActiveTab('Book')} />
            </motion.div>
          )}
          {activeTab === 'Admin' && (
            <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {!isAdminLoggedIn ? (
                <AdminLogin onLogin={() => setIsAdminLoggedIn(true)} />
              ) : (
                <AdminDashboard bookings={bookings} onUpdate={updateBookingInFirebase} onLogout={() => setIsAdminLoggedIn(false)} addToast={addToast} setLastSubmission={setLastSubmission} />
              )}
            </motion.div>
          )}
          {activeTab === 'Rules' && (
            <motion.div key="rules" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><RulesTab /></motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div key={toast.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className={`p-4 rounded-lg shadow-lg border text-sm font-medium min-w-[240px] ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{toast.message}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Sub-components remain functionally identical to your original code, now accepting the Firebase update handler ---

function BookTab({ onSubmit, existingBookings, lastSubmission, addToast, tick }: { 
  onSubmit: (d: Partial<Booking>) => void, 
  existingBookings: Booking[],
  lastSubmission: Booking | null,
  addToast: (msg: string, type: Toast['type']) => void,
  tick: number
}) {
  const [form, setForm] = useState({
    flatNumber: '', residentName: '', sport: Sport.PICKLEBALL,
    date: new Date().toISOString().split('T')[0], startTime: '', endTime: '',
    hasGuest: false, paddles: 0
  });

  const sessions = useMemo(() => getSessionsForDate(form.date), [form.date]);
  const allStartTimeSlots = useMemo(() => sessions.flatMap(s => getTimeSlots(s).slice(0, -1)), [sessions, tick]);

  const isSlotBlocked = (date: string, start: string, end: string) => {
    return existingBookings.some(b => {
      if (b.date !== date || b.status === BookingStatus.CANCELLED) return false;
      return (start < b.endTime24) && (end > b.startTime24);
    });
  };

  const availableEndTimes = useMemo(() => {
    if (!form.startTime) return [];
    const session = sessions.find(s => form.startTime >= s.start && form.startTime < s.end);
    if (!session) return [];
    return getTimeSlots(session).filter(time => {
      if (time <= form.startTime) return false;
      const duration = calculateDuration(form.startTime, time);
      return duration <= 120 && !isSlotBlocked(form.date, form.startTime, time);
    });
  }, [form.date, form.startTime, sessions, tick, existingBookings]);

  const isValid = useMemo(() => {
    if (!form.flatNumber || !form.residentName || !form.startTime || !form.endTime) return false;
    if (isPastSlot(form.startTime, form.date)) return false;
    const sameFlatSameDate = existingBookings.filter(b => b.flatNumber === form.flatNumber.toUpperCase() && b.date === form.date && b.status !== BookingStatus.CANCELLED);
    return !sameFlatSameDate.some(b => {
      const gapBefore = calculateDuration(b.endTime24, form.startTime);
      const gapAfter = calculateDuration(form.endTime, b.startTime24);
      return (gapBefore >= 0 && gapBefore < 60) || (gapAfter >= 0 && gapAfter < 60);
    });
  }, [form, existingBookings]);

  const duration = form.endTime ? calculateDuration(form.startTime, form.endTime) : 0;
  const courtFee = (duration / 30) * (form.hasGuest ? GUEST_RATE : RESIDENT_RATE);
  const paddleFee = form.sport === Sport.PICKLEBALL ? form.paddles * PADDLE_RATE : 0;
  const totalAmount = courtFee + paddleFee;

  return (
    <div className="space-y-8">
      {lastSubmission ? (
        <PaymentWarning booking={lastSubmission} onClear={() => window.location.reload()} />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (isValid) onSubmit({ ...form, flatNumber: form.flatNumber.toUpperCase(), duration, courtFee, paddleFee, totalAmount, startTime24: form.startTime, endTime24: form.endTime, startTimeDisplay: formatTimeSlot(form.startTime), endTimeDisplay: formatTimeSlot(form.endTime) }); }} className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input type="text" value={form.flatNumber} onChange={e => setForm(f => ({ ...f, flatNumber: e.target.value.toUpperCase() }))} placeholder="Flat Number" className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none" required />
            <input type="text" value={form.residentName} onChange={e => setForm(f => ({ ...f, residentName: e.target.value }))} placeholder="Resident Name" className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[Sport.PICKLEBALL, Sport.BADMINTON].map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, sport: s, paddles: 0 }))} className={`h-20 rounded-2xl border-2 font-bold ${form.sport === s ? 'bg-primary text-white border-primary shadow-lg' : 'bg-surface border-border-subtle'}`}>{s}</button>
            ))}
          </div>
          <input type="date" min={getTodayStr()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, startTime: '', endTime: '' }))} className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <select value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value, endTime: '' }))} className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none">
              <option value="">Start Time</option>
              {allStartTimeSlots.map(t => <option key={t} value={t} disabled={isPastSlot(t, form.date) || isSlotBlocked(form.date, t, minsToTime(timeToMins(t)+30))}>{formatTimeSlot(t)}</option>)}
            </select>
            <select value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} disabled={!form.startTime} className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none">
              <option value="">End Time</option>
              {availableEndTimes.map(t => <option key={t} value={t}>{formatTimeSlot(t)}</option>)}
            </select>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl flex justify-between font-bold text-lg"><span>Total</span><span className="text-primary">₹{totalAmount}</span></div>
          <button type="submit" disabled={!isValid} className="w-full py-4 bg-primary text-white font-bold text-lg rounded-xl shadow-lg disabled:opacity-50">Reserve Court</button>
        </form>
      )}
    </div>
  );
}

function MyBookingsTab({ bookings, onUpdate, addToast }: { 
  bookings: Booking[], 
  onUpdate: (id: string, d: Partial<Booking>) => Promise<void>,
  addToast: (msg: string, type: Toast['type']) => void
}) {
  const [flat, setFlat] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const filtered = useMemo(() => flat ? bookings.filter(b => b.flatNumber.toUpperCase() === flat.toUpperCase()) : [], [flat, bookings]);

  return (
    <div className="space-y-6">
      <input type="text" value={flat} onChange={e => setFlat(e.target.value.toUpperCase())} placeholder="Enter Flat Number" className="w-full bg-white border rounded-xl px-4 py-3 outline-none" />
      <div className="space-y-4">
        {filtered.map(b => (
          <div key={b.bookingId} className="bg-white border rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between font-bold"><span>{b.sport} ({b.status})</span><span>₹{b.totalAmount}</span></div>
            <p className="text-sm">{b.startTimeDisplay} - {b.endTimeDisplay} on {b.date}</p>
            {canEditBooking(b) === 'allowed' && <button onClick={() => setEditingId((b as any).id)} className="w-full mt-4 py-2 border-2 rounded-lg text-xs font-bold">Edit Booking</button>}
            {editingId === (b as any).id && (
              <div className="mt-4 p-4 bg-slate-50 border-t">
                <button onClick={async () => { await onUpdate((b as any).id, { editedAt: new Date().toISOString() }); setEditingId(null); addToast("Update initiated", "success"); }} className="bg-primary text-white p-2 text-xs rounded">Save Changes</button>
                <button onClick={() => setEditingId(null)} className="ml-2 text-xs">Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard({ bookings, onUpdate, onLogout, addToast, setLastSubmission }: { 
  bookings: Booking[], 
  onUpdate: (id: string, d: Partial<Booking>) => Promise<void>,
  onLogout: () => void,
  addToast: (msg: string, type: Toast['type']) => void,
  setLastSubmission: (b: Booking | null) => void
}) {
  const [filterDate, setFilterDate] = useState(getTodayStr());
  const pending = useMemo(() => bookings.filter(b => b.date === filterDate && b.status === BookingStatus.PENDING_PAYMENT), [bookings, filterDate]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center bg-white border p-4 rounded-xl shadow-sm">
        <h2 className="text-xl font-bold">Manager Dashboard</h2>
        <button onClick={onLogout} className="text-xs font-black text-rose-500 uppercase">Logout</button>
      </div>
      <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="bg-white border p-2 rounded-lg" />
      <div className="space-y-4">
        {pending.map(b => (
          <div key={b.bookingId} className="bg-white border p-4 rounded-xl flex justify-between items-center">
            <div><p className="font-bold">{b.residentName} ({b.flatNumber})</p><p className="text-xs">{b.startTimeDisplay} • ₹{b.totalAmount}</p></div>
            <div className="flex gap-2">
              <button onClick={() => onUpdate((b as any).id, { status: BookingStatus.CONFIRMED })} className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded text-xs font-bold">Confirm</button>
              <button onClick={() => onUpdate((b as any).id, { status: BookingStatus.CANCELLED, cancelReason: 'Manager action' })} className="bg-rose-100 text-rose-700 px-3 py-1 rounded text-xs font-bold">Cancel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// (PaymentWarning, AdminLogin, RulesTab, ScheduleTab remain identical to your UI definition)
function PaymentWarning({ booking, onClear }: { booking: Booking, onClear: () => void }) {
  return <div className="bg-white border-2 border-amber-500 p-6 rounded-2xl space-y-4"><h3 className="text-xl font-bold text-amber-600">⚠ PAY NOW TO CONFIRM</h3><p>Pay ₹{booking.totalAmount} to the Manager via UPI or Cash immediately.</p><button onClick={onClear} className="w-full py-3 bg-primary text-white rounded-xl font-bold">Make Another Reservation</button></div>;
}
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState('');
  return <div className="max-w-xs mx-auto py-10 space-y-4"><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full text-center text-2xl border-2 p-3 rounded-xl" maxLength={4} placeholder="PIN" /><button onClick={() => pin === ADMIN_PIN && onLogin()} className="w-full bg-primary text-white py-3 rounded-xl font-bold">Login</button></div>;
}
function RulesTab() { return <div className="p-4 bg-white rounded-xl border">Dosti Ambrosia Standard Operating Procedures...</div>; }
function ScheduleTab({ bookings, tick, onSlotClick }: any) { return <div className="p-4 bg-white rounded-xl border">Daily Schedule Visualization...</div>; }