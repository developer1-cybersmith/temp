import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MessageCircle, Footprints, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import client from '../api/client';
import AddWalkInModal from '../components/AddWalkInModal';

interface Customer {
  id: string;
  full_name: string | null;
  primary_phone: string | null;
  first_seen_via: string;
  last_activity_at: string;
  hotness: 'hot' | 'warm' | 'cold';
  status: string;
  tags: string[] | null;
}

const HOTNESS: Record<string, { emoji: string; label: string; bg: string; pill: string }> = {
  hot:  { emoji: '🔥', label: 'Hot',  bg: 'bg-pastel-rose',  pill: 'bg-pastel-rose text-rose-600' },
  warm: { emoji: '🌡️', label: 'Warm', bg: 'bg-pastel-honey', pill: 'bg-pastel-honey text-amber-600' },
  cold: { emoji: '❄️', label: 'Cold', bg: 'bg-pastel-sky',   pill: 'bg-pastel-sky text-blue-500' },
};

const SOURCE_ICON: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle size={11} className="text-soft-sage shrink-0" />,
  walk_in:  <Footprints size={11} className="text-soft-lavender shrink-0" />,
  phone:    <Phone size={11} className="text-soft-honey shrink-0" />,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getDisplayName(c: Customer): string {
  return c.full_name || c.primary_phone || 'Walk-in Customer';
}

