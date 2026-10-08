import React, { useState, useRef } from 'react';
import client from '../api/client';
import { Upload, FileSpreadsheet, Loader2, X, AlertCircle, Check } from 'lucide-react';
import { Button } from './ui/Button';
import ColumnMapper from './ColumnMapper';

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

type Step = 'upload' | 'mapping' | 'processing' | 'done';

const FileUpload: React.FC<Props> = ({ onComplete, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed file data from backend
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState<any[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Processing results
  const [result, setResult] = useState<{ added: number; failed: number } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await client.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setFileId(data.fileId);
      setColumns(data.columns);
      setPreviewRows(data.preview);
      setAllRows(data.rows || data.preview);
      setTotalRows(data.totalRows);
      setStep('mapping');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleMapping = async (columnMapping: Record<string, string>, allRows: any[]) => {
    if (!fileId) return;

    setStep('processing');
    setError(null);

    try {
      const { data } = await client.post(`/files/${fileId}/process`, {
        columnMapping,
        rows: allRows,
      });

      setResult({ added: data.added, failed: data.failed });
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Processing failed');
      setStep('mapping');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-400/40 backdrop-blur-sm">
      <div className="bg-cream-50 rounded-[24px] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-cream-200 sticky top-0 bg-cream-50 rounded-t-[24px] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pastel-lavender rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-soft-lavender" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink-400">Import Inventory</h2>
              <p className="text-xs text-ink-50">
                {step === 'upload' && 'Upload an Excel or CSV file'}
                {step === 'mapping' && `${fileName} — ${totalRows} rows found`}
                {step === 'processing' && 'Processing...'}
                {step === 'done' && 'Import complete!'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-cream-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-ink-100" />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-cream-200 rounded-[20px] p-12 text-center hover:border-soft-lavender transition-all cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              {uploading ? (
                <Loader2 className="w-12 h-12 text-ink-300 mx-auto mb-4 animate-spin" />
              ) : (
                <Upload className="w-12 h-12 text-ink-50/40 mx-auto mb-4" />
              )}
              <h3 className="text-lg font-bold text-ink-300 mb-2">
                {uploading ? 'Parsing file...' : 'Drop Excel/CSV here or click to browse'}
              </h3>
              <p className="text-sm text-ink-50">
                Supports .xlsx, .xls, .csv — up to 10MB
              </p>
              {error && (
                <div className="mt-4 text-soft-rose text-sm flex items-center justify-center gap-2 bg-pastel-rose/40 p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <ColumnMapper
              columns={columns}
              previewRows={previewRows}
              allRows={allRows}
              totalRows={totalRows}
              onConfirm={handleMapping}
              error={error}
            />
          )}

          {/* Step 3: Processing */}
          {step === 'processing' && (
            <div className="text-center py-16">
              <Loader2 className="w-16 h-16 text-ink-300 mx-auto mb-6 animate-spin" />
              <h3 className="text-xl font-bold text-ink-300 mb-2">Processing {totalRows} items...</h3>
              <p className="text-ink-50">Generating embeddings and storing in database. This may take a moment.</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && result && (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-pastel-sage rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-soft-sage" />
              </div>
              <h3 className="text-2xl font-bold text-ink-400 mb-2">Import Complete!</h3>
              <p className="text-ink-100 mb-6">
                <span className="text-soft-sage font-bold">{result.added}</span> items added
                {result.failed > 0 && (
                  <>, <span className="text-soft-rose font-bold">{result.failed}</span> failed</>
                )}
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => { onComplete(); onClose(); }}
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
