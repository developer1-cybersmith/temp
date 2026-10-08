import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageCircle, Footprints, Clock,
  Pencil, X, Check, Trash2, Plus, FileText, Tag, Mic, Square, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../api/client';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface Customer {
  id: string;
  full_name: string | null;
  primary_phone: string | null;
  alt_phone: string | null;
  email: string | null;
  first_seen_via: string;
  last_activity_at: string;
  hotness: 'hot' | 'warm' | 'cold';
  status: string;
  tags: string[] | null;
  internal_notes: string | null;
  predicted_close_days: number | null;
}

interface Visit {
  id: string;
  visited_at: string;
  staff_name: string | null;
  outcome: string;
  manual_notes: string | null;   // raw voice transcript
  ai_summary: string | null;     // GPT-generated 1-sentence summary
  follow_up_at: string | null;
  trial_taken: boolean;
  quoted_amount: number | null;
  items_shown: string[] | null;
}

interface Conversation {
  id: string;
  customer_jid: string;
  last_message_at: string;
  summary: string | null;
}

interface Lead {
  score: string;
  stage: string;
  intent: string;
  summary: string;
  notes: string;
}

const HOTNESS: Record<string, { emoji: string; label: string; pill: string }> = {
  hot:  { emoji: '🔥', label: 'Hot',  pill: 'bg-pastel-rose text-rose-600' },
  warm: { emoji: '🌡️', label: 'Warm', pill: 'bg-pastel-honey text-amber-600' },
  cold: { emoji: '❄️', label: 'Cold', pill: 'bg-pastel-sky text-blue-500' },
};

// Values match what's stored in the customers.hotness column
const HOTNESS_OPTIONS = [
  { value: 'hot' as const,  label: '🔥 Hot',  hint: 'Wants to buy soon' },
  { value: 'warm' as const, label: '🌡️ Warm', hint: 'Thinking about it' },
  { value: 'cold' as const, label: '❄️ Cold', hint: 'Just looking' },
];

const MIN_RECORDING_MS = 1500;

const VolumeBars: React.FC<{ level: number }> = ({ level }) => (
  <div className="flex items-end gap-0.5 h-5">
    {Array.from({ length: 6 }).map((_, i) => {
      const on = level >= (i + 1) * 14;
      const ht = 6 + i * 2;
      const col = i < 4 ? 'bg-soft-sage' : i < 5 ? 'bg-soft-honey' : 'bg-soft-rose';
      return <span key={i} className={`w-1.5 rounded-sm transition-colors ${on ? col : 'bg-cream-200'}`} style={{ height: `${ht}px` }} />;
    })}
  </div>
);

const OUTCOME_OPTIONS = [
  { value: 'interested',     label: '👀 Interested' },
  { value: 'will_decide',    label: '🤔 Will Decide' },
  { value: 'purchased',      label: '✅ Purchased' },
  { value: 'not_interested', label: '❌ Not Interested' },
  { value: 'follow_up',      label: '⏰ Follow-Up' },
];

