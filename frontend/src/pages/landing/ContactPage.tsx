import React, { useState } from 'react';
import LandingLayout from './LandingLayout';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', business: '', message: '' });
  const [sent, setSent] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // In production: POST to a form handler (e.g., Formspree, EmailJS, or your own API)
    // For now, simulate success
    setSent(true);
  }

  return (
    <LandingLayout>
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Contact</p>
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-ink-300 mb-4">
              Get in touch
            </h1>
            <p className="text-ink-100 max-w-xl mx-auto">
              Have questions about VyavsayAssist? Our team is here to help. Reach out and we'll get back to you within 1 business day.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Contact info */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-display font-semibold text-ink-300 mb-4">Contact Information</h2>
                <div className="space-y-4">
                  {[
                    {
                      icon: '📧',
                      label: 'Email',
                      value: 'support@vyavsayassist.app',
                      href: 'mailto:support@vyavsayassist.app',
                    },
                    {
                      icon: '🌐',
                      label: 'Website',
                      value: 'vyavsayassist.app',
                      href: 'https://vyavsayassist.app',
                    },
                    {
                      icon: '📍',
                      label: 'Address',
                      value: 'Maharashtra, India',
                      href: null,
                    },
                  ].map(item => (
                    <div key={item.label} className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{item.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-ink-50 uppercase tracking-wider">{item.label}</p>
                        {item.href ? (
                          <a href={item.href} className="text-sm text-soft-lavender hover:underline mt-0.5 block">
                            {item.value}
                          </a>
                        ) : (
                          <p className="text-sm text-ink-100 mt-0.5">{item.value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-pastel-lavender/30 rounded-card p-5 border border-pastel-lavender/50">
                <p className="font-semibold text-ink-300 mb-1">Vitthal Technologies</p>
                <p className="text-sm text-ink-100">
                  VyavsayAssist is a product of Vitthal Technologies, a registered MSME in India (Udyam Registration).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-ink-300 mb-3">Support Hours</h3>
                <div className="text-sm text-ink-100 space-y-1">
                  <p>Monday – Saturday: 10:00 AM – 6:00 PM IST</p>
                  <p>Sunday: Closed</p>
                  <p className="text-ink-50 text-xs mt-2">AI support via WhatsApp available 24/7</p>
                </div>
              </div>
            </div>

            {/* Contact form */}
            <div className="bg-cream-100 rounded-card p-6 border border-cream-200">
              {sent ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-4">✅</div>
                  <h3 className="font-display font-semibold text-ink-300 text-xl mb-2">Message Sent!</h3>
                  <p className="text-sm text-ink-100">
                    Thanks for reaching out. We'll reply to your email within 1 business day.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-xs font-semibold text-ink-100 mb-1.5 uppercase tracking-wider">
                      Your Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Ramesh Sharma"
                      className="w-full bg-cream-50 border border-cream-200 rounded-input px-4 py-2.5 text-sm text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-ink-100 mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="ramesh@showroom.com"
                      className="w-full bg-cream-50 border border-cream-200 rounded-input px-4 py-2.5 text-sm text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="business" className="block text-xs font-semibold text-ink-100 mb-1.5 uppercase tracking-wider">
                      Business Name
                    </label>
                    <input
                      id="business"
                      name="business"
                      type="text"
                      value={form.business}
                      onChange={handleChange}
                      placeholder="Sharma Motors Pvt Ltd"
                      className="w-full bg-cream-50 border border-cream-200 rounded-input px-4 py-2.5 text-sm text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-xs font-semibold text-ink-100 mb-1.5 uppercase tracking-wider">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={4}
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Tell us about your showroom and what you'd like to know..."
                      className="w-full bg-cream-50 border border-cream-200 rounded-input px-4 py-2.5 text-sm text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-soft-lavender/30 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-soft-lavender text-white py-3 rounded-pill font-semibold text-sm hover:opacity-90 transition-opacity mt-2"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
