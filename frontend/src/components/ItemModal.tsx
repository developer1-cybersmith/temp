import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { InventorySchema } from '../pages/AIBrain';
import { X, Save, Package, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  schema: InventorySchema;
  item: any | null; // null = adding new, object = editing
  onSave: () => void;
  onClose: () => void;
}

const ItemModal: React.FC<Props> = ({ schema, item, onSave, onClose }) => {
  const isEditing = !!item;
  const maxImages = 5;

  const [itemName, setItemName] = useState(item?.item_name || '');
  const [category, setCategory] = useState(item?.category || '');
  const [price, setPrice] = useState(item?.price?.toString() || '');
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || '1');
  const [attributes, setAttributes] = useState<Record<string, any>>(item?.attributes || {});
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingImages = useMemo(() => {
    const images = Array.isArray(item?.images) ? item.images : [];
    return [...images].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [item]);

  const imagePreviewUrls = useMemo(() => selectedImages.map(file => URL.createObjectURL(file)), [selectedImages]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  const handleAttributeChange = (key: string, value: any) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const handleImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const totalImages = existingImages.length + files.length;
    if (totalImages > maxImages) {
      setError(`You can store up to ${maxImages} images per product.`);
      event.target.value = '';
      return;
    }

    setError(null);
    setSelectedImages(files);
  };

  const uploadSelectedImages = async (): Promise<{ url: string; caption?: string; order: number }[]> => {
    if (selectedImages.length === 0) return [];

    const formData = new FormData();
    selectedImages.forEach((file) => {
      formData.append('images', file);
    });

    const { data } = await client.post('/catalog/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return Array.isArray(data.images) ? data.images : [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    setSaving(true);
    setError(null);

    const payload = {
      item_name: itemName.trim(),
      category: category.trim() || undefined,
      price: price ? (Number.isFinite(parseFloat(price)) ? parseFloat(price) : undefined) : undefined,
      quantity: quantity ? (parseInt(quantity, 10) || 1) : 1,
      attributes,
    };

    try {
      const uploadedImages = await uploadSelectedImages();
      const mergedImages = [...existingImages, ...uploadedImages].map((image, index) => ({
        ...image,
        order: index,
      }));

      const savePayload = {
        ...payload,
        ...(mergedImages.length > 0 ? { images: mergedImages } : {}),
      };

      if (isEditing) {
        await client.patch(`/catalog/${item.id}`, savePayload);
      } else {
        await client.post('/catalog', savePayload);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: { key: string; label: string; type: string; required?: boolean; options?: string[] }) => {
    const value = attributes[field.key] ?? '';

    switch (field.type) {
      case 'dropdown':
        return (
          <select
            value={value}
            onChange={(e) => handleAttributeChange(field.key, e.target.value)}
            className="w-full bg-pastel-lavender/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
          >
            <option value="">Select {field.label}</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleAttributeChange(field.key, e.target.value ? parseFloat(e.target.value) : '')}
            placeholder={field.label}
            className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleAttributeChange(field.key, e.target.checked)}
              className="w-5 h-5 rounded border-cream-200 accent-ink-300"
            />
            <span className="text-sm text-ink-200">{field.label}</span>
          </label>
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleAttributeChange(field.key, e.target.value)}
            className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
          />
        );

      default: // text
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleAttributeChange(field.key, e.target.value)}
            placeholder={field.label}
            className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-400/40 backdrop-blur-sm">
      <div className="bg-cream-50 rounded-[24px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-cream-200 sticky top-0 bg-cream-50 rounded-t-[24px] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pastel-sky/60 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-ink-200" />
            </div>
            <h2 className="text-xl font-bold text-ink-400">{isEditing ? 'Edit Item' : 'Add New Item'}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-200 transition-colors cursor-pointer text-ink-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Core fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-ink-100 uppercase tracking-wider mb-2">
                Item Name *
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g., Honda City SV 2022"
                required
                className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-100 uppercase tracking-wider mb-2">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Sedan, SUV, Hatchback"
                className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-100 uppercase tracking-wider mb-2">
                Price
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g., 650000"
                className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-100 uppercase tracking-wider mb-2">
                Quantity
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0"
                className="w-full bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30"
              />
            </div>
          </div>

          {/* Product images */}
          <div className="border-t border-cream-200 pt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-100 uppercase tracking-wider">Product Images</p>
                <p className="text-[12px] text-ink-50 mt-1">Upload image files here. They will be stored in Supabase and saved with this product.</p>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-100 bg-cream-100 px-3 py-1.5 rounded-full">
                <ImageIcon className="w-3.5 h-3.5" />
                {existingImages.length + selectedImages.length}/{maxImages}
              </div>
            </div>

            <label className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-cream-200 bg-pastel-sky/20 px-4 py-6 cursor-pointer hover:bg-pastel-sky/30 transition-colors">
              <Upload className="w-5 h-5 text-ink-100" />
              <span className="text-sm font-semibold text-ink-200">Choose product images</span>
              <input type="file" accept="image/*" multiple onChange={handleImageSelection} className="hidden" />
            </label>

            {(existingImages.length > 0 || imagePreviewUrls.length > 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {existingImages.map((image: any, index: number) => (
                  <div key={`${image.url}-${index}`} className="relative rounded-xl overflow-hidden border border-cream-200 bg-cream-100 aspect-square">
                    <img src={image.url} alt={image.caption || itemName || 'Product image'} className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-ink-300/70 text-cream-50 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      Saved
                    </div>
                  </div>
                ))}

                {imagePreviewUrls.map((url, index) => (
                  <div key={url} className="relative rounded-xl overflow-hidden border border-cream-200 bg-cream-100 aspect-square">
                    <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-pastel-sage text-soft-sage text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      New
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic schema fields */}
          {(schema?.fields || []).length > 0 && (
            <>
              <div className="border-t border-cream-200 pt-5">
                <p className="text-xs font-semibold text-ink-100 uppercase tracking-wider mb-4">
                  Custom Fields
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {schema.fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-ink-100 uppercase tracking-wider mb-2">
                      {field.label} {field.required && '*'}
                    </label>
                    {renderField(field)}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="text-soft-rose text-sm bg-pastel-rose/40 p-3 rounded-xl border border-pastel-rose/60">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-cream-200">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !itemName.trim()}
              loading={saving}
            >
              {!saving && <Save className="w-4 h-4 mr-2" />}
              {isEditing ? 'Update' : 'Add Item'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ItemModal;
