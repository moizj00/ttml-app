import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Privacy Policy | Talk to My Lawyer</title>
        <meta name="description" content="Read the Privacy Policy for Talk to My Lawyer. Learn how we collect, use, and protect your personal information when you use our attorney-reviewed legal letter service." />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/privacy" />
        <meta property="og:title" content="Privacy Policy | Talk to My Lawyer" />
        <meta property="og:description" content="Privacy Policy for Talk to My Lawyer — how we collect, use, and protect your personal information." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/privacy" />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Privacy Policy | Talk to My Lawyer" />
        <meta name="twitter:description" content="Privacy Policy for Talk to My Lawyer — how we protect your personal information." />
        <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
      </Helmet>

      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Talk To My Lawyer ("we," "us," "our," or "Company") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We may collect information about you in a variety of ways. The information we may collect on the Site includes:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li><strong>Personal Data:</strong> Name, email address, phone number, and other contact information you provide when registering or using our services</li>
              <li><strong>Account Information:</strong> Information related to your subscription, usage history, and preferences</li>
              <li><strong>Payment Information:</strong> Billing address, payment method details (processed securely through third-party providers)</li>
              <li><strong>Communication Data:</strong> Messages, letters, and documents you create or upload through our service</li>
              <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers</li>
              <li><strong>Usage Data:</strong> Pages visited, time spent, clicks, and other interaction metrics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Use of Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Site to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Create and manage your account</li>
              <li>Process your transactions and send related information</li>
              <li>Email you regarding your account or order</li>
              <li>Fulfill and manage purchases, orders, payments, and other transactions related to the Site</li>
              <li>Generate a personal profile about you so that future visits to the Site will be personalized</li>
              <li>Increase the efficiency and operation of the Site</li>
              <li>Monitor and analyze usage and trends to improve your experience with the Site</li>
              <li>Notify you of updates to the Site</li>
              <li>Offer new products, services, and/or recommendations to you</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Disclosure of Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We may share your information in the following situations:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information is necessary to comply with the law</li>
              <li><strong>Third-Party Service Providers:</strong> We may share your information with vendors, consultants, and service providers who perform services on our behalf</li>
              <li><strong>Business Transfers:</strong> Your information may be transferred as part of a merger, acquisition, or asset sale</li>
              <li><strong>Consent:</strong> We may disclose your information with your consent for any purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Security of Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use administrative, technical, and physical security measures to protect your personal information. However, perfect security does not exist on the Internet. While we strive to protect your personal information, we cannot guarantee its absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              If you have questions or comments about this Privacy Policy, please contact us at:
            </p>
            <div className="bg-muted p-4 rounded-lg text-muted-foreground">
              <p><strong>Talk To My Lawyer</strong></p>
              <p>Email: <a href="mailto:privacy@talk-to-my-lawyer.com" className="text-blue-600 hover:underline">privacy@talk-to-my-lawyer.com</a></p>
              <p>Support: <a href="mailto:support@talk-to-my-lawyer.com" className="text-blue-600 hover:underline">support@talk-to-my-lawyer.com</a></p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Changes to This Privacy Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time in order to reflect, for example, changes to our practices or for other operational, legal, or regulatory reasons. We will notify you of any changes by updating the "Last updated" date of this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Depending on your location, you may have certain rights regarding your personal information, including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>The right to access your personal data</li>
              <li>The right to correct inaccurate data</li>
              <li>The right to request deletion of your data</li>
              <li>The right to opt-out of marketing communications</li>
              <li>The right to data portability</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              To exercise any of these rights, please contact us at <a href="mailto:privacy@talk-to-my-lawyer.com" className="text-blue-600 hover:underline">privacy@talk-to-my-lawyer.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar tracking technologies to track activity on our Site and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Site.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">10. CCPA Privacy Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              If you are a California resident, you are entitled to learn about what data we collect, use, share, and sell. Under the CCPA, you have the following rights:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>The right to know what personal information is collected, used, shared, or sold</li>
              <li>The right to delete personal information collected from you</li>
              <li>The right to opt-out of the sale or sharing of personal information</li>
              <li>The right to non-discrimination for exercising your CCPA rights</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
