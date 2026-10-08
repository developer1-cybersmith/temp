import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'How it Works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-cream-50/80 backdrop-blur border-b border-cream-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-soft-lavender flex items-center justify-center">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-display font-semibold text-ink-300 text-lg">VyavsayAssist</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(l => (
            <a key={l.label} href={l.href} className="text-sm text-ink-100 hover:text-ink-300 transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-ink-100 hover:text-ink-300 px-4 py-2 rounded-pill transition-colors">
            Login
          </Link>
          <Link to="/login" className="text-sm bg-soft-lavender text-white px-5 py-2 rounded-pill hover:opacity-90 transition-opacity font-medium">
            Get Started Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-ink-100"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-cream-200 bg-cream-50 px-4 py-4 space-y-3">
          {NAV_LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block text-sm text-ink-100 hover:text-ink-300 py-1"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link to="/login" onClick={() => setOpen(false)} className="text-sm text-center text-ink-100 border border-cream-200 px-4 py-2 rounded-pill">
              Login
            </Link>
            <Link to="/login" onClick={() => setOpen(false)} className="text-sm text-center bg-soft-lavender text-white px-4 py-2 rounded-pill font-medium">
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-ink-300 text-cream-200 mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-ink-200">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-soft-lavender flex items-center justify-center">
                <span className="text-white font-bold text-sm">V</span>
              </div>
              <span className="font-display font-semibold text-cream-50 text-lg">VyavsayAssist</span>
            </div>
            <p className="text-sm text-cream-200/70 max-w-xs leading-relaxed">
              AI-powered WhatsApp sales assistant for Indian showrooms. Automate customer conversations, track leads, and grow faster.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cream-200/50 mb-3">Product</p>
            <ul className="space-y-2">
              {[
                { label: 'Features', href: '/#features' },
                { label: 'Pricing', href: '/pricing' },
                { label: 'How it Works', href: '/#how-it-works' },
              ].map(l => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-cream-200/70 hover:text-cream-50 transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cream-200/50 mb-3">Legal</p>
            <ul className="space-y-2">
              {[
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms of Service', href: '/terms' },
                { label: 'Contact Us', href: '/contact' },
              ].map(l => (
                <li key={l.label}>
                  <Link to={l.href} className="text-sm text-cream-200/70 hover:text-cream-50 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-cream-200/50">
          <p>© {new Date().getFullYear()} VyavsayAssist. All rights reserved.</p>
          <p className="font-medium text-cream-200/60">VyavsayAssist is a product of Vitthal Technologies</p>
        </div>
      </div>
    </footer>
  );
}

interface LandingLayoutProps {
  children: React.ReactNode;
}

export default function LandingLayout({ children }: LandingLayoutProps) {
  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <LandingNav />
      <main className="flex-1">{children}</main>
      <LandingFooter />
    </div>
  );
}
