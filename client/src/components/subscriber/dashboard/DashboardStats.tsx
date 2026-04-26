import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { staggerStyle } from "@/hooks/useAnimations";

interface DashboardStatsProps {
  stats: {
    total: number;
    active: number;
    approved: number;
    needsAttention: number;
  };
  statCardVisible: boolean[];
}

export function DashboardStats({
  stats,
  statCardVisible,
}: DashboardStatsProps) {
  const cards = [
    {
      label: "Total Letters",
      value: stats.total,
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Active",
      value: stats.active,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Approved",
      value: stats.approved,
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Action Needed",
      value: stats.needsAttention,
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.label}
          className={`transition-all duration-500 ease-out ${statCardVisible[i] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={staggerStyle(i, !!statCardVisible[i])}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
              {card.label}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
