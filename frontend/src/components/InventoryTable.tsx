import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { InventorySchema } from '../pages/AIBrain';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Trash2,
  Tag,
  Package,
  Loader2,
  XCircle,
  LayoutGrid,
  List,
  Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '../components/ui/EmptyState';

interface Props {
  schema: InventorySchema;
  onEdit: (item: any) => void;
  onRefresh: () => void;
}

type ViewMode = 'grid' | 'table';

const InventoryTable: React.FC<Props> = ({ schema, onEdit, onRefresh }) => {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'available' | 'sold' | 'all'>('available');
  const [sort, setSort] = useState<string>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, [page, statusFilter, sort, viewMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: viewMode === 'grid' ? '12' : '25',
        status: statusFilter,
        sort,
      });
      if (search) params.set('search', search);

      const { data } = await client.get(`/catalog?${params}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error('Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSold = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await client.patch(`/catalog/${id}/sold`);
      await onRefresh();
      fetchItems();
    } catch (err) {
      console.error('Failed to mark as sold');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await client.delete(`/catalog/${id}`);
      await onRefresh();
      fetchItems();
    } catch (err) {
      console.error('Failed to delete item');
    }
  };

  const handleEdit = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    onEdit(item);
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '-';
    if (price >= 100000) return `${(price / 100000).toFixed(1)}L`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)}K`;
    return price.toString();
  };

  const getImages = (item: any) => {
    const images = Array.isArray(item.images) ? item.images : [];
    return [...images].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  };

  const visibleFields = (schema?.fields || []).slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-100" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-cream-200/60 rounded-2xl py-3 pl-12 pr-4 text-ink-300 placeholder:text-ink-100 focus:outline-none focus:ring-2 focus:ring-ink-100/40 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <XCircle className="w-5 h-5 text-ink-100 hover:text-ink-300" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-cream-100 rounded-2xl p-1">
          {(['available', 'sold', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${
                statusFilter === s
                  ? s === 'available'
                    ? 'bg-pastel-sage text-ink-300'
                    : s === 'sold'
                    ? 'bg-pastel-rose text-ink-300'
                    : 'bg-cream-200 text-ink-300'
                  : 'text-ink-100 hover:text-ink-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="bg-cream-100 rounded-2xl px-4 py-3 text-sm font-semibold text-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-100/40"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="name">Name A-Z</option>
        </select>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-cream-100 rounded-2xl p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-ink-300 text-cream-50' : 'text-ink-100'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-ink-300 text-cream-50' : 'text-ink-100'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <span className="text-sm text-ink-100 ml-auto">
          {total} item{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-cream-300" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package className="w-7 h-7" />}
          title="No Items Found"
          description={search ? 'Try a different search term.' : 'Add your first inventory item to get started.'}
        />
      ) : viewMode === 'grid' ? (
        /* ─── GRID VIEW ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {items.map((item) => {
              const isSold = item.quantity <= 0 || !item.is_active;
              const images = getImages(item);
              const primaryImage = images[0];

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                  className={`bg-cream-50 rounded-[16px] overflow-hidden transition-all cursor-pointer group ${
                    isSold ? 'opacity-60' : ''
                  }`}
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] bg-cream-100 overflow-hidden">
                    {primaryImage?.url ? (
                      <>
                        <img
                          src={primaryImage.url}
                          alt={item.item_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 bg-ink-300/70 backdrop-blur-sm text-cream-50 text-[10px] font-bold px-2.5 py-1 rounded-full">
                          <ImageIcon className="w-3 h-3" />
                          {images.length}
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-12 h-12 text-cream-300" />
                      </div>
                    )}

                    {/* Status badge */}
                    <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      isSold
                        ? 'bg-pastel-rose text-ink-300'
                        : 'bg-pastel-sage text-ink-300'
                    }`}>
                      {isSold ? 'Sold' : 'Available'}
                    </div>

                    {/* Image count */}
                    {images.length > 1 && (
                      <div className="absolute top-3 right-3 bg-ink-300/50 backdrop-blur-sm text-cream-50 text-[10px] font-bold px-2 py-1 rounded-lg">
                        {images.length} photos
                      </div>
                    )}

                    {/* Quick actions overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-ink-300/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={(e) => handleEdit(e, item)}
                          className="p-2 bg-cream-50/20 backdrop-blur-sm rounded-lg hover:bg-cream-50/40 transition-all"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4 text-cream-50" />
                        </button>
                        {!isSold && (
                          <button
                            onClick={(e) => handleMarkSold(e, item.id)}
                            className="p-2 bg-cream-50/20 backdrop-blur-sm rounded-lg hover:bg-pastel-rose/60 transition-all"
                            title="Mark Sold"
                          >
                            <Tag className="w-4 h-4 text-cream-50" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          className="p-2 bg-cream-50/20 backdrop-blur-sm rounded-lg hover:bg-soft-rose/60 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-cream-50" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-sm text-ink-300 mb-1 truncate">{item.item_name}</h3>

                    {item.category && (
                      <span className="text-[10px] bg-cream-200/60 px-2 py-0.5 rounded-md font-semibold text-ink-100 uppercase tracking-widest">
                        {item.category}
                      </span>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <span className="text-lg font-bold text-soft-lavender">
                        {item.price ? `₹${formatPrice(item.price)}` : '—'}
                      </span>
                      <span className={`text-xs font-bold ${item.quantity > 0 ? 'text-soft-sage' : 'text-soft-rose'}`}>
                        Qty: {item.quantity}
                      </span>
                    </div>

                    {/* Expanded details */}
                    {expandedItem === item.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-3 pt-3 border-t border-cream-200 space-y-1"
                      >
                        {visibleFields.map(f => {
                          const val = item.attributes?.[f.key];
                          if (val === undefined || val === null || val === '') return null;
                          return (
                            <div key={f.key} className="flex justify-between text-xs">
                              <span className="text-ink-100">{f.label}</span>
                              <span className="font-semibold text-ink-300">{String(val)}</span>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* ─── TABLE VIEW ─── */
        <div className="bg-cream-100/60 rounded-[20px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-cream-200">
                  <th className="text-left px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Image</th>
                  <th className="text-left px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Name</th>
                  <th className="text-left px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Category</th>
                  <th className="text-right px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Price</th>
                  <th className="text-center px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Qty</th>
                  {visibleFields.map(f => (
                    <th key={f.key} className="text-left px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">
                      {f.label}
                    </th>
                  ))}
                  <th className="text-center px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Status</th>
                  <th className="text-center px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-ink-100 bg-cream-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isSold = item.quantity <= 0 || !item.is_active;
                  const primaryImage = getImages(item)[0];

                  return (
                    <tr key={item.id} className={`border-b border-cream-200/60 hover:bg-cream-200/40 transition-colors ${isSold ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="relative w-12 h-12">
                          {primaryImage?.url ? (
                            <img src={primaryImage.url} alt={item.item_name} className="w-12 h-12 rounded-xl object-cover border border-cream-200" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-cream-200/60 flex items-center justify-center">
                              <Package className="w-5 h-5 text-ink-100" />
                            </div>
                          )}

                          {primaryImage?.url && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-ink-300 text-cream-50 flex items-center justify-center shadow-sm">
                              <ImageIcon className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4"><p className="font-semibold text-sm text-ink-300">{item.item_name}</p></td>
                      <td className="px-6 py-4">
                        {item.category ? (
                          <span className="bg-cream-200/60 text-xs font-semibold text-ink-200 px-3 py-1 rounded-lg">{item.category}</span>
                        ) : <span className="text-ink-100 text-xs">-</span>}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-sm text-soft-lavender">{item.price ? `₹${formatPrice(item.price)}` : '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-bold text-sm ${item.quantity <= 0 ? 'text-soft-rose' : 'text-soft-sage'}`}>{item.quantity}</span>
                      </td>
                      {visibleFields.map(f => (
                        <td key={f.key} className="px-6 py-4 text-sm text-ink-200">{item.attributes?.[f.key] ?? '-'}</td>
                      ))}
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-lg ${
                          isSold ? 'bg-pastel-rose text-ink-300' : 'bg-pastel-sage text-ink-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSold ? 'bg-soft-rose' : 'bg-soft-sage'}`} />
                          {isSold ? 'Sold' : 'Available'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={(e) => handleEdit(e, item)} className="p-2 text-ink-100 hover:text-ink-300 hover:bg-cream-200/60 rounded-xl transition-all" title="Edit">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {!isSold && (
                            <button onClick={(e) => handleMarkSold(e, item.id)} className="p-2 text-ink-100 hover:text-soft-rose hover:bg-pastel-rose/40 rounded-xl transition-all" title="Mark Sold">
                              <Tag className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={(e) => handleDelete(e, item.id)} className="p-2 text-ink-100 hover:text-soft-rose hover:bg-pastel-rose/40 rounded-xl transition-all" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-100">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl bg-cream-100 text-ink-200 hover:bg-cream-200 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = page <= 3 ? i + 1 : page + i - 2;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 rounded-xl font-semibold text-sm transition-all ${
                    page === pageNum ? 'bg-ink-300 text-cream-50' : 'bg-cream-100 text-ink-200 hover:bg-cream-200'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-cream-100 text-ink-200 hover:bg-cream-200 disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryTable;
