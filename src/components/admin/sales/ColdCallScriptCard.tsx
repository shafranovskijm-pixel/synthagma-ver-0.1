import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { coldCallScript, fillScriptTemplate, CALL_RESULTS, type CallResultKey } from '@/constants/coldCallScript';

interface Props {
  leadName?: string;
  managerName?: string;
  onQuickResult?: (result: CallResultKey) => void;
}

export function ColdCallScriptCard({ leadName, managerName, onQuickResult }: Props) {
  const [copied, setCopied] = useState(false);
  const [openObj, setOpenObj] = useState<number | null>(null);

  const handleCopy = async () => {
    const full = coldCallScript
      .map(tab => `## ${tab.title}\n${tab.items.map(i => (i.title ? `- ${i.title}: ` : '- ') + fillScriptTemplate(i.text, { leadName, managerName })).join('\n')}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      toast.success('Скрипт скопирован');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const quick: Array<{ key: CallResultKey; label: string; variant?: 'default' | 'outline' | 'destructive' }> = [
    { key: 'no_answer', label: 'Недозвон', variant: 'outline' },
    { key: 'not_interested', label: 'Неинтересно', variant: 'outline' },
    { key: 'callback_later', label: 'Перезвонить', variant: 'outline' },
    { key: 'interested', label: 'Есть интерес', variant: 'default' },
    { key: 'send_proposal', label: 'КП отправить', variant: 'default' },
    { key: 'demo_scheduled', label: 'Назначить демо', variant: 'default' },
  ];

  return (
    <div className="border rounded-xl bg-card">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm font-semibold">Скрипт звонка</div>
        <Button size="sm" variant="ghost" onClick={handleCopy} className="h-8">
          {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
          Скопировать
        </Button>
      </div>

      <Tabs defaultValue="start" className="p-3">
        <TabsList className="w-full grid grid-cols-4 h-9">
          {coldCallScript.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.title}</TabsTrigger>
          ))}
        </TabsList>

        {coldCallScript.map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="mt-3 space-y-2">
            {tab.key === 'objections'
              ? tab.items.map((it, i) => (
                <div key={i} className="border rounded-lg">
                  <button
                    onClick={() => setOpenObj(openObj === i ? null : i)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left hover:bg-muted/40"
                  >
                    <span>{it.title}</span>
                    {openObj === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openObj === i && (
                    <div className="px-3 pb-3 text-sm text-muted-foreground leading-relaxed">
                      {fillScriptTemplate(it.text, { leadName, managerName })}
                    </div>
                  )}
                </div>
              ))
              : tab.items.map((it, i) => (
                <div key={i} className="text-sm leading-relaxed p-2.5 rounded-lg bg-muted/40">
                  {fillScriptTemplate(it.text, { leadName, managerName })}
                </div>
              ))}
          </TabsContent>
        ))}
      </Tabs>

      {onQuickResult && (
        <div className="p-3 border-t">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Результат звонка</div>
          <div className="flex flex-wrap gap-1.5">
            {quick.map(q => (
              <Button
                key={q.key}
                size="sm"
                variant={q.variant || 'outline'}
                className="h-7 text-xs rounded-full"
                onClick={() => onQuickResult(q.key)}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer">Больше результатов</summary>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CALL_RESULTS.filter(r => !quick.find(q => q.key === r.key)).map(r => (
                <Button
                  key={r.key}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-full"
                  onClick={() => onQuickResult(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
