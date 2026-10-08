import LandingLayout from './LandingLayout';

export default function TermsPage() {
  return (
    <LandingLayout>
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <p className="section-label mb-3">Legal</p>
          <h1 className="text-4xl font-display font-bold text-ink-300 mb-2">Terms of Service</h1>
          <p className="text-sm text-ink-50 mb-10">Last updated: May 1, 2025</p>

          <div className="space-y-8 text-ink-100 leading-relaxed text-sm">

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">1. Agreement to Terms</h2>
              <p>
                These Terms of Service ("Terms") govern your access to and use of VyavsayAssist, a product of <strong className="text-ink-300">Vitthal Technologies</strong> ("Company", "we", "our"). By creating an account or using our service, you agree to be bound by these Terms.
              </p>
              <p className="mt-3">
                If you are using VyavsayAssist on behalf of a business, you represent that you have authority to bind that business to these Terms.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">2. Description of Service</h2>
              <p>
                VyavsayAssist provides an AI-powered WhatsApp customer communication platform for Indian businesses, including features for:
              </p>
              <ul className="list-disc pl-5 mt-3 space-y-1">
                <li>Automated AI replies to customer WhatsApp messages</li>
                <li>Lead management and scoring</li>
                <li>Inventory catalog management</li>
                <li>Walk-in customer tracking</li>
                <li>Sales analytics and reporting</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">3. Accounts and Registration</h2>
              <p>
                To use VyavsayAssist, you must register for an account with a valid email address. You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately of any unauthorized use of your account.
              </p>
              <p className="mt-3">
                You must provide accurate and complete information during registration. We reserve the right to suspend accounts with false information.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">4. WhatsApp Business Platform Compliance</h2>
              <p>
                VyavsayAssist uses the Meta WhatsApp Business Cloud API. By using our service, you agree to also comply with Meta's WhatsApp Business Terms of Service and Commerce Policy. You must:
              </p>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li>Only send messages to users who have opted in to receive communications from your business.</li>
                <li>Not use the service to send spam, unsolicited commercial messages, or bulk promotional messages to users who have not consented.</li>
                <li>Comply with all applicable Indian laws governing electronic communications, including the Information Technology Act, 2000 and TRAI regulations.</li>
                <li>Not use the service for any illegal, deceptive, or harmful purpose.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">5. Acceptable Use</h2>
              <p>You agree not to use VyavsayAssist to:</p>
              <ul className="list-disc pl-5 mt-3 space-y-1">
                <li>Send fraudulent, misleading, or deceptive messages</li>
                <li>Harass, threaten, or abuse customers</li>
                <li>Violate any applicable law or regulation</li>
                <li>Infringe on any intellectual property rights</li>
                <li>Attempt to reverse engineer or compromise the platform's security</li>
                <li>Resell or sublicense the service without written permission</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">6. Subscription and Payment</h2>
              <p>
                VyavsayAssist offers paid subscription plans as described on our Pricing page. All prices are in Indian Rupees (INR) and inclusive of applicable taxes.
              </p>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li><strong>Free Trial:</strong> New accounts receive a 14-day free trial with full access to Pro features.</li>
                <li><strong>Billing:</strong> Subscriptions are billed monthly or annually. Payment is due at the start of each billing cycle.</li>
                <li><strong>Cancellation:</strong> You may cancel at any time. Your access continues until the end of the current billing period. No refunds are issued for partial months.</li>
                <li><strong>Price Changes:</strong> We will provide 30 days' notice before changing subscription prices.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">7. Data and Intellectual Property</h2>
              <p>
                You retain ownership of all data you upload to VyavsayAssist, including inventory, customer records, and conversation history. By using the service, you grant us a limited license to process your data solely to provide and improve the service.
              </p>
              <p className="mt-3">
                VyavsayAssist, its AI models, software, and branding are the intellectual property of Vitthal Technologies. You may not copy, modify, or distribute our intellectual property without written permission.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">8. Service Availability</h2>
              <p>
                We strive for 99.5% uptime but do not guarantee uninterrupted service. We are not responsible for outages caused by Meta/WhatsApp platform issues, third-party service providers, or events outside our control. Scheduled maintenance will be communicated in advance.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">9. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by applicable law, Vitthal Technologies shall not be liable for any indirect, incidental, special, or consequential damages, including loss of profits, data, or business opportunities, arising from your use of VyavsayAssist. Our total liability for any claim shall not exceed the amount you paid in the three months preceding the claim.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">10. Termination</h2>
              <p>
                Either party may terminate this agreement at any time. We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or misuse the WhatsApp platform without prior notice. Upon termination, your data will be retained for 30 days before deletion.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">11. Governing Law and Disputes</h2>
              <p>
                These Terms are governed by the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Maharashtra, India. We encourage resolution of disputes through our support team before legal proceedings.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">12. Changes to Terms</h2>
              <p>
                We may update these Terms periodically. We will notify you of material changes at least 14 days in advance via email or in-app notice. Continued use of VyavsayAssist after the effective date constitutes acceptance of the revised Terms.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-ink-300 mb-3">13. Contact</h2>
              <div className="bg-cream-100 rounded-card p-5 border border-cream-200 mt-3">
                <p className="font-semibold text-ink-300">Vitthal Technologies</p>
                <p>Maharashtra, India</p>
                <p>Email: <a href="mailto:support@vyavsayassist.app" className="text-soft-lavender underline">support@vyavsayassist.app</a></p>
                <p>Website: <a href="https://vyavsayassist.app" className="text-soft-lavender underline">vyavsayassist.app</a></p>
              </div>
            </div>

          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
