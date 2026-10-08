import React, { useState, useEffect } from 'react';
import client from '../api/client';
import {
  Search,
  ArrowRight,
  ArrowLeft,
  Star,
  Phone,
  XCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useIsMobile } from '../hooks/useMediaQuery';

const STAGES = ['new', 'interested', 'quoted', 'negotiating', 'closed'];

const STAGE_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  new:          { bg: 'bg-pastel-sky',      text: 'text-soft-sky',      accent: 'border-soft-sky/30' },
  interested:   { bg: 'bg-pastel-lavender',  text: 'text-soft-lavender',  accent: 'border-soft-lavender/30' },
  quoted:       { bg: 'bg-pastel-honey',     text: 'text-soft-honey',     accent: 'border-soft-honey/30' },
  negotiating:  { bg: 'bg-pastel-peach',     text: 'text-soft-peach',     accent: 'border-soft-peach/30' },
  closed:       { bg: 'bg-pastel-sage',      text: 'text-soft-sage',      accent: 'border-soft-sage/30' },
};

const SCORE_COLORS: Record<string, string> = {
  high:   'bg-pastel-rose text-soft-rose',
  medium: 'bg-pastel-honey text-soft-honey',
  low:    'bg-pastel-sky text-soft-sky',
};

const Leads: React.FC = () => {
  const isMobile = useIsMobile();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [mobileFilter, setMobileFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await client.get('/leads');
      setLeads(res.data.leads || []);
    } catch (err) {
      console.error('Failed to fetch leads', err);
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const updateLeadStage = async (leadId: string, newStage: string) => {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));
    try {
      await client.patch(`/leads/${leadId}`, { stage: newStage });
    } catch (err) {
      console.error('Failed to update stage', err);
      setError('Failed to update lead stage');
      fetchLeads(); // Revert on error
    }
  };

  // Auto-dismiss error toast
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLead(leadId);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) {
      updateLeadStage(leadId, targetStage);
    }
    setDraggedLead(null);
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDraggedLead(null);
    setDragOverStage(null);
  };

  // Normalize lead stage — if the backend stage doesn't match our stages, default to 'new'
  const normalizeStage = (stage: string | null | undefined): string => {
    if (stage && STAGES.includes(stage)) return stage;
    return 'new';
  };

  // Filter leads by search
  const filteredLeads = (search
    ? leads.filter(l =>
        l.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.summary?.toLowerCase().includes(search.toLowerCase())
      )
    : leads
  ).map(l => ({ ...l, stage: normalizeStage(l.stage) }));

  // Mobile: further filter by stage
  const mobileLeads = mobileFilter
    ? filteredLeads.filter(l => l.stage === mobileFilter)
    : filteredLeads;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 border-4 border-cream-300 border-t-soft-lavender rounded-full animate-spin" />
        <p className="text-[13px] text-ink-50">Loading leads...</p>
      </div>
    );
  }

  /* ── Lead Card (shared between desktop and mobile) ── */
  const renderLeadCard = (lead: any, stage: string, options?: { draggable?: boolean }) => {
    const stageIdx = STAGES.indexOf(stage);
    const colors = STAGE_COLORS[stage];
    const scoreClass = SCORE_COLORS[lead.score] || SCORE_COLORS.low;
    const isDragged = draggedLead === lead.id;

    return (
      <div
        key={lead.id}
        draggable={options?.draggable}
        onDragStart={options?.draggable ? (e) => handleDragStart(e, lead.id) : undefined}
        onDragEnd={options?.draggable ? handleDragEnd : undefined}
        className={`bg-cream-50 rounded-[16px] p-3.5 transition-colors ${
          options?.draggable ? 'cursor-grab active:cursor-grabbing hover:bg-cream-100' : ''
        } ${isDragged ? 'opacity-40' : ''}`}
      >
        {/* Score + star */}
        <div className="flex justify-between items-center mb-2.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${scoreClass}`}>
            {lead.score || 'new'}
          </span>
          {lead.score === 'high' && <Star className="w-3.5 h-3.5 text-soft-honey fill-soft-honey" />}
        </div>

        {/* Name */}
        <h4 className="text-[14px] font-semibold text-ink-300 mb-0.5">
          {lead.customer_name || 'Unknown'}
        </h4>

        {/* Summary */}
        <p className="text-[12px] text-ink-50 line-clamp-2 mb-2.5 min-h-[2rem]">
          {lead.summary || 'New lead -- no summary yet.'}
        </p>

        {/* Phone */}
        {lead.wb_conversations?.customer_phone && (
          <p className="text-[11px] text-ink-50 flex items-center gap-1 mb-2.5">
            <Phone className="w-3 h-3" />
            {lead.wb_conversations.customer_phone}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2.5 border-t border-cream-200">
          <button
            onClick={() => stageIdx > 0 && updateLeadStage(lead.id, STAGES[stageIdx - 1])}
            disabled={stageIdx === 0}
            className="p-1.5 rounded-lg hover:bg-cream-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title={stageIdx > 0 ? `Move to ${STAGES[stageIdx - 1]}` : ''}
          >
            <ArrowLeft className="w-4 h-4 text-ink-100" />
          </button>

          <span className={`text-[9px] uppercase tracking-widest font-semibold ${colors.text}`}>
            {stage}
          </span>

          <button
            onClick={() => stageIdx < STAGES.length - 1 && updateLeadStage(lead.id, STAGES[stageIdx + 1])}
            disabled={stageIdx === STAGES.length - 1}
            className="p-1.5 rounded-lg hover:bg-cream-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title={stageIdx < STAGES.length - 1 ? `Move to ${STAGES[stageIdx + 1]}` : ''}
          >
            <ArrowRight className="w-4 h-4 text-ink-100" />
          </button>
        </div>
      </div>
    );
  };

  /* ── Page ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col h-full max-w-[1600px] mx-auto"
    >
      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-2 lg:px-8 lg:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[22px] font-bold text-ink-400">Leads</h1>
            <span className="bg-pastel-lavender text-soft-lavender text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              {filteredLeads.length}
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-50" />
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-cream-200/60 rounded-2xl h-11 pl-10 pr-9 text-[13px] text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30 w-full sm:w-64 transition-shadow"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <XCircle className="w-4 h-4 text-ink-50 hover:text-ink-200 transition-colors" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop View ── */}
      {!isMobile && (
        <>
          {/* Stage Summary Bar */}
          <div className="px-5 lg:px-8 pb-3">
            <div className="flex gap-3">
              {STAGES.map(stage => {
                const count = filteredLeads.filter(l => l.stage === stage).length;
                const colors = STAGE_COLORS[stage];
                return (
                  <div key={stage} className={`flex-1 ${colors.bg} rounded-2xl px-4 py-2.5 text-center`}>
                    <p className={`text-xl font-bold ${colors.text}`}>{count}</p>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-ink-50">{stage}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kanban Board */}
          <div className="flex gap-3 overflow-x-auto px-5 lg:px-8 pb-8 flex-1">
            {STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter(l => l.stage === stage);
              const isDropTarget = dragOverStage === stage;
              const colors = STAGE_COLORS[stage];

              return (
                <div
                  key={stage}
                  className={`min-w-[260px] max-w-[280px] flex flex-col rounded-[20px] border-2 transition-colors ${
                    isDropTarget
                      ? `border-dashed ${colors.accent} bg-cream-100/80`
                      : 'border-transparent bg-cream-100/60'
                  }`}
                  onDragOver={(e) => handleDragOver(e, stage)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage)}
                >
                  {/* Column header */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[11px] uppercase tracking-widest font-bold text-ink-50">{stage}</h3>
                      <span className={`${colors.bg} ${colors.text} px-2 py-0.5 rounded-full text-[10px] font-bold`}>
                        {stageLeads.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 px-2.5 pb-2.5 space-y-2.5 overflow-y-auto max-h-[60vh]">
                    {stageLeads.map((lead) => renderLeadCard(lead, stage, { draggable: true }))}

                    {stageLeads.length === 0 && (
                      <div className={`h-24 flex items-center justify-center rounded-xl border border-dashed transition-colors ${
                        isDropTarget
                          ? `${colors.accent} ${colors.text}`
                          : 'border-cream-300 text-ink-50/40'
                      }`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest">
                          {isDropTarget ? 'Drop here' : 'Empty'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Mobile View ── */}
      {isMobile && (
        <div className="flex-1 flex flex-col px-4 pb-6">
          {/* Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
            <button
              onClick={() => setMobileFilter(null)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                mobileFilter === null
                  ? 'bg-pastel-lavender text-soft-lavender'
                  : 'bg-cream-200 text-ink-50'
              }`}
            >
              All ({filteredLeads.length})
            </button>
            {STAGES.map(stage => {
              const count = filteredLeads.filter(l => l.stage === stage).length;
              const colors = STAGE_COLORS[stage];
              const isActive = mobileFilter === stage;
              return (
                <button
                  key={stage}
                  onClick={() => setMobileFilter(stage)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold capitalize transition-colors ${
                    isActive
                      ? `${colors.bg} ${colors.text}`
                      : 'bg-cream-200 text-ink-50'
                  }`}
                >
                  {stage} ({count})
                </button>
              );
            })}
          </div>

          {/* Lead Cards List */}
          <div className="flex-1 space-y-2.5 overflow-y-auto">
            {mobileLeads.length === 0 && (
              <div className="flex items-center justify-center h-32 rounded-2xl border border-dashed border-cream-300">
                <p className="text-[13px] text-ink-50">No leads found</p>
              </div>
            )}

            {mobileLeads.map((lead) => {
              const stage = lead.stage || 'new';
              const colors = STAGE_COLORS[stage] || STAGE_COLORS.new;
              const stageIdx = STAGES.indexOf(stage);
              const scoreClass = SCORE_COLORS[lead.score] || SCORE_COLORS.low;

              return (
                <div key={lead.id} className="flex bg-cream-50 rounded-[16px] overflow-hidden">
                  {/* Left accent bar */}
                  <div className={`w-1 shrink-0 ${colors.bg}`} />

                  <div className="flex-1 p-3.5">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center shrink-0`}>
                          <span className={`text-[12px] font-bold ${colors.text}`}>
                            {(lead.customer_name || 'U')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-[14px] font-semibold text-ink-300">
                            {lead.customer_name || 'Unknown'}
                          </h4>
                          {lead.wb_conversations?.customer_phone && (
                            <p className="text-[11px] text-ink-50 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.wb_conversations.customer_phone}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${scoreClass}`}>
                          {lead.score || 'new'}
                        </span>
                        {lead.score === 'high' && <Star className="w-3.5 h-3.5 text-soft-honey fill-soft-honey" />}
                      </div>
                    </div>

                    {/* Summary */}
                    <p className="text-[12px] text-ink-50 line-clamp-2 mb-2.5 ml-10">
                      {lead.summary || 'New lead -- no summary yet.'}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center justify-between ml-10">
                      <span className={`text-[10px] uppercase tracking-widest font-semibold ${colors.text}`}>
                        {stage}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => stageIdx > 0 && updateLeadStage(lead.id, STAGES[stageIdx - 1])}
                          disabled={stageIdx === 0}
                          className="p-1.5 rounded-lg hover:bg-cream-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowLeft className="w-4 h-4 text-ink-100" />
                        </button>
                        <button
                          onClick={() => stageIdx < STAGES.length - 1 && updateLeadStage(lead.id, STAGES[stageIdx + 1])}
                          disabled={stageIdx === STAGES.length - 1}
                          className="p-1.5 rounded-lg hover:bg-cream-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowRight className="w-4 h-4 text-ink-100" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-soft-rose text-white px-5 py-3 rounded-2xl shadow-lg text-sm font-medium flex items-center gap-2">
          <XCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </motion.div>
  );
};

export default Leads;
