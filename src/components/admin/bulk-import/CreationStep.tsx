import { CheckCircle2} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface Props {
  current: number;
  total: number;
  currentName: string;
  completed: string[];
}

export function CreationStep({ current, total, currentName, completed }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const isDone = current >= total;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-8 space-y-6">
          <div className="text-center">
            {isDone ? (
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            ) : (
              <SigmaSpinner size="xl" className="mx-auto mb-3" />
            )}
            <h3 className="text-lg font-display font-semibold">
              {isDone ? "Все курсы созданы!" : "Создание курсов..."}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isDone
                ? `Успешно создано ${total} курсов`
                : `${current} из ${total} — ${currentName}`}
            </p>
          </div>

          <Progress value={pct} className="h-3" />

          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary">{pct}%</Badge>
            <span className="text-xs text-muted-foreground">
              {current} / {total}
            </span>
          </div>
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="max-h-48 overflow-auto space-y-1">
              {completed.map((name, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
