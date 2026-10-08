import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-pastel-sage text-soft-sage',
  error: 'bg-pastel-rose text-soft-rose',
  info: 'bg-pastel-sky text-soft-sky',
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <AlertCircle size={18} />,
  info: <Info size={18} />,
};

function ToastMessage({ item }: { item: ToastItem }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className={cn(
        'flex items-center gap-2.5 px-4 py-3 rounded-input text-sm font-medium pointer-events-auto',
        variantStyles[item.variant]
      )}
      role="alert"
    >
      {variantIcons[item.variant]}
      <span>{item.message}</span>
    </motion.div>
  );
}

export function ToastContainer({ toasts }: {
  toasts: ToastItem[];
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastMessage key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  const Container = useCallback(
    () => <ToastContainer toasts={toasts} />,
    [toasts]
  );

  return { toast, ToastContainer: Container };
}

export default ToastContainer;
