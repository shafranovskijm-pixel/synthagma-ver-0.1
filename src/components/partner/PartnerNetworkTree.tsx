import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Users, User, Network } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartnerNode {
  id: string;
  code: string;
  status: string;
  total_earned: number;
  created_at: string;
  referred_by_partner_id: string | null;
}

interface Props {
  partnerId: string;
  partnerCode: string;
  networkPartners: PartnerNode[];
  registrations: any[];
}

function TreeNode({ 
  partner, 
  level, 
  children, 
  clientsCount 
}: { 
  partner: { code: string; status: string; total_earned: number; created_at: string; id?: string };
  level: number;
  children: PartnerNode[];
  clientsCount: number;
}) {
  const [open, setOpen] = useState(level === 0);
  const hasChildren = children.length > 0 || clientsCount > 0;
  
  const levelColors = [
    "border-l-primary",
    "border-l-teal-500",
    "border-l-cyan-500",
    "border-l-blue-500",
  ];

  return (
    <div className={cn("relative", level > 0 && "ml-6 border-l-2 pl-4", level > 0 && levelColors[level] || "border-l-muted")}>
      {level > 0 && (
        <div className={cn("absolute -left-[1px] top-0 w-4 h-4 border-b-2 border-l-0", levelColors[level] || "border-muted")} style={{ borderBottomLeftRadius: 0 }} />
      )}
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-muted/50",
          level === 0 && "bg-primary/5 border border-primary/20",
          open && level > 0 && "bg-muted/30"
        )}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-90")} />
        ) : (
          <div className="w-4" />
        )}
        
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          level === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}>
          {level === 0 ? <Network className="w-4 h-4" /> : <User className="w-4 h-4" />}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium">{partner.code}</span>
            {level === 0 && <Badge variant="outline" className="text-[10px] px-1.5">Вы</Badge>}
            <Badge 
              variant={partner.status === "active" ? "default" : "secondary"}
              className={cn(
                "text-[10px] px-1.5",
                partner.status === "active" && "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
              )}
            >
              {partner.status === "active" ? "Активен" : partner.status === "pending" ? "Ожидает" : partner.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{new Date(partner.created_at).toLocaleDateString("ru-RU")}</span>
            <span className="font-medium text-foreground">{Number(partner.total_earned).toLocaleString("ru-RU")} ₽</span>
            {clientsCount > 0 && (
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {clientsCount} кл.</span>
            )}
            {children.length > 0 && (
              <span className="flex items-center gap-1"><Network className="w-3 h-3" /> {children.length} парт.</span>
            )}
          </div>
        </div>
      </div>
      
      {open && children.length > 0 && (
        <div className="mt-1 space-y-1">
          {children.map(child => (
            <RecursiveNode key={child.id} partner={child} level={level + 1} allPartners={[]} registrations={[]} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecursiveNode({ 
  partner, 
  level, 
  allPartners,
  registrations 
}: { 
  partner: PartnerNode; 
  level: number;
  allPartners: PartnerNode[];
  registrations: any[];
}) {
  const children = allPartners.filter(p => p.referred_by_partner_id === partner.id);
  const clientsCount = registrations.filter(r => r.partner_id === partner.id).length;
  
  return (
    <TreeNode 
      partner={partner} 
      level={level} 
      children={children}
      clientsCount={clientsCount}
    />
  );
}

export function PartnerNetworkTree({ partnerId, partnerCode, networkPartners, registrations }: Props) {
  const level1 = networkPartners.filter(p => p.referred_by_partner_id === partnerId);
  const level1Ids = level1.map(p => p.id);
  const level2 = networkPartners.filter(p => level1Ids.includes(p.referred_by_partner_id!));
  const level2Ids = level2.map(p => p.id);
  const level3 = networkPartners.filter(p => level2Ids.includes(p.referred_by_partner_id!));

  const totalClients = registrations.length;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Дерево вашей сети
          <div className="flex gap-2 ml-auto">
            <Badge variant="outline" className="text-xs">Ур.1: {level1.length}</Badge>
            <Badge variant="outline" className="text-xs">Ур.2: {level2.length}</Badge>
            <Badge variant="outline" className="text-xs">Ур.3: {level3.length}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {networkPartners.length === 0 && totalClients === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Ваша сеть пока пуста</p>
            <p className="text-xs mt-1">Поделитесь ссылкой для привлечения партнёров!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Root: current partner */}
            <TreeNode
              partner={{ code: partnerCode, status: "active", total_earned: 0, created_at: new Date().toISOString() }}
              level={0}
              children={level1}
              clientsCount={totalClients}
            />
            {/* Level 1 children rendered inside TreeNode via open state */}
            {/* We need to render the full tree properly */}
            <div className="ml-6 border-l-2 border-l-primary pl-4 space-y-1">
              {level1.map(p1 => {
                const p1Children = level2.filter(p => p.referred_by_partner_id === p1.id);
                const p1Clients = registrations.filter(r => r.partner_id === p1.id).length;
                return (
                  <TreeNodeFull
                    key={p1.id}
                    partner={p1}
                    level={1}
                    clientsCount={p1Clients}
                    childrenNodes={p1Children.map(p2 => {
                      const p2Children = level3.filter(p => p.referred_by_partner_id === p2.id);
                      const p2Clients = registrations.filter(r => r.partner_id === p2.id).length;
                      return { partner: p2, children: p2Children, clientsCount: p2Clients };
                    })}
                  />
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TreeNodeFull({
  partner,
  level,
  clientsCount,
  childrenNodes,
}: {
  partner: PartnerNode;
  level: number;
  clientsCount: number;
  childrenNodes: { partner: PartnerNode; children: PartnerNode[]; clientsCount: number }[];
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = childrenNodes.length > 0;

  const levelColors = ["", "border-l-teal-500", "border-l-cyan-500", "border-l-blue-500"];

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-muted/50",
          hasChildren && "cursor-pointer"
        )}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-90")} />
        ) : (
          <div className="w-4" />
        )}
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium">{partner.code}</span>
            <Badge
              className={cn(
                "text-[10px] px-1.5",
                partner.status === "active"
                  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {partner.status === "active" ? "Активен" : partner.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{new Date(partner.created_at).toLocaleDateString("ru-RU")}</span>
            <span className="font-medium text-foreground">{Number(partner.total_earned).toLocaleString("ru-RU")} ₽</span>
            {clientsCount > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{clientsCount}</span>}
            {hasChildren && <span className="flex items-center gap-1"><Network className="w-3 h-3" />{childrenNodes.length}</span>}
          </div>
        </div>
      </div>

      {open && hasChildren && (
        <div className={cn("ml-6 border-l-2 pl-4 space-y-1 mt-1", levelColors[level + 1] || "border-l-muted")}>
          {childrenNodes.map(({ partner: cp, children: cc, clientsCount: ccl }) => (
            <TreeNodeFull
              key={cp.id}
              partner={cp}
              level={level + 1}
              clientsCount={ccl}
              childrenNodes={cc.map(c3 => ({ partner: c3, children: [], clientsCount: 0 }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
