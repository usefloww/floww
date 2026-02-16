import { useQuery } from "@tanstack/react-query";
import { FileText, Download, ExternalLink, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getInvoices, type InvoiceInfo } from "@/lib/server/billing";

interface InvoicesListProps {
  organizationId: string;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "paid":
      return (
        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
          Paid
        </Badge>
      );
    case "open":
      return (
        <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
          Open
        </Badge>
      );
    case "void":
      return (
        <Badge className="bg-muted text-muted-foreground">Void</Badge>
      );
    case "uncollectible":
      return (
        <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
          Uncollectible
        </Badge>
      );
    case "draft":
      return (
        <Badge className="bg-muted text-muted-foreground">Draft</Badge>
      );
    default:
      return (
        <Badge className="bg-muted text-muted-foreground">{status || "Unknown"}</Badge>
      );
  }
}

export function InvoicesList({ organizationId }: InvoicesListProps) {
  const {
    data: invoices,
    isLoading,
    error,
  } = useQuery<InvoiceInfo[]>({
    queryKey: ["invoices", organizationId],
    queryFn: () => getInvoices({ data: { organizationId } }),
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Billing History</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Billing History</h2>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4 text-red-600 dark:text-red-400 text-sm">
          Failed to load invoices.
        </div>
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Billing History</h2>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No invoices yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Billing History</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 pr-4">
                Invoice
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">
                Date
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">
                Amount
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-4">
                Status
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 pl-4">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-muted/50">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {invoice.number || invoice.id.slice(-8).toUpperCase()}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-muted-foreground">
                    {formatDate(invoice.created)}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm font-medium">
                    {formatCurrency(invoice.amount_paid || invoice.amount_due, invoice.currency)}
                  </span>
                </td>
                <td className="py-3 px-4">{getStatusBadge(invoice.status)}</td>
                <td className="py-3 pl-4">
                  <div className="flex items-center justify-end gap-2">
                    {invoice.pdf_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        className="h-8 px-2"
                      >
                        <a
                          href={invoice.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {invoice.hosted_invoice_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        className="h-8 px-2"
                      >
                        <a
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View Invoice"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

