import React, { useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';

interface DetectedColumn {
  key: string;
  label: string;
  sampleValues: any[];
  inferredType: string;
}

interface Props {
  columns: DetectedColumn[];
  previewRows: any[];
  allRows: any[];
  totalRows: number;
  onConfirm: (mapping: Record<string, string>, allRows: any[]) => void;
  error: string | null;
}

const TARGET_OPTIONS = [
  { value: 'item_name', label: 'Item Name (required)', group: 'core' },
  { value: 'category', label: 'Category', group: 'core' },
  { value: 'price', label: 'Price', group: 'core' },
  { value: 'quantity', label: 'Quantity / Stock', group: 'core' },
  { value: 'ignore', label: '— Skip this column —', group: 'other' },
];

const ColumnMapper: React.FC<Props> = ({ columns, previewRows, allRows, totalRows, onConfirm, error }) => {
  // Auto-map based on column labels
  const autoMap = (): Record<string, string> => {
    const mapping: Record<string, string> = {};
    for (const col of columns) {
      const lower = col.label.toLowerCase();
      if (['name', 'model', 'item', 'product', 'title', 'item name', 'product name'].some(k => lower.includes(k))) {
        mapping[col.label] = 'item_name';
      } else if (['category', 'type', 'segment'].some(k => lower.includes(k))) {
        mapping[col.label] = 'category';
      } else if (['price', 'cost', 'amount', 'mrp', 'rate'].some(k => lower.includes(k))) {
        mapping[col.label] = 'price';
      } else if (['qty', 'quantity', 'stock', 'count', 'available'].some(k => lower.includes(k))) {
        mapping[col.label] = 'quantity';
      } else if (['status', 'sr', 'sl', 'no', 'id', 'serial'].some(k => lower === k)) {
        mapping[col.label] = 'ignore';
      } else {
        // Map everything else as an attribute
        mapping[col.label] = `attributes.${col.key}`;
      }
    }
    return mapping;
  };

  const [mapping, setMapping] = useState<Record<string, string>>(autoMap());

  const updateMapping = (columnLabel: string, target: string) => {
    setMapping(prev => ({ ...prev, [columnLabel]: target }));
  };

  const hasItemName = Object.values(mapping).includes('item_name');

  // Build full target options including custom attributes
  const allTargets = [
    ...TARGET_OPTIONS,
    ...columns
      .filter(c => !TARGET_OPTIONS.some(t => t.value === mapping[c.label]))
      .map(c => ({ value: `attributes.${c.key}`, label: `Custom: ${c.label}`, group: 'attribute' })),
  ];

  // Deduplicate targets
  const uniqueTargets = allTargets.filter((t, i, arr) =>
    arr.findIndex(x => x.value === t.value) === i
  );

  return (
    <div className="space-y-6">
      <div className="bg-pastel-sky/30 rounded-[18px] p-4 text-sm text-ink-100">
        Map your file columns to inventory fields. We auto-detected {columns.length} columns and {totalRows} rows.
      </div>

      {/* Mapping table */}
      <div className="space-y-3">
        {columns.map((col) => (
          <div key={col.label} className="flex items-center gap-4 bg-cream-100 rounded-xl p-3">
            {/* Source column */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-ink-300 truncate">{col.label}</p>
              <p className="text-[11px] text-ink-50 truncate">
                e.g., {col.sampleValues.slice(0, 2).join(', ') || 'empty'}
              </p>
            </div>

            <ArrowRight className="w-4 h-4 text-ink-50 shrink-0" />

            {/* Target field */}
            <select
              value={mapping[col.label] || 'ignore'}
              onChange={(e) => updateMapping(col.label, e.target.value)}
              className="flex-1 bg-cream-50 rounded-input px-3 py-2 text-sm text-ink-300 focus:outline-none focus:ring-2 focus:ring-soft-lavender/50"
            >
              <optgroup label="Core Fields">
                {uniqueTargets.filter(t => t.group === 'core' || t.group === 'other').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="Custom Attributes">
                {uniqueTargets.filter(t => t.group === 'attribute').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
        ))}
      </div>

      {/* Preview */}
      {previewRows.length > 0 && (
        <div className="overflow-x-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-50 mb-2">Preview (first 3 rows)</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-cream-200">
                {columns.map(c => (
                  <th key={c.label} className="text-left px-3 py-2 text-ink-50 font-bold">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.slice(0, 3).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-cream-100' : 'bg-cream-50'}>
                  {columns.map(c => (
                    <td key={c.label} className="px-3 py-2 text-ink-200 truncate max-w-[150px]">
                      {row[c.label] !== null && row[c.label] !== undefined ? String(row[c.label]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div className="text-soft-rose text-sm flex items-center gap-2 bg-pastel-rose/40 p-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Confirm */}
      <div className="flex items-center justify-between pt-4 border-t border-cream-200">
        {!hasItemName && (
          <p className="text-sm text-soft-rose flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> Map at least one column to "Item Name"
          </p>
        )}
        <div className="ml-auto">
          <Button
            variant="primary"
            size="lg"
            onClick={() => onConfirm(mapping, allRows)}
            disabled={!hasItemName}
          >
            Import {totalRows} Items
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ColumnMapper;
