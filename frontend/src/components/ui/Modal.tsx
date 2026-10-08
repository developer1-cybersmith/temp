import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useMediaQuery';

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  const isMobile = useIsMobile();

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-ink-400/40"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={
              isMobile
                ? { y: '100%', opacity: 1 }
                : { opacity: 0, scale: 0.95 }
            }
            animate={
              isMobile
                ? { y: 0, opacity: 1 }
                : { opacity: 1, scale: 1 }
            }
            exit={
              isMobile
                ? { y: '100%', opacity: 1 }
                : { opacity: 0, scale: 0.95 }
            }
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'relative bg-cream-50 z-10',
              isMobile
                ? 'w-full rounded-t-card max-h-[90vh] overflow-y-auto'
                : cn('w-full rounded-card', sizeMap[size])
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-3">
              <h2 className="font-display text-lg font-bold text-ink-400">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-200 transition-colors cursor-pointer text-ink-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
