import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Brain,
  Menu,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

const bottomItems: ReadonlyArray<{
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  badge?: number;
}> = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard' },
  { icon: MessageSquare, label: 'Chats', path: '/conversations', badge: 0 },
  { icon: Users, label: 'Leads', path: '/leads' },
  { icon: Brain, label: 'AI', path: '/ai-brain' },
];

export default function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-5 left-4 right-4 z-50 flex items-center justify-around bg-ink-300/[0.92] backdrop-blur-xl rounded-full px-2 py-1.5">
      {bottomItems.map(({ icon: Icon, label, path, badge }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 min-w-[52px] py-1 transition-colors',
              isActive ? 'text-cream-50' : 'text-cream-50/50'
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'relative flex items-center justify-center w-8 h-8 rounded-full transition-colors',
                  isActive && 'bg-cream-50/15'
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                {badge != null && badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-error text-cream-50 text-[9px] font-bold px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[9px] font-medium',
                  isActive && 'font-semibold'
                )}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}

      {/* More button */}
      <button
        onClick={onMoreClick}
        className="flex flex-col items-center gap-0.5 min-w-[52px] py-1 text-cream-50/50 hover:text-cream-50 transition-colors cursor-pointer"
        aria-label="More navigation options"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-full">
          <Menu className="w-[18px] h-[18px]" />
        </span>
        <span className="text-[9px] font-medium">More</span>
      </button>
    </nav>
  );
}
