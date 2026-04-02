import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Terms of Service | Talk to My Lawyer</title>
        <meta name="description" content="Read the Terms of Service for Talk to My Lawyer. Understand your rights and obligations when using our professional attorney-reviewed legal letter service." />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/terms" />
        <meta property="og:title" content="Terms of Service | Talk to My Lawyer" />
        <meta property="og:description" content="Terms of Service for Talk to My Lawyer — professional attorney-reviewed legal letter service." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/terms" />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Terms of Service | Talk to My Lawyer" />
        <meta name="twitter:description" content="Terms of Service for Talk to My Lawyer — professional attorney-reviewed legal letter service." />
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
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using Talk To My Lawyer ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Use License</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Permission is granted to temporarily download one copy of the materials (information or software) on Talk To My Lawyer for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>Attempting to decompile or reverse engineer any software contained on the Service</li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>Transferring the materials to another person or "mirroring" the materials on any other server</li>
              <li>Violating any applicable laws or regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              The materials on Talk To My Lawyer are provided on an "as is" basis. Talk To My Lawyer makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Limitations</h2>
            <p className="text-muted-foreground leading-relaxed">
              In no event shall Talk To My Lawyer or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Talk To My Lawyer, even if Talk To My Lawyer or an authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Accuracy of Materials</h2>
            <p className="text-muted-foreground leading-relaxed">
              The materials appearing on Talk To My Lawyer could include technical, typographical, or photographic errors. Talk To My Lawyer does not warrant that any of the materials on the Service are accurate, complete, or current. Talk To My Lawyer may make changes to the materials contained on the Service at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Materials and Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Talk To My Lawyer has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Talk To My Lawyer of the site. Use of any such linked website is at the user's own risk.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Users agree that they will not post, upload, or transmit any unlawful, threatening, abusive, defamatory, obscene, or otherwise objectionable material through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Limitations of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              In no case shall Talk To My Lawyer, its directors, officers, or agents be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service or materials, even if Talk To My Lawyer has been advised of the possibility of such damages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Revisions and Errata</h2>
            <p className="text-muted-foreground leading-relaxed">
              The materials appearing on Talk To My Lawyer may include errors or inaccuracies. Talk To My Lawyer does not commit to updating such materials. Talk To My Lawyer may make changes to the materials contained on the Service at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. Modifications</h2>
            <p className="text-muted-foreground leading-relaxed">
              Talk To My Lawyer may revise these terms of service at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">10. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which Talk To My Lawyer operates, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">11. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at <a href="mailto:support@talk-to-my-lawyer.com" className="text-blue-600 hover:underline">support@talk-to-my-lawyer.com</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
