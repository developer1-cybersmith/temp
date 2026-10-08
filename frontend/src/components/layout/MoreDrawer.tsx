import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QrCode,
  UserCircle,
  CheckSquare,
  CalendarDays,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

interface MoreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const drawerItems = [
  { icon: UserCircle, label: 'Customers', path: '/customers' },
  { icon: QrCode, label: 'Connect WhatsApp', path: '/qr-scanner' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: CalendarDays, label: 'Appointments', path: '/appointments' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: Settings, label: 'Settings', path: '/settings' },
] as const;

export default function MoreDrawer({ isOpen, onClose }: MoreDrawerProps) {
  const { user, signOut } = useAuth();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const email = user?.email || '';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-ink-400/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-cream-50 rounded-t-[28px] max-h-[70vh] overflow-y-auto px-5 py-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 bg-cream-200 rounded-full mx-auto mb-4" />

            {/* Nav items */}
            <nav className="flex flex-col gap-0.5">
              {drawerItems.map(({ icon: Icon, label, path }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors min-h-[48px]',
                      isActive
                        ? 'bg-pastel-lavender text-ink-400 font-semibold'
                        : 'text-ink-100 hover:bg-cream-100 hover:text-ink-300'
                    )
                  }
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            {/* User section */}
            <div className="mt-4 pt-4 border-t border-cream-200">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-9 h-9 rounded-full bg-pastel-peach flex items-center justify-center shrink-0">
                  <span className="font-display font-bold text-soft-peach text-sm">{initial}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink-400 truncate">{displayName}</p>
                  <p className="text-[11px] text-ink-50 truncate">{email}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  signOut();
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 mt-1 mb-2 text-[13px] font-medium text-error hover:bg-error/5 rounded-xl transition-colors cursor-pointer min-h-[48px]"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
