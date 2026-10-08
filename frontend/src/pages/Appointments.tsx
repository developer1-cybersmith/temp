import React, { useState, useEffect } from 'react';
import client from '../api/client';
import {
  Calendar,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  CalendarDays,
  Car,
  Plus,
  Trash2,
  Bell,
} from 'lucide-react';
import { motion } from 'framer-motion';
import Modal from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface Appointment {
  id: string;
  title: string;
  due_date: string | null;
  appointment_time: string | null;
  is_completed: boolean;
  created_at: string;
  customerName: string;
  service: string;
  isAutoDetected: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TIME_SLOTS = [
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM',
];

const extractInfo = (title: string): { customerName: string; service: string } => {
  // "📅 Appointment: John — Test Drive at 3:00 PM"
  const apptMatch = title.match(/(?:Appointment|Booking|Meeting)[:\s]*(.+?)\s*[—–\-]\s*(.+)/i);
  if (apptMatch) {
    // Strip "at HH:MM AM/PM" from service name
    const service = apptMatch[2].trim().replace(/\s+at\s+\d{1,2}:\d{2}\s*[AP]M$/i, '').trim();
    return { customerName: apptMatch[1].trim(), service };
  }

  // "Test Drive for John"
  const forMatch = title.match(/(.+?)\s+(?:for|with)\s+(.+)/i);
  if (forMatch) return { customerName: forMatch[2].trim(), service: forMatch[1].trim() };

  // Fallback — use full title as service
  return { customerName: 'Customer', service: title.length > 40 ? title.slice(0, 40) + '...' : title };
};

const Appointments: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formService, setFormService] = useState('Test Drive');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAppointments(); }, []);

  const fetchAppointments = async () => {
    try {
      const res = await client.get('/tasks');
      const tasks = res.data.tasks || [];

      // Show ALL tasks that have a due_date — they're all scheduled items
      const appts: Appointment[] = tasks
        .filter((t: any) => t.due_date)
        .map((t: any) => {
          const info = extractInfo(t.title || '');
          return {
            ...t,
            customerName: info.customerName,
            service: info.service,
            isAutoDetected: t.title?.includes('📅') || false,
          };
        });

      setAppointments(appts);
    } catch (err) {
      console.error('Failed to fetch', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (id: string, current: boolean) => {
    await client.patch(`/tasks/${id}`, { is_completed: !current }).catch(() => {});
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, is_completed: !current } : a));
  };

  const deleteAppt = async (id: string) => {
    await client.delete(`/tasks/${id}`).catch(() => {});
    setAppointments(prev => prev.filter(a => a.id !== id));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDate) return;
    setSaving(true);
    try {
      // Convert 24h time to 12h AM/PM format for the title
      let timeLabel = '';
      if (formTime) {
        const [hh, mm] = formTime.split(':').map(Number);
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const h12 = hh % 12 || 12;
        timeLabel = ` at ${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
      }
      const title = `📅 Appointment: ${formName.trim()} — ${formService}${timeLabel}`;
      await client.post('/tasks', {
        title,
        due_date: formDate,
        is_completed: false,
        appointment_time: formTime ? new Date(`${formDate}T${formTime}`).toISOString() : null,
      });
      setFormName(''); setFormService('Test Drive'); setFormDate(''); setFormTime('');
      setShowAddModal(false);
      await fetchAppointments();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // Date helpers
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

  const active = appointments.filter(a => !a.is_completed);
  const todayAppts = active.filter(a => new Date(a.due_date!).toDateString() === today.toDateString());
  const tomorrowAppts = active.filter(a => new Date(a.due_date!).toDateString() === tomorrow.toDateString());
  const weekAppts = active.filter(a => { const d = new Date(a.due_date!); return d >= today && d <= weekEnd; });
  const pastAppts = appointments.filter(a => a.is_completed || new Date(a.due_date!) < today);

  // Calendar
  const calMonth = calendarDate.getMonth();
  const calYear = calendarDate.getFullYear();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const getApptsForDate = (day: number) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.filter(a => a.due_date?.startsWith(dateStr));
  };

  const selectedDayAppts = selectedDay ? getApptsForDate(selectedDay) : [];
  const selectedDateStr = selectedDay ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` : '';

  const handleSlotClick = (slot: string) => {
    // Convert "02:00 PM" to 24h "14:00" for the time input
    const [time, meridiem] = slot.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (meridiem === 'PM' && h !== 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    const time24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    setFormDate(selectedDateStr);
    setFormTime(time24);
    setShowAddModal(true);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 className="w-10 h-10 animate-spin text-ink-100" />
      <span className="text-[13px] text-ink-50">Loading appointments...</span>
    </div>
  );

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[22px] font-bold text-ink-400">Appointments</h1>
          <p className="text-[13px] text-ink-50">Auto-detected from WhatsApp + manually added</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Appointment
        </Button>
      </div>

      {/* Today's Reminder Banner */}
      {todayAppts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-pastel-sage rounded-[20px] p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-soft-sage/20 rounded-xl flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-soft-sage" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-soft-sage text-sm">
              {todayAppts.length} appointment{todayAppts.length > 1 ? 's' : ''} today!
            </span>
            <p className="text-[12px] text-soft-sage/70 truncate">
              {todayAppts.map(a => `${a.customerName} — ${a.service}`).join(' | ')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Today', value: todayAppts.length, bg: 'bg-pastel-sage', color: 'text-soft-sage' },
          { label: 'Tomorrow', value: tomorrowAppts.length, bg: 'bg-pastel-sky', color: 'text-soft-sky' },
          { label: 'This Week', value: weekAppts.length, bg: 'bg-pastel-lavender', color: 'text-soft-lavender' },
          { label: 'Completed', value: pastAppts.filter(a => a.is_completed).length, bg: 'bg-cream-200', color: 'text-ink-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-[20px] p-4`}>
            <p className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className={`text-[12px] font-medium ${s.color} opacity-70 mt-0.5`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main Layout: Calendar + Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar — 2 cols */}
        <div className="lg:col-span-2 bg-cream-100/60 rounded-[20px] overflow-hidden">
          {/* Month header */}
          <div className="flex items-center justify-between p-4">
            <button onClick={() => setCalendarDate(new Date(calYear, calMonth - 1, 1))}
              className="p-2 rounded-xl hover:bg-cream-200 transition-colors">
              <ChevronLeft className="w-5 h-5 text-ink-200" />
            </button>
            <h2 className="font-display font-semibold text-ink-300">{MONTHS[calMonth]} {calYear}</h2>
            <button onClick={() => setCalendarDate(new Date(calYear, calMonth + 1, 1))}
              className="p-2 rounded-xl hover:bg-cream-200 transition-colors">
              <ChevronRight className="w-5 h-5 text-ink-200" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-2">
            {DAYS.map(d => (
              <div key={d} className="text-center py-2 text-[10px] font-semibold text-ink-50 uppercase tracking-widest">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 px-2 pb-2">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`e-${i}`} className="min-h-[72px] p-1.5" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayAppts = getApptsForDate(day);
              const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
              const isPast = new Date(calYear, calMonth, day) < today;
              const isSelected = selectedDay === day;

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={`min-h-[72px] p-1.5 cursor-pointer transition-all rounded-xl m-0.5 ${
                    isSelected ? 'bg-pastel-peach/40 ring-2 ring-soft-peach/30 ring-inset' :
                    isToday ? 'bg-pastel-lavender/40' :
                    isPast ? 'opacity-40' : 'hover:bg-cream-200/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-soft-lavender text-cream-50' : 'text-ink-200'
                    }`}>{day}</span>
                    {dayAppts.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-pastel-sage text-soft-sage">
                        {dayAppts.length}
                      </span>
                    )}
                  </div>
                  {dayAppts.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {dayAppts.slice(0, 2).map(a => (
                        <div key={a.id} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate ${
                          a.is_completed ? 'text-ink-50 line-through' : 'text-soft-sage bg-pastel-sage/40'
                        }`}>{a.customerName}</div>
                      ))}
                      {dayAppts.length > 2 && <div className="text-[9px] text-ink-50 pl-1">+{dayAppts.length - 2}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Panel — 1 col */}
        <div className="space-y-4">
          {/* Selected day detail OR upcoming list */}
          {selectedDay ? (
            <div className="bg-cream-100/60 rounded-[20px] p-4">
              <h3 className="font-display font-semibold text-ink-300 text-base mb-3">
                {MONTHS[calMonth]} {selectedDay}, {calYear}
                <span className="text-[12px] font-normal text-ink-50 ml-2">
                  ({selectedDayAppts.length} appointment{selectedDayAppts.length !== 1 ? 's' : ''})
                </span>
              </h3>
              {/* Time Slot Grid */}
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-100 mb-2">
                Available Time Slots
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {TIME_SLOTS.map(slot => {
                  // Normalize slot for comparison: "03:00 PM" → parse hours/minutes
                  const slotMatch = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                  const slotHour24 = slotMatch ? (slotMatch[3].toUpperCase() === 'PM' && parseInt(slotMatch[1]) !== 12 ? parseInt(slotMatch[1]) + 12 : slotMatch[3].toUpperCase() === 'AM' && parseInt(slotMatch[1]) === 12 ? 0 : parseInt(slotMatch[1])) : -1;
                  const slotMin = slotMatch ? parseInt(slotMatch[2]) : -1;

                  const isBooked = selectedDayAppts.some(a => {
                    if (a.appointment_time) {
                      const d = new Date(a.appointment_time);
                      // Get IST hours: UTC + 5:30
                      const istH = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
                      const istM = (d.getUTCMinutes() + 30) % 60;
                      return istH === slotHour24 && istM === slotMin;
                    }
                    const titleTime = a.title.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    if (!titleTime) return false;
                    const tH = titleTime[3].toUpperCase() === 'PM' && parseInt(titleTime[1]) !== 12 ? parseInt(titleTime[1]) + 12 : titleTime[3].toUpperCase() === 'AM' && parseInt(titleTime[1]) === 12 ? 0 : parseInt(titleTime[1]);
                    return tH === slotHour24 && parseInt(titleTime[2]) === slotMin;
                  });
                  return (
                    <button
                      key={slot}
                      className={`text-[11px] py-2 rounded-xl font-semibold transition-all ${
                        isBooked
                          ? 'bg-pastel-sage text-white cursor-default'
                          : 'bg-cream-200/50 text-ink-100 hover:bg-pastel-lavender/40 cursor-pointer'
                      }`}
                      onClick={() => !isBooked && handleSlotClick(slot)}
                    >
                      {slot} {isBooked ? '●' : ''}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-ink-50 mb-4">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pastel-sage inline-block" /> Booked</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cream-200 inline-block" /> Available</span>
              </div>

              {selectedDayAppts.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="w-10 h-10 mx-auto mb-2 text-ink-50/30" />
                  <p className="text-[13px] text-ink-50">No appointments this day</p>
                  <button onClick={() => { setFormDate(selectedDateStr); setShowAddModal(true); }}
                    className="mt-3 text-soft-sage text-xs font-bold hover:underline">
                    + Add one
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayAppts.map(a => {
                    const isActiveToday = !a.is_completed && new Date(a.due_date!).toDateString() === today.toDateString();
                    const timeMatch = a.title.match(/at\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
                    const extractedTime = timeMatch ? timeMatch[1] : null;
                    let displayTime = extractedTime;
                    if (a.appointment_time) {
                      const d = new Date(a.appointment_time);
                      const istH = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
                      const istM = (d.getUTCMinutes() + 30) % 60;
                      const h12 = istH === 0 ? 12 : istH > 12 ? istH - 12 : istH;
                      const ampm = istH >= 12 ? 'PM' : 'AM';
                      displayTime = `${h12}:${String(istM).padStart(2, '0')} ${ampm}`;
                    }
                    return (
                      <div key={a.id} className={`flex items-center gap-3 p-4 rounded-2xl transition-all border ${
                        a.is_completed ? 'opacity-50 border-cream-200' :
                        isActiveToday ? 'bg-pastel-sage/20 border-pastel-sage/40' : 'bg-cream-50 border-cream-200 hover:bg-cream-100'
                      }`}>
                        <div className="w-10 h-10 rounded-full bg-pastel-sky/30 flex items-center justify-center shrink-0">
                          <Car className="w-5 h-5 text-soft-sky" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[14px] font-semibold text-ink-400 ${a.is_completed ? 'line-through' : ''}`}>{a.service}</p>
                          <p className="text-[12px] text-ink-100 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" /> {a.customerName}
                          </p>
                          {displayTime && (
                            <p className="text-[13px] text-soft-sage font-bold flex items-center gap-1 mt-1">
                              <Clock className="w-3.5 h-3.5" /> {displayTime}
                            </p>
                          )}
                          {!displayTime && a.due_date && (
                            <p className="text-[11px] text-ink-50 mt-0.5">Date: {new Date(a.due_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => toggleComplete(a.id, a.is_completed)}
                            className="p-1.5 rounded-lg hover:bg-pastel-sage/40 text-soft-sage transition-colors">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteAppt(a.id)}
                            className="p-1.5 rounded-lg hover:bg-pastel-peach/40 text-soft-peach transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Upcoming list when no day selected */
            <div className="bg-cream-100/60 rounded-[20px] p-4">
              <h3 className="font-display font-semibold text-ink-300 text-base mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-soft-lavender" /> Upcoming
              </h3>
              {active.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-10 h-10 mx-auto mb-2 text-ink-50/30" />
                  <p className="text-[13px] text-ink-50">No upcoming appointments</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {active.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()).slice(0, 10).map(a => {
                    const d = new Date(a.due_date!);
                    const isToday2 = d.toDateString() === today.toDateString();
                    return (
                      <div key={a.id} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${
                        isToday2 ? 'bg-pastel-sage/30' : 'hover:bg-cream-100'
                      }`}>
                        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-[10px] font-bold ${
                          isToday2 ? 'bg-soft-sage text-cream-50' : 'bg-cream-200 text-ink-100'
                        }`}>
                          <span>{DAYS[d.getDay()].slice(0, 2)}</span>
                          <span className="text-sm leading-none">{d.getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-ink-300 truncate">{a.service}</p>
                          <p className="text-[11px] text-ink-50 flex items-center gap-1">
                            <User className="w-3 h-3" /> {a.customerName}
                            {isToday2 && <span className="text-soft-sage font-bold ml-1">TODAY</span>}
                          </p>
                        </div>
                        <button onClick={() => toggleComplete(a.id, a.is_completed)}
                          className="p-1.5 rounded-lg hover:bg-pastel-sage/40 text-ink-50 hover:text-soft-sage transition-colors">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Completed section */}
          {pastAppts.length > 0 && (
            <div className="bg-cream-100/40 rounded-[20px] p-4">
              <h3 className="text-[11px] font-semibold text-ink-50 uppercase tracking-widest mb-3">
                Completed ({pastAppts.filter(a => a.is_completed).length})
              </h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {pastAppts.filter(a => a.is_completed).slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-[12px] text-ink-50">
                    <CheckCircle2 className="w-3.5 h-3.5 text-soft-sage/50 shrink-0" />
                    <span className="truncate flex-1 line-through">{a.service} — {a.customerName}</span>
                    <span className="text-[11px] shrink-0">{a.due_date ? new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── ADD MODAL ─── */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Appointment">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input
            label="Customer Name"
            color="honey"
            type="text"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="e.g., Rahul Sharma"
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-100 uppercase tracking-wider">Purpose</label>
            <select value={formService} onChange={e => setFormService(e.target.value)}
              className="w-full h-[54px] rounded-input px-4 text-sm text-ink-300 bg-pastel-lavender/40 outline-none border-0 transition-all duration-150 focus:ring-2 focus:ring-ink-200/30">
              <option value="Test Drive">Test Drive</option>
              <option value="Showroom Visit">Showroom Visit</option>
              <option value="Meeting">Meeting</option>
              <option value="Consultation">Consultation</option>
              <option value="Document Verification">Document Verification</option>
              <option value="Delivery">Delivery</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date"
              color="sage"
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-100 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Time
              </label>
              <input
                type="time"
                value={formTime}
                onChange={e => setFormTime(e.target.value)}
                className={`w-full h-[54px] rounded-input px-4 text-sm text-ink-300 outline-none border-0 transition-all duration-150 focus:ring-2 focus:ring-ink-200/30 ${
                  formTime ? 'bg-pastel-sage/40 ring-2 ring-soft-sage/30' : 'bg-pastel-sage/20'
                }`}
              />
              {formTime && (
                <span className="text-[10px] text-soft-sage font-semibold">
                  Selected from time slot
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="ghost" size="md" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" loading={saving}
              disabled={saving || !formName.trim() || !formDate}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Appointments;