const OUTCOME_LABELS: Record<string, string> = Object.fromEntries(
  OUTCOME_OPTIONS.map(o => [o.value, o.label]),
);

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Bottom sheet wrapper ───────────────────────────────────────────────────
const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({
  open, onClose, title, children,
}) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-cream-50 rounded-t-3xl px-5 pt-5 pb-10 max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-[17px] font-bold text-ink-400">{title}</h3>
            <button onClick={onClose} className="p-1 text-ink-100 hover:text-ink-300 transition">
              <X size={20} />
            </button>
          </div>
          {children}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit sheet
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editHotness, setEditHotness] = useState<'hot' | 'warm' | 'cold'>('cold');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add visit sheet
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitOutcome, setVisitOutcome] = useState('interested');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitItems, setVisitItems] = useState('');
  const [visitStaff, setVisitStaff] = useState('');
  const [visitSaving, setVisitSaving] = useState(false);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitTranscript, setVisitTranscript] = useState('');
  const [visitAiSummary, setVisitAiSummary] = useState('');
  const [visitExtracting, setVisitExtracting] = useState(false);
  const [visitVoiceError, setVisitVoiceError] = useState<string | null>(null);
  const visitRecorder = useAudioRecorder(30_000);

  useEffect(() => {
    if (id) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/customers/${id}`);
      setCustomer(res.data.customer);
      setVisits(res.data.visits || []);
      setConversation(res.data.conversation || null);
      setLead(res.data.lead || null);
    } catch (err) {
      console.error('Failed to fetch customer', err);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = () => {
    if (!customer) return;
    setEditName(customer.full_name || '');
    setEditPhone(customer.primary_phone || '');
    setEditHotness(customer.hotness || 'cold');
    setEditNotes(customer.internal_notes || '');
    setEditError(null);
    setDeleteConfirm(false);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!customer) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await client.patch(`/customers/${customer.id}`, {
        full_name: editName.trim() || null,
        primary_phone: editPhone.replace(/\D/g, '') || null,
        hotness: editHotness,
        internal_notes: editNotes.trim() || null,
      });
      setCustomer(res.data.customer);
      setEditOpen(false);
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Failed to save. Try again.');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteCustomer = async () => {
    if (!customer) return;
    setDeleting(true);
    try {
      await client.delete(`/customers/${customer.id}`);
      navigate('/customers', { replace: true });
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Failed to delete.');
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const openAddVisit = () => {
    setVisitOutcome('interested');
    setVisitNotes('');
    setVisitItems('');
    setVisitStaff('');
    setVisitError(null);
    setVisitTranscript('');
    setVisitAiSummary('');
    setVisitVoiceError(null);
    setVisitOpen(true);
  };

  const handleVisitMicClick = async () => {
    setVisitVoiceError(null);
    if (visitRecorder.status === 'idle') {
      await visitRecorder.start();
    } else if (visitRecorder.status === 'recording') {
      const recordedMs = visitRecorder.durationMs;
      const blob = await visitRecorder.stop();
      if (!blob) {
        setVisitVoiceError(visitRecorder.error || 'Recording failed. Try again.');
        return;
      }
      if (recordedMs < MIN_RECORDING_MS) {
        setVisitVoiceError('Too short — hold and speak for at least 2 seconds.');
        return;
      }
      await sendForVisitExtraction(blob);
    }
  };

  const sendForVisitExtraction = async (blob: Blob) => {
    setVisitExtracting(true);
    setVisitVoiceError(null);
    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `visit.${ext}`, { type: blob.type });
      const form = new FormData();
      form.append('file', file);
      const res = await client.post('/voice/extract-walkin', form);
      const { transcript, extracted, quality } = res.data;

      if (quality !== 'good') {
        const msgs: Record<string, string> = {
          too_short: 'Too short — speak for a few seconds.',
          unclear: "Couldn't catch that. Try again, closer to the phone.",
          low_confidence: 'Audio unclear. Try somewhere quieter.',
          hallucination: "Couldn't hear properly. Please try again.",
        };
        setVisitVoiceError(msgs[quality] || "Couldn't catch that. Try again.");
        return;
      }

      setVisitTranscript(transcript || '');
      if (extracted.notes) { setVisitNotes(extracted.notes); setVisitAiSummary(extracted.notes); }
      if (extracted.items_mentioned?.length) setVisitItems(extracted.items_mentioned.join(', '));
      if (extracted.outcome) setVisitOutcome(extracted.outcome);
      if (extracted.staff_name) setVisitStaff(extracted.staff_name);
    } catch (err: any) {
      setVisitVoiceError(err.response?.data?.error || 'Could not process voice. Try again.');
    } finally {
      setVisitExtracting(false);
    }
  };

  const saveNewVisit = async () => {
    if (!customer) return;
    setVisitSaving(true);
    setVisitError(null);
    try {
      const itemsArray = visitItems.split(',').map(s => s.trim()).filter(Boolean);
      await client.post('/visits', {
        customer_id: customer.id,
        outcome: visitOutcome,
        manual_notes: visitTranscript || visitNotes.trim() || undefined,
        ai_summary: visitAiSummary || undefined,
        items_shown: itemsArray.length ? itemsArray : undefined,
        staff_name: visitStaff.trim() || undefined,
      });
      setVisitOpen(false);
      await fetchData(); // refresh visit list
    } catch (err: any) {
      setVisitError(err.response?.data?.error || 'Failed to save. Try again.');
    } finally {
      setVisitSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-soft-lavender/30 border-t-soft-lavender rounded-full animate-spin" />
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center text-ink-100 text-[13px]">
        Customer not found.
      </div>
    );
  }

  const h = HOTNESS[customer.hotness] || HOTNESS.cold;
  const displayName = customer.full_name || customer.primary_phone || 'Walk-in Customer';
  const phoneForCall = customer.primary_phone?.replace(/\D/g, '');

  return (
    <div className="min-h-screen bg-cream-50 pb-28">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-cream-50/95 backdrop-blur-sm border-b border-cream-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 text-ink-300 hover:text-ink-400 transition">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-display text-[17px] font-bold text-ink-400 truncate">{displayName}</div>
            {customer.full_name && customer.primary_phone && (
              <div className="text-[11px] text-ink-100">{customer.primary_phone}</div>
            )}
            {!customer.full_name && (
              <div className="text-[10px] text-ink-50 italic">No name saved — tap Edit to add</div>
            )}
          </div>
          <button
            onClick={openEdit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-cream-100 border border-cream-200 text-ink-200 text-[12px] font-medium hover:bg-cream-200 transition"
          >
            <Pencil size={12} /> Edit
          </button>
        </div>
      </div>

      {/* ── Quick actions ── */}
      {phoneForCall && (
        <div className="px-4 pt-4 flex gap-2">
          <a
            href={`tel:${phoneForCall}`}
            className="flex-1 py-2.5 rounded-full bg-cream-50 text-ink-300 text-sm font-medium border border-cream-200 flex items-center justify-center gap-1.5 hover:bg-cream-100 transition"
          >
            <Phone size={14} /> Call
          </a>
          <a
            href={`https://wa.me/91${phoneForCall}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-2.5 rounded-full bg-soft-sage text-cream-50 text-sm font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition"
          >
            <MessageCircle size={14} /> WhatsApp
          </a>
        </div>
      )}

      {/* ── Profile card ── */}
      <div className="px-4 pt-4">
        <div className="bg-cream-50 rounded-2xl p-4 shadow-sm border border-cream-200">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-[12px] font-semibold px-3 py-1 rounded-full ${h.pill}`}>
              {h.emoji} {h.label}
            </span>
            <span className="text-[12px] text-ink-100 capitalize">{customer.status || 'new'}</span>
            {customer.first_seen_via && (
              <span className="text-[11px] text-ink-50 ml-auto">
                {customer.first_seen_via === 'walk_in' ? '🚪 Walk-in' :
                 customer.first_seen_via === 'whatsapp' ? '💬 WhatsApp' : '📞 Phone'}
              </span>
            )}
          </div>

          {/* Items / tags */}
          {customer.tags && customer.tags.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-ink-50 font-medium mb-1.5">Interested In</div>
              <div className="flex flex-wrap gap-1.5">
                {customer.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-pastel-lavender/40 text-soft-lavender rounded-full text-[11px] font-medium border border-soft-lavender/20">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {customer.internal_notes && (
            <div className="mt-3 pt-3 border-t border-cream-200">
              <div className="text-[10px] uppercase tracking-wide text-ink-50 font-medium mb-1">Notes</div>
              <div className="text-[13px] text-ink-300 whitespace-pre-wrap leading-relaxed">{customer.internal_notes}</div>
            </div>
          )}

          {/* AI lead summary */}
          {lead?.summary && (
            <div className="mt-3 pt-3 border-t border-cream-200">
              <div className="text-[10px] uppercase tracking-wide text-soft-lavender font-medium mb-1">✨ AI Summary</div>
              <div className="text-[13px] text-ink-300 whitespace-pre-wrap leading-relaxed">{lead.summary}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Visit History ── */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-50 font-medium">
            Visit History ({visits.length + (conversation ? 1 : 0)})
          </div>
          <button
            onClick={openAddVisit}
            className="flex items-center gap-1 text-[12px] font-semibold text-soft-sage hover:opacity-80 transition"
          >
            <Plus size={14} /> Log Visit
          </button>
        </div>

        {visits.map((v, i) => (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="bg-cream-50 rounded-2xl p-4 mb-2 border border-cream-200"
          >
            {/* Visit header */}
            <div className="flex items-center justify-between text-[11px] text-ink-50 mb-2">
              <div className="flex items-center gap-1.5">
                <Footprints size={11} className="text-soft-lavender" />
                <span>{formatDateTime(v.visited_at)}</span>
              </div>
              {v.staff_name && <span>👤 {v.staff_name}</span>}
            </div>

            {/* Outcome */}
            <div className="text-[13px] font-semibold text-ink-300 mb-2">
              {OUTCOME_LABELS[v.outcome] || v.outcome}
            </div>

            {/* Items they were shown */}
            {v.items_shown && v.items_shown.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {v.items_shown.map(item => (
                  <span key={item} className="px-2 py-0.5 bg-cream-200 text-ink-200 rounded text-[11px] font-medium">
                    {item}
                  </span>
                ))}
              </div>
            )}

            {/* AI summary (GPT 1-sentence extract) */}
            {v.ai_summary && (
              <div className="text-[12px] text-soft-lavender bg-pastel-lavender/30 rounded-xl px-3 py-2 mb-1 border border-soft-lavender/20 leading-relaxed">
                ✨ {v.ai_summary}
              </div>
            )}

            {/* Voice transcript (what was actually spoken) */}
            {v.manual_notes && (
              <div className="text-[12px] text-ink-200 italic bg-cream-100 rounded-xl px-3 py-2 leading-relaxed">
                🎤 &ldquo;{v.manual_notes}&rdquo;
              </div>
            )}

            {v.trial_taken && (
              <div className="text-[11px] text-soft-sage mt-2">✓ Trial / Demo taken</div>
            )}
            {v.quoted_amount != null && (
              <div className="text-[11px] text-soft-honey mt-1">
                💰 Quoted ₹{Number(v.quoted_amount).toLocaleString('en-IN')}
              </div>
            )}
            {v.follow_up_at && (
              <div className="text-[11px] text-ink-50 mt-2 flex items-center gap-1">
                <Clock size={11} /> Follow-up: {formatDateTime(v.follow_up_at)}
              </div>
            )}
          </motion.div>
        ))}

        {conversation && (
          <motion.button
            onClick={() => navigate('/conversations')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full text-left bg-cream-50 rounded-2xl p-4 mb-2 border border-cream-200 hover:bg-cream-100 transition"
          >
            <div className="flex items-center gap-1.5 text-[11px] text-ink-50 mb-1">
              <MessageCircle size={11} className="text-soft-sage" />
              <span>WhatsApp · {formatDateTime(conversation.last_message_at)}</span>
            </div>
            {conversation.summary && (
              <div className="text-[13px] text-ink-300 mt-1 line-clamp-2">{conversation.summary}</div>
            )}
            <div className="text-[11px] text-soft-sage mt-2">View full chat →</div>
          </motion.button>
        )}

        {visits.length === 0 && !conversation && (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-ink-100 text-[13px] mb-3">No visit history yet.</div>
            <button
              onClick={openAddVisit}
              className="text-soft-sage font-semibold text-[13px] underline"
            >
              Log first visit
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* Edit Customer Sheet                           */}
      {/* ══════════════════════════════════════════════ */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer">
        {/* Name */}
        <label className="block text-[12px] text-ink-200 mb-1 font-medium">Customer's Name</label>
        <input
          autoFocus
          value={editName}
          onChange={e => setEditName(e.target.value)}
          placeholder="e.g. Rajesh Sharma"
          className="w-full bg-cream-100 border border-cream-200 rounded-xl px-3 py-3 text-[14px] text-ink-300 placeholder:text-ink-50 outline-none focus:ring-2 focus:ring-soft-lavender/30 mb-3"
        />

        {/* Phone */}
        <label className="block text-[12px] text-ink-200 mb-1 font-medium">Phone Number</label>
        <input
          value={editPhone}
          onChange={e => setEditPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="9876543210"
          inputMode="numeric"
          className="w-full bg-cream-100 border border-cream-200 rounded-xl px-3 py-3 text-[14px] text-ink-300 placeholder:text-ink-50 outline-none focus:ring-2 focus:ring-soft-lavender/30 mb-3"
        />

        {/* Interest level — values must be 'hot'/'warm'/'cold' to match DB */}
        <label className="block text-[12px] text-ink-200 mb-2 font-medium">How interested?</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {HOTNESS_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setEditHotness(o.value)}
              title={o.hint}
              className={`text-[12px] py-3 rounded-xl font-medium border transition ${
                editHotness === o.value
                  ? 'bg-ink-300 text-cream-50 border-ink-300'
                  : 'bg-cream-50 text-ink-200 border-cream-200 hover:bg-cream-100'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Internal notes */}
        <label className="block text-[12px] text-ink-200 mb-1 font-medium">Notes</label>
        <textarea
          value={editNotes}
          onChange={e => setEditNotes(e.target.value)}
          placeholder="Extra info about this customer…"
          rows={3}
          className="w-full bg-cream-100 border border-cream-200 rounded-xl px-3 py-2.5 text-[14px] text-ink-300 placeholder:text-ink-50 outline-none focus:ring-2 focus:ring-soft-lavender/30 resize-none mb-4"
        />

        {editError && (
          <div className="mb-3 text-xs text-soft-rose bg-pastel-rose/30 px-3 py-2 rounded-lg">{editError}</div>
        )}

        <button
          onClick={saveEdit}
          disabled={editSaving}
          className="w-full py-3.5 rounded-full bg-soft-sage text-cream-50 font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition mb-3"
        >
          {editSaving
            ? <div className="w-4 h-4 border-2 border-cream-50/30 border-t-cream-50 rounded-full animate-spin" />
            : <Check size={16} />}
          {editSaving ? 'Saving…' : 'Save Changes'}
        </button>

        {/* Delete — requires tap-to-confirm */}
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="w-full py-3 rounded-full text-[13px] font-medium text-soft-rose border border-soft-rose/30 hover:bg-pastel-rose/30 transition flex items-center justify-center gap-1.5"
          >
            <Trash2 size={14} /> Delete Customer
          </button>
        ) : (
          <div className="bg-pastel-rose/30 rounded-2xl p-4 border border-soft-rose/20">
            <div className="text-[13px] text-ink-300 font-medium mb-3">
              Delete <span className="font-bold">{displayName}</span>? This cannot be undone.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-full border border-cream-200 text-ink-200 text-[13px] font-medium hover:bg-cream-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={deleteCustomer}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full bg-soft-rose text-cream-50 text-[13px] font-bold hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
              >
                {deleting
                  ? <div className="w-3.5 h-3.5 border-2 border-cream-50/30 border-t-cream-50 rounded-full animate-spin" />
                  : <Trash2 size={13} />}
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* ══════════════════════════════════════════════ */}
      {/* Log New Visit Sheet                           */}
      {/* ══════════════════════════════════════════════ */}
      <Sheet open={visitOpen} onClose={() => setVisitOpen(false)} title="Log Visit">
        {/* ── Voice recorder strip ── */}
        <div className="mb-4">
          {visitTranscript ? (
            <div className="bg-pastel-sage/30 rounded-2xl px-3 py-2.5 border border-soft-sage/20 mb-2">
              <div className="text-[10px] uppercase tracking-wide text-soft-sage font-medium mb-1">🎤 Heard</div>
              <div className="text-[12px] text-ink-300 italic leading-relaxed">"{visitTranscript}"</div>
              <button
                onClick={() => { setVisitTranscript(''); setVisitAiSummary(''); setVisitVoiceError(null); }}
                className="mt-1.5 text-[11px] text-ink-50 hover:text-ink-200 underline transition"
              >
                Re-record
              </button>
            </div>
          ) : (
            <button
              onClick={handleVisitMicClick}
              disabled={visitExtracting || visitRecorder.status === 'stopping'}
              className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl font-semibold text-[13px] transition border ${
                visitRecorder.status === 'recording'
                  ? 'bg-soft-rose/10 border-soft-rose text-soft-rose animate-pulse'
                  : visitExtracting
                  ? 'bg-cream-100 border-cream-200 text-ink-50'
                  : 'bg-cream-100 border-cream-200 text-ink-200 hover:bg-pastel-lavender/30 hover:border-soft-lavender'
              }`}
            >
              {visitExtracting ? (
                <><Loader2 size={16} className="animate-spin" /> Processing…</>
              ) : visitRecorder.status === 'recording' ? (
                <><VolumeBars level={visitRecorder.level} /><Square size={14} fill="currentColor" /> Tap to stop</>
              ) : (
                <><Mic size={16} /> Speak about this visit</>
              )}
            </button>
          )}
          {visitVoiceError && (
            <div className="text-[11px] text-soft-rose bg-pastel-rose/20 rounded-xl px-3 py-2 mt-1.5 border border-soft-rose/20">
              {visitVoiceError}
            </div>
          )}
        </div>

        {/* Outcome */}
        <label className="block text-[12px] text-ink-200 mb-2 font-medium">What happened?</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {OUTCOME_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setVisitOutcome(o.value)}
              className={`text-[12px] py-2.5 rounded-xl font-medium border transition ${
                visitOutcome === o.value
                  ? 'bg-ink-300 text-cream-50 border-ink-300'
                  : 'bg-cream-50 text-ink-200 border-cream-200 hover:bg-cream-100'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Items */}
        <label className="block text-[12px] text-ink-200 mb-1 font-medium">
          Items Shown <span className="text-ink-50 font-normal">(comma separated)</span>
        </label>
        <div className="flex items-center gap-2 bg-cream-100 border border-cream-200 rounded-xl px-3 py-2.5 mb-3">
          <Tag size={14} className="text-ink-50 shrink-0" />
          <input
            value={visitItems}
            onChange={e => setVisitItems(e.target.value)}
            placeholder="e.g. Fortuner, Thar"
            className="flex-1 bg-transparent outline-none text-[14px] text-ink-300 placeholder:text-ink-50"
          />
        </div>

        {/* Notes */}
        <label className="block text-[12px] text-ink-200 mb-1 font-medium">
          Notes <span className="text-ink-50 font-normal">(optional)</span>
        </label>
        <div className="flex items-start gap-2 bg-cream-100 border border-cream-200 rounded-xl px-3 py-2.5 mb-3">
          <FileText size={14} className="text-ink-50 shrink-0 mt-0.5" />
          <textarea
            value={visitNotes}
            onChange={e => setVisitNotes(e.target.value)}
            placeholder="What did they say?"
            rows={2}
            className="flex-1 bg-transparent outline-none text-[14px] text-ink-300 placeholder:text-ink-50 resize-none"
          />
        </div>

        {/* Staff */}
        <label className="block text-[12px] text-ink-200 mb-1 font-medium">
          Handled By <span className="text-ink-50 font-normal">(optional)</span>
        </label>
        <input
          value={visitStaff}
          onChange={e => setVisitStaff(e.target.value)}
          placeholder="Sales rep name"
          className="w-full bg-cream-100 border border-cream-200 rounded-xl px-3 py-2.5 text-[14px] text-ink-300 placeholder:text-ink-50 outline-none focus:ring-2 focus:ring-soft-lavender/30 mb-4"
        />

        {visitError && (
          <div className="mb-3 text-xs text-soft-rose bg-pastel-rose/30 px-3 py-2 rounded-lg">{visitError}</div>
        )}

        <button
          onClick={saveNewVisit}
          disabled={visitSaving}
          className="w-full py-3.5 rounded-full bg-soft-sage text-cream-50 font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {visitSaving
            ? <div className="w-4 h-4 border-2 border-cream-50/30 border-t-cream-50 rounded-full animate-spin" />
            : <Check size={16} />}
          {visitSaving ? 'Saving…' : 'Save Visit'}
        </button>
      </Sheet>
    </div>
  );
};

export default CustomerDetail;
