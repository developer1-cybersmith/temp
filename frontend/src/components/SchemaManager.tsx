import React, { useState } from 'react';
import { InventorySchema, SchemaField } from '../pages/AIBrain';
import { X, Plus, Trash2, GripVertical, Save, Settings2 } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  schema: InventorySchema;
  onSave: (schema: InventorySchema) => void;
  onClose: () => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
];

const SchemaManager: React.FC<Props> = ({ schema, onSave, onClose }) => {
  const [fields, setFields] = useState<SchemaField[]>(schema.fields.length > 0 ? [...schema.fields] : []);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<SchemaField['type']>('text');
  const [editingOptions, setEditingOptions] = useState<string | null>(null);
  const [optionsInput, setOptionsInput] = useState('');

  const addField = () => {
    if (!newFieldLabel.trim()) return;

    const key = newFieldLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    // Prevent duplicate keys
    if (fields.some(f => f.key === key)) return;

    const newField: SchemaField = {
      key,
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: false,
    };

    if (newFieldType === 'dropdown') {
      newField.options = [];
    }

    setFields([...fields, newField]);
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const removeField = (key: string) => {
    setFields(fields.filter(f => f.key !== key));
  };

  const toggleRequired = (key: string) => {
    setFields(fields.map(f => f.key === key ? { ...f, required: !f.required } : f));
  };

  const saveOptions = (key: string) => {
    const options = optionsInput.split(',').map(o => o.trim()).filter(o => o.length > 0);
    setFields(fields.map(f => f.key === key ? { ...f, options } : f));
    setEditingOptions(null);
    setOptionsInput('');
  };

  const handleSave = () => {
    onSave({ fields });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-400/40 backdrop-blur-sm">
      <div className="bg-cream-50 rounded-[24px] w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-cream-200 sticky top-0 bg-cream-50 rounded-t-[24px] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pastel-lavender/60 rounded-xl flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-ink-200" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink-400">Manage Inventory Fields</h2>
              <p className="text-xs text-ink-100">Define what data each item should have</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-200 transition-colors cursor-pointer text-ink-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Info */}
          <div className="bg-pastel-sky/30 border border-cream-200 rounded-2xl p-4 text-sm text-ink-200">
            <strong className="text-ink-400">Core fields</strong> (Name, Category, Price, Quantity) are always included.
            Add custom fields below for your specific business needs.
          </div>

          {/* Existing fields */}
          {fields.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-100 uppercase tracking-wider">Custom Fields</p>
              {fields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-3 bg-cream-100 border border-cream-200 rounded-xl p-3"
                >
                  <GripVertical className="w-4 h-4 text-ink-100/50 shrink-0" />

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-ink-400">{field.label}</span>
                      <span className="text-[10px] bg-cream-200 px-2 py-0.5 rounded-md uppercase tracking-widest font-bold text-ink-100">
                        {field.type}
                      </span>
                      {field.required && (
                        <span className="text-[10px] bg-pastel-lavender/60 text-ink-200 px-2 py-0.5 rounded-md font-bold">
                          Required
                        </span>
                      )}
                    </div>

                    {/* Dropdown options */}
                    {field.type === 'dropdown' && (
                      <div className="mt-2">
                        {editingOptions === field.key ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={optionsInput}
                              onChange={(e) => setOptionsInput(e.target.value)}
                              placeholder="Option1, Option2, Option3"
                              className="flex-1 bg-cream-50 border border-cream-200 rounded-lg px-3 py-1.5 text-xs text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-1 focus:ring-ink-100/30"
                              autoFocus
                            />
                            <button
                              onClick={() => saveOptions(field.key)}
                              className="text-xs bg-ink-300 text-cream-50 px-3 py-1.5 rounded-lg font-semibold"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingOptions(field.key);
                              setOptionsInput((field.options || []).join(', '));
                            }}
                            className="text-xs text-ink-200 hover:underline"
                          >
                            {field.options && field.options.length > 0
                              ? `Options: ${field.options.join(', ')}`
                              : '+ Add options'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => toggleRequired(field.key)}
                    className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-all ${
                      field.required
                        ? 'bg-pastel-lavender/60 text-ink-200'
                        : 'bg-cream-200 text-ink-100 hover:bg-cream-200/80'
                    }`}
                  >
                    {field.required ? 'Required' : 'Optional'}
                  </button>

                  <button
                    onClick={() => removeField(field.key)}
                    className="p-1.5 text-ink-100 hover:text-soft-rose hover:bg-pastel-rose/30 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new field */}
          <div className="border border-dashed border-cream-200 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-ink-100 uppercase tracking-wider">Add New Field</p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="Field name (e.g., Color, Fuel Type, Year)"
                className="flex-1 bg-pastel-honey/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 placeholder:text-ink-100/50 focus:outline-none focus:ring-2 focus:ring-ink-100/30 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addField())}
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as SchemaField['type'])}
                className="bg-pastel-lavender/40 border border-cream-200 rounded-xl px-4 py-3 text-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100/30 text-sm"
              >
                {FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                onClick={addField}
                disabled={!newFieldLabel.trim()}
                className="bg-cream-200 hover:bg-cream-200/80 p-3 rounded-xl transition-all disabled:opacity-30 text-ink-200"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-cream-200">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
            >
              <Save className="w-4 h-4 mr-2" /> Save Schema
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchemaManager;
