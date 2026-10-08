import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Phone,
  QrCode,
  BookOpen,
  WifiOff,
  User,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { motion } from 'framer-motion';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const handleDisconnect = async (sessionUserId: string) => {
    if (!confirm('Disconnect this WhatsApp device? You will need to scan a new QR to reconnect.')) return;
    setDisconnectingId(sessionUserId);
    try {
      await client.delete(`/sessions/${sessionUserId}`);
      // Refresh the session list from the server so UI reflects reality
      const sessionsRes = await client.get('/sessions').catch(() => ({ data: { sessions: [] } }));
      setSessions(sessionsRes.data.sessions || []);
    } catch (err) {
      console.error('Disconnect failed', err);
      alert('Failed to disconnect. Please try again.');
    } finally {
      setDisconnectingId(null);
    }
  };

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    try {
      const { data: userProfile } = await client.get(`/users/${user?.id}`);

      // Redirect to onboarding if profile is incomplete
      if (!userProfile.user?.business_name) {
        navigate('/onboarding');
        return;
      }

      const [statsRes, sessionsRes, tasksRes] = await Promise.all([
        client.get('/analytics').catch(() => ({ data: {} })),
        client.get('/sessions').catch(() => ({ data: { sessions: [] } })),
        client.get('/tasks').catch(() => ({ data: { tasks: [] } })),
      ]);
      setStats(statsRes.data);
      setSessions(sessionsRes.data.sessions || []);

      // Extract upcoming appointments from tasks — match multiple patterns
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const isAppt = (title: string) => {
        if (!title) return false;
        const lower = title.toLowerCase();
        return lower.includes('appointment') || lower.includes('test drive') ||
               lower.includes('meeting') || lower.includes('visit') ||
               lower.includes('booking') || lower.includes('schedule') || title.includes('\u{1F4C5}');
      };
      const upcomingAppts = (tasksRes.data.tasks || [])
        .filter((t: any) => isAppt(t.title) && !t.is_completed && t.due_date && new Date(t.due_date) >= now)
        .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
        .slice(0, 5);
      setAppointments(upcomingAppts);
    } catch (err) {
      console.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const isConnected = connectedSessions.length > 0;

  /* Derive first name from email */
  const firstName = user?.email
    ? user.email.split('@')[0].replace(/[._-]/g, ' ').split(' ')[0].replace(/^\w/, (c: string) => c.toUpperCase())
    : 'there';

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-ink-50/30 border-t-ink-200 rounded-full animate-spin" />
          <p className="text-ink-50 font-medium">Syncing dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 lg:pb-8 max-w-3xl mx-auto space-y-6">

      {/* ── Greeting Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-ink-50">{dateLabel}</p>
          <h1 className="font-display text-[24px] font-bold text-ink-400 leading-tight">
            Hi, {firstName}
          </h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="w-11 h-11 rounded-full bg-pastel-peach flex items-center justify-center shrink-0 card-press cursor-pointer focus:outline-none focus:ring-2 focus:ring-soft-peach/40"
          aria-label="Open Settings"
        >
          <span className="font-display font-bold text-soft-peach text-[16px]">
            {firstName.charAt(0).toUpperCase()}
          </span>
        </button>
      </div>

      {/* ── WhatsApp Status Inline ── */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-cream-200'}`} />
        <span className={`text-[12px] font-medium ${isConnected ? 'text-soft-sage' : 'text-ink-50'}`}>
          {isConnected ? 'WhatsApp Connected' : 'Not Connected'}
        </span>
      </div>

      {/* ── Stat Cards ── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4"
      >
        <motion.button
          variants={item}
          onClick={() => navigate('/conversations')}
          className="bg-pastel-lavender rounded-[20px] p-4 card-press text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-soft-lavender/40"
          aria-label="Open Active Chats"
        >
          <p className="font-display text-[28px] font-bold text-soft-lavender leading-none">
            {stats?.totalConversations || 0}
          </p>
          <p className="text-[12px] text-soft-lavender/70 mt-1">Active Chats</p>
        </motion.button>

        <motion.button
          variants={item}
          onClick={() => navigate('/leads')}
          className="bg-pastel-sage rounded-[20px] p-4 card-press text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-soft-sage/40"
          aria-label="Open Total Leads"
        >
          <p className="font-display text-[28px] font-bold text-soft-sage leading-none">
            {stats?.totalLeads || 0}
          </p>
          <p className="text-[12px] text-soft-sage/70 mt-1">Total Leads</p>
        </motion.button>

        <motion.button
          variants={item}
          onClick={() => navigate('/analytics')}
          className="bg-pastel-peach rounded-[20px] p-4 card-press text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-soft-peach/40"
          aria-label="Open Analytics"
        >
          <p className="font-display text-[28px] font-bold text-soft-peach leading-none">
            {stats?.aiMessagesCount || 0}
          </p>
          <p className="text-[12px] text-soft-peach/70 mt-1">AI Replies</p>
        </motion.button>

        <motion.button
          variants={item}
          onClick={() => navigate('/tasks')}
          className="bg-pastel-sky rounded-[20px] p-4 card-press text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-soft-sky/40"
          aria-label="Open Tasks"
        >
          <p className="font-display text-[28px] font-bold text-soft-sky leading-none">
            {stats?.totalTasks || 0}
          </p>
          <p className="text-[12px] text-soft-sky/70 mt-1">Tasks</p>
        </motion.button>
      </motion.div>

      {/* ── Quick Actions ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="section-label mb-2">Quick actions</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => navigate('/qr-scanner')}
            className="flex items-center gap-2 bg-ink-300 text-cream-50 rounded-full h-11 px-5 font-semibold text-[13px] shrink-0 card-press"
          >
            <QrCode className="w-4 h-4" />
            Link WhatsApp
          </button>
          <button
            onClick={() => navigate('/ai-brain')}
            className="flex items-center gap-2 bg-pastel-honey text-ink-200 rounded-full h-11 px-5 font-semibold text-[13px] shrink-0 card-press"
          >
            <BookOpen className="w-4 h-4" />
            Train AI
          </button>
          <button
            onClick={() => navigate('/conversations')}
            className="flex items-center gap-2 bg-pastel-mint text-ink-200 rounded-full h-11 px-5 font-semibold text-[13px] shrink-0 card-press"
          >
            <MessageSquare className="w-4 h-4" />
            View Chats
          </button>
        </div>
      </motion.div>

      {/* ── Upcoming Appointments ── */}
      {appointments.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-2">
            <p className="section-label">Upcoming</p>
            <button
              onClick={() => navigate('/appointments')}
              className="text-[12px] text-soft-lavender font-semibold flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            {appointments.map((appt: any) => {
              const apptDate = new Date(appt.due_date);
              const isToday = apptDate.toDateString() === new Date().toDateString();
              const nameMatch = appt.title?.match(/Appointment:\s*(.+?)\s*[\u2014\u2013-]\s*/);
              const serviceMatch = appt.title?.match(/[\u2014\u2013-]\s*(.+)$/);
              const customerName = nameMatch?.[1] || 'Customer';
              const service = (serviceMatch?.[1] || 'Appointment').replace(/\s+at\s+\d{1,2}:\d{2}\s*[AP]M$/i, '').trim();
              const dayAbbr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][apptDate.getDay()];
              // Use appointment_time if available, otherwise extract from title
              let timeStr = '';
              if (appt.appointment_time) {
                const d = new Date(appt.appointment_time);
                const istH = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
                const istM = (d.getUTCMinutes() + 30) % 60;
                const h12 = istH === 0 ? 12 : istH > 12 ? istH - 12 : istH;
                const ampm = istH >= 12 ? 'PM' : 'AM';
                timeStr = `${h12}:${String(istM).padStart(2, '0')} ${ampm}`;
              } else {
                const titleTimeMatch = appt.title?.match(/at\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
                timeStr = titleTimeMatch ? titleTimeMatch[1] : '';
              }

              return (
                <button
                  key={appt.id}
                  onClick={() => navigate('/appointments')}
                  className="w-full flex items-center gap-3 rounded-2xl p-3 hover:bg-cream-100 transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-soft-sky/40"
                  aria-label="Open Appointments"
                >
                  {/* Date avatar */}
                  <div className="w-10 h-10 rounded-full bg-pastel-sky flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold uppercase text-soft-sky leading-none">{dayAbbr}</span>
                    <span className="text-[14px] font-bold text-soft-sky leading-none">{apptDate.getDate()}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink-300 truncate">{service}</p>
                    <p className="text-[12px] text-ink-50 flex items-center gap-1">
                      <User className="w-3 h-3" /> {customerName}
                      {isToday && (
                        <span className="ml-1.5 text-[10px] font-semibold bg-pastel-sage text-soft-sage rounded-full px-2 py-0.5">
                          Today
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Time */}
                  <span className="text-[11px] text-ink-50 shrink-0">{timeStr}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Devices ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="section-label mb-2">Devices</p>
        {sessions.length === 0 ? (
          <div className="flex items-center justify-between rounded-2xl p-4 hover:bg-cream-100 transition-colors">
            <div className="flex items-center gap-3">
              <WifiOff className="w-5 h-5 text-ink-50/40" />
              <p className="text-[13px] text-ink-50">No devices linked</p>
            </div>
            <button
              onClick={() => navigate('/qr-scanner')}
              className="text-[12px] text-soft-lavender font-semibold"
            >
              Link now
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session, i) => {
              const isConnectedSession = session.status === 'connected';
              const isBusy = disconnectingId === session.userId;
              return (
                <div
                  key={session.userId || i}
                  className="w-full flex items-center justify-between rounded-2xl p-3 hover:bg-cream-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-pastel-lavender flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-soft-lavender" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink-300 truncate">
                        {session.phone ? `+${session.phone}` : 'Pending...'}
                      </p>
                      <p className="text-[11px] text-ink-50 truncate">
                        {session.connectedAt
                          ? `Connected ${new Date(session.connectedAt).toLocaleDateString()}`
                          : 'Awaiting QR scan'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${isConnectedSession ? 'bg-success' : 'bg-cream-200'}`} />
                    {isConnectedSession ? (
                      <button
                        onClick={() => handleDisconnect(session.userId)}
                        disabled={isBusy}
                        className="flex items-center gap-1 text-[11px] font-semibold text-soft-rose bg-pastel-rose/60 hover:bg-pastel-rose rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-soft-rose/40"
                        aria-label="Disconnect WhatsApp device"
                      >
                        <LogOut className="w-3 h-3" />
                        {isBusy ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate('/qr-scanner')}
                        className="text-[11px] font-semibold text-soft-lavender bg-pastel-lavender/60 hover:bg-pastel-lavender rounded-full px-3 py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-soft-lavender/40"
                        aria-label="Reconnect WhatsApp"
                      >
                        Reconnect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Dashboard;
