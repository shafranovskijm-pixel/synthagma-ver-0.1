import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? "docs/course-library/csz-178h/candidate-manifest.json";

if (!sourcePath) {
  throw new Error("Usage: node scripts/build-csz-course-library-candidate.mjs <source-manifest.json> [output.json]");
}

const repoRoot = process.cwd();
const verificationPath = resolve(
  repoRoot,
  "docs/course-library/csz-178h/resource-verification-2026-09-03.json",
);
const [source, verification] = await Promise.all([
  readFile(resolve(sourcePath), "utf8").then(JSON.parse),
  readFile(verificationPath, "utf8").then(JSON.parse),
]);

if (source.official_resources?.length !== 8 || source.manufacturer_resources?.length !== 20) {
  throw new Error("Source manifest must contain exactly 8 official and 20 manufacturer candidates");
}
if (verification.resources?.length !== 28) {
  throw new Error("Verification register must contain exactly 28 entries");
}

const sources = [
  ...source.official_resources.map((resource, index) => ({
    id: index + 1,
    set: "official",
    category: "legal_acts",
    module_no: null,
    source_name: "Официальный государственный источник",
    ...resource,
  })),
  ...source.manufacturer_resources.map((resource, index) => ({
    id: index + 9,
    set: "manufacturer",
    category: "manufacturer_guides",
    source_name: resource.vendor,
    ...resource,
  })),
];

const resources = sources.map((resource) => {
  const check = verification.resources.find((item) => item.id === resource.id);
  if (!check) throw new Error(`Missing verification row ${resource.id}`);
  return {
    candidate_id: `csz-178h-${String(resource.id).padStart(2, "0")}`,
    title: resource.name,
    category: resource.category,
    description: resource.note ?? "",
    source_name: resource.source_name,
    original_url: resource.url,
    proposed_url: check.recommended_url ?? resource.url,
    recommended_source_page: check.recommended_source_page ?? null,
    module_no: resource.module_no ?? null,
    edition_label: resource.checked_on ? `проверка источника ${resource.checked_on}` : null,
    last_checked_at: verification.checked_at,
    usage_basis: resource.set === "official" ? "official_open_source" : null,
    library_status: "needs_review",
    original_availability: check.http,
    proposed_availability: check.recommended_http ?? check.http,
    availability: check.recommended_http ?? check.http,
    source_class: check.source_class,
    reuse_signal: check.reuse_signal,
    verification_decision: check.decision,
    verification_note: check.note ?? null,
    import_action: "HOLD",
  };
});

const candidate = {
  schema_version: 1,
  generated_at: verification.checked_at,
  approval_status: "not_approved",
  import_ready: false,
  overall_decision: "NO_GO",
  target_course: {
    id: null,
    organization_id: "55c536f0-6024-4386-950e-d180a358e841",
    title: source.title,
    hours: source.hours?.total ?? 178,
    is_published: null,
    required_state: "unpublished",
    landing_content: {
      electronic_library: {
        enabled: true,
      },
    },
  },
  do_not_modify_course_ids: ["e3737d51-c092-4564-b2a6-4c9b86245ff4"],
  source_manifest: resolve(sourcePath),
  verification_register: verificationPath,
  verification_summary: verification.summary,
  resources,
  known_internal_candidates: [
    {
      title: "Методические материалы к практическим работам",
      path: "D:/Codex/ЗАДАЧИ/outputs/csz_refiling_20260902/01_на_подпись/05_Методические_материалы_к_практическим_работам_ДЛЯ_УТВЕРЖДЕНИЯ.pdf",
      category: "educational_materials",
      usage_basis: "own_material",
      library_status: "needs_review",
      import_action: "HOLD_UNTIL_APPROVED"
    },
    {
      title: "Фонд оценочных средств",
      path: "D:/Codex/ЗАДАЧИ/outputs/csz_refiling_20260902/01_на_подпись/04_Фонд_оценочных_средств_ДЛЯ_УТВЕРЖДЕНИЯ.pdf",
      category: "educational_materials",
      usage_basis: "own_material",
      library_status: "needs_review",
      import_action: "HOLD_UNTIL_APPROVED"
    }
  ],
  module_material_gaps: source.modules.map((module) => ({
    module_no: module.module_no,
    module_title: module.title,
    source_lesson_count: module.lessons?.length ?? 0,
    gap: "No separately approved library artifact and no target course module id",
  })),
  blockers: [
    "The new 178-hour course does not exist yet, so target_course.id and module ids are absent",
    "The source manifest and internal files are not approved",
    "Eight candidates remain HOLD: four unavailable official records, two unconfirmed videos, one TLS-unsafe manufacturer file and one retailer-hosted manual",
    "Four working official replacement URLs are confirmed but still require manifest approval before import",
    "Manufacturer and video rights require link-only decisions or separate confirmation",
    "Own educational materials are not yet mapped to target course module ids"
  ]
};

const absoluteOutput = resolve(repoRoot, outputPath);
await mkdir(dirname(absoluteOutput), { recursive: true });
await writeFile(absoluteOutput, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
console.log(`Wrote ${absoluteOutput}`);
console.log(`Decision: ${candidate.overall_decision}; resources: ${resources.length}; module gaps: ${candidate.module_material_gaps.length}`);
