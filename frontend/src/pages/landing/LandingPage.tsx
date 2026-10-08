import { Link } from 'react-router-dom';
import LandingLayout from './LandingLayout';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Auto-Reply in Hindi & English',
    desc: 'Your AI sales assistant understands Hinglish and responds naturally — 24/7, without missing a single customer.',
    color: 'pastel-lavender',
  },
  {
    icon: '📋',
    title: 'Smart Lead Management',
    desc: 'Automatically scores every lead as Hot, Warm, or Cold. Know exactly who to follow up with and when.',
    color: 'pastel-sage',
  },
  {
    icon: '🛍️',
    title: 'Live Inventory Matching',
    desc: 'Connect your catalog. The AI shows customers exactly what is in stock — with prices, photos, and details.',
    color: 'pastel-peach',
  },
  {
    icon: '🎤',
    title: 'Voice Walk-In Capture',
    desc: 'Record a 10-second voice note when a customer visits. AI extracts name, items shown, and follow-up — no typing.',
    color: 'pastel-sky',
  },
  {
    icon: '📊',
    title: 'Daily Sales Dashboard',
    desc: 'See today\'s visits, hot leads, and pending tasks at a glance. Your entire sales pipeline on one screen.',
    color: 'pastel-honey',
  },
  {
    icon: '⏰',
    title: 'Automated Follow-Ups',
    desc: 'Never let a lead go cold. AI sends timely follow-up messages for quotes, appointments, and dormant customers.',
    color: 'pastel-mint',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Connect Your WhatsApp',
    desc: 'Link your WhatsApp Business number in 2 minutes. No technical knowledge needed.',
  },
  {
    num: '02',
    title: 'Train with Your Catalog',
    desc: 'Upload your inventory, set your business hours, and add a greeting. The AI learns your business.',
  },
  {
    num: '03',
    title: 'Watch Leads Convert',
    desc: 'AI replies instantly, qualifies leads, and sends you a daily summary. You close the deals.',
  },
];

const INDUSTRIES = [
  'Car Dealerships', 'Saree & Textile Showrooms', 'Jewellery Shops',
  'Furniture Stores', 'Electronics Retailers', 'Real Estate Offices',
];

export default function LandingPage() {
  return (
    <LandingLayout>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-24 px-4 sm:px-6">
        {/* Subtle background blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-pastel-lavender/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-pastel-sage/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-pastel-lavender/60 px-4 py-1.5 rounded-pill mb-6">
            <span className="w-2 h-2 bg-whatsapp rounded-full animate-pulse-slow" />
            <span className="text-xs font-semibold text-soft-lavender">Official WhatsApp Business API</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-ink-300 leading-[1.1] tracking-tight mb-6">
            Your Showroom's AI
            <span className="text-soft-lavender"> Sales Assistant</span>
            <br />on WhatsApp
          </h1>

          <p className="text-lg text-ink-100 max-w-2xl mx-auto leading-relaxed mb-10">
            VyavsayAssist handles WhatsApp inquiries, matches inventory, qualifies leads, and captures walk-in visits — so you focus on closing deals, not typing replies.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 bg-soft-lavender text-white px-8 py-3.5 rounded-pill font-semibold hover:opacity-90 transition-opacity text-base shadow-sm"
            >
              Start Free Trial
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <a
              href="/#how-it-works"
              className="inline-flex items-center justify-center gap-2 bg-cream-100 text-ink-200 px-8 py-3.5 rounded-pill font-semibold hover:bg-cream-200 transition-colors text-base"
            >
              See How It Works
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-50">No credit card required · Setup in 5 minutes · Cancel anytime</p>

          {/* Mock chat preview */}
          <div className="mt-14 max-w-xs mx-auto bg-white rounded-card shadow-lg overflow-hidden border border-cream-200">
            <div className="bg-[#075E54] px-4 py-3 flex items-center gap-2">
              <div className="w-8 h-8 bg-whatsapp/30 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">S</span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Sharma Motors</p>
                <p className="text-white/60 text-xs">VyavsayAssist AI · Online</p>
              </div>
            </div>
            <div className="bg-[#ECE5DD] px-3 py-3 space-y-2">
              <div className="flex justify-start">
                <div className="bg-white text-ink-200 text-xs px-3 py-2 rounded-2xl rounded-tl-none max-w-[80%] shadow-sm">
                  Bhai Fortuner ka price kya hai?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-[#DCF8C6] text-ink-200 text-xs px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm">
                  Namaste! 🙏 Fortuner 4×2 AT abhi ₹33.5L mein available hai. Test drive ke liye kab aana chahoge? Kal subah slot available hai 🚗
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-white text-ink-200 text-xs px-3 py-2 rounded-2xl rounded-tl-none max-w-[80%] shadow-sm">
                  Kal 11 baje theek rahega
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-[#DCF8C6] text-ink-200 text-xs px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm">
                  Confirm ✅ Kal 11:00 AM test drive book kar diya hai. Showroom address WhatsApp pe share kar raha hoon!
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Industries ────────────────────────────────────────────────── */}
      <section className="bg-cream-100 py-8 px-4 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-ink-50 mb-5">Works for every type of showroom</p>
          <div className="flex flex-wrap justify-center gap-2">
            {INDUSTRIES.map(ind => (
              <span key={ind} className="bg-cream-50 border border-cream-200 text-ink-100 text-sm px-4 py-1.5 rounded-pill">
                {ind}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="section-label mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-ink-300">
            Everything your sales team needs
          </h2>
          <p className="text-ink-100 mt-3 max-w-xl mx-auto">
            From the first WhatsApp message to the final purchase, VyavsayAssist handles every step of the sales journey.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className={`bg-${f.color}/40 rounded-card p-6 hover:shadow-md transition-shadow`}>
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-display font-semibold text-ink-300 mb-2">{f.title}</h3>
              <p className="text-sm text-ink-100 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-cream-100 py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="section-label mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-ink-300">
              Live in 3 simple steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-7 left-[60%] w-[80%] h-px border-t-2 border-dashed border-cream-200" />
                )}
                <div className="bg-cream-50 rounded-card p-6 border border-cream-200">
                  <div className="w-12 h-12 bg-soft-lavender text-white rounded-2xl flex items-center justify-center font-display font-bold text-sm mb-4">
                    {step.num}
                  </div>
                  <h3 className="font-display font-semibold text-ink-300 mb-2">{step.title}</h3>
                  <p className="text-sm text-ink-100 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats / Social proof ─────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: '24/7', label: 'Always Available' },
            { value: '< 3s', label: 'Reply Time' },
            { value: '10+', label: 'Industries' },
            { value: '100%', label: 'WhatsApp API' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-3xl font-display font-bold text-soft-lavender">{s.value}</p>
              <p className="text-xs text-ink-50 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center bg-pastel-lavender/40 rounded-card p-12 border border-pastel-lavender">
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-ink-300 mb-4">
            Ready to grow your showroom?
          </h2>
          <p className="text-ink-100 mb-8 max-w-xl mx-auto">
            Join showrooms across India using VyavsayAssist to handle customer conversations automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center bg-soft-lavender text-white px-8 py-3.5 rounded-pill font-semibold hover:opacity-90 transition-opacity"
            >
              Start Free Trial
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center bg-cream-50 text-ink-200 px-8 py-3.5 rounded-pill font-semibold hover:bg-cream-100 transition-colors border border-cream-200"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
