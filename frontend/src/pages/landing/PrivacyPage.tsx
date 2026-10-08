import LandingLayout from './LandingLayout';

export default function PrivacyPage() {
  return (
    <LandingLayout>
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <p className="section-label mb-3">Legal</p>
          <h1 className="text-4xl font-display font-bold text-ink-300 mb-2">Privacy Policy</h1>
          <p className="text-sm text-ink-50 mb-10">Last updated: May 1, 2025</p>

          <div className="prose max-w-none space-y-8 text-ink-100 leading-relaxed text-sm">

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">1. About Us</h2>
              <p>
                VyavsayAssist is a product of <strong className="text-ink-300">Vitthal Technologies</strong>, a registered business in India (Udyam Registration No. UDYAM-MH-XX-XXXXXXXX). We provide an AI-powered WhatsApp sales assistant platform for Indian showrooms and retail businesses.
              </p>
              <p className="mt-3">
                <strong>Business Address:</strong> Maharashtra, India<br />
                <strong>Contact Email:</strong> support@vyavsayassist.app<br />
                <strong>Website:</strong> https://vyavsayassist.app
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">2. Information We Collect</h2>
              <p>We collect the following categories of information:</p>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li><strong>Account Information:</strong> Your name, email address, and business name when you register.</li>
                <li><strong>WhatsApp Data:</strong> Messages, phone numbers, and contact names from your WhatsApp Business account (processed on your behalf to provide the AI reply service).</li>
                <li><strong>Inventory Data:</strong> Product names, prices, and catalog information you upload to the platform.</li>
                <li><strong>Customer Records:</strong> Walk-in visitor information and lead data you enter into the system.</li>
                <li><strong>Usage Data:</strong> Logs of how you use the platform, such as page views and feature usage, for product improvement.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li>To provide and operate the VyavsayAssist service.</li>
                <li>To generate AI-powered replies to your customers' WhatsApp messages.</li>
                <li>To analyze leads and generate sales insights for your dashboard.</li>
                <li>To send you important service announcements and updates.</li>
                <li>To improve our AI models and platform features.</li>
                <li>To comply with applicable legal obligations.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">4. WhatsApp Data and Meta Platform</h2>
              <p>
                VyavsayAssist uses the official Meta WhatsApp Business Cloud API. Your WhatsApp conversations are processed according to Meta's Data Processing Terms. We act as a <strong>data processor</strong> on your behalf — you remain the data controller for your customer conversations.
              </p>
              <p className="mt-3">
                We do not use your customers' WhatsApp data for any purpose other than providing you with the VyavsayAssist service. We do not sell, rent, or share WhatsApp conversation data with third parties.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">5. Data Sharing</h2>
              <p>We share your data only in the following limited circumstances:</p>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li><strong>Service Providers:</strong> We use Supabase (database), OpenAI / GitHub Models (AI processing), and AWS (hosting). These providers process data on our behalf under contractual obligations.</li>
                <li><strong>Legal Requirements:</strong> We may disclose data if required by law, court order, or government authority.</li>
                <li><strong>Business Transfer:</strong> In the event of a merger or acquisition, your data may be transferred with appropriate notice.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">6. Data Security</h2>
              <p>
                We implement industry-standard security measures including SSL/TLS encryption in transit, AES-256 encryption at rest, and role-based access controls. However, no system is 100% secure. We encourage you to use strong passwords and enable two-factor authentication.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">7. Data Retention</h2>
              <p>
                We retain your account data for as long as your account is active. Upon cancellation, your data is retained for 30 days and then permanently deleted unless a longer retention is required by law. WhatsApp message logs are retained for 12 months by default.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">8. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li><strong>Access</strong> the personal data we hold about you.</li>
                <li><strong>Correct</strong> inaccurate or incomplete data.</li>
                <li><strong>Delete</strong> your account and associated data.</li>
                <li><strong>Export</strong> your data in a portable format.</li>
                <li><strong>Opt out</strong> of non-essential communications.</li>
              </ul>
              <p className="mt-3">To exercise these rights, email us at <a href="mailto:support@vyavsayassist.app" className="text-soft-lavender underline">support@vyavsayassist.app</a>.</p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">9. Cookies</h2>
              <p>
                We use essential cookies to keep you logged in and remember your preferences. We do not use advertising or tracking cookies. You can disable cookies in your browser settings, but this may affect some features.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">10. Children's Privacy</h2>
              <p>
                VyavsayAssist is a business tool not intended for persons under the age of 18. We do not knowingly collect personal information from minors.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notice at least 7 days before they take effect. Continued use of the service after the effective date constitutes acceptance of the updated policy.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">12. Contact Us</h2>
              <p>
                For any privacy-related questions or requests, contact us at:
              </p>
              <div className="mt-3 bg-cream-100 rounded-card p-5 border border-cream-200">
                <p className="font-semibold text-ink-300">Vitthal Technologies</p>
                <p>VyavsayAssist Privacy Team</p>
                <p>Maharashtra, India</p>
                <p>Email: <a href="mailto:support@vyavsayassist.app" className="text-soft-lavender underline">support@vyavsayassist.app</a></p>
              </div>
            </div>

          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
