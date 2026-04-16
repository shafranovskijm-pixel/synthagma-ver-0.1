import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, BookOpen, DollarSign, ChevronDown } from "lucide-react";

interface Organization {
  is_paid?: boolean;
  users_count?: number;
  courses_count?: number;
}

interface OrgStatsCardsProps {
  organizations: Organization[];
  showStats: boolean;
  onToggleStats: () => void;
}

export function OrgStatsCards({ organizations, showStats, onToggleStats }: OrgStatsCardsProps) {
  return (
    <div>
      <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground mb-2" onClick={onToggleStats}>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showStats ? 'rotate-180' : ''}`} />
        {showStats ? 'Скрыть статистику' : 'Показать статистику'}
      </Button>
      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-fade-in">
          <Card className="transition-transform hover:scale-[1.02]">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-primary" /></div>Всего организаций</CardDescription><CardTitle className="text-3xl">{organizations.length}</CardTitle></CardHeader>
          </Card>
          <Card className="border-green-500/30 bg-green-500/5 transition-transform hover:scale-[1.02]">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center"><DollarSign className="w-3.5 h-3.5 text-green-600" /></div>С оплатой</CardDescription><CardTitle className="text-3xl text-green-600">{organizations.filter(o => o.is_paid).length}</CardTitle></CardHeader>
          </Card>
          <Card className="border-orange-500/30 bg-orange-500/5 transition-transform hover:scale-[1.02]">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-orange-600" /></div>Без оплаты</CardDescription><CardTitle className="text-3xl text-orange-600">{organizations.filter(o => !o.is_paid).length}</CardTitle></CardHeader>
          </Card>
          <Card className="transition-transform hover:scale-[1.02]">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-blue-600" /></div>Всего сотрудников</CardDescription><CardTitle className="text-3xl">{organizations.reduce((acc, org) => acc + (org.users_count || 0), 0)}</CardTitle></CardHeader>
          </Card>
          <Card className="transition-transform hover:scale-[1.02]">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center"><BookOpen className="w-3.5 h-3.5 text-purple-600" /></div>Всего курсов</CardDescription><CardTitle className="text-3xl">{organizations.reduce((acc, org) => acc + (org.courses_count || 0), 0)}</CardTitle></CardHeader>
          </Card>
        </div>
      )}
    </div>
  );
}
