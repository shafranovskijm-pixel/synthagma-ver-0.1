import { auroraTemplate } from "./aurora";
import { beautyTemplate } from "./beauty";
import { safetyTemplate } from "./safety";
import type { LandingTemplate } from "./types";

export const LANDING_TEMPLATES: LandingTemplate[] = [
  auroraTemplate,
  beautyTemplate,
  safetyTemplate,
];

export type { LandingTemplate, TemplateTier, TemplateCategory } from "./types";
