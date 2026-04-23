import { Button } from "@/components/ui/button";
import { Download, Printer, Share2 } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { toast } from "sonner";

interface Props {
  onDownload: () => void;
  isExporting?: boolean;
}

export function PlatformProposalHeader({ onDownload, isExporting }: Props) {
  const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Коммерческое предложение — Синтагма", url });
      } catch {
        // ignored
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована");
    }
  };

  return (
    <header className="proposal-print-hide mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="mb-3 flex items-center gap-3">
          <SigmaLogo className="h-10 w-10 text-accent" />
          <div>
            <div className="font-display text-xl font-medium tracking-tight">Синтагма</div>
            <div className="text-xs text-muted-foreground">Образовательная платформа</div>
          </div>
        </div>
        <div className="mt-2 text-xs uppercase tracking-widest text-accent">Коммерческое предложение</div>
        <div className="mt-1 text-sm text-muted-foreground">Дата формирования: {today}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onDownload} disabled={isExporting} className="gap-2">
          <Download className="h-4 w-4" />
          {isExporting ? "Готовим PDF…" : "Скачать PDF"}
        </Button>
        <Button variant="outline" onClick={handleShare} className="gap-2">
          <Share2 className="h-4 w-4" />
          Поделиться
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" />
          Распечатать
        </Button>
      </div>
    </header>
  );
}
