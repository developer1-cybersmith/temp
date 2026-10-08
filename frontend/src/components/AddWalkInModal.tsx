import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Phone, Tag, Calendar, FileText,
  Mic, Square, Loader2, Sparkles, Check, RotateCcw, ChevronDown, Keyboard,
} from 'lucide-react';
import client from '../api/client';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface Props {
  onClose: () => void;
  onSaved: (customerId: string) => void;
}

/** Simple 3-button interest level (mapped to backend outcome enum). */
const INTEREST_OPTIONS = [
  { value: 'interested',     label: '🔥 Hot',  hint: 'Wants to buy soon' },
  { value: 'will_decide',    label: '🌡️ Warm', hint: 'Thinking about it' },
  { value: 'not_interested', label: '❄️ Cold', hint: 'Just looking' },
];

/** Extra outcomes shown only when user opens "More options". */
const EXTRA_OUTCOMES = [
  { value: 'purchased', label: '✅ Bought!' },
  { value: 'follow_up', label: '⏰ Will Follow Up' },
];

interface VoicePreview {
  transcript: string;
  customer_name?: string;
  customer_phone?: string;
  staff_name?: string;
  outcome?: string;
  notes?: string;
  items_mentioned?: string[];
  follow_up_hint?: string;
  quality: 'good' | 'unclear' | 'too_short' | 'low_confidence' | 'hallucination';
}

const MIN_RECORDING_MS = 1500;
type Mode = 'voice' | 'manual';

/** 8 vertical bars driven by recorder.level (0-100). Quick trust signal. */
const VolumeBars: React.FC<{ level: number }> = ({ level }) => (
  <div className="flex items-end gap-1 h-7">
    {Array.from({ length: 8 }).map((_, i) => {
      const threshold = (i + 1) * 11;
      const on = level >= threshold;
      const height = 10 + i * 2;
      const color = i < 5 ? 'bg-soft-sage' : i < 7 ? 'bg-soft-honey' : 'bg-soft-rose';
      return (
        <span
          key={i}
          className={`w-1.5 rounded-sm transition-colors ${on ? color : 'bg-cream-200'}`}
          style={{ height: `${height}px` }}
        />
      );
    })}
  </div>
);

const AddWalkInModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const [mode, setMode] = useState<Mode>('voice');
  const [showMore, setShowMore] = useState(false);

  // form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [staffName, setStaffName] = useState('');
  const [outcome, setOutcome] = useState('interested');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');

  // submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // voice state
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  const recorder = useAudioRecorder(30_000);

  const formatDuration = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    return `0:${s.toString().padStart(2, '0')}`;
  };

  const handleMicClick = async () => {
    setVoiceError(null);
    setPreview(null);
    if (recorder.status === 'idle') {
      await recorder.start();
    } else if (recorder.status === 'recording') {
      const recordedMs = recorder.durationMs;
      const blob = await recorder.stop();
      if (!blob) {
        setVoiceError(recorder.error || 'Recording failed. Please try again.');
        return;
      }
      if (recordedMs < MIN_RECORDING_MS) {
        setVoiceError('Too short — please hold and speak for at least 2 seconds.');
        return;
      }
      await sendForExtraction(blob);
    }
  };

  const sendForExtraction = async (blob: Blob) => {
    setExtracting(true);
    setVoiceError(null);
    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `walkin.${ext}`, { type: blob.type });
      const form = new FormData();
      form.append('file', file);

      const res = await client.post('/voice/extract-walkin', form);

      // DIAG: visible in browser DevTools
      console.log('[walkin] extraction response:', res.data);

      const { transcript, extracted, quality } = res.data;

      if (quality !== 'good') {
        const messages: Record<string, string> = {
          too_short:       "That was very short — please hold and speak for a few seconds.",
          unclear:         "Couldn't catch any clear info. Try again, closer to the phone.",
          low_confidence:  "Audio was unclear (background noise?). Try somewhere quieter.",
          hallucination:   "Couldn't hear you properly. Please try again.",
        };
        setVoiceError(messages[quality] || "Couldn't catch that. Try again.");
        setPreview({ transcript: transcript || '', quality });
        return;
      }

      setPreview({
        transcript,
        customer_name: extracted.customer_name,
        customer_phone: extracted.customer_phone,
        staff_name: extracted.staff_name,
        outcome: extracted.outcome,
        notes: extracted.notes,
        items_mentioned: extracted.items_mentioned,
        follow_up_hint: extracted.follow_up_hint,
        quality: 'good',
      });
      setPreviewName(extracted.customer_name || '');
    } catch (err: any) {
      console.error('Voice extraction failed', err);
      setVoiceError(err.response?.data?.error || 'Could not process voice. Try again.');
    } finally {
      setExtracting(false);
    }
  };

  const applyPreviewAndSave = async () => {
    if (!preview) return;
    const finalName = previewName.trim() || name;
    const finalPhone = preview.customer_phone || phone;
    const finalOutcome = preview.outcome || outcome;
    const finalStaff = preview.staff_name || staffName;
    if (!finalName && !finalPhone) {
      setVoiceError('I need at least a name or phone — try again or type below.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // manual_notes = raw voice transcript (always saved so voice data is never lost)
      // ai_summary   = GPT-generated 1-sentence summary (saved separately when available)
      const res = await client.post('/visits', {
        customer_name: finalName || undefined,
        customer_phone: finalPhone || undefined,
        staff_name: finalStaff || undefined,
        outcome: finalOutcome,
        items_shown: preview.items_mentioned?.length ? preview.items_mentioned : undefined,
        manual_notes: preview.transcript || undefined,
        ai_summary: preview.notes || undefined,
      });
      onSaved(res.data.visit.customer_id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
      setSaving(false);
    }
  };

  const editPreview = () => {
    if (!preview) return;
    if (preview.customer_name) setName(preview.customer_name);
    if (preview.customer_phone) setPhone(preview.customer_phone);
    if (preview.staff_name) setStaffName(preview.staff_name);
    if (preview.outcome) setOutcome(preview.outcome);
    const noteParts: string[] = [];
    if (preview.notes) noteParts.push(preview.notes);
    if (preview.items_mentioned?.length) noteParts.push(`Items: ${preview.items_mentioned.join(', ')}`);
    if (preview.follow_up_hint) noteParts.push(`Follow-up: ${preview.follow_up_hint}`);
    if (noteParts.length) setNotes(noteParts.join(' · '));
    setPreview(null);
    setMode('manual');
  };

  const discardPreview = () => {
    setPreview(null);
    setVoiceError(null);
  };

  const handleManualSubmit = async () => {
    if (!name && !phone) {
      setError('Please add a name or phone number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await client.post('/visits', {
        customer_name: name || undefined,
        customer_phone: phone || undefined,
        staff_name: staffName || undefined,
        outcome,
        manual_notes: notes || undefined,
        follow_up_at: followUp ? new Date(followUp).toISOString() : undefined,
      });
      onSaved(res.data.visit.customer_id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
      setSaving(false);
    }
  };

  const isRecording = recorder.status === 'recording';
  const isStopping  = recorder.status === 'stopping';
  const showPreview = preview !== null && preview.quality === 'good';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-cream-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-[18px] font-bold text-ink-400">New Walk-In</h2>
            <button onClick={onClose} className="text-ink-50 hover:text-ink-200 p-1 transition" aria-label="Close">
              <X size={20} />
            </button>
          </div>

          {/* ════════════════════════════════════════════════ */}
          {/* MODE: VOICE — big mic, dominant primary action  */}
          {/* ════════════════════════════════════════════════ */}
          {mode === 'voice' && !showPreview && (
            <div className="py-4">
              <div className="flex flex-col items-center gap-4">
                {/* Big mic button */}
                <button
                  onClick={handleMicClick}
                  disabled={extracting || isStopping}
                  className={`w-28 h-28 rounded-full flex items-center justify-center transition shadow-lg ${
                    isRecording
                      ? 'bg-soft-rose text-cream-50 animate-pulse'
                      : extracting
                      ? 'bg-cream-200 text-ink-50'
                      : 'bg-soft-lavender text-cream-50 hover:scale-105 active:scale-95'
                  }`}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                >
                  {extracting ? (
                    <Loader2 size={44} className="animate-spin" />
                  ) : isRecording ? (
                    <Square size={36} fill="currentColor" />
                  ) : (
                    <Mic size={48} />
                  )}
                </button>

                {/* Live volume bars + duration */}
                {isRecording && (
                  <div className="flex flex-col items-center gap-2">
                    <VolumeBars level={recorder.level} />
                    <div className="text-[12px] text-soft-rose font-mono font-semibold">
                      🔴 {formatDuration(recorder.durationMs)}
                    </div>
                  </div>
                )}

                {/* Status text */}
                <div className="text-center">
                  {extracting ? (
                    <>
                      <div className="text-[16px] text-ink-300 font-semibold">
                        Sun rahe hain...
                      </div>
                      <div className="text-[12px] text-ink-50 mt-1">
                        Processing what you said
                      </div>
                    </>
                  ) : isRecording ? (
                    <div className="text-[14px] text-ink-200 font-medium">
                      {recorder.level > 5
                        ? 'Speak now — tap red square when done'
                        : "Can't hear you — speak louder or check mic"}
                    </div>
                  ) : (
                    <>
                      <div className="text-[18px] text-ink-400 font-bold font-display">
                        Tap to Speak
                      </div>
                      <div className="text-[12px] text-ink-50 mt-1">
                        Hindi · Marathi · English — all work
                      </div>
                    </>
                  )}
                </div>

                {/* Example */}
                {!isRecording && !extracting && (
                  <div className="w-full bg-cream-100 rounded-xl p-3 border border-cream-200 mt-2">
                    <div className="text-[10px] uppercase tracking-wide text-ink-50 font-medium mb-1">
                      Example
                    </div>
                    <div className="text-[13px] text-ink-200 italic leading-relaxed">
                      "Rajesh Sharma 9876543210, Fortuner chahiye, Sunday tak decide karenge"
                    </div>
                  </div>
                )}

                {/* Failed states */}
                {voiceError && !isRecording && !extracting && (
                  <div className="w-full bg-pastel-honey/30 rounded-xl px-3 py-2.5 border border-soft-honey/20">
                    <div className="text-[12px] text-ink-300">{voiceError}</div>
                  </div>
                )}

                {recorder.error && (
                  <div className="text-[12px] text-soft-rose">
                    Mic error: {recorder.error}
                  </div>
                )}

                {/* Type instead — small escape hatch */}
                {!isRecording && !extracting && (
                  <button
                    onClick={() => { setMode('manual'); setVoiceError(null); }}
                    className="mt-2 text-[13px] text-ink-100 hover:text-ink-300 font-medium underline flex items-center gap-1.5 transition"
                  >
                    <Keyboard size={14} /> Type instead
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* PREVIEW: after successful extraction              */}
          {/* ════════════════════════════════════════════════ */}
          {showPreview && preview && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-2"
            >
              <div className="bg-pastel-sage/30 rounded-2xl p-4 border border-soft-sage/20 mb-3">
                <div className="text-[11px] uppercase tracking-wide font-medium text-soft-sage flex items-center gap-1 mb-3">
                  <Sparkles size={12} /> Here's what I heard
                </div>

                <div className="bg-cream-50 rounded-lg px-3 py-2 mb-3 border border-cream-200">
                  <div className="text-[13px] text-ink-300 italic leading-relaxed">
                    "{preview.transcript}"
                  </div>
                </div>

                {/* Editable name — always shown, pre-filled from voice if captured */}
                <div className="mb-3">
                  <label className={`text-[10px] uppercase tracking-wide font-medium block mb-1 ${previewName ? 'text-soft-sage' : 'text-soft-rose'}`}>
                    {previewName ? '✓ Customer\'s Name' : '⚠ Type customer name (not heard)'}
                  </label>
                  <input
                    value={previewName}
                    onChange={e => setPreviewName(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    autoFocus={!previewName}
                    className={`w-full border rounded-xl px-3 py-2.5 text-[14px] text-ink-300 font-semibold placeholder:text-ink-50 placeholder:font-normal outline-none focus:ring-2 transition ${
                      previewName
                        ? 'bg-cream-50 border-cream-200 focus:ring-soft-sage/30'
                        : 'bg-pastel-rose/20 border-soft-rose/40 focus:ring-soft-rose/30'
                    }`}
                  />
                </div>

                <ul className="space-y-1.5 text-[13px] text-ink-300">
                  {preview.customer_phone && (
                    <li className="flex gap-2"><Check size={14} className="text-soft-sage shrink-0 mt-0.5" /><div><span className="text-ink-100">Phone:</span> <span className="font-semibold">{preview.customer_phone}</span></div></li>
                  )}
                  {preview.items_mentioned && preview.items_mentioned.length > 0 && (
                    <li className="flex gap-2"><Check size={14} className="text-soft-sage shrink-0 mt-0.5" /><div><span className="text-ink-100">Wants:</span> <span className="font-semibold">{preview.items_mentioned.join(', ')}</span></div></li>
                  )}
                  {preview.outcome && (
                    <li className="flex gap-2"><Check size={14} className="text-soft-sage shrink-0 mt-0.5" /><div><span className="text-ink-100">Status:</span> <span className="font-semibold">{INTEREST_OPTIONS.find(o => o.value === preview.outcome)?.label || EXTRA_OUTCOMES.find(o => o.value === preview.outcome)?.label || preview.outcome}</span></div></li>
                  )}
                  {preview.follow_up_hint && (
                    <li className="flex gap-2"><Check size={14} className="text-soft-sage shrink-0 mt-0.5" /><div><span className="text-ink-100">When:</span> <span className="font-semibold">{preview.follow_up_hint}</span></div></li>
                  )}
                  {preview.notes && (
                    <li className="flex gap-2"><Check size={14} className="text-soft-sage shrink-0 mt-0.5" /><div><span className="text-ink-100">Note:</span> <span className="font-semibold">{preview.notes}</span></div></li>
                  )}
                </ul>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={discardPreview}
                  className="flex-1 py-3 rounded-full text-[13px] font-medium text-ink-200 bg-cream-100 border border-cream-200 hover:bg-cream-200 transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={14} /> Try Again
                </button>
                <button
                  onClick={applyPreviewAndSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-full text-[14px] font-bold bg-soft-sage text-cream-50 hover:opacity-90 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="text-center mt-3">
                <button
                  onClick={editPreview}
                  className="text-[12px] text-ink-100 hover:text-ink-300 underline transition"
                >
                  Edit details before saving
                </button>
              </div>

              {error && (
                <div className="mt-3 text-xs text-soft-rose bg-pastel-rose/30 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* MODE: MANUAL — simplified form                    */}
          {/* ════════════════════════════════════════════════ */}
          {mode === 'manual' && !showPreview && (
            <div>
              <button
                onClick={() => { setMode('voice'); setError(null); }}
                className="mb-4 text-[13px] text-soft-lavender hover:text-soft-lavender/80 font-medium flex items-center gap-1.5 transition"
              >
                <Mic size={14} /> Use voice instead (faster)
              </button>

              {/* Name */}
              <label className="block text-[12px] text-ink-200 mb-1 font-medium">
                Customer's Name
              </label>
              <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-3 border border-cream-200 mb-3">
                <User size={16} className="text-ink-50" />
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rajesh Sharma"
                  className="flex-1 bg-transparent outline-none text-[14px] text-ink-300 placeholder:text-ink-50"
                />
              </div>

              {/* Phone */}
              <label className="block text-[12px] text-ink-200 mb-1 font-medium">
                Phone Number
              </label>
              <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-3 border border-cream-200 mb-3">
                <Phone size={16} className="text-ink-50" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  inputMode="numeric"
                  className="flex-1 bg-transparent outline-none text-[14px] text-ink-300 placeholder:text-ink-50"
                />
              </div>

              {/* Interest level — 3 simple buttons */}
              <label className="block text-[12px] text-ink-200 mb-2 font-medium">
                How interested?
              </label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {INTEREST_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setOutcome(o.value)}
                    className={`text-[12px] py-3 rounded-xl font-medium border transition ${
                      outcome === o.value
                        ? 'bg-ink-300 text-cream-50 border-ink-300'
                        : 'bg-cream-50 text-ink-200 border-cream-200 hover:bg-cream-100'
                    }`}
                    title={o.hint}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <label className="block text-[12px] text-ink-200 mb-1 font-medium">
                Notes <span className="text-ink-50 font-normal">(optional)</span>
              </label>
              <div className="flex items-start gap-2 bg-cream-100 rounded-xl px-3 py-2.5 border border-cream-200 mb-3">
                <FileText size={16} className="text-ink-50 mt-0.5" />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did they want?"
                  rows={2}
                  className="flex-1 bg-transparent outline-none text-[14px] resize-none text-ink-300 placeholder:text-ink-50"
                />
              </div>

              {/* Add more (collapsible) */}
              <button
                onClick={() => setShowMore(!showMore)}
                className="text-[12px] text-ink-100 hover:text-ink-300 font-medium flex items-center gap-1 mb-2 transition"
              >
                <ChevronDown size={14} className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />
                {showMore ? 'Hide extra options' : 'Add more details'}
              </button>

              {showMore && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="overflow-hidden"
                >
                  {/* Extra outcomes */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {EXTRA_OUTCOMES.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => setOutcome(o.value)}
                        className={`text-[12px] py-2 rounded-xl font-medium border transition ${
                          outcome === o.value
                            ? 'bg-ink-300 text-cream-50 border-ink-300'
                            : 'bg-cream-50 text-ink-200 border-cream-200'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  <label className="block text-[12px] text-ink-200 mb-1 font-medium">
                    Handled By
                  </label>
                  <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2.5 border border-cream-200 mb-3">
                    <Tag size={16} className="text-ink-50" />
                    <input
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      placeholder="Sales rep name"
                      className="flex-1 bg-transparent outline-none text-[14px] text-ink-300 placeholder:text-ink-50"
                    />
                  </div>

                  <label className="block text-[12px] text-ink-200 mb-1 font-medium">
                    Follow-Up Date
                  </label>
                  <div className="flex items-center gap-2 bg-cream-100 rounded-xl px-3 py-2.5 border border-cream-200 mb-3">
                    <Calendar size={16} className="text-ink-50" />
                    <input
                      type="datetime-local"
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-[14px] text-ink-300"
                    />
                  </div>
                </motion.div>
              )}

              {error && (
                <div className="mt-2 text-xs text-soft-rose bg-pastel-rose/30 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-full text-[14px] font-medium text-ink-100 border border-cream-200 hover:bg-cream-100 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualSubmit}
                  disabled={saving}
                  className="flex-1 py-3 rounded-full text-[14px] font-bold bg-soft-sage text-cream-50 disabled:opacity-50 hover:opacity-90 transition"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddWalkInModal;
