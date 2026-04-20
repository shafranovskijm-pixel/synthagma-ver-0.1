import { auroraTemplate } from "./aurora";
import { beautyTemplate } from "./beauty";
import { safetyTemplate } from "./safety";
import { labTemplate } from "./lab";
import { languageTemplate } from "./language";
import type { LandingTemplate } from "./types";

export const LANDING_TEMPLATES: LandingTemplate[] = [
  auroraTemplate,
  beautyTemplate,
  safetyTemplate,
  labTemplate,
  languageTemplate,
];

export type { LandingTemplate, TemplateTier, TemplateCategory } from "./types";
