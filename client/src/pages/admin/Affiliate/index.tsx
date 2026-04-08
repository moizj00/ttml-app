import AppLayout from "@/components/shared/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  Users,
  Gift,
  Wallet,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAffiliateAdmin } from "./hooks/useAffiliateAdmin";
import { AffiliatePerformanceTab } from "./AffiliatePerformanceTab";
import { AffiliateCodesTab } from "./AffiliateCodesTab";
import { AffiliateCommissionsTab } from "./AffiliateCommissionsTab";
import { AffiliatePayoutsTab } from "./AffiliatePayoutsTab";
import { AffiliateDialogs } from "./AffiliateDialogs";

export default function AdminAffiliate() {
  const {
    codes,
    commissions,
    payouts,
    performance,
    codesLoading,
    commissionsLoading,
    payoutsLoading,
    perfLoading,
    combinedError,
    refetchAll,
    totalCommissions,
    pendingPayouts,
    activeEmployees,
    processingPayout,
    setProcessingPayout,
    rejectionReason,
    setRejectionReason,
    processPayout,
    handleProcessPayout,
    expandedEmployeeId,
    toggleEmployee,
    updateCode,
    forceExpireCode,
    forceExpireCodeId,
    setForceExpireCodeId,
  } = useAffiliateAdmin();

  return (
    <AppLayout
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Affiliate Program" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-700 to-purple-700 rounded-2xl p-6 text-white">
          <h1 className="text-xl font-bold mb-1">
            Affiliate Program Management
          </h1>
          <p className="text-indigo-200 text-sm">
            Manage discount codes, commissions, payouts, and affiliate
            performance.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mb-3">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(totalCommissions)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total Commissions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
                <Wallet className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-2xl font-bold">{pendingPayouts}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pending Payouts
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
                <Gift className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold">{codes?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Discount Codes
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-bold">{activeEmployees}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active Affiliates
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Error State */}
        {combinedError && (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {combinedError.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetchAll()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="performance">
              <BarChart3 className="w-3.5 h-3.5 mr-1" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="codes">
              <Gift className="w-3.5 h-3.5 mr-1" />
              Codes
            </TabsTrigger>
            <TabsTrigger value="commissions">
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              Commissions
            </TabsTrigger>
            <TabsTrigger value="payouts">
              <Wallet className="w-3.5 h-3.5 mr-1" />
              Payouts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance">
            <AffiliatePerformanceTab
              performance={performance as any}
              perfLoading={perfLoading}
              expandedEmployeeId={expandedEmployeeId}
              toggleEmployee={toggleEmployee}
            />
          </TabsContent>

          <TabsContent value="codes">
            <AffiliateCodesTab
              codes={codes as any}
              codesLoading={codesLoading}
              updateCode={updateCode}
              setForceExpireCodeId={setForceExpireCodeId}
            />
          </TabsContent>

          <TabsContent value="commissions">
            <AffiliateCommissionsTab
              commissions={commissions as any}
              commissionsLoading={commissionsLoading}
            />
          </TabsContent>

          <TabsContent value="payouts">
            <AffiliatePayoutsTab
              payouts={payouts}
              payoutsLoading={payoutsLoading}
              setProcessingPayout={setProcessingPayout}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <AffiliateDialogs
          processingPayout={processingPayout}
          setProcessingPayout={setProcessingPayout}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          processPayout={processPayout}
          handleProcessPayout={handleProcessPayout}
          forceExpireCodeId={forceExpireCodeId}
          setForceExpireCodeId={setForceExpireCodeId}
          forceExpireCode={forceExpireCode}
        />
      </div>
    </AppLayout>
  );
}
