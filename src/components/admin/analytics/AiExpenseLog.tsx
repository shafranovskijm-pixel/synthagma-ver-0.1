import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Search, Sparkles } from "lucide-react";
import { RoleBadge } from "./RoleBadge";
import type { AiExpenseEntry } from "@/hooks/admin-analytics/selectors";

interface Props {
  entries: AiExpenseEntry[];
}

export function AiExpenseLog({ entries }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.userName.toLowerCase().includes(q)
      || e.orgName.toLowerCase().includes(q)
      || (e.role || "").toLowerCase().includes(q)
      || e.dayLabel.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const totals = useMemo(() => filtered.reduce(
    (acc, e) => ({ generations: acc.generations + e.generations, tokens: acc.tokens + e.tokens }),
    { generations: 0, tokens: 0 },
  ), [filtered]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Расход ИИ по дням
        </CardTitle>
        <CardDescription>
          Кто и из какой организации расходовал токены — с разбивкой по дням.
          Итого за выбранные строки: {totals.generations.toLocaleString("ru-RU")} ген. · {totals.tokens.toLocaleString("ru-RU")} ток.
        </CardDescription>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск: пользователь, организация, роль, дата..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[520px] w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Дата</TableHead>
                <TableHead className="whitespace-nowrap">Пользователь</TableHead>
                <TableHead className="whitespace-nowrap">Роль</TableHead>
                <TableHead className="whitespace-nowrap">Организация</TableHead>
                <TableHead className="text-right whitespace-nowrap">Генераций</TableHead>
                <TableHead className="text-right whitespace-nowrap">Токенов</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Нет расходов ИИ
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.key}>
                    <TableCell className="whitespace-nowrap text-xs">{e.dayLabel}</TableCell>
                    <TableCell className="font-medium text-sm">{e.userName}</TableCell>
                    <TableCell><RoleBadge role={e.role} /></TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{e.orgName}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.generations.toLocaleString("ru-RU")}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{e.tokens.toLocaleString("ru-RU")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
