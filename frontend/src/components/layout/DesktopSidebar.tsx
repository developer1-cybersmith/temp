import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  QrCode,
  MessageSquare,
  Users,
  UserCircle,
  CheckSquare,
  CalendarDays,
  Brain,
  BarChart3,
  Settings,
  LogOut,
  Crown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import VyavsayLogo from '../brand/VyavsayLogo';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: QrCode, label: 'Connect WhatsApp', path: '/qr-scanner' },
  { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
  { icon: UserCircle, label: 'Customers', path: '/customers' },
  { icon: Users, label: 'Leads', path: '/leads' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: CalendarDays, label: 'Appointments', path: '/appointments' },
  { icon: Brain, label: 'AI Brain', path: '/ai-brain' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: Settings, label: 'Settings', path: '/settings' },
] as const;

export default function DesktopSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const email = user?.email || '';

  // Check if user is owner
  const ownerEmails = ((import.meta.env.VITE_OWNER_EMAILS as string | undefined) || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isOwner = Boolean(email && ownerEmails.includes(email.toLowerCase()));

  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 flex flex-col bg-cream-50 border-r border-cream-200">
      {/* Logo */}
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="group mx-3 mt-4 mb-4 flex items-center gap-3 rounded-2xl border border-cream-200 bg-white/80 px-3.5 py-3 text-left shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-cream-300 hover:shadow-[0_20px_50px_rgba(15,23,42,0.1)]"
        aria-label="Go to dashboard"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6FAF6] ring-1 ring-[#D9E6D7] shadow-inner">
          <VyavsayLogo className="h-8 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold tracking-tight text-ink-400">
            Vyavsay Assist
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-50">
            AI Sales Copilot
          </div>
        </div>
      </button>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3 py-2 overflow-y-auto">
        {navItems.map(({ icon: Icon, label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors',
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
        
        {/* Owner Dashboard (only for owner) */}
        {isOwner && (
          <div className="mt-2 pt-2 border-t border-cream-200">
            <NavLink
              to="/owner/dashboard"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-pastel-lavender text-ink-400 font-semibold'
                    : 'text-ink-100 hover:bg-cream-100 hover:text-ink-300'
                )
              }
            >
              <Crown className="w-5 h-5 shrink-0" />
              <span>Owner Dashboard</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-cream-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-pastel-peach flex items-center justify-center shrink-0">
            <span className="font-display font-bold text-soft-peach text-sm">{initial}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink-400 truncate">{displayName}</p>
            <p className="text-[11px] text-ink-50 truncate">{email}</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-success shrink-0" title="Online" />
        </div>

        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-4 py-2.5 mb-2 mx-0 text-[13px] font-medium text-error hover:bg-error/5 rounded-xl transition-colors cursor-pointer"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
