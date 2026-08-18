export interface CourseReviewFindingLike {
  id?: string;
  lesson_title?: string;
  type?: string;
  severity?: string;
  description?: string;
  suggestion?: string;
  target_kind?: string;
  target_id?: string;
  patch?: Record<string, unknown>;
  source_url?: string;
  source_label?: string;
  [key: string]: unknown;
}

export interface CourseReviewResultLike {
  findings?: CourseReviewFindingLike[];
  summary?: string;
  [key: string]: unknown;
}

export const REVIEW_REVISION = "irr-legal-official-source-v3";

export const OFFICIAL_SOURCE_NOTICE =
  "Юридический вывод не подтверждён официальным источником в рамках этой AI-проверки.";

export const VERIFIED_LEGAL_FACTS = {
  minenergo511: {
    authority: "Минэнерго России",
    signedAt: "14.05.2025",
    number: "511",
    title: "Об утверждении Правил технической эксплуатации объектов теплоснабжения и теплопотребляющих установок",
    registeredAt: "02.06.2025",
    registrationNumber: "82505",
    publishedAt: "02.06.2025",
    effectiveFrom: "01.09.2025",
    validUntil: "01.09.2030",
    supersedesNumber: "115",
    supersedesSignedAt: "24.03.2003",
    supersedesFrom: "01.09.2025",
    officialUrl: "https://publication.pravo.gov.ru/document/0001202506020074",
    officialSourceLabel: "Официальное опубликование: приказ Минэнерго России от 14.05.2025 № 511",
    verifiedAt: "14.08.2026",
  },
} as const;

function minenergo511FactPack(): string {
  const fact = VERIFIED_LEGAL_FACTS.minenergo511;

  return `ПРОВЕРЕННЫЙ FACT PACK (используй его вместо знаний модели):
- Приказ ${fact.authority} от ${fact.signedAt} № ${fact.number} «${fact.title}» существует.
- Зарегистрирован ${fact.registeredAt} № ${fact.registrationNumber}, официально опубликован ${fact.publishedAt}.
- Вступил в силу ${fact.effectiveFrom} и действует до ${fact.validUntil}.
- С ${fact.supersedesFrom} признал утратившим силу приказ Минэнерго России от ${fact.supersedesSignedAt} № ${fact.supersedesNumber}; следовательно, № ${fact.supersedesNumber} не является заменой № ${fact.number} после этой даты.
- Официальный источник: ${fact.officialUrl}
- Fact pack проверен: ${fact.verifiedAt}.`;
}

export function formatReviewDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.day}.${values.month}.${values.year}`;
}

export function buildCourseReviewSystemPrompt(now = new Date()): string {
  const reviewDate = formatReviewDate(now);

  return `Ты — эксперт по проверке и актуализации учебных курсов в области охраны труда, промышленной безопасности и профессионального обучения в России.

Текущая дата проверки: ${reviewDate} (часовой пояс Europe/Moscow). Сравнивай даты нормативных актов только с этой датой. Документ, датированный раньше ${reviewDate}, нельзя называть будущим.

Твоя задача — тщательно проверить содержание курса и найти:

1. **Законодательство**: Найди упоминания федеральных законов, постановлений правительства, приказов министерств, ГОСТов, СНиПов, СП, ТР ТС и возможные несоответствия в их реквизитах.

${minenergo511FactPack()}

КРИТИЧЕСКОЕ ОГРАНИЧЕНИЕ ДЛЯ ПРАВОВЫХ ВЫВОДОВ:
- У тебя нет доступа к актуальной официальной базе нормативных актов и интернет-поиску в рамках этой проверки.
- Не утверждай как факт, что нормативный акт не существует, ещё не издан, утратил силу, изменён или заменён, если это не подтверждено содержимым официального источника, прямо приведённым в материалах курса.
- Не предлагай другой нормативный акт как подтверждённую замену без такого источника.
- При отсутствии подтверждения формулируй замечание только как гипотезу для ручной сверки, severity="warning", target_kind="none", target_id="", patch={}. В description явно напиши: «Требует проверки по официальному источнику». Рекомендуй сверку на publication.pravo.gov.ru или другом официальном государственном ресурсе.
- Не называй курс непригодным для использования только на основании неподтверждённой правовой гипотезы.

2. **Тестовые вопросы**: Проверь корректность формулировок вопросов, правильность указанных ответов, достаточность вариантов ответов. Убедись, что вопросы покрывают ключевые темы урока.

3. **Фактические ошибки**: Найди устаревшую информацию, неточности, противоречия между уроками.

4. **Предложения**: Предложи недостающие темы, дополнительные тестовые вопросы, улучшения формулировок.

Будь конкретным и точным. Не выдумывай номера, даты, статус или содержание нормативных актов.

