import React, { useState } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import DesktopSidebar from './DesktopSidebar';
import MobileBottomNav from './MobileBottomNav';
import MoreDrawer from './MoreDrawer';

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const isMobile = useIsMobile();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-cream-50 text-ink-300 font-sans">
        <main className="flex-1 overflow-y-auto pb-24">
          {children}
        </main>
        <MobileBottomNav onMoreClick={() => setIsMoreOpen(true)} />
        <MoreDrawer isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-cream-50 text-ink-300 font-sans">
      <DesktopSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default AppShell;
