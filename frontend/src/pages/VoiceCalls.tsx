import React, { useEffect, useMemo, useState } from 'react';
import { PhoneCall, Clock3, AudioLines, RefreshCw, FileText, PhoneForwarded, PhoneOff, Phone, User } from 'lucide-react';
import { motion } from 'framer-motion';
import client from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

type VoiceCall = {
  id: string;
  status: string;
  direction: 'inbound' | 'outbound';
  customer_name: string | null;
  customer_phone: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  summary: string | null;
  transcript: string | null;
  outcome: string | null;
  recording_url: string | null;
  created_at: string;
};

type VoiceAction = {
  id: string;
  action_name: string;
  success: boolean;
  latency_ms: number | null;
  created_at: string;
  action_result: Record<string, any> | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDuration = (sec?: number | null) => {
  if (!sec || sec < 1) return '0s';
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins === 0) return `${rem}s`;
  return `${mins}m ${rem}s`;
};

const outcomeLabel = (outcome?: string | null) => {
  switch (outcome) {
    case 'appointment_booked':
      return 'Appointment Booked';
    case 'escalated':
      return 'Escalated';
    case 'dropped':
      return 'Dropped';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Unknown';
  }
};

const VoiceCalls: React.FC = () => {
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'ended' | 'completed'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'resolved' | 'appointment_booked' | 'escalated' | 'dropped'>('all');
  const [search, setSearch] = useState('');
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [loadingActions, setLoadingActions] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('+91');
  const [customerName, setCustomerName] = useState('');
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState('');
  const [callSuccess, setCallSuccess] = useState('');

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((call) => {
      if (statusFilter !== 'all' && call.status !== statusFilter) return false;
      if (outcomeFilter !== 'all' && call.outcome !== outcomeFilter) return false;

      if (!q) return true;
      const haystack = [
        call.customer_name || '',
        call.customer_phone || '',
        call.from_number || '',
        call.to_number || '',
        call.summary || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [calls, statusFilter, outcomeFilter, search]);

  const selectedCall = useMemo(
    () => filteredCalls.find((c) => c.id === selectedCallId) || null,
    [filteredCalls, selectedCallId]
  );

  const handleOutboundCall = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setCallError('Please enter a valid phone number');
      return;
    }
    setCallError('');
    setCallSuccess('');
    setCalling(true);
    try {
      const { data } = await client.post('/vapi/calls/outbound', {
        phoneNumber: phoneNumber.replace(/\s/g, ''),
        customerName: customerName || undefined,
      });
      setCallSuccess(`Call initiated! ID: ${data.callId}`);
      setPhoneNumber('+91');
      setCustomerName('');
      // Refresh calls list
      loadCalls();
    } catch (err: any) {
      setCallError(err.response?.data?.error || 'Failed to start call');
    } finally {
      setCalling(false);
    }
  };

  const loadCalls = async () => {
    setLoadingCalls(true);
    try {
      const res = await client.get('/vapi/calls?limit=100');
      const list = (res.data?.calls || []) as VoiceCall[];
      setCalls(list);
      if (!selectedCallId && list.length > 0) {
        setSelectedCallId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load voice calls', err);
    } finally {
      setLoadingCalls(false);
    }
  };

  const loadActions = async (callId: string) => {
    setLoadingActions(true);
    try {
      const res = await client.get(`/vapi/calls/${callId}/actions`);
      setActions((res.data?.actions || []) as VoiceAction[]);
    } catch (err) {
      console.error('Failed to load call actions', err);
      setActions([]);
    } finally {
      setLoadingActions(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  useEffect(() => {
    if (selectedCallId) {
      loadActions(selectedCallId);
    }
  }, [selectedCallId]);

  useEffect(() => {
    if (!selectedCallId && filteredCalls.length > 0) {
      setSelectedCallId(filteredCalls[0].id);
      return;
    }

    if (selectedCallId && !filteredCalls.some((c) => c.id === selectedCallId)) {
      setSelectedCallId(filteredCalls.length > 0 ? filteredCalls[0].id : null);
    }
  }, [filteredCalls, selectedCallId]);

  if (loadingCalls) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-3">
        <RefreshCw className="w-8 h-8 text-ink-100 animate-spin" />
        <p className="text-[13px] text-ink-50">Loading voice calls...</p>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-5xl mx-auto">
        <PageHeader
          title="Voice Calls"
          subtitle="Call logs, transcript, and executed actions from the voice agent"
        />
        <EmptyState
          icon={<PhoneCall className="w-7 h-7" />}
          title="No voice calls yet"
          description="Calls will appear here once your Vapi number starts receiving inbound or outbound calls."
        />
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-7xl mx-auto">
      <PageHeader
        title="Voice Calls"
        subtitle="Call logs, transcript, and action execution details"
        action={(
          <button
            type="button"
            onClick={loadCalls}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cream-200 bg-white text-[12px] font-semibold text-ink-300 hover:bg-cream-100 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        )}
      />

      {/* Make a Call */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-cream-100/60 rounded-[20px] p-5 lg:p-6 mb-6"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-100 mb-3">
          Make a Call
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Input
            label="Phone Number"
            color="sky"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+91 98765 43210"
            icon={<Phone className="w-4 h-4" />}
          />
          <Input
            label="Customer Name"
            color="honey"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Optional"
            icon={<User className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            loading={calling}
            onClick={handleOutboundCall}
          >
            <PhoneCall className="w-4 h-4 mr-2" />
            Start AI Call
          </Button>
        </div>

        {callError && (
          <p className="mt-3 text-sm text-red-500">{callError}</p>
        )}
        {callSuccess && (
          <p className="mt-3 text-sm text-green-600">{callSuccess}</p>
        )}
        {calling && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-100">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Calling {phoneNumber}...
          </div>
        )}
      </motion.div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, summary..."
          className="h-10 rounded-xl border border-cream-200 bg-white px-3 text-[12px] text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="h-10 rounded-xl border border-cream-200 bg-white px-3 text-[12px] text-ink-300 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30"
        >
          <option value="all">All Statuses</option>
          <option value="in-progress">In Progress</option>
          <option value="ended">Ended</option>
          <option value="completed">Completed</option>
        </select>

        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value as any)}
          className="h-10 rounded-xl border border-cream-200 bg-white px-3 text-[12px] text-ink-300 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30"
        >
          <option value="all">All Outcomes</option>
          <option value="resolved">Resolved</option>
          <option value="appointment_booked">Appointment Booked</option>
          <option value="escalated">Escalated</option>
          <option value="dropped">Dropped</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2 bg-cream-100/70 rounded-[20px] p-3 space-y-2 max-h-[75vh] overflow-y-auto">
          {filteredCalls.length === 0 && (
            <div className="rounded-xl bg-white/80 border border-cream-200 p-4 text-[12px] text-ink-50">
              No calls match your current filters.
            </div>
          )}

          {filteredCalls.map((call) => {
            const isActive = call.id === selectedCallId;
            return (
              <button
                key={call.id}
                type="button"
                onClick={() => setSelectedCallId(call.id)}
                className={`w-full text-left rounded-2xl p-3 border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-pastel-lavender/50 border-soft-lavender/40'
                    : 'bg-white/80 border-transparent hover:border-cream-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink-300 truncate">
                    {call.customer_name || call.customer_phone || 'Unknown Caller'}
                  </p>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-cream-200 text-ink-100 font-semibold">
                    {outcomeLabel(call.outcome)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-50 mt-1">{formatDate(call.started_at || call.created_at)}</p>
                <div className="flex items-center gap-3 text-[11px] text-ink-50 mt-2">
                  <span className="inline-flex items-center gap-1">
                    {call.direction === 'outbound' ? <PhoneForwarded className="w-3.5 h-3.5" /> : <PhoneCall className="w-3.5 h-3.5" />}
                    {call.direction}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="w-3.5 h-3.5" />
                    {formatDuration(call.duration_sec)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="xl:col-span-3 bg-cream-100/70 rounded-[20px] p-4 lg:p-5 space-y-4 min-h-[45vh]">
          {selectedCall ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[20px] font-bold text-ink-400">
                    {selectedCall.customer_name || selectedCall.customer_phone || 'Unknown Caller'}
                  </h2>
                  <p className="text-[12px] text-ink-50 mt-1">
                    From: {selectedCall.from_number || 'N/A'} | To: {selectedCall.to_number || 'N/A'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-50">{formatDate(selectedCall.started_at || selectedCall.created_at)}</p>
                  <p className="text-[12px] font-semibold text-ink-300 mt-1">{formatDuration(selectedCall.duration_sec)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/80 p-3 border border-cream-200">
                  <p className="text-[11px] text-ink-50 uppercase tracking-[0.08em]">Status</p>
                  <p className="text-[13px] font-semibold text-ink-300 mt-1">{selectedCall.status}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3 border border-cream-200">
                  <p className="text-[11px] text-ink-50 uppercase tracking-[0.08em]">Outcome</p>
                  <p className="text-[13px] font-semibold text-ink-300 mt-1">{outcomeLabel(selectedCall.outcome)}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 p-4 border border-cream-200">
                <p className="text-[11px] text-ink-50 uppercase tracking-[0.08em] mb-2 inline-flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Summary
                </p>
                <p className="text-[13px] text-ink-300 leading-relaxed">
                  {selectedCall.summary || 'No summary generated for this call yet.'}
                </p>
              </div>

              <div className="rounded-2xl bg-white/80 p-4 border border-cream-200">
                <p className="text-[11px] text-ink-50 uppercase tracking-[0.08em] mb-2 inline-flex items-center gap-1">
                  <AudioLines className="w-3.5 h-3.5" /> Transcript
                </p>
                <p className="text-[13px] text-ink-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedCall.transcript || 'Transcript not available for this call.'}
                </p>
                {selectedCall.recording_url && (
                  <a
                    href={selectedCall.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-3 text-[12px] font-semibold text-soft-lavender hover:underline"
                  >
                    Open recording URL
                  </a>
                )}
              </div>

              <div className="rounded-2xl bg-white/80 p-4 border border-cream-200">
                <p className="text-[11px] text-ink-50 uppercase tracking-[0.08em] mb-2">Actions</p>
                {loadingActions ? (
                  <p className="text-[12px] text-ink-50">Loading actions...</p>
                ) : actions.length === 0 ? (
                  <p className="text-[12px] text-ink-50">No tool actions recorded for this call.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {actions.map((action) => (
                      <div key={action.id} className="rounded-xl bg-cream-50 border border-cream-200 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-ink-300">{action.action_name}</span>
                          <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${action.success ? 'bg-pastel-sage text-soft-sage' : 'bg-pastel-peach text-soft-peach'}`}>
                            {action.success ? 'success' : 'failed'}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-50 mt-1">
                          {formatDate(action.created_at)}
                          {typeof action.latency_ms === 'number' ? ` | ${action.latency_ms}ms` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-ink-50">
              <p className="text-[13px] inline-flex items-center gap-2"><PhoneOff className="w-4 h-4" /> Select a call to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceCalls;