export const COURSE_LIBRARY_CATEGORIES = [
  "legal_acts",
  "educational_materials",
  "manufacturer_guides",
  "additional_resources",
] as const;

export type CourseLibraryCategory = (typeof COURSE_LIBRARY_CATEGORIES)[number];

export const LIBRARY_CATEGORIES = COURSE_LIBRARY_CATEGORIES;

export const LIBRARY_CATEGORY_LABELS: Record<CourseLibraryCategory, string> = {
  legal_acts: "Нормативные правовые акты",
  educational_materials: "Учебно-методические материалы",
  manufacturer_guides: "Инструкции и руководства изготовителей",
  additional_resources: "Дополнительные информационные ресурсы",
};

export const COURSE_LIBRARY_STATUSES = [
  "active",
  "needs_review",
  "archive",
] as const;

export type CourseLibraryStatus = (typeof COURSE_LIBRARY_STATUSES)[number];

export const LIBRARY_STATUSES = COURSE_LIBRARY_STATUSES;

export const LIBRARY_STATUS_LABELS: Record<CourseLibraryStatus, string> = {
  active: "действует",
  needs_review: "требует проверки",
  archive: "архив",
};

export const COURSE_LIBRARY_USAGE_BASES = [
  "official_open_source",
  "own_material",
  "rights_holder_permission",
] as const;

export type CourseLibraryUsageBasis = (typeof COURSE_LIBRARY_USAGE_BASES)[number];

export const LIBRARY_USAGE_BASES = COURSE_LIBRARY_USAGE_BASES;

export const LIBRARY_USAGE_BASIS_LABELS: Record<CourseLibraryUsageBasis, string> = {
  official_open_source: "официальный открытый источник",
  own_material: "собственный материал",
  rights_holder_permission: "разрешение правообладателя",
};

/**
 * Course-local feature gate for the electronic library. Existing courses do
 * not have this setting, so the strict `=== true` check keeps their learner
 * and organization interfaces unchanged by default.
 */
export function isCourseElectronicLibraryEnabled(landingContent: unknown): boolean {
  if (
    landingContent === null
    || typeof landingContent !== "object"
    || Array.isArray(landingContent)
  ) {
    return false;
  }

  const electronicLibrary = (landingContent as Record<string, unknown>).electronic_library;
  if (
    electronicLibrary === null
    || typeof electronicLibrary !== "object"
    || Array.isArray(electronicLibrary)
  ) {
    return false;
  }

  return (electronicLibrary as Record<string, unknown>).enabled === true;
}

export interface CourseElectronicLibraryViewState {
  enabled: boolean;
  requested: boolean;
  open: boolean;
  shouldClearRequestedView: boolean;
}

export function resolveCourseElectronicLibraryView(
  landingContent: unknown,
  requestedView: string | null,
): CourseElectronicLibraryViewState {
  const enabled = isCourseElectronicLibraryEnabled(landingContent);
  const requested = requestedView === "library";
  return {
    enabled,
    requested,
    open: enabled && requested,
    shouldClearRequestedView: requested && !enabled,
  };
}

export interface CourseLibraryResourceInput {
  id: string;
  courseId: string;
  name: string;
  category: CourseLibraryCategory;
  description: string;
  sourceName: string;
  externalUrl?: string | null;
  internalFilePath?: string | null;
  moduleId?: string | null;
  moduleName?: string | null;
  documentDateOrEdition: string;
  lastCheckedAt: string;
  usageBasis: CourseLibraryUsageBasis;
  status: CourseLibraryStatus;
  displayOrder?: number | null;
}

export interface CourseLibraryResource {
  id: string;
  courseId: string;
  name: string;
  category: CourseLibraryCategory;
  description: string;
  sourceName: string;
  externalUrl: string | null;
  internalFilePath: string | null;
  moduleId: string | null;
  moduleName: string | null;
  documentDateOrEdition: string;
  lastCheckedAt: string;
  usageBasis: CourseLibraryUsageBasis;
  status: CourseLibraryStatus;
  displayOrder: number;
}

/** Minimal structural contract shared by domain records and API view models. */
export interface CourseLibraryListResource {
  category: CourseLibraryCategory;
  moduleId?: string | null;
  name?: string;
  title?: string;
  displayOrder?: number | null;
  sortOrder?: number | null;
  id?: string;
  assignmentId?: string;
  libraryDocumentId?: string;
}

export interface CourseLibraryCsvResource extends CourseLibraryListResource {
  description?: string | null;
  sourceName: string;
  externalUrl?: string | null;
  internalFilePath?: string | null;
  storagePath?: string | null;
  moduleName?: string | null;
  moduleTitle?: string | null;
  documentDateOrEdition?: string | null;
  editionLabel?: string | null;
  lastCheckedAt?: string | null;
  usageBasis: CourseLibraryUsageBasis;
  status: CourseLibraryStatus;
}

export class CourseLibraryValidationError extends Error {
  readonly field: keyof CourseLibraryResourceInput | "resourceLocation";

