import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Package,
  BookOpen,
  Plus,
  Trash2,
  FileText,
  Sparkles,
  AlertCircle,
  Settings2,
  Upload,
  Download,
  FileDown,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import InventoryTable from '../components/InventoryTable';
import ItemModal from '../components/ItemModal';
import SchemaManager from '../components/SchemaManager';
import FileUpload from '../components/FileUpload';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

type Tab = 'products' | 'knowledge';

export interface SchemaField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'dropdown' | 'date' | 'boolean';
  required?: boolean;
  options?: string[];
}

export interface InventorySchema {
  fields: SchemaField[];
}

const AIBrain: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [schema, setSchema] = useState<InventorySchema>({ fields: [] });
  const [showSchemaManager, setShowSchemaManager] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [inventoryStats, setInventoryStats] = useState<any>(null);

  // Knowledge tab state
  const [knowledgeItems, setKnowledgeItems] = useState<any[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);

  // Google Sheets sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Refresh key to trigger InventoryTable reload
  const [refreshKey, setRefreshKey] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);

  // Auto-dismiss error toast
  useEffect(() => {
    if (pageError) {
      const timer = setTimeout(() => setPageError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [pageError]);

  useEffect(() => {
    if (user) {
      fetchSchema();
      fetchInventoryStats();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'knowledge') {
      fetchKnowledge();
    }
  }, [user, activeTab]);

  const fetchSchema = async () => {
    try {
      const { data } = await client.get('/schema');
      setSchema(data.schema || { fields: [] });
    } catch (err) {
      console.error('Failed to fetch schema');
      setPageError('Failed to load schema');
    }
  };

  const fetchInventoryStats = async () => {
    try {
      const { data } = await client.get('/catalog/stats');
      setInventoryStats(data);
    } catch (err) {
      console.error('Failed to fetch inventory stats');
      setPageError('Failed to load inventory stats');
    }
  };

  const fetchKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const { data } = await client.get('/knowledge');
      setKnowledgeItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch knowledge');
      setPageError('Failed to load knowledge items');
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setAddingKnowledge(true);
    setKnowledgeError(null);
    try {
      await client.post('/knowledge', { content: newContent });
      setNewContent('');
      await fetchKnowledge();
    } catch (err: any) {
      setKnowledgeError(err.response?.data?.error || 'Failed to add knowledge');
    } finally {
      setAddingKnowledge(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await client.delete(`/knowledge/${id}`);
      setKnowledgeItems(knowledgeItems.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to delete');
      setPageError('Failed to delete knowledge item');
      fetchKnowledge(); // Revert optimistic delete
    }
  };

  const handleSaveSchema = async (newSchema: InventorySchema) => {
    try {
      await client.patch('/schema', { schema: newSchema });
      setSchema(newSchema);
      setShowSchemaManager(false);
    } catch (err) {
      console.error('Failed to save schema');
      setPageError('Failed to save schema');
    }
  };

  const handleItemSaved = async () => {
    setShowItemModal(false);
    setEditingItem(null);
    await new Promise(r => setTimeout(r, 500));
    setRefreshKey(prev => prev + 1);
    await fetchInventoryStats();
  };

  const handleDownload = async (type: 'all' | 'sold') => {
    try {
      const response = await client.get(`/catalog/export?type=${type}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'sold' ? 'sold_report.xlsx' : 'inventory_export.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setPageError(type === 'sold' ? 'No sold items to export.' : 'No items to export.');
      } else {
        setPageError('Download failed. Please try again.');
      }
    }
  };

  const handleSheetSync = async (action: 'sync' | 'export-to-sheet' | 'import-from-sheet') => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const { data } = await client.post(`/sheets/${action}`);
      setSyncMsg(data.message || `Sync complete! Added: ${data.added || 0}, Updated: ${data.updated || 0}`);
      // Small delay to ensure DB has committed all changes
      await new Promise(r => setTimeout(r, 500));
      // Refresh inventory list AND stats
      setRefreshKey(prev => prev + 1);
      await fetchInventoryStats();
    } catch (err: any) {
      setSyncMsg(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setShowItemModal(true);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'products', label: 'Products', icon: <Package className="w-4 h-4" /> },
    { key: 'knowledge', label: 'General Knowledge', icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="px-5 pt-4 pb-6 lg:px-8 lg:pt-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-5">
        <h1 className="font-display text-[22px] font-bold text-ink-400">AI Brain</h1>
        <p className="text-ink-50 text-[13px] mt-0.5">
          Everything your AI knows about your business
        </p>

        {/* Stats pills — below header, horizontal on all sizes */}
        {inventoryStats && activeTab === 'products' && (
          <div className="flex gap-2 mt-3">
            <div className="flex-1 bg-pastel-sage rounded-[16px] px-3 py-2 text-center">
              <p className="text-lg font-bold font-display text-soft-sage">{inventoryStats?.available ?? 0}</p>
              <p className="text-[9px] text-soft-sage/70 uppercase tracking-widest font-semibold">Available</p>
            </div>
            <div className="flex-1 bg-pastel-rose rounded-[16px] px-3 py-2 text-center">
              <p className="text-lg font-bold font-display text-soft-rose">{inventoryStats?.sold ?? 0}</p>
              <p className="text-[9px] text-soft-rose/70 uppercase tracking-widest font-semibold">Sold</p>
            </div>
            <div className="flex-1 bg-pastel-lavender rounded-[16px] px-3 py-2 text-center">
              <p className="text-lg font-bold font-display text-soft-lavender">{inventoryStats?.total ?? 0}</p>
              <p className="text-[9px] text-soft-lavender/70 uppercase tracking-widest font-semibold">Total</p>
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-cream-200/60 rounded-full p-1 w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold transition-all rounded-full ${
              activeTab === tab.key
                ? 'bg-cream-50 shadow-sm text-ink-300'
                : 'text-ink-50 hover:text-ink-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* Action bar — horizontal scroll on mobile */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Button
              variant="primary"
              size="sm"
              className="flex-shrink-0"
              onClick={() => { setEditingItem(null); setShowItemModal(true); }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add Item
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setShowFileUpload(true)}
            >
              <Upload className="w-4 h-4 mr-1.5" /> Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setShowSchemaManager(true)}
            >
              <Settings2 className="w-4 h-4 mr-1.5" /> Fields
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => handleDownload('all')}
            >
              <Download className="w-4 h-4 mr-1.5" /> Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => handleDownload('sold')}
            >
              <FileDown className="w-4 h-4 mr-1.5" /> Sold
            </Button>
          </div>

          {/* Google Sheets Sync */}
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              variant="soft"
              softColor="sage"
              size="sm"
              loading={syncing}
              onClick={() => handleSheetSync('sync')}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Sync with Google Sheets
            </Button>
          </div>
          <p className="text-[10px] text-ink-50 mt-1">Auto-syncs every 2 minutes. Click to sync now.</p>
          {syncMsg && (
            <p className={`text-xs mt-2 ${syncMsg.includes('fail') ? 'text-red-500' : 'text-soft-sage'}`}>
              {syncMsg}
            </p>
          )}

          {/* Info banner about Excel sync */}
          <div className="bg-pastel-sky/30 rounded-[18px] p-4 flex items-start gap-3">
            <Upload className="w-5 h-5 text-ink-100 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-ink-300">Excel Sync</p>
              <p className="text-ink-50">
                Upload your Excel to import inventory. Make changes here on the dashboard.
                Download anytime to get the updated Excel with all changes.
                Sold items are tracked with dates in the Sold Report.
              </p>
            </div>
          </div>

          {/* Schema hint if empty */}
          {schema.fields.length === 0 && (
            <div className="border border-dashed border-cream-200 rounded-[18px] p-8 text-center">
              <Settings2 className="w-12 h-12 text-ink-50/40 mx-auto mb-4" />
              <h3 className="font-display text-lg font-bold text-ink-300 mb-2">Set Up Your Inventory Fields</h3>
              <p className="text-ink-50 text-sm mb-4">
                Define what fields each item should have (e.g., Brand, Model, Year, Color, Fuel Type)
              </p>
              <Button
                variant="primary"
                onClick={() => setShowSchemaManager(true)}
              >
                Configure Fields
              </Button>
            </div>
          )}

          {/* Inventory Table */}
          {schema.fields.length > 0 && (
            <InventoryTable
              key={refreshKey}
              schema={schema}
              onEdit={handleEditItem}
              onRefresh={async () => { await new Promise(r => setTimeout(r, 500)); setRefreshKey(prev => prev + 1); await fetchInventoryStats(); }}
            />
          )}
        </motion.div>
      )}

      {/* Knowledge Tab */}
      {activeTab === 'knowledge' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add Knowledge Form */}
            <div className="lg:col-span-1">
              <div className="bg-cream-100/60 rounded-[20px] p-6 sticky top-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 bg-pastel-lavender rounded-xl flex items-center justify-center">
                    <Plus className="w-5 h-5 text-ink-200" />
                  </div>
                  <h2 className="font-display text-base font-bold text-ink-300">Add Context</h2>
                </div>
                <form onSubmit={handleAddKnowledge} className="space-y-4">
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Paste FAQs, business policies, working hours, EMI details, or any info your AI should know..."
                    className="w-full h-56 bg-pastel-lavender/40 border-none rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-ink-100/30 transition-all resize-none text-sm leading-relaxed text-ink-300 placeholder:text-ink-50"
                    required
                  />
                  {knowledgeError && (
                    <div className="text-error text-xs flex items-center gap-2 bg-error/10 p-3 rounded-xl">
                      <AlertCircle className="w-4 h-4" /> {knowledgeError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={addingKnowledge}
                    disabled={addingKnowledge || !newContent.trim()}
                  >
                    {!addingKnowledge && <Sparkles className="w-4 h-4 mr-1.5" />}
                    Sync to AI Brain
                  </Button>
                </form>
              </div>
            </div>

            {/* Knowledge List */}
            <div className="lg:col-span-2 space-y-4">
              {knowledgeLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-28 bg-cream-200/40 rounded-[18px] animate-pulse" />
                ))
              ) : knowledgeItems.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="w-7 h-7" />}
                  title="Empty Library"
                  description="Add your first business context to train the AI."
                />
              ) : (
                <AnimatePresence mode="popLayout">
                  {knowledgeItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-cream-100/80 rounded-[18px] p-4 group transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 bg-pastel-lavender rounded-xl flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-ink-200" />
                          </div>
                          <div>
                            <p className="text-sm leading-relaxed text-ink-200 mb-3 line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                              {item.content}
                            </p>
                            <div className="flex items-center gap-4 text-[10px] text-ink-50 uppercase tracking-widest font-semibold">
                              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-ink-100" /> Vectorized</span>
                              <span>{new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteKnowledge(item.id)}
                          className="p-2 text-ink-50 hover:text-error hover:bg-error/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Schema Manager Modal */}
      {showSchemaManager && (
        <SchemaManager
          schema={schema}
          onSave={handleSaveSchema}
          onClose={() => setShowSchemaManager(false)}
        />
      )}

      {/* Item Add/Edit Modal */}
      {showItemModal && (
        <ItemModal
          schema={schema}
          item={editingItem}
          onSave={handleItemSaved}
          onClose={() => { setShowItemModal(false); setEditingItem(null); }}
        />
      )}

      {/* File Upload Modal */}
      {showFileUpload && (
        <FileUpload
          onComplete={async () => { await new Promise(r => setTimeout(r, 500)); setRefreshKey(prev => prev + 1); await fetchInventoryStats(); fetchSchema(); }}
          onClose={() => setShowFileUpload(false)}
        />
      )}

      {/* Error Toast */}
      {pageError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-soft-rose text-white px-5 py-3 rounded-2xl shadow-lg text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {pageError}
        </div>
      )}
    </div>
  );
};

export default AIBrain;
