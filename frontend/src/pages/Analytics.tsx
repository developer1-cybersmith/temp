import React, { useState, useEffect } from 'react';
import client from '../api/client';
import {
  BarChart3,
  Users,
  MessageSquare,
  Zap,
  PieChart,
  Activity,
  MessagesSquare
} from 'lucide-react';
import { motion } from 'framer-motion';

const pastelBarColors = [
  'bg-pastel-lavender',
  'bg-pastel-sage',
  'bg-pastel-peach',
  'bg-pastel-sky',
  'bg-pastel-honey',
];

const Analytics: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await client.get('/analytics');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-8 h-8 border-[3px] border-cream-300 border-t-soft-sage rounded-full animate-spin" />
        <span className="text-[13px] text-ink-50 font-medium">Loading analytics...</span>
      </div>
    );

  const leadDistribution = [
    { label: 'High Intent', count: data?.leadsByScore?.high || 0, color: 'bg-pastel-rose', textColor: 'text-soft-rose' },
    { label: 'Warm Leads', count: data?.leadsByScore?.medium || 0, color: 'bg-pastel-honey', textColor: 'text-soft-honey' },
    { label: 'General', count: data?.leadsByScore?.low || 0, color: 'bg-pastel-sky', textColor: 'text-soft-sky' },
  ];

  const totalLeads = data?.totalLeads || 1;

  const statCards = [
    { icon: MessageSquare, label: 'Chat Volume', value: data?.totalMessages || 0, bg: 'bg-pastel-lavender', textColor: 'text-soft-lavender' },
    { icon: Users, label: 'Total Leads', value: data?.totalLeads || 0, bg: 'bg-pastel-sage', textColor: 'text-soft-sage' },
    { icon: Zap, label: 'AI Replies', value: data?.aiMessagesCount || 0, bg: 'bg-pastel-peach', textColor: 'text-soft-peach' },
    { icon: MessagesSquare, label: 'Conversations', value: data?.totalConversations || 0, bg: 'bg-pastel-sky', textColor: 'text-soft-sky' },
  ];

  const stageEntries = Object.entries(data?.leadsByStage || {});
  const maxStageCount = Math.max(...stageEntries.map(([, c]: any) => c), 1);

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[22px] font-bold text-ink-400">Analytics</h1>
          <p className="text-[13px] text-ink-50 mt-0.5">AI-powered insights into your sales funnel</p>
        </div>
        <div className="flex items-center gap-1.5 bg-pastel-sage text-soft-sage rounded-full px-3 py-1">
          <Activity className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold">Real-time</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {statCards.map((stat, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label}
            className={`${stat.bg} rounded-[20px] p-4`}
          >
            <p className={`font-display text-[28px] font-bold ${stat.textColor}`}>
              {stat.value}
            </p>
            <p className={`text-[12px] ${stat.textColor}/70 mt-0.5`}>{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar Chart — Lead Stage Distribution */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="lg:col-span-2 bg-cream-100/60 rounded-[20px] p-5 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-ink-100" />
            <h2 className="text-[14px] font-semibold text-ink-300">Lead Stages</h2>
          </div>

          <div className="flex-1 flex items-end gap-3 h-[240px]">
            {stageEntries.map(([stage, count]: any, idx) => {
              const barHeight = Math.max((count / maxStageCount) * 200, 12);
              const barColor = pastelBarColors[idx % pastelBarColors.length];
              return (
                <div key={stage} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full relative flex flex-col items-center">
                    <span className="text-[11px] font-bold text-ink-100 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                      {count}
                    </span>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${barHeight}px` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`w-full ${barColor} rounded-t-xl`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-ink-50 uppercase truncate w-full text-center">
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Progress Bars — Intent Scoring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-cream-100/60 rounded-[20px] p-5"
        >
          <div className="flex items-center gap-2 mb-5">
            <PieChart className="w-4 h-4 text-ink-100" />
            <h2 className="text-[14px] font-semibold text-ink-300">Intent Scoring</h2>
          </div>

          <div className="space-y-5">
            {leadDistribution.map((item) => {
              const pct = Math.round((item.count / totalLeads) * 100);
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] font-semibold text-ink-100">{item.label}</span>
                    <span className="text-[11px] text-ink-50">{pct}%</span>
                  </div>
                  <div className="h-2 bg-cream-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`h-full rounded-full ${item.color}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Analytics;
