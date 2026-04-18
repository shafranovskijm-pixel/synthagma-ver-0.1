import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { PEP_AGREEMENT_VERSION } from "@/constants/pepAgreementTemplate";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agreementText: string;
  /** Если задан — внизу попапа появится кнопка «Я ознакомился(ась)», которая закроет попап и вызовет onAccept. */
  onAccept?: () => void;
}

/**
 * Полноэкранный модал с текстом Соглашения об использовании ПЭП.
 * Используется и в режиме «просто почитать», и в режиме «принять условия».
 */
export function PepAgreementDialog({ open, onOpenChange, agreementText, onAccept }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Соглашение об использовании простой электронной подписи
          </DialogTitle>
          <DialogDescription className="text-xs">
            Версия {PEP_AGREEMENT_VERSION} · в соответствии с 63-ФЗ «Об электронной подписи»
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4 max-h-[65vh]">
          <pre className="text-[13px] whitespace-pre-wrap font-sans leading-relaxed text-foreground">
            {agreementText}
          </pre>
        </ScrollArea>

        <div className="border-t p-4 flex items-center justify-between gap-2 bg-muted/30">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Принимая соглашение, вы признаёте юридическую силу подписей, проставленных на платформе.
          </p>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
            {onAccept && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  onAccept();
                  onOpenChange(false);
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Я ознакомился(ась) и принимаю
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
