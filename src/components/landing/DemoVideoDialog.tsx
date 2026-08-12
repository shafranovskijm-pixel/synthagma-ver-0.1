import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LANDING_DEMO_KINESCOPE_ID } from "@/constants/landing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoVideoDialog({ open, onOpenChange }: Props) {
  const src = `https://kinescope.io/embed/${LANDING_DEMO_KINESCOPE_ID}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-0">
        <div className="sr-only">
          <DialogTitle>Демо СИНТАГМЫ</DialogTitle>
        </div>
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          {LANDING_DEMO_KINESCOPE_ID ? (
            <iframe
              src={src}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; clipboard-write; screen-wake-lock"
              allowFullScreen
              frameBorder={0}
              className="absolute inset-0 w-full h-full"
              title="Демо СИНТАГМЫ"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm px-6 text-center">
              Видео скоро появится. Добавьте ID Kinescope-видео
              в <code className="mx-1 px-1 rounded bg-white/10">src/constants/landing.ts</code>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
