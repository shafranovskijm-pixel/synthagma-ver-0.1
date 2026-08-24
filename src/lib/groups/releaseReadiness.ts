export type ProofStatus = "ready" | "attention" | "blocked" | "unknown";

export interface ReadinessStage {
  status: ProofStatus;
  detail: string;
}

export interface EnrollmentEvidence {
  user_id: string;
  status?: string | null;
  progress?: number | null;
  completed_at?: string | null;
}

export interface LearningReadiness extends ReadinessStage {
  enrolledCount: number;
  completedCount: number;
}

function uniqueParticipants(userIds: string[]): Set<string> {
  return new Set(userIds.filter(Boolean));
}

export function isCompletedEnrollment(row: EnrollmentEvidence): boolean {
  return row.status === "completed"
    && Number(row.progress) >= 100
    && Boolean(row.completed_at);
}

export function resolveParticipantsReadiness(participantCount: number): ReadinessStage {
  if (participantCount <= 0) {
    return { status: "blocked", detail: "Добавьте учеников" };
  }
  return { status: "ready", detail: `${participantCount} активных участников` };
}

export function resolveLearningReadiness(input: {
  participantUserIds: string[];
  courseId: string | null;
  enrollments: EnrollmentEvidence[];
  evidenceError?: boolean;
}): LearningReadiness {
  const participants = uniqueParticipants(input.participantUserIds);
  const total = participants.size;

  if (total === 0) {
    return {
      status: "blocked",
      detail: "Сначала добавьте учеников",
      enrolledCount: 0,
      completedCount: 0,
    };
  }
  if (!input.courseId) {
    return {
      status: "blocked",
      detail: "Курс не привязан",
      enrolledCount: 0,
      completedCount: 0,
    };
  }
  if (input.evidenceError) {
    return {
      status: "unknown",
      detail: "Не удалось подтвердить обучение",
      enrolledCount: 0,
      completedCount: 0,
    };
  }

  const enrolled = new Set<string>();
  const completed = new Set<string>();
  for (const row of input.enrollments) {
    if (!participants.has(row.user_id)) continue;
    enrolled.add(row.user_id);
    if (isCompletedEnrollment(row)) completed.add(row.user_id);
  }

  const enrolledCount = enrolled.size;
  const completedCount = completed.size;
  if (enrolledCount < total) {
    return {
      status: "blocked",
      detail: `${enrolledCount} из ${total} зачислено`,
      enrolledCount,
      completedCount,
    };
  }
  if (completedCount < total) {
    return {
      status: "blocked",
      detail: `${completedCount} из ${total} завершили`,
      enrolledCount,
      completedCount,
    };
  }
  return {
    status: "ready",
    detail: `${completedCount} из ${total} завершили обучение`,
    enrolledCount,
    completedCount,
  };
}

/**
 * Количество строк само по себе не доказывает полный актуальный Word-пакет.
 * До проверки типов, версии, batch, файла и SHA такой этап остаётся attention.
 */
export function resolveDocumentsReadiness(input: {
  missingFieldCount: number;
  documentCount: number;
  contractCount: number;
  evidenceError?: boolean;
}): ReadinessStage {
  if (input.evidenceError) {
    return { status: "unknown", detail: "Не удалось подтвердить документы" };
  }
  if (input.missingFieldCount > 0) {
    return {
      status: "blocked",
      detail: `${input.missingFieldCount} полей не заполнено`,
    };
  }
  if (input.documentCount <= 0) {
    return { status: "blocked", detail: "Пакет ещё не сформирован" };
  }
  if (input.contractCount <= 0) {
    return { status: "blocked", detail: "Договоры не сформированы" };
  }
  return {
    status: "attention",
    detail: `${input.documentCount} документов · пакет не проверен`,
  };
}

/** Заполненные реквизиты — ещё не доказательство выгрузки или отправки в ФИС ФРДО. */
export function resolveFrdoReadinessStage(input: {
  participantCount: number;
  completeDataCount: number;
  evidenceError?: boolean;
}): ReadinessStage {
  if (input.evidenceError) {
    return { status: "unknown", detail: "Не удалось подтвердить данные ФРДО" };
  }
  if (input.participantCount <= 0) {
    return { status: "blocked", detail: "Сначала добавьте учеников" };
  }
  if (input.completeDataCount < input.participantCount) {
    return {
      status: "blocked",
      detail: `${input.completeDataCount} из ${input.participantCount} данных заполнено`,
    };
  }
  return {
    status: "attention",
    detail: `${input.completeDataCount} из ${input.participantCount} данных заполнено · выгрузка не подтверждена`,
  };
}

export function confirmedReadinessCount(stages: ReadinessStage[]): number {
  return stages.filter(stage => stage.status === "ready").length;
}
