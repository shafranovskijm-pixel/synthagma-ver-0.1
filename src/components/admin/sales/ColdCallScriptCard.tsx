import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  coldCallScript,
  shortScript30s,
  fillScriptTemplate,
  CALL_RESULTS,
  type CallResultKey,
  type ScriptContext,
} from '@/constants/coldCallScript';

interface Props {
  /** Название компании. */
  companyName?: string;
  /** Alias — оставлен для обратной совместимости. */
  leadName?: string;
  managerName?: string;
  contactName?: string;
  phone?: string;
  onQuickResult?: (result: CallResultKey) => void;
}

function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setOk(true);
      setTimeout(() => setOk(false), 1200);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };
  return (
    <button
      onClick={copy}
      className={
        'shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground ' +
        'hover:bg-muted hover:text-foreground transition ' + (className ?? '')
      }
      title="Скопировать реплику"
      type="button"
    >
      {ok ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function ColdCallScriptCard({
  companyName,
  leadName,
  managerName,
  contactName,
  phone,
  onQuickResult,
}: Props) {
  const ctx: ScriptContext = { companyName: companyName ?? leadName, managerName, contactName, phone };
  const [copiedAll, setCopiedAll] = useState(false);
  const [openObj, setOpenObj] = useState<number | null>(null);
  const [openShort, setOpenShort] = useState(false);

  const fill = (t: string) => fillScriptTemplate(t, ctx);

  const handleCopyAll = async () => {
    const parts = coldCallScript.map(tab => {
      const lines = tab.items.map(it => {
        const head = it.title ? `• ${it.title}: ${fill(it.text)}` : `• ${fill(it.text)}`;
        const fu = (it.followUps || []).map(f => `   ↳ ${f.title ? f.title + ': ' : ''}${fill(f.text)}`).join('\n');
        return fu ? `${head}\n${fu}` : head;
      });
      return `## ${tab.title}\n${lines.join('\n')}`;
    });
    const full = parts.join('\n\n') + `\n\n## Скрипт на 30 секунд\n${shortScript30s.map(l => '• ' + fill(l)).join('\n')}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopiedAll(true);
      toast.success('Весь скрипт скопирован');
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const quick: Array<{ key: CallResultKey; label: string; variant?: 'default' | 'outline' | 'destructive' }> = [
    { key: 'no_answer',      label: 'Не дозвонился',        variant: 'outline' },
    { key: 'gatekeeper',     label: 'Не ЛПР',               variant: 'outline' },
    { key: 'not_interested', label: 'Не актуально',         variant: 'outline' },
    { key: 'interested',     label: 'Есть интерес',         variant: 'default' },
    { key: 'send_info',      label: 'Отправить информацию', variant: 'default' },
    { key: 'demo_scheduled', label: 'Назначить демо',       variant: 'default' },
    { key: 'callback_later', label: 'Перезвонить',          variant: 'outline' },
    { key: 'blacklist',      label: 'Чёрный список',        variant: 'outline' },
  ];

  const contactFio = (contactName || '').trim();

  return (
    <div className="border rounded-xl bg-card">
      <div className="flex items-center justify-between gap-2 p-3 border-b">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Скрипт звонка</div>
          {contactFio ? (
            <div className="text-[11px] text-muted-foreground truncate">
              ЛПР: <span className="text-foreground font-medium">{contactFio}</span>
            </div>
          ) : (
            <div className="text-[11px] text-amber-600">
              ФИО ЛПР не указано — уточните у секретаря
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={handleCopyAll} className="h-8 shrink-0">
          {copiedAll ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
          Скопировать весь скрипт
        </Button>
      </div>

      <Tabs defaultValue="lpr" className="p-3">
        <TabsList className="w-full grid grid-cols-5 h-9">
          {coldCallScript.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.title}</TabsTrigger>
          ))}
        </TabsList>

        {coldCallScript.map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="mt-3 space-y-2">
            {tab.key === 'objections'
              ? tab.items.map((it, i) => {
                const open = openObj === i;
                return (
                  <div key={i} className="border rounded-lg">
                    <button
                      onClick={() => setOpenObj(open ? null : i)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left hover:bg-muted/40"
                      type="button"
                    >
                      <span>{it.title}</span>
                      {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="flex items-start gap-2 text-sm leading-relaxed p-2.5 rounded-md bg-muted/40">
                          <div className="flex-1">{fill(it.text)}</div>
                          <CopyBtn text={fill(it.text)} />
                        </div>
                        {(it.followUps || []).map((f, j) => (
                          <div key={j} className="flex items-start gap-2 text-sm leading-relaxed p-2.5 rounded-md bg-muted/20 border border-dashed">
                            <div className="flex-1">
                              {f.title && <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{f.title}</div>}
                              <div>{fill(f.text)}</div>
                            </div>
                            <CopyBtn text={fill(f.text)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
              : tab.items.map((it, i) => (
                <div key={i} className="flex items-start gap-2 text-sm leading-relaxed p-2.5 rounded-lg bg-muted/40">
                  <div className="flex-1">{fill(it.text)}</div>
                  <CopyBtn text={fill(it.text)} />
                </div>
              ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Скрипт на 30 секунд */}
      <div className="border-t">
        <button
          type="button"
          onClick={() => setOpenShort(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
        >
          <span>Скрипт на 30 секунд</span>
          {openShort ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {openShort && (
          <div className="px-3 pb-3 space-y-1.5">
            {shortScript30s.map((line, i) => (
              <div key={i} className="flex items-start gap-2 text-sm leading-relaxed p-2 rounded-md bg-muted/30">
                <div className="flex-1">{fill(line)}</div>
                <CopyBtn text={fill(line)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {onQuickResult && (
        <div className="p-3 border-t">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Итог звонка</div>
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
