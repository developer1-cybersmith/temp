import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Zap,
  Shield,
  Database,
  Phone,
  Globe,
  Monitor,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const pastelCycle = [
  'bg-pastel-lavender',
  'bg-pastel-honey',
  'bg-pastel-sage',
  'bg-pastel-sky',
  'bg-pastel-peach',
  'bg-pastel-rose',
];

const Settings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hasLocalEditsRef = useRef(false);
  const ownerEmails = ((import.meta.env.VITE_OWNER_EMAILS as string | undefined) || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const canOpenOwnerDashboard = Boolean(user?.email && ownerEmails.includes(user.email.toLowerCase()));

  const updateProfileField = (field: string, value: any) => {
    hasLocalEditsRef.current = true;
    setProfile((prev: any) => ({ ...(prev || {}), [field]: value }));
  };

  useEffect(() => {
    if (user?.id) fetchProfile();
  }, [user?.id]);

  const fetchProfile = async () => {
    try {
      const res = await client.get(`/users/${user?.id}`);
      // Avoid wiping in-progress edits when auth/session events trigger refetch.
      if (!hasLocalEditsRef.current) {
        setProfile(res.data.user);
      }
    } catch (err) {
      console.error('Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoReply = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const newVal = !profile.auto_reply_enabled;
      await client.patch(`/users/${user?.id}`, { auto_reply_enabled: newVal });
      updateProfileField('auto_reply_enabled', newVal);
    } catch (err) {
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const resetSessions = async () => {
    if (!confirm('This will disconnect all linked devices. Are you sure?')) return;
    try {
      await client.delete(`/sessions/${user?.id}`);
      alert('All sessions reset. Scan QR again to reconnect.');
      window.location.href = '/dashboard';
    } catch (err) {
      alert('Failed to reset sessions');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-ink-50">
        <div className="w-5 h-5 border-2 border-cream-200 border-t-ink-100 rounded-full animate-spin" />
        <span className="text-sm">Loading settings...</span>
      </div>
    </div>
  );

  const settingsGroups = [
    {
      title: 'AI configuration',
      items: [
        {
          icon: Zap,
          label: 'Auto-Reply Mode',
          description: 'AI automatically handles greetings and FAQs',
          value: profile?.auto_reply_enabled ? 'Enabled' : 'Disabled',
          active: profile?.auto_reply_enabled,
          onClick: toggleAutoReply
        },
        { icon: Monitor, label: 'Confidence Threshold', description: 'Minimum score for AI to reply autonomously', value: profile?.ai_confidence_threshold || '0.75', active: false },
        { icon: Globe, label: 'Primary Language', description: 'Default language for auto-responses', value: 'English (Auto-Detect)', active: false },
      ]
    },
    {
      title: 'system & Integrations',
      items: [
        { icon: Phone, label: 'Baileys Session', description: 'Manage linked WhatsApp Business account', value: 'Active', active: true },
        { icon: Database, label: 'Supabase Data', description: 'Lead storage and conversation persistence', value: 'Connected', active: true },
        { icon: Shield, label: 'Security & Auth', description: 'Manage employee access and session keys', value: 'Enabled', active: false },
      ]
    }
  ];

  let globalItemIdx = 0;

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-bold text-ink-400">Settings</h1>
        <p className="text-[13px] text-ink-50">Configure your AI agent behavior and business identity.</p>
      </div>

      <div className="space-y-8">
        {/* Business Profile Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-100 mb-3">Business Profile</h3>
          <div className="bg-cream-100/60 rounded-[20px] p-5 lg:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Business Name"
                color="honey"
                value={profile?.business_name || ''}
                onChange={(e) => updateProfileField('business_name', e.target.value)}
                placeholder="e.g. VyavsayAssist"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink-100 uppercase tracking-wider">
                  Industry
                </label>
                <select
                  value={profile?.industry || 'generic'}
                  onChange={(e) => updateProfileField('industry', e.target.value)}
                  className="w-full bg-pastel-lavender/40 rounded-input h-[54px] px-4 text-sm text-ink-300 outline-none border-0 transition-all duration-150 focus:ring-2 focus:ring-ink-200/30"
                >
                  <option value="generic">General Business</option>
                  <option value="used_cars">Used Car Dealer</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-100 uppercase tracking-wider">
                Services Offered (comma separated)
              </label>
              <textarea
                value={Array.isArray(profile?.services) ? profile.services.join(', ') : profile?.services || ''}
                onChange={(e) => updateProfileField('services', e.target.value.split(',').map((s: string) => s.trim()))}
                placeholder="e.g. Solar Installation, Maintenance, Consultation"
                className="w-full bg-pastel-sage/40 rounded-input p-4 h-32 text-sm text-ink-300 placeholder:text-ink-50 outline-none border-0 transition-all duration-150 focus:ring-2 focus:ring-ink-200/30 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Business Address"
                color="sky"
                value={profile?.business_address || ''}
                onChange={(e) => updateProfileField('business_address', e.target.value)}
                placeholder="e.g. 123 MG Road, Pune, Maharashtra 411001"
              />
              <Input
                label="Google Maps Link"
                color="cream"
                value={profile?.google_maps_link || ''}
                onChange={(e) => updateProfileField('google_maps_link', e.target.value)}
                placeholder="e.g. https://maps.google.com/..."
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                size="md"
                loading={saving}
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    // Clean up services array — filter out empty strings
                    const cleanServices = Array.isArray(profile?.services)
                      ? profile.services.filter((s: string) => s && s.trim())
                      : [];

                    await client.patch(`/users/${user?.id}`, {
                      business_name: profile.business_name || null,
                      industry: profile.industry || null,
                      services: cleanServices.length > 0 ? cleanServices : null,
                      business_address: profile.business_address || null,
                      google_maps_link: profile.google_maps_link || null,
                    });
                    hasLocalEditsRef.current = false;
                    alert('Profile updated! AI will now use these details.');
                  } catch (err: any) {
                    const details = err?.response?.data?.details;
                    const message = err?.response?.data?.message;
                    const backendError = err?.response?.data?.error;
                    const detailText = Array.isArray(details) ? details.join('\n') : details;
                    alert(detailText || message || backendError || 'Failed to save profile');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Saving...' : 'Update Profile'}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Settings Groups */}
        {settingsGroups.map((group, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (i + 1) * 0.1 }}
            key={group.title}
          >
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-100 mb-3">{group.title}</h3>
            <div className="bg-cream-100/60 rounded-[20px] overflow-hidden">
              {group.items.map((item, idx) => {
                const colorIdx = globalItemIdx % pastelCycle.length;
                globalItemIdx++;
                return (
                  <button
                    key={item.label}
                    disabled={saving}
                    onClick={item.onClick}
                    className={`w-full flex items-center gap-4 p-4 lg:p-5 text-left hover:bg-cream-200/40 transition-all ${
                      idx !== group.items.length - 1 ? 'border-b border-cream-200' : ''
                    } ${saving ? 'opacity-50' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${pastelCycle[colorIdx]} flex items-center justify-center flex-shrink-0`}>
                      <item.icon className="w-5 h-5 text-ink-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="text-[14px] font-semibold text-ink-300">{item.label}</h4>
                        {item.active && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                      </div>
                      <p className="text-[12px] text-ink-50 leading-relaxed">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="bg-cream-200 text-ink-50 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{item.value}</span>
                      <ChevronRight className="w-4 h-4 text-ink-50" />
                    </div>
                  </button>
                );
              })}

              {canOpenOwnerDashboard && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-100 mb-3">Owner tools</h3>
                  <button
                    type="button"
                    onClick={() => navigate('/owner/dashboard')}
                    className="w-full flex items-center justify-between gap-4 px-4 py-4 bg-cream-100/60 rounded-[20px] border border-cream-200 hover:bg-cream-100 transition-colors text-left"
                  >
                    <div>
                      <div className="text-[14px] font-semibold text-ink-300">Open owner dashboard</div>
                      <div className="text-[12px] text-ink-50 mt-1">See aggregate customer, device, and usage health.</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-ink-100 shrink-0" />
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Danger Zone */}
        <div className="bg-pastel-rose/40 rounded-[20px] p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-soft-rose text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              Danger Zone <AlertCircle className="w-3.5 h-3.5" />
            </h4>
            <p className="text-[12px] text-soft-rose/70">
              Terminate all active Baileys sessions and wipe local connection cache.
            </p>
          </div>
          <Button
            variant="danger"
            size="md"
            onClick={resetSessions}
          >
            Reset All Sessions
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
