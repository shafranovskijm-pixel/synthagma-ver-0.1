import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadPlatformContractPdf, printPlatformContract } from "@/lib/platform-contract";
import type { PlatformContractDraft } from "@/lib/platform-contract";

interface Props {
  draft: PlatformContractDraft;
  label?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  /** Показать дополнительную кнопку «Распечатать». */
  withPrint?: boolean;
  printClassName?: string;
}

/** Общая кнопка скачивания PDF проекта договора. */
export function PlatformContractDownloadButton({
  draft,
  label = "Скачать проект PDF",
  size = "default",
  variant = "default",
  className,
  withPrint = false,
  printClassName,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      await downloadPlatformContractPdf(draft);
      toast.success("PDF проекта договора готов");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось сформировать PDF. Попробуйте распечатать проект.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={handleDownload}
        disabled={busy}
        aria-label="Скачать проект договора в формате PDF"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? "Готовим PDF…" : label}
      </Button>
      {withPrint && (
        <Button
          type="button"
          size={size}
          variant="outline"
          className={printClassName}
          onClick={() => printPlatformContract(draft)}
          aria-label="Распечатать проект договора"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Распечатать
        </Button>
      )}
    </div>
  );
}