function getInitials(c: Customer): string {
  if (c.full_name) {
    return c.full_name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  return '?';
}

const Customers: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { fetchCustomers(); }, [sourceFilter, search]); // eslint-disable-line

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (search) params.search = search;
      const res = await client.get('/customers', { params });
      setCustomers(res.data.customers || []);
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toDateString();
  const todayItems = customers.filter(c => new Date(c.last_activity_at).toDateString() === todayStr);
  const hotCount   = customers.filter(c => c.hotness === 'hot').length;
  const warmCount  = customers.filter(c => c.hotness === 'warm').length;

  const groups = (sourceFilter !== 'all' || search)
    ? [{ label: '', items: customers }]
    : [
        { label: 'Today',   items: todayItems },
        { label: 'Earlier', items: customers.filter(c => new Date(c.last_activity_at).toDateString() !== todayStr) },
      ].filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-cream-50 pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-cream-50/95 backdrop-blur-sm border-b border-cream-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-[22px] font-bold text-ink-400">Customers</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-soft-sage text-cream-50 px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:opacity-90 active:scale-95 transition"
          >
            <Plus size={15} /> Walk-In
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-50" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-cream-100 text-[13px] text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30 border border-cream-200 transition"
          />
        </div>

        {/* Source filter chips */}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {[
            { id: 'all',      label: 'All' },
            { id: 'walk_in',  label: '🚪 Walk-In' },
            { id: 'whatsapp', label: '💬 WhatsApp' },
            { id: 'phone',    label: '📞 Phone' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSourceFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-medium transition ${
                sourceFilter === f.id
                  ? 'bg-ink-300 text-cream-50'
                  : 'bg-cream-100 text-ink-100 border border-cream-200 hover:bg-cream-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Today summary stats */}
        {!loading && customers.length > 0 && sourceFilter === 'all' && !search && (
          <div className="mb-4 bg-cream-100 rounded-2xl px-4 py-2.5 border border-cream-200 flex items-center gap-3 text-[12px] flex-wrap">
            <span>
              <span className="font-bold text-ink-400">{todayItems.length}</span>
              <span className="text-ink-100"> today</span>
            </span>
            {hotCount > 0 && (
              <>
                <div className="w-px h-3 bg-cream-200" />
                <span>
                  <span className="font-bold text-rose-500">{hotCount}</span>
                  <span className="text-ink-100"> 🔥 hot</span>
                </span>
              </>
            )}
            {warmCount > 0 && (
              <>
                <div className="w-px h-3 bg-cream-200" />
                <span>
                  <span className="font-bold text-amber-500">{warmCount}</span>
                  <span className="text-ink-100"> 🌡️ warm</span>
                </span>
              </>
            )}
            <span className="ml-auto text-ink-50">{customers.length} total</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-soft-lavender/30 border-t-soft-lavender rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && customers.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🚶</div>
            <div className="font-semibold text-ink-300 text-[16px] mb-1">No customers yet</div>
            <div className="text-[13px] text-ink-100 mb-5">
              {search ? 'No results for that search.' : 'Tap "+ Walk-In" to log your first visitor.'}
            </div>
            {!search && (
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-soft-sage text-cream-50 px-5 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition"
              >
                Add First Walk-In
              </button>
            )}
          </div>
        )}

        {/* Grouped customer list */}
        {!loading && customers.length > 0 && (
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.label || 'all'}>
                {group.label && (
                  <div className="text-[11px] font-semibold text-ink-100 uppercase tracking-widest mb-2 px-1">
                    {group.label}
                  </div>
                )}
                <div className="space-y-2">
                  {group.items.map(c => {
                    const h = HOTNESS[c.hotness] || HOTNESS.cold;
                    const name = getDisplayName(c);
                    const init = getInitials(c);
                    const tags = (c.tags || []).slice(0, 3);
                    // If name is the display: show phone below. If phone IS the display: show a hint.
                    const nameIsName = !!c.full_name;
                    const showPhone = nameIsName && !!c.primary_phone;
                    const showNoName = !c.full_name;

                    return (
                      <motion.div
                        key={c.id}
                        whileTap={{ scale: 0.98 }}
                        className="bg-cream-50 rounded-2xl border border-cream-200 shadow-sm overflow-hidden"
                      >
                        {/* Main tap area → detail */}
                        <button
                          className="w-full text-left p-3.5 flex items-start gap-3"
                          onClick={() => navigate(`/customers/${c.id}`)}
                        >
                          {/* Avatar with initials */}
                          <div className={`w-11 h-11 rounded-full ${h.bg} flex items-center justify-center shrink-0`}>
                            <span className="text-[13px] font-bold text-ink-300">{init}</span>
                          </div>

                          {/* Customer info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-semibold text-[14px] text-ink-400 truncate">{name}</span>
                              {SOURCE_ICON[c.first_seen_via]}
                            </div>
                            {showPhone && (
                              <div className="text-[11px] text-ink-100 mb-0.5">{c.primary_phone}</div>
                            )}
                            {showNoName && (
                              <div className="text-[10px] text-ink-50 italic mb-0.5">No name saved · tap Edit to add</div>
                            )}
                            {tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tags.map(tag => (
                                  <span key={tag} className="px-1.5 py-0.5 bg-cream-200 text-ink-200 rounded text-[10px] font-medium">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Right: hotness pill + time */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${h.pill}`}>
                              {h.emoji} {h.label}
                            </span>
                            <span className="text-[10px] text-ink-50">{formatTime(c.last_activity_at)}</span>
                          </div>
                        </button>

                        {/* Quick actions strip (only if phone known) */}
                        {c.primary_phone && (
                          <div className="flex border-t border-cream-200 text-[11px] text-ink-100">
                            <a
                              href={`tel:${c.primary_phone}`}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-cream-100 transition"
                            >
                              <Phone size={12} /> Call
                            </a>
                            <div className="w-px bg-cream-200" />
                            <a
                              href={`https://wa.me/91${c.primary_phone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 hover:bg-cream-100 transition"
                            >
                              <MessageCircle size={12} /> WhatsApp
                            </a>
                            <div className="w-px bg-cream-200" />
                            <button
                              onClick={() => navigate(`/customers/${c.id}`)}
                              className="flex-1 flex items-center justify-center gap-1 py-2 hover:bg-cream-100 transition"
                            >
                              View →
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddWalkInModal
          onClose={() => setShowAddModal(false)}
          onSaved={customerId => {
            setShowAddModal(false);
            fetchCustomers();
            navigate(`/customers/${customerId}`);
          }}
        />
      )}
    </div>
  );
};

export default Customers;
