import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/shared/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Download, ExternalLink, CreditCard } from "lucide-react";
import { Link } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    open: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    void: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    draft: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    uncollectible: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors[status] ?? colors.draft}`}>
      {status}
    </span>
  );
}

export default function Receipts() {
  const { data, isLoading } = trpc.billing.receipts.useQuery();

  return (
    <AppLayout>
      <div className="container max-w-4xl py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payment History</h1>
            <p className="text-sm text-muted-foreground">View and download receipts for all your payments.</p>
          </div>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!isLoading && (!data?.invoices || data.invoices.length === 0) && (
          <Card>
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                <CreditCard className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No payments yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Subscribe to a plan or submit a letter for review to see your payment history here.
              </p>
              <Link href="/pricing">
                <Button className="mt-2">View Plans</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!isLoading && data?.invoices && data.invoices.length > 0 && (
          <>
            {/* Desktop table */}
            <Card className="hidden sm:block">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Invoices ({data.invoices.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left px-6 py-3 font-medium">Date</th>
                      <th className="text-left px-6 py-3 font-medium">Description</th>
                      <th className="text-right px-6 py-3 font-medium">Amount</th>
                      <th className="text-center px-6 py-3 font-medium">Status</th>
                      <th className="text-right px-6 py-3 font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 text-sm text-foreground">
                          {new Date(inv.date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground max-w-[200px] truncate">
                          {inv.description}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground text-right font-medium">
                          ${(inv.amount / 100).toFixed(2)} <span className="text-xs text-muted-foreground uppercase">{inv.currency}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          {inv.pdfUrl ? (
                            <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <Download className="w-3.5 h-3.5" />
                              PDF
                            </a>
                          ) : inv.receiptUrl ? (
                            <a href={inv.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="w-3.5 h-3.5" />
                              View
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Mobile card list */}
            <div className="sm:hidden space-y-3">
              {data.invoices.map((inv) => (
                <Card key={inv.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        ${(inv.amount / 100).toFixed(2)} <span className="text-xs text-muted-foreground uppercase">{inv.currency}</span>
                      </span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{inv.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(inv.date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      {inv.pdfUrl ? (
                        <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Download className="w-3.5 h-3.5" />
                          Download Receipt
                        </a>
                      ) : inv.receiptUrl ? (
                        <a href={inv.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Receipt
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
