import { auroraTemplate } from "./aurora";
import { beautyTemplate } from "./beauty";
import { safetyTemplate } from "./safety";
import { labTemplate } from "./lab";
import { languageTemplate } from "./language";
import { harmonyTemplate } from "./harmony";
import { mysticTemplate } from "./mystic";
import { maritimeTemplate } from "./maritime";
import { heavyMachineryTemplate } from "./heavy-machinery";
import type { LandingTemplate } from "./types";

export const LANDING_TEMPLATES: LandingTemplate[] = [
  auroraTemplate,
  beautyTemplate,
  safetyTemplate,
  labTemplate,
  languageTemplate,
  harmonyTemplate,
  mysticTemplate,
  maritimeTemplate,
  heavyMachineryTemplate,
];

export type { LandingTemplate, TemplateTier, TemplateCategory } from "./types";
