import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import StatusTimeline from "@/components/shared/StatusTimeline";
import { LetterPaywall } from "@/components/LetterPaywall";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Download, MessageSquare, ArrowLeft, CheckCircle, AlertCircle, Send, Clock, Copy, Trash2 } from "lucide-react";
import { Link, useParams, useSearch } from "wouter";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLetterRealtime } from "@/hooks/useLetterRealtime";

// Statuses that require active polling (pipeline in progress or awaiting action)
const POLLING_STATUSES = ["submitted", "researching", "drafting", "pending_review", "under_review"];

export default function LetterDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearch();
  const letterId = parseInt(params.id ?? "0");
  const [updateText, setUpdateText] = useState("");

  // Show success toast after Stripe redirect
  useEffect(() => {
    const searchParams = new URLSearchParams(search);
    if (searchParams.get("unlocked") === "true") {
      toast.success("Payment confirmed", {
        description: "Your letter has been sent for attorney review. You'll receive an email when it's approved.",
        duration: 6000,
      });
    } else if (searchParams.get("canceled") === "true") {
      toast.info("Checkout canceled", { description: "No charges were made. Your letter draft is still ready whenever you are." });
    }
  }, [search]);

  // Poll every 5s for in-progress statuses
  const { data, isLoading, error } = trpc.letters.detail.useQuery(
    { id: letterId },
    {
      enabled: !!letterId,
      refetchInterval: (query) => {
        const status = query.state.data?.letter?.status;
        return status && POLLING_STATUSES.includes(status) ? 5000 : false;
      },
    }
  );

  const utils = trpc.useUtils();

  // Supabase Realtime — instant status updates without polling
  useLetterRealtime({
    letterId: letterId || null,
    enabled: !!letterId,
    onStatusChange: ({ newStatus }) => {
      utils.letters.detail.invalidate({ id: letterId });
      const statusLabels: Record<string, string> = {
        researching: "Our team is researching your legal situation...",
        drafting: "Drafting your letter...",
        generated_locked: "Your letter draft is ready!",
        pending_review: "Sent to attorney review queue.",
        under_review: "An attorney is reviewing your letter.",
        approved: "Your letter has been approved!",
        rejected: "Your letter request was rejected.",
        needs_changes: "The attorney has requested changes.",
      };
      const label = statusLabels[newStatus];
      if (label) {
        if (newStatus === "approved") toast.success(label);
        else if (newStatus === "rejected" || newStatus === "needs_changes") toast.warning(label);
        else toast.info(label);
      }
    },
  });

  const archiveMutation = trpc.letters.archive.useMutation({
    onSuccess: () => {
      toast.success("Letter archived", { description: "You can find it in your letter history." });
      window.history.back();
    },
    onError: (err: any) => toast.error("Could not archive letter", { description: err.message }),
  });

  const handleCopyToClipboard = () => {
    const finalVer = data?.versions?.find((v: any) => v.versionType === "final_approved");
    if (!finalVer) {
      toast.error("Nothing to copy", { description: "The approved letter content is not yet available." });
      return;
    }
    navigator.clipboard.writeText(finalVer.content).then(() => {
      toast.success("Copied to clipboard", { description: "The letter content is ready to paste." });
    }).catch(() => {
      toast.error("Copy failed", { description: "Please try selecting and copying the text manually." });
    });
  };

  const handleArchive = () => {
    if (confirm("Are you sure you want to archive this letter? It will be hidden from your letters list.")) {
      archiveMutation.mutate({ letterId });
    }
  };

  const updateMutation = trpc.letters.updateForChanges.useMutation({
    onSuccess: () => {
      toast.success("Response submitted", { description: "Our legal team is re-processing your letter with the new information." });
      setUpdateText("");
    },
    onError: (err) => toast.error("Submission failed", { description: err.message }),
  });

  const handleSubmitUpdate = () => {
    if (updateText.trim().length < 10) {
      toast.error("Response too short", { description: "Please provide at least 10 characters of additional context." });
      return;
    }
    updateMutation.mutate({ letterId, additionalContext: updateText });
  };

  const handleDownloadPdf = () => {
    if (data?.letter?.pdfUrl) {
      window.open(data.letter.pdfUrl, "_blank");
      return;
    }
    handleDownloadFallback();
  };

  const handleDownloadFallback = () => {
    if (!data?.versions) return;
    const finalVersion = data.versions.find((v) => v.versionType === "final_approved");
    if (!finalVersion) return;

    const isHtml = /<[a-z][\s\S]*>/i.test(finalVersion.content);
    const letterBody = isHtml
      ? finalVersion.content
      : finalVersion.content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .split(/\n\n+/)
          .map((para: string) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
          .join("\n");

    const letterTypeLabel = (data?.letter?.letterType ?? "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    const docDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${data?.letter?.subject ?? "Legal Letter"} — Talk to My Lawyer</title>
  <style>
    @page {
      size: letter;
      margin: 0.85in 1in 1in 1in;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', Times, serif;
      font-size: 11.5pt;
      line-height: 1.7;
      color: #111;
      background: #fff;
    }

    /* ── Letterhead ── */
    .letterhead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 14px;
      border-bottom: 2.5px solid #1e3a5f;
      margin-bottom: 6px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      background: #1e3a5f;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
      line-height: 1;
      flex-shrink: 0;
    }
    .brand-name {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13pt;
      font-weight: 700;
      color: #1e3a5f;
      letter-spacing: -0.3px;
    }
    .brand-tagline {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #6b7280;
      letter-spacing: 0.3px;
      margin-top: 1px;
    }
    .doc-meta {
      text-align: right;
      font-family: Arial, Helvetica, sans-serif;
    }
    .doc-meta-label {
      font-size: 7.5pt;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 600;
    }
    .doc-meta-value {
      font-size: 9pt;
      color: #374151;
      margin-top: 2px;
    }

    /* ── Attorney badge ── */
    .attorney-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 7px 12px;
      margin: 10px 0 22px;
      font-family: Arial, Helvetica, sans-serif;
    }
    .attorney-badge-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .attorney-badge-text {
      font-size: 8.5pt;
      color: #166534;
      font-weight: 600;
    }
    .attorney-badge-sub {
      font-size: 7.5pt;
      color: #4ade80;
      color: #16a34a;
      font-weight: 400;
    }

    /* ── Letter body ── */
    .letter-body {
      font-size: 11.5pt;
      line-height: 1.75;
      color: #111;
    }
    .letter-body p {
      margin-bottom: 14px;
    }
    .letter-body p:last-child {
      margin-bottom: 0;
    }
    .letter-body br + br {
      display: block;
      content: "";
      margin-top: 10px;
    }
    .letter-body strong, .letter-body b {
      font-weight: 700;
    }
    .letter-body em, .letter-body i {
      font-style: italic;
    }
    .letter-body u {
      text-decoration: underline;
    }
    .letter-body ul, .letter-body ol {
      margin: 8px 0 14px 22px;
    }
    .letter-body li {
      margin-bottom: 4px;
    }
    .letter-body h1, .letter-body h2, .letter-body h3 {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 700;
      margin: 18px 0 8px;
      color: #111;
    }
    .letter-body h1 { font-size: 13pt; }
    .letter-body h2 { font-size: 12pt; }
    .letter-body h3 { font-size: 11.5pt; }

    /* ── Footer ── */
    .footer {
      position: running(footer);
    }
    @page { @bottom-center { content: element(footer); } }

    .footer-bar {
      border-top: 1.5px solid #e5e7eb;
      padding-top: 10px;
      margin-top: 40px;
      font-family: Arial, Helvetica, sans-serif;
    }
    .footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .footer-cert {
      font-size: 7.5pt;
      color: #6b7280;
      line-height: 1.4;
    }
    .footer-cert strong {
      color: #374151;
      font-weight: 600;
    }
    .footer-id {
      font-size: 7.5pt;
      color: #9ca3af;
      text-align: right;
      white-space: nowrap;
    }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Letterhead -->
  <div class="letterhead">
    <div class="brand-left">
      <div class="brand-icon">&#9878;</div>
      <div>
        <div class="brand-name">Talk to My Lawyer</div>
        <div class="brand-tagline">Attorney-Reviewed Legal Correspondence</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-meta-label">Document Type</div>
      <div class="doc-meta-value">${letterTypeLabel}</div>
    </div>
  </div>

  <!-- Attorney Approved Badge -->
  <div class="attorney-badge">
    <div class="attorney-badge-icon">&#10003;</div>
    <div>
      <span class="attorney-badge-text">Attorney Reviewed &amp; Approved</span>
      <span class="attorney-badge-sub"> &mdash; This letter has been reviewed and approved by a licensed attorney</span>
    </div>
  </div>

  <!-- Letter Body -->
  <div class="letter-body">
    ${letterBody}
  </div>

  <!-- Footer -->
  <div class="footer-bar">
    <div class="footer-row">
      <div class="footer-cert">
        <strong>Talk to My Lawyer &mdash; Attorney-Reviewed Document</strong><br>
        This letter was professionally drafted and approved by a licensed attorney. Generated ${docDate}.
      </div>
      <div class="footer-id">Document ID: #${letterId}</div>
    </div>
  </div>

</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      const blob = new Blob([printHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `legal-letter-${letterId}.html`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 600);
  };

  if (isLoading) {
    return (
      <AppLayout breadcrumb={[{ label: "My Letters", href: "/letters" }, { label: "Loading..." }]}>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout breadcrumb={[{ label: "My Letters", href: "/letters" }, { label: "Not Found" }]}>
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">Letter not found</h3>
          <Button asChild variant="outline" size="sm" className="bg-background">
            <Link href="/letters"><ArrowLeft className="w-4 h-4 mr-2" />Back to Letters</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { letter, actions, versions, attachments } = data;
  const finalVersion = versions?.find((v) => v.versionType === "final_approved");
  const aiDraftVersion = versions?.find((v) => v.versionType === "ai_draft");
  const userVisibleActions = actions?.filter((a) => a.noteVisibility === "user_visible" && a.noteText);
  const isPolling = POLLING_STATUSES.includes(letter.status);
  const isGeneratedLocked = letter.status === "generated_locked";

  return (
    <AppLayout breadcrumb={[{ label: "My Letters", href: "/letters" }, { label: letter.subject }]}>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground leading-tight">{letter.subject}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {LETTER_TYPE_CONFIG[letter.letterType]?.label ?? letter.letterType}
                  {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <StatusBadge status={letter.status} />
                  <span className="text-xs text-muted-foreground">
                    Submitted {new Date(letter.createdAt).toLocaleDateString()}
                  </span>
                  {isPolling && (
                    <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Auto-refreshing...
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              {letter.status === "approved" && finalVersion && (
                <>
                  <Button onClick={handleCopyToClipboard} size="sm" variant="outline" className="bg-background flex-1 sm:flex-initial">
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                  <Button onClick={handleDownloadPdf} size="sm" className="flex-1 sm:flex-initial">
                    <Download className="w-4 h-4 mr-1" />
                    {(data?.letter as any)?.pdfUrl ? "Download Reviewed PDF" : "Download"}
                  </Button>
                </>
              )}
              {["approved", "rejected"].includes(letter.status) && (
                <Button onClick={handleArchive} size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={archiveMutation.isPending}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Status Timeline */}
        <Card>
          <CardContent className="p-5">
            <StatusTimeline currentStatus={letter.status} />
          </CardContent>
        </Card>

        {/* ── In-progress: pipeline running ── */}
        {["submitted", "researching", "drafting"].includes(letter.status) && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-blue-700 rounded-full animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {letter.status === "submitted" && "Preparing your letter..."}
                    {letter.status === "researching" && "Researching applicable laws and precedents..."}
                    {letter.status === "drafting" && "Drafting your letter..."}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {letter.status === "submitted" && "Our team is reviewing your intake and starting research."}
                    {letter.status === "researching" && "Our legal research team is analysing statutes, case law, and local ordinances relevant to your matter."}
                    {letter.status === "drafting" && "Our team is drafting a professional letter based on the research findings."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PAYWALL: generated_locked — blurred draft + $299 CTA ── */}
        {isGeneratedLocked && (
          <LetterPaywall
            letterId={letterId}
            letterType={letter.letterType}
            subject={letter.subject}
            draftContent={aiDraftVersion?.content ?? undefined}
          />
        )}

        {/* ── Pending / Under Review ── */}
        {["pending_review", "under_review"].includes(letter.status) && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {letter.status === "pending_review" ? "In the Attorney Review Queue" : "Attorney is Reviewing Your Letter"}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    {letter.status === "pending_review"
                      ? "Your letter is in the queue. A licensed attorney will pick it up shortly."
                      : "A licensed attorney has claimed your letter and is currently reviewing and editing it. You'll be notified by email once it's approved."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attorney Notes (user-visible only) */}
        {!isGeneratedLocked && userVisibleActions && userVisibleActions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Attorney Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {userVisibleActions.map((action) => (
                <div key={action.id} className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-foreground">{action.noteText}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(action.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Needs Changes — Subscriber Update Form */}
        {letter.status === "needs_changes" && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-4 h-4" />
                Changes Requested — Your Response
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-amber-700">
                The reviewing attorney has requested changes. Please review the attorney notes above and provide additional context or corrections below. Our legal team will re-process your letter with this new information.
              </p>
              <Textarea
                value={updateText}
                onChange={(e) => setUpdateText(e.target.value)}
                placeholder="Provide additional context, corrections, or clarifications here..."
                rows={4}
                className="bg-white border-amber-200"
              />
              <Button
                onClick={handleSubmitUpdate}
                disabled={updateMutation.isPending || updateText.trim().length < 10}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {updateMutation.isPending ? (
                  "Submitting..."
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Response & Re-Process
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Final Approved Letter */}
        {letter.status === "approved" && finalVersion && (
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  Final Approved Letter
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button onClick={handleCopyToClipboard} size="sm" variant="outline" className="bg-background border-green-300 text-green-700 hover:bg-green-50">
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </Button>
                  <Button onClick={handleDownloadPdf} size="sm" variant="outline" className="bg-background border-green-300 text-green-700 hover:bg-green-50">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    {(data?.letter as any)?.pdfUrl ? "Download Reviewed PDF" : "Download"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-white border border-green-200 rounded-lg p-5">
                {/<[a-z][\s\S]*>/i.test(finalVersion.content) ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground
                      prose-p:my-2 prose-p:leading-relaxed
                      prose-headings:font-semibold prose-headings:text-foreground
                      prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                      prose-strong:text-foreground"
                    dangerouslySetInnerHTML={{ __html: finalVersion.content }}
                  />
                ) : (
                  <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">
                    {finalVersion.content}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rejected Notice */}
        {letter.status === "rejected" && (
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Letter Request Rejected</p>
                  <p className="text-sm text-red-700 mt-1">
                    Unfortunately, the reviewing attorney has rejected this letter request. Please review the attorney notes above for details.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attachments */}
        {attachments && attachments.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Attachments ({attachments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {attachments.map((att) => (
                <a
                  key={att.id}
                  href={att.storageUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">{att.fileName ?? "Attachment"}</span>
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
