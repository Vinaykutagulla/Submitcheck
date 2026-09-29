import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions | SubmitCheck',
  description: 'Terms and Conditions for using SubmitCheck to match journals, review manuscript gaps, and prepare a submission-ready paper.',
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <div className="legal-card">
        <Link href="/" className="auth-back">← Back to SubmitCheck</Link>
        <p className="auth-kicker">Legal</p>
        <h1>Terms and Conditions</h1>
        <p className="legal-updated">Last updated: September 28, 2026</p>

        <p>These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of SubmitCheck (&quot;SubmitCheck&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), including our website and manuscript review tools. By creating an account or using SubmitCheck, you agree to these Terms. If you do not agree, please do not use the service.</p>

        <h2>1. Description of service</h2>
        <p>SubmitCheck provides journal matching suggestions, gap analysis, formatting checks, and manuscript submission-preparation tools. These features rely on automated and AI-assisted analysis and are provided for informational and advisory purposes only. SubmitCheck is not affiliated with, endorsed by, or acting on behalf of any journal, publisher, or indexing body referenced in the service.</p>

        <h2>2. No guarantee of publication</h2>
        <p>Journal matches, gap analyses, and formatting suggestions are recommendations only. SubmitCheck does not review manuscripts on behalf of any journal and has no influence over, and makes no guarantee regarding, any journal&apos;s editorial decisions, peer review outcome, or acceptance for publication.</p>

        <h2>3. Accounts</h2>
        <p>You must provide accurate information when creating an account and are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us promptly if you suspect unauthorized use of your account.</p>

        <h2>4. Subscriptions and payments</h2>
        <p>SubmitCheck offers a free plan and paid options, including one-time per-manuscript checks and the Author Pro subscription, as described on our <Link href="/pricing">Pricing</Link> page. Payments are processed by Razorpay. Prices are shown in Indian Rupees (₹) and may change with notice. Subscriptions renew automatically for each billing period until cancelled.</p>

        <h2>5. Cancellations and refunds</h2>
        <p>You may cancel a subscription at any time; cancellation takes effect at the end of the current billing period, and no further renewal charges will apply. One-time manuscript checks are billed per manuscript and are generally non-refundable once the analysis has been generated, except where required by applicable law or at our discretion.</p>

        <h2>6. Your manuscript content</h2>
        <p>You retain all ownership rights to the manuscripts, abstracts, and other content you upload or paste into SubmitCheck (&quot;Your Content&quot;). You grant us a limited license to process Your Content solely to provide and improve the service. You are responsible for ensuring you have the right to submit Your Content and that it does not infringe any third party&apos;s rights or contain plagiarized material.</p>

        <h2>7. AI-assisted analysis</h2>
        <p>Journal matches, gap analysis, and formatting suggestions are generated using automated rules and AI models. This analysis may be incomplete, inaccurate, or out of date, and does not constitute editorial, legal, or professional advice. You are solely responsible for reviewing and verifying all suggestions before submitting a manuscript to any journal.</p>

        <h2>8. Acceptable use</h2>
        <p>You agree not to misuse the service, including by uploading unlawful or infringing content, attempting to disrupt or reverse-engineer the service, or using the service to circumvent any journal&apos;s or publisher&apos;s policies.</p>

        <h2>9. Third-party services</h2>
        <p>SubmitCheck relies on third-party providers, including Supabase for authentication and data storage and Razorpay for payment processing, as well as third-party journal and indexing data sources. We are not responsible for the availability or accuracy of these third-party services.</p>

        <h2>10. Limitation of liability</h2>
        <p>SubmitCheck is provided &quot;as is&quot; without warranties of any kind. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages, including manuscript rejection, missed deadlines, or loss of data, arising from your use of the service.</p>

        <h2>11. Termination</h2>
        <p>We may suspend or terminate your access to SubmitCheck if you violate these Terms. You may stop using the service and delete your account at any time.</p>

        <h2>12. Changes to these terms</h2>
        <p>We may update these Terms from time to time. Continued use of SubmitCheck after changes are posted constitutes acceptance of the revised Terms.</p>

        <h2>13. Governing law</h2>
        <p>These Terms are governed by the laws of India, without regard to conflict-of-law principles.</p>

        <h2>14. Contact</h2>
        <p>Questions about these Terms can be sent to <a href="mailto:support@thesubmitcheck.com">support@thesubmitcheck.com</a>.</p>
      </div>
    </main>
  );
}
