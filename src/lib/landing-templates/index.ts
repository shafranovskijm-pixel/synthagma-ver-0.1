import { auroraTemplate } from './aurora.ts';
import { beautyTemplate } from './beauty.ts';
import { safetyTemplate } from './safety.ts';
import { labTemplate } from './lab.ts';
import { languageTemplate } from './language.ts';
import { harmonyTemplate } from './harmony.ts';
import { mysticTemplate } from './mystic.ts';
import { maritimeTemplate } from './maritime.ts';
import { heavyMachineryTemplate } from './heavy-machinery.ts';
import type { LandingTemplate } from './types.ts';

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

export type { LandingTemplate, TemplateTier, TemplateCategory } from './types.ts';
