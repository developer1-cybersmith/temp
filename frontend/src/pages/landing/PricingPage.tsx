import { Link } from 'react-router-dom';
import LandingLayout from './LandingLayout';

const PLANS = [
  {
    name: 'Starter',
    price: '₹999',
    period: '/month',
    desc: 'Perfect for small showrooms just getting started with WhatsApp automation.',
    color: 'pastel-sage',
    features: [
      '1 WhatsApp number',
      'Up to 500 conversations/month',
      'AI auto-reply in Hindi & English',
      'Basic lead scoring',
      'Inventory catalog (up to 100 items)',
      'Email support',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Pro',
    price: '₹2,499',
    period: '/month',
    desc: 'For growing showrooms that want full AI automation and insights.',
    color: 'pastel-lavender',
    features: [
      '1 WhatsApp number',
      'Unlimited conversations',
      'AI auto-reply + voice note transcription',
      'Advanced lead scoring & pipeline',
      'Unlimited inventory catalog',
      'Walk-in customer tracking',
      'Google Sheets sync',
      'Daily sales reports',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Business',
    price: '₹4,999',
    period: '/month',
    desc: 'For multi-location dealerships and enterprise showrooms.',
    color: 'pastel-peach',
    features: [
      'Up to 5 WhatsApp numbers',
      'Unlimited conversations',
      'All Pro features',
      'Multi-branch support',
      'Custom AI personality & prompts',
      'Dedicated account manager',
      'API access',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <LandingLayout>
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Pricing</p>
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-ink-300 mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-ink-100 text-lg max-w-xl mx-auto">
              No hidden charges. No setup fees. Start free for 14 days, then choose a plan that fits your showroom.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative rounded-card p-7 border ${
                  plan.popular
                    ? 'border-soft-lavender shadow-lg ring-2 ring-soft-lavender/30'
                    : 'border-cream-200 bg-cream-50'
                } bg-${plan.color}/20`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-soft-lavender text-white text-xs px-4 py-1 rounded-pill font-semibold">
                    Most Popular
                  </div>
                )}

                <h2 className="font-display font-bold text-ink-300 text-xl mb-1">{plan.name}</h2>
                <p className="text-sm text-ink-50 mb-4">{plan.desc}</p>

                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-display font-bold text-ink-300">{plan.price}</span>
                  <span className="text-ink-50 mb-1">{plan.period}</span>
                </div>

                <Link
                  to="/login"
                  className={`block text-center py-2.5 rounded-pill text-sm font-semibold mb-6 transition-opacity ${
                    plan.popular
                      ? 'bg-soft-lavender text-white hover:opacity-90'
                      : 'bg-cream-200 text-ink-300 hover:bg-cream-200'
                  }`}
                >
                  {plan.cta}
                </Link>

                <ul className="space-y-2.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-ink-100">
                      <svg className="w-4 h-4 text-success mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div className="mt-20">
            <h2 className="text-2xl font-display font-bold text-ink-300 text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="max-w-2xl mx-auto space-y-4">
              {[
                {
                  q: 'Do I need a WhatsApp Business API account?',
                  a: 'Yes. VyavsayAssist uses the official Meta WhatsApp Cloud API. We help you connect your existing WhatsApp Business number or set up a new one during onboarding.',
                },
                {
                  q: 'Is my customer data secure?',
                  a: 'All data is encrypted in transit and at rest. We are compliant with Indian IT Act guidelines and do not sell your data to any third party.',
                },
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes. No long-term contracts. You can cancel your plan at any time and your data remains accessible for 30 days.',
                },
                {
                  q: 'What languages does the AI support?',
                  a: 'VyavsayAssist supports Hindi, English, and Hinglish (mixed). It automatically detects the customer\'s language and replies in the same language.',
                },
              ].map(item => (
                <div key={item.q} className="bg-cream-100 rounded-card p-5 border border-cream-200">
                  <p className="font-semibold text-ink-300 mb-2">{item.q}</p>
                  <p className="text-sm text-ink-100 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
