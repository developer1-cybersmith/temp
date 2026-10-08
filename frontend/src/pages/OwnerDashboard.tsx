import React, { useEffect, useState } from 'react';
import client from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Building2, Users, PlugZap, MessageSquareText, CheckSquare, PhoneCall, ShieldAlert, RefreshCw, ScrollText, CircleDashed } from 'lucide-react';

type OwnerBusiness = {
  id: string;
  business_name: string | null;
  industry: string | null;
  created_at: string;
  connected_sessions: number;
  disconnected_sessions: number;
  total_conversations: number;
  total_messages: number;
  total_leads: number;
  total_tasks: number;
  total_voice_calls: number;
  last_activity_at: string | null;
  setup_complete: boolean;
};

type OwnerOverview = {
  total_businesses: number;
  active_businesses: number;
  connected_devices: number;
  disconnected_devices: number;
  total_conversations: number;
  total_messages: number;
  total_leads: number;
  total_tasks: number;
  total_voice_calls: number;
  businesses_added_today: number;
  businesses: OwnerBusiness[];
};

const statCards = [
  { label: 'Customers', key: 'total_businesses', icon: Building2, color: 'lavender' },
  { label: 'Active', key: 'active_businesses', icon: Users, color: 'sage' },
  { label: 'Connected Devices', key: 'connected_devices', icon: PlugZap, color: 'sky' },
  { label: 'Disconnected', key: 'disconnected_devices', icon: CircleDashed, color: 'rose' },
  { label: 'Voice Calls', key: 'total_voice_calls', icon: PhoneCall, color: 'peach' },
  { label: 'Conversations', key: 'total_conversations', icon: MessageSquareText, color: 'honey' },
  { label: 'Messages', key: 'total_messages', icon: ScrollText, color: 'mint' },
  { label: 'Tasks', key: 'total_tasks', icon: CheckSquare, color: 'mint' },
] as const;

type StatCardKey = typeof statCards[number]['key'];

const OwnerDashboard: React.FC = () => {
  const [overview, setOverview] = useState<OwnerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.get('/owner/overview');
      setOverview(res.data?.overview || null);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setError('You are not authorized to view the owner dashboard. Add your email to OWNER_EMAILS in backend/.env.');
      } else {
        setError('Failed to load owner overview.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-3">
        <RefreshCw className="w-8 h-8 text-ink-100 animate-spin" />
        <p className="text-[13px] text-ink-50">Loading owner dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-5xl mx-auto">
        <PageHeader
          title="Owner Dashboard"
          subtitle="Privacy-safe business control center"
        />
        <EmptyState
          icon={<ShieldAlert className="w-7 h-7" />}
          title="Owner access required"
          description={error}
          action={{ label: 'Retry', onClick: loadOverview }}
        />
      </div>
    );
  }

  const businesses = overview?.businesses || [];

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Owner Dashboard"
        subtitle="Aggregate-only view: no private customer chats, addresses, or contact details are shown here"
        action={(
          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cream-200 bg-white text-[12px] font-semibold text-ink-300 hover:bg-cream-100 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        )}
      />

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {statCards.map((card) => {
          const value = overview?.[card.key as StatCardKey] ?? 0;
          const icon = card.icon;
          const colorClass = {
            lavender: 'bg-pastel-lavender text-soft-lavender',
            sage: 'bg-pastel-sage text-soft-sage',
            sky: 'bg-pastel-sky text-soft-sky',
            peach: 'bg-pastel-peach text-soft-peach',
            honey: 'bg-pastel-honey text-soft-honey',
            mint: 'bg-pastel-mint text-soft-mint',
            rose: 'bg-pastel-rose text-soft-rose',
          }[card.color];

          return (
            <Card key={card.label} color="cream" className="border border-cream-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[24px] font-bold text-ink-400 leading-none">{value}</p>
                  <p className="text-[12px] text-ink-50 mt-1">{card.label}</p>
                </div>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${colorClass}`}>
                  {React.createElement(icon, { className: 'w-5 h-5' })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Operations snapshot</p>
          <Badge variant="warm">Aggregate only</Badge>
        </div>

        <Card color="cream" className="border border-cream-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-ink-50">Businesses added today</p>
              <p className="mt-1 text-[18px] font-bold text-ink-400">{overview?.businesses_added_today || 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-ink-50">Disconnected devices</p>
              <p className="mt-1 text-[18px] font-bold text-ink-400">{overview?.disconnected_devices || 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-ink-50">Private data policy</p>
              <p className="mt-1 text-[13px] text-ink-300 leading-relaxed">Chats, addresses, customer contact details, and raw messages stay hidden in this view.</p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Customers overview</p>
          <Badge variant="live">Private data hidden</Badge>
        </div>

        {businesses.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-7 h-7" />}
            title="No customer businesses yet"
            description="Once customers sign up, you’ll see aggregate business health here."
          />
        ) : (
          <div className="space-y-3">
            {businesses.map((business) => (
              <Card key={business.id} color="cream" className="border border-cream-200">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg font-bold text-ink-400">
                        {business.business_name || 'Unnamed Business'}
                      </h3>
                      <Badge variant={business.setup_complete ? 'new' : 'warm'}>
                        {business.setup_complete ? 'Setup complete' : 'Needs setup'}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-ink-50 mt-1">
                      {business.industry || 'Industry not set'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Sessions</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.connected_sessions}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Inactive</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.disconnected_sessions}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Chats</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.total_conversations}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Messages</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.total_messages}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Leads</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.total_leads}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Tasks</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.total_tasks}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-50 uppercase tracking-[0.08em]">Voice</p>
                      <p className="text-[14px] font-semibold text-ink-300">{business.total_voice_calls}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] text-ink-50">
                  <span>Joined {new Date(business.created_at).toLocaleDateString()}</span>
                  <span>Last activity: {business.last_activity_at ? new Date(business.last_activity_at).toLocaleString() : 'No activity yet'}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="section-label mb-3">Subscription management</p>
        <Card color="cream" className="border border-cream-200">
          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-semibold text-ink-300">Billing is not wired yet</p>
            <p className="text-[12px] text-ink-50 leading-relaxed">
              The current schema does not include plans, invoices, or subscription tables. Add a billing model before exposing plan changes, renewals, or cancellations here.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default OwnerDashboard;