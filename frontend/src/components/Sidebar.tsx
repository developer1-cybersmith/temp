import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  QrCode, 
  MessageSquare, 
  Users, 
  CheckSquare, 
  BarChart3, 
  Settings,
  LogOut,
  Zap,
  Brain,
  CalendarDays
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: QrCode, label: 'Connect WhatsApp', path: '/qr-scanner' },
    { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
    { icon: Users, label: 'Leads', path: '/leads' },
    { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
    { icon: CalendarDays, label: 'Appointments', path: '/appointments' },
    { icon: Brain, label: 'AI Brain', path: '/ai-brain' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <aside className="w-20 bg-card border-r border-border h-screen sticky top-0 flex flex-col items-center py-8 z-50 transition-all duration-300 hover:w-64 group font-outfit shadow-2xl">
      {/* Logo */}
      <div className="mb-12 relative flex items-center w-full px-4">
        <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)] shrink-0">
          <Zap className="w-8 h-8 text-white fill-white" />
        </div>
        <span className="ml-4 font-bold text-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
          Vyavsay Baileys
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 w-full px-4 space-y-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-4 p-3 rounded-xl transition-all duration-200 relative
              ${isActive ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted hover:text-white'}
            `}
          >
            <item.icon className="w-6 h-6 shrink-0" />
            <span className="font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* User & Auth */}
      <div className="w-full px-4 space-y-4 mt-auto pt-8 border-t border-border/50">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-4 p-2 rounded-xl bg-muted/30 border border-border/50 overflow-hidden text-left hover:bg-muted/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Open Settings"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center text-white font-bold shrink-0 shadow-inner">
            {user?.email?.[0].toUpperCase() || 'U'}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity overflow-hidden flex-1">
            <p className="text-xs font-bold truncate">{user?.email}</p>
            <p className="text-[10px] text-green-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Online
            </p>
          </div>
        </button>
        
        <button 
          onClick={() => signOut()}
          className="w-full flex items-center gap-4 p-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all group/logout"
        >
          <LogOut className="w-6 h-6 shrink-0 group-hover/logout:translate-x-1 transition-transform" />
          <span className="font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
