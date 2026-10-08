import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { Calendar, CheckCircle2, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '../components/ui/EmptyState';

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await client.get('/tasks');
      setTasks(res.data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (id: string, currentStatus: boolean) => {
    try {
      await client.patch(`/tasks/${id}`, { is_completed: !currentStatus });
      setTasks(tasks.map(t => t.id === id ? { ...t, is_completed: !currentStatus } : t));
    } catch (err) {
      console.error('Failed to update task', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-8 h-8 border-2 border-cream-200 border-t-soft-lavender rounded-full animate-spin" />
        <p className="text-[13px] text-ink-50">Loading tasks...</p>
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  if (tasks.length === 0) {
    return (
      <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-[22px] font-bold text-ink-400">Tasks</h1>
          <p className="text-[13px] text-ink-50">Auto-extracted from conversations</p>
        </div>

        <EmptyState
          icon={<CheckCircle2 className="w-7 h-7" />}
          title="No tasks yet"
          description="Tasks will appear here as your AI extracts action items from customer conversations."
        />
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-bold text-ink-400">Tasks</h1>
        <p className="text-[13px] text-ink-50">Auto-extracted from conversations</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-8">
        <div className="bg-pastel-lavender rounded-[18px] p-4">
          <p className="font-display text-[24px] font-bold text-soft-lavender">{pendingTasks.length}</p>
          <p className="text-[11px] text-soft-lavender/70">To Do</p>
        </div>
        <div className="bg-pastel-sage rounded-[18px] p-4">
          <p className="font-display text-[24px] font-bold text-soft-sage">{completedTasks.length}</p>
          <p className="text-[11px] text-soft-sage/70">Completed</p>
        </div>
        <div className="bg-pastel-peach rounded-[18px] p-4">
          <p className="font-display text-[24px] font-bold text-soft-peach">
            {pendingTasks.filter(t => t.due_date && new Date(t.due_date) < new Date(Date.now() + 86400000)).length}
          </p>
          <p className="text-[11px] text-soft-peach/70">Due Soon</p>
        </div>
      </div>

      {/* Pending Tasks */}
      <div className="mb-8">
        <p className="section-label mb-3">
          Pending <span className="text-ink-50 ml-1">({pendingTasks.length})</span>
        </p>
        <div className="space-y-2.5">
          <AnimatePresence>
            {pendingTasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16 }}
                className="bg-cream-100/80 rounded-[18px] p-4 flex items-center gap-4"
              >
                <button
                  onClick={() => toggleTask(task.id, task.is_completed)}
                  className="w-7 h-7 rounded-full border-2 border-cream-200 hover:border-soft-lavender transition-colors shrink-0 flex items-center justify-center group/check"
                >
                  <div className="w-3 h-3 rounded-full opacity-0 group-hover/check:opacity-100 bg-soft-lavender/20 transition-opacity" />
                </button>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[14px] font-semibold text-ink-300 truncate">{task.title}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[12px] text-ink-50">
                      <Calendar className="w-3.5 h-3.5" />
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'}
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-ink-50">
                      <Tag className="w-3.5 h-3.5" />
                      AI Extracted
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div>
          <p className="section-label mb-3">Completed</p>
          <div className="space-y-2 opacity-60">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="bg-cream-100/40 rounded-[16px] p-3 flex items-center gap-4"
              >
                <button
                  onClick={() => toggleTask(task.id, task.is_completed)}
                  className="w-6 h-6 rounded-full bg-soft-sage flex items-center justify-center shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </button>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] text-ink-50 line-through truncate">{task.title}</h4>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
