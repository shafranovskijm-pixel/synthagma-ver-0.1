import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan, formatStorageSize } from "@/constants/subscriptionPlans";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, Search, Crown, Users, BookOpen, HardDrive } from "lucide-react";

interface OrgTariff {
  id: string;
  name: string;
  email: string;
  subscription_plan: string;
  is_paid: boolean;
  paid_until: string | null;
  created_at: string;
}

const planColors: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  start: "bg-blue-500/10 text-blue-500",
  standard: "bg-emerald-500/10 text-emerald-500",
  professional: "bg-amber-500/10 text-amber-500",
  maximum: "bg-purple-500/10 text-purple-500",
};

export function TariffsManager() {
  const [orgs, setOrgs] = useState<OrgTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchOrgs = async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, email, subscription_plan, is_paid, paid_until, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching orgs:", error);
    } else {
      setOrgs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handlePlanChange = async (orgId: string, newPlan: SubscriptionPlan) => {
    setUpdating(orgId);
    const { error } = await supabase
      .from("organizations")
      .update({ subscription_plan: newPlan })
      .eq("id", orgId);

    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Тариф обновлён" });
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, subscription_plan: newPlan } : o));
    }
    setUpdating(null);
  };

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.email.toLowerCase().includes(search.toLowerCase())
  );

  const planStats = Object.keys(SUBSCRIPTION_PLANS).map(plan => ({
    plan,
    name: SUBSCRIPTION_PLANS[plan as SubscriptionPlan].name,
    count: orgs.filter(o => o.subscription_plan === plan).length,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {planStats.map(s => (
          <Card key={s.plan}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-xs text-muted-foreground">{s.name}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plans overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="w-5 h-5 text-amber-500" />
            Тарифные планы
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {Object.values(SUBSCRIPTION_PLANS).map(plan => (
              <div key={plan.id} className="p-3 rounded-xl border border-border space-y-2">
                <div className="font-semibold text-sm">{plan.name}</div>
                <div className="text-lg font-bold">
                  {plan.price === 0 ? "Бесплатно" : `${plan.price.toLocaleString()} ₽`}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {plan.limits.maxCourses === -1 ? "∞" : plan.limits.maxCourses} курсов
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {plan.limits.maxStudents === -1 ? "∞" : plan.limits.maxStudents} учеников
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {formatStorageSize(plan.limits.storageBytes)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Organizations table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-5 h-5" />
              Организации ({filtered.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Организация</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Текущий тариф</TableHead>
                  <TableHead>Изменить</TableHead>
                  <TableHead>Оплачен до</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(org => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{org.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{org.email}</TableCell>
                    <TableCell>
                      <Badge className={planColors[org.subscription_plan] || planColors.free} variant="secondary">
                        {SUBSCRIPTION_PLANS[org.subscription_plan as SubscriptionPlan]?.name || org.subscription_plan}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={org.subscription_plan}
                        onValueChange={(v) => handlePlanChange(org.id, v as SubscriptionPlan)}
                        disabled={updating === org.id}
                      >
                        <SelectTrigger className="w-[160px] h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(SUBSCRIPTION_PLANS).map(plan => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} — {plan.price === 0 ? "0 ₽" : `${plan.price.toLocaleString()} ₽`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {org.paid_until
                        ? new Date(org.paid_until).toLocaleDateString("ru-RU")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