  constructor(
    field: keyof CourseLibraryResourceInput | "resourceLocation",
    message: string,
  ) {
    super(message);
    this.name = "CourseLibraryValidationError";
    this.field = field;
  }
}

const categoryOrder = new Map<CourseLibraryCategory, number>(
  COURSE_LIBRARY_CATEGORIES.map((category, index) => [category, index]),
);

const russianCollator = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});

function requireTrimmedString(
  value: unknown,
  field: keyof CourseLibraryResourceInput,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CourseLibraryValidationError(field, `Поле «${field}» обязательно.`);
  }

  return value.trim();
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requireFixedValue<T extends string>(
  value: unknown,
  values: readonly T[],
  field: keyof CourseLibraryResourceInput,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new CourseLibraryValidationError(
      field,
      `Недопустимое значение поля «${field}».`,
    );
  }

  return value as T;
}

/**
 * Accepts only an absolute HTTPS URL without credentials or whitespace/control
 * characters. The narrow contract prevents browser-normalized values such as
 * `https:example.org` from being treated as valid external resources.
 */
export function isStrictHttpsUrl(value: unknown): value is string {
  const containsControlOrWhitespace = typeof value === "string"
    && [...value].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x20 || code === 0x7f;
    });
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || containsControlOrWhitespace
    || !/^https:\/\//iu.test(value)
  ) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.length > 0
      && url.username.length === 0
      && url.password.length === 0;
  } catch {
    return false;
  }
}

export function normalizeStrictHttpsUrl(value: string): string {
  const normalized = value.trim();
  if (!isStrictHttpsUrl(normalized)) {
    throw new CourseLibraryValidationError(
      "externalUrl",
      "Внешний ресурс должен иметь корректную абсолютную HTTPS-ссылку без логина и пароля.",
    );
  }

  return new URL(normalized).href;
}

export function normalizeCourseLibraryResource(
  input: Readonly<CourseLibraryResourceInput>,
): CourseLibraryResource {
  const externalUrl = optionalTrimmedString(input.externalUrl);
  const internalFilePath = optionalTrimmedString(input.internalFilePath);

  if ((externalUrl === null) === (internalFilePath === null)) {
    throw new CourseLibraryValidationError(
      "resourceLocation",
      "Укажите ровно один источник: внешнюю HTTPS-ссылку или внутренний файл.",
    );
  }

  const displayOrder = input.displayOrder ?? 0;
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 0) {
    throw new CourseLibraryValidationError(
      "displayOrder",
      "Порядок отображения должен быть неотрицательным целым числом.",
    );
  }

  const moduleId = optionalTrimmedString(input.moduleId);

  return {
    id: requireTrimmedString(input.id, "id"),
    courseId: requireTrimmedString(input.courseId, "courseId"),
    name: requireTrimmedString(input.name, "name"),
    category: requireFixedValue(input.category, COURSE_LIBRARY_CATEGORIES, "category"),
    description: requireTrimmedString(input.description, "description"),
    sourceName: requireTrimmedString(input.sourceName, "sourceName"),
    externalUrl: externalUrl === null ? null : normalizeStrictHttpsUrl(externalUrl),
    internalFilePath,
    moduleId,
    moduleName: moduleId === null ? null : optionalTrimmedString(input.moduleName),
    documentDateOrEdition: requireTrimmedString(
      input.documentDateOrEdition,
      "documentDateOrEdition",
    ),
    lastCheckedAt: requireTrimmedString(input.lastCheckedAt, "lastCheckedAt"),
    usageBasis: requireFixedValue(
      input.usageBasis,
      COURSE_LIBRARY_USAGE_BASES,
      "usageBasis",
    ),
    status: requireFixedValue(input.status, COURSE_LIBRARY_STATUSES, "status"),
    displayOrder,
  };
}

