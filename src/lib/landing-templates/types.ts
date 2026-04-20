import type { LandingData } from "@/hooks/useLandingEditor";

export type TemplateTier = "free" | "pro" | "premium";

export interface LandingTemplate {
  id: string;
  name: string;
  tagline: string;
  preview_image: string;
  accent_color: string;
  tier: TemplateTier;
  /** Partial data — поля будут смерджены поверх defaultLanding в useLandingEditor */
  data: Partial<LandingData>;
}