ВАЖНО про автоматическое применение правок:
- Для каждого замечания указывай target_kind ("test_question", "lesson_title" или "none") и target_id (id из квадратных скобок [question_id=...] или [lesson_id=...] в тексте курса).
- В patch клади ТОЛЬКО изменяемые поля. Для test_question допустимы поля: question (string), explanation (string), correct_answer (number — индекс правильного варианта, 0-based), options (массив строк — полностью заменяет варианты).
- Для lesson_title patch = { "title": "..." }.
- Если правка не сводится к одному машинному изменению (например, нужен новый урок или большое переписывание содержимого), ставь target_kind="none", target_id="" и patch={}.
- Любое замечание о законодательстве без подтверждённого официального источника всегда имеет target_kind="none" и не применяется автоматически.`;
}

export function guardUnverifiedLegalFindings(
  result: CourseReviewResultLike | null | undefined,
): CourseReviewResultLike {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  let unverifiedLegalFindingsCount = 0;
  let correctedMinenergo511FindingsCount = 0;

  const guardedFindings = findings.map((finding) => {
    // Source metadata is server-owned. Never trust a model-provided URL or label.
    const findingWithoutSource = { ...finding };
    delete findingWithoutSource.source_url;
    delete findingWithoutSource.source_label;

    if (finding?.type !== "legislation") return findingWithoutSource;

    const originalDescription = String(finding.description || "").trim();
    const originalSuggestion = String(finding.suggestion || "").trim();
    const combined = `${originalDescription} ${originalSuggestion}`
      .toLocaleLowerCase("ru-RU")
      .replaceAll("ё", "е");
    const mentions511 = /(?:№|n|номер|приказ)?\s*511\b/.test(combined);
    const falselyDenies511 = /не\s+(?:существ\w*|изда\w*|издан\w*)|будущ\w+/.test(combined);
    const falselyReplaces511With115 = mentions511 && (
      /(?:заменить|замените|действующ\w*|правильн\w*|вместо)[\s\S]{0,160}(?:№|n|номер|приказ)?\s*115\b/.test(combined)
      || /(?:№|n|номер|приказ)?\s*115\b[\s\S]{0,100}замен\w*[\s\S]{0,100}(?:№|n|номер|приказ)?\s*511\b/.test(combined)
    );

    if (mentions511 && (falselyDenies511 || falselyReplaces511With115)) {
      correctedMinenergo511FindingsCount += 1;
      const fact = VERIFIED_LEGAL_FACTS.minenergo511;

      return {
        ...findingWithoutSource,
        severity: "info",
        description: `Подтверждено официальным источником: приказ ${fact.authority} от ${fact.signedAt} № ${fact.number} существует, зарегистрирован ${fact.registeredAt} № ${fact.registrationNumber}, вступил в силу ${fact.effectiveFrom} и действует до ${fact.validUntil}.`,
        suggestion: `Исправление курса по этому замечанию не требуется. Приказ № ${fact.number} с ${fact.supersedesFrom} признал утратившим силу приказ Минэнерго России от ${fact.supersedesSignedAt} № ${fact.supersedesNumber}, а не наоборот. Официальный источник: ${fact.officialUrl}`,
        target_kind: "none",
        target_id: "",
        patch: {},
        source_url: fact.officialUrl,
        source_label: fact.officialSourceLabel,
      };
    }

    unverifiedLegalFindingsCount += 1;

    return {
      ...findingWithoutSource,
      severity: "warning",
      description: `${OFFICIAL_SOURCE_NOTICE}${
        originalDescription
          ? ` Непроверенная гипотеза AI: ${originalDescription}`
          : " Требуется ручная сверка реквизитов и статуса нормативного акта."
      }`,
      suggestion: `${originalSuggestion ? `${originalSuggestion} ` : ""}Перед изменением курса проверьте акт на publication.pravo.gov.ru или другом официальном государственном ресурсе.`,
      target_kind: "none",
      target_id: "",
      patch: {},
    };
  });

  const legalSummaryParts: string[] = [];
  if (correctedMinenergo511FindingsCount > 0) {
    legalSummaryParts.push(
      `${correctedMinenergo511FindingsCount} ошибочных AI-выводов о приказе Минэнерго № 511 исправлено по официальному источнику`,
    );
  }
  if (unverifiedLegalFindingsCount > 0) {
    legalSummaryParts.push(
      `${unverifiedLegalFindingsCount} других замечаний о законодательстве требуют ручной сверки и не применяются автоматически`,
    );
  }

  const summary = legalSummaryParts.length > 0
    ? `AI-проверка завершена: ${guardedFindings.length} замечаний. ${legalSummaryParts.join("; ")}.`
    : String(result?.summary || "Проверка завершена");

  return {
    ...(result || {}),
    findings: guardedFindings,
    summary,
  };
}