function getListResourceOrder(resource: CourseLibraryListResource): number {
  const value = resource.displayOrder ?? resource.sortOrder ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function getListResourceName(resource: CourseLibraryListResource): string {
  return resource.name ?? resource.title ?? "";
}

function getListResourceId(resource: CourseLibraryListResource): string {
  return resource.id
    ?? resource.assignmentId
    ?? resource.libraryDocumentId
    ?? "";
}

export function sortLibraryResources<T extends CourseLibraryListResource>(
  resources: readonly T[],
): T[] {
  return [...resources].sort((left, right) => {
    const categoryDifference = (categoryOrder.get(left.category) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(right.category) ?? Number.MAX_SAFE_INTEGER);
    if (categoryDifference !== 0) return categoryDifference;

    const orderDifference = getListResourceOrder(left) - getListResourceOrder(right);
    if (orderDifference !== 0) return orderDifference;

    const nameDifference = russianCollator.compare(
      getListResourceName(left),
      getListResourceName(right),
    );
    if (nameDifference !== 0) return nameDifference;

    return russianCollator.compare(getListResourceId(left), getListResourceId(right));
  });
}

export function filterResourcesByModule<T extends Pick<CourseLibraryListResource, "moduleId">>(
  resources: readonly T[],
  moduleId?: string | null,
): T[] {
  const normalizedModuleId = optionalTrimmedString(moduleId);
  if (normalizedModuleId === null || normalizedModuleId === "all") return [...resources];

  return resources.filter(resource => (
    resource.moduleId == null || resource.moduleId === normalizedModuleId
  ));
}

export function sortCourseLibraryResources(
  resources: readonly CourseLibraryResource[],
): CourseLibraryResource[] {
  return sortLibraryResources(resources);
}

export function normalizeCourseLibraryResources(
  resources: readonly Readonly<CourseLibraryResourceInput>[],
): CourseLibraryResource[] {
  return sortCourseLibraryResources(resources.map(normalizeCourseLibraryResource));
}

/**
 * A module view always includes materials assigned to the whole course. Passing
 * an empty module means "all modules" and returns the complete sorted list.
 */
export function filterCourseLibraryResourcesByModule(
  resources: readonly Readonly<CourseLibraryResourceInput>[],
  moduleId?: string | null,
): CourseLibraryResource[] {
  const normalizedResources = normalizeCourseLibraryResources(resources);
  return filterResourcesByModule(normalizedResources, moduleId);
}

export const COURSE_LIBRARY_CSV_HEADERS = [
  "Название",
  "Категория",
  "Краткое описание",
  "Организация или автор источника",
  "Ссылка HTTPS либо внутренний файл",
  "Связанный модуль курса",
  "Дата или редакция документа",
  "Дата последней проверки доступности",
  "Основание использования",
  "Статус",
  "Порядок отображения",
] as const;

export interface CourseLibraryCsvOptions {
  delimiter?: "," | ";" | "\t";
  includeBom?: boolean;
  lineEnding?: "\n" | "\r\n";
}

function protectSpreadsheetFormula(value: string): string {
  const withoutNullBytes = value.replaceAll("\u0000", "");
  const normalizedLineEndings = withoutNullBytes.replace(/\r\n?/gu, "\n");

  return /^[\t ]*[=+\-@]/u.test(normalizedLineEndings)
    ? `'${normalizedLineEndings}`
    : normalizedLineEndings;
}

function escapeCsvCell(value: string | number): string {
  const protectedValue = protectSpreadsheetFormula(String(value));
  return `"${protectedValue.replace(/"/gu, '""')}"`;
}

export function exportCourseLibraryResourcesToCsv(
  resources: readonly Readonly<CourseLibraryResourceInput>[],
  options: Readonly<CourseLibraryCsvOptions> = {},
): string {
  return courseLibraryToCsv(normalizeCourseLibraryResources(resources), options);
}

export function courseLibraryToCsv(
  resources: readonly Readonly<CourseLibraryCsvResource>[],
  options: Readonly<CourseLibraryCsvOptions> = {},
): string {
  const delimiter = options.delimiter ?? ";";
  const lineEnding = options.lineEnding ?? "\r\n";
  const includeBom = options.includeBom ?? true;
  const sortedResources = sortLibraryResources(resources);

  const rows: Array<readonly (string | number)[]> = [
    COURSE_LIBRARY_CSV_HEADERS,
    ...sortedResources.map(resource => {
      const externalUrl = optionalTrimmedString(resource.externalUrl);
      const internalFilePath = optionalTrimmedString(
        resource.internalFilePath ?? resource.storagePath,
      );
      if (externalUrl !== null && internalFilePath !== null) {
        throw new CourseLibraryValidationError(
          "resourceLocation",
          "Укажите ровно один источник: внешнюю HTTPS-ссылку или внутренний файл.",
        );
      }

      const location = externalUrl !== null
        ? normalizeStrictHttpsUrl(externalUrl)
        : internalFilePath ?? "Недоступно";

      return [
        requireTrimmedString(resource.name ?? resource.title, "name"),
        LIBRARY_CATEGORY_LABELS[
          requireFixedValue(resource.category, COURSE_LIBRARY_CATEGORIES, "category")
        ],
        optionalTrimmedString(resource.description) ?? "",
        requireTrimmedString(resource.sourceName, "sourceName"),
        location,
        optionalTrimmedString(resource.moduleName ?? resource.moduleTitle)
          ?? optionalTrimmedString(resource.moduleId)
          ?? "",
        optionalTrimmedString(
          resource.documentDateOrEdition ?? resource.editionLabel,
        ) ?? "",
        optionalTrimmedString(resource.lastCheckedAt) ?? "",
        LIBRARY_USAGE_BASIS_LABELS[
          requireFixedValue(resource.usageBasis, COURSE_LIBRARY_USAGE_BASES, "usageBasis")
        ],
        LIBRARY_STATUS_LABELS[
          requireFixedValue(resource.status, COURSE_LIBRARY_STATUSES, "status")
        ],
        getListResourceOrder(resource),
      ];
    }),
  ];

  const csv = rows
    .map(row => row.map(escapeCsvCell).join(delimiter))
    .join(lineEnding);

  return includeBom ? `\uFEFF${csv}` : csv;
}

// Concise integration exports used by the organization and learner adapters.
export const isValidHttpsUrl = isStrictHttpsUrl;
