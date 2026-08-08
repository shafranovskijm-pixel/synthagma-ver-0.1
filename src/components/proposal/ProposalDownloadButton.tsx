import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateProposalPdf } from "@/lib/proposal/generateProposalPdf";
import { PROPOSAL_ONLINE_PATH } from "@/lib/proposal/proposalContent";

interface Props {
  label?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  /** Показать безопасную ссылку-фолбэк «Открыть КП онлайн». */
  withOnlineLink?: boolean;
  onlineLinkClassName?: string;
}

/**
 * Общая кнопка скачивания единого КП. Скачивает PDF сразу, с любой страницы,
 * без обязательного перехода на /proposal/platform.
 */
export function ProposalDownloadButton({
  label = "Скачать КП PDF",
  size = "default",
  variant = "default",
  className,
  withOnlineLink = false,
  onlineLinkClassName,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await generateProposalPdf();
      toast.success("PDF коммерческого предложения готов");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось сформировать PDF. Откройте КП онлайн.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={handleClick}
        disabled={busy}
        aria-label="Скачать коммерческое предложение в формате PDF"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Готовим PDF…" : label}
      </Button>
      {withOnlineLink && (
        <Link
          to={PROPOSAL_ONLINE_PATH}
          className={onlineLinkClassName ?? "inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:no-underline"}
          aria-label="Открыть коммерческое предложение онлайн"
        >
          Открыть КП онлайн
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
