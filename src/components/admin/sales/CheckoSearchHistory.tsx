import { useState } from 'react';
import { History, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCheckoSearch } from '@/hooks/useCheckoSearch';
import { regionName } from '@/data/russianRegions';
import { licenseName } from '@/data/checkoLicenseTypes';

export function CheckoSearchHistory() {
  const { runs } = useCheckoSearch();
  const [expanded, setExpanded] = useState(false);

  const items = (runs.data || []).slice(0, expanded ? 50 : 5);

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">История подборов</h4>
            <Badge variant="secondary">{runs.data?.length ?? 0}</Badge>
          </div>
          {(runs.data?.length ?? 0) > 5 && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)} className="gap-1 text-xs">
              {expanded ? <>Свернуть <ChevronUp className="w-3 h-3" /></> : <>Все <ChevronDown className="w-3 h-3" /></>}
            </Button>
          )}
        </div>

        {runs.isLoading ? (
          <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Подборов ещё не было</div>
        ) : (
          <div className="space-y-2">
            {items.map(r => (
              <div key={r.id} className="text-xs p-2 rounded border bg-muted/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('ru-RU')}
                  </span>
                  <div className="flex gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">найдено {r.found_count}</Badge>
                    {r.enriched_count > 0 && <Badge className="text-[10px]">обогащено {r.enriched_count}</Badge>}
                    {r.queued_count > 0 && <Badge variant="outline" className="text-[10px]">в очереди {r.queued_count}</Badge>}
                    <Badge variant="outline" className="text-[10px]">поиск × {r.search_requests_used}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.licenses.slice(0, 4).map(l => (
                    <span key={l} className="text-muted-foreground">{licenseName(l)}</span>
                  ))}
                  {r.licenses.length > 4 && <span className="text-muted-foreground">+{r.licenses.length - 4}</span>}
                  {r.regions.length > 0 && (
                    <span className="text-muted-foreground">
                      · {r.regions.slice(0, 3).map(c => regionName(c)).join(', ')}
                      {r.regions.length > 3 ? ` +${r.regions.length - 3}` : ''}
                    </span>
                  )}
                </div>
                {r.error_message && <div className="text-destructive text-xs">{r.error_message}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
