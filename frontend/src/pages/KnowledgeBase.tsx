import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  Plus,
  Trash2,
  Search,
  FileText,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

const KnowledgeBase: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      const { data } = await client.get(`/knowledge?userId=${user?.id}`);
      setItems(data);
    } catch (err) {
      console.error('Failed to fetch knowledge items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchItems();
  }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setAdding(true);
    setError(null);
    try {
      await client.post('/knowledge', {
        userId: user?.id,
        content: newContent
      });
      setNewContent('');
      await fetchItems();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add knowledge');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await client.delete(`/knowledge/${id}?userId=${user?.id}`);
      setItems(items.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to delete item');
    }
  };

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-[22px] font-bold text-ink-400">
            Knowledge Base
          </h1>
          <p className="text-[13px] text-ink-50">
            The AI brain is only as good as the facts you feed it.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-50" />
          <input
            type="text"
            placeholder="Search knowledge..."
            className="bg-cream-200/60 rounded-2xl h-11 pl-10 pr-4 text-sm text-ink-200 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-100/30 transition-all w-56"
          />
        </div>
      </header>

      {/* Grid: form left, list right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Knowledge Form */}
        <div className="lg:col-span-1">
          <div className="bg-cream-100/60 rounded-[20px] p-5 sticky top-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-pastel-lavender flex items-center justify-center">
                <Plus className="w-5 h-5 text-soft-lavender" />
              </div>
              <h2 className="font-display text-lg font-bold text-ink-300">
                Add Context
              </h2>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Paste pricing, services, or business info here..."
                className="w-full h-56 bg-pastel-lavender/40 rounded-input p-4 text-sm text-ink-200 placeholder:text-ink-50 leading-relaxed focus:outline-none focus:ring-2 focus:ring-soft-lavender/30 transition-all resize-none"
                required
              />
              {error && (
                <div className="flex items-center gap-2 bg-pastel-rose/40 text-soft-rose text-xs p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={adding}
                disabled={!newContent.trim()}
              >
                {!adding && <Sparkles className="w-4 h-4 mr-2" />}
                Sync to AI Brain
              </Button>
            </form>
          </div>
        </div>

        {/* Knowledge List */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-cream-200/40 rounded-[18px] h-28 animate-pulse" />
            ))
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="w-7 h-7" />}
              title="Empty Library"
              description="Add your first business context to train the AI."
            />
          ) : (
            <div className="grid gap-4">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-cream-100/80 rounded-[18px] p-4 hover:bg-cream-200/60 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-pastel-lavender/60 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-soft-lavender" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] text-ink-200 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                            {item.content}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-[11px]">
                            <span className="flex items-center gap-1 text-soft-lavender font-medium">
                              <Sparkles className="w-3 h-3" /> Vectorized
                            </span>
                            <span className="text-ink-50">
                              {new Date(item.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-pastel-rose/40 text-soft-rose transition-all shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase;
