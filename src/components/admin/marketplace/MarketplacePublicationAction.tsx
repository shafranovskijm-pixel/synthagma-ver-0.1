import { Button } from "@/components/ui/button";
import { ownPlatformPublicationTarget, publicationReadinessLabel, type PublicationReadiness } from "@/lib/platformCoursePublication";

export interface PublicationControls {
  readinessByCourse: Record<string, PublicationReadiness>;
  onReview: (item: unknown) => void;
  busy: boolean;
}
export function MarketplacePublicationAction({ item, controls }: { item: unknown; controls?: PublicationControls }) {
  const target = ownPlatformPublicationTarget(item);
  if (!target || !controls) return null;
  const readiness = controls.readinessByCourse[target.courseId];
  return <div className="text-xs text-muted-foreground">
    <Button variant="link" size="sm" className="h-auto p-0 text-left text-xs" disabled={controls.busy} onClick={() => controls.onReview(item)}>
      {readiness ? publicationReadinessLabel(readiness) : "Досье и выпуск редакции"}
    </Button>
  </div>;
}
