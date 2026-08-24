import { describe, expect, it } from "vitest";
import {
  confirmedReadinessCount,
  isCompletedEnrollment,
  resolveDocumentsReadiness,
  resolveFrdoReadinessStage,
  resolveLearningReadiness,
  resolveParticipantsReadiness,
} from "../releaseReadiness";

const participants = ["u1", "u2"];

describe("group release readiness", () => {
  it("does not treat active enrollment as completed training", () => {
    const stage = resolveLearningReadiness({
      participantUserIds: participants,
      courseId: "course-1",
      enrollments: participants.map(user_id => ({
        user_id,
        status: "active",
        progress: 100,
        completed_at: null,
      })),
    });

    expect(stage.status).toBe("blocked");
    expect(stage.detail).toBe("0 из 2 завершили");
  });

  it("requires status, 100 percent progress and completion timestamp", () => {
    expect(isCompletedEnrollment({
      user_id: "u1",
      status: "completed",
      progress: 99,
      completed_at: "2026-08-25T00:00:00Z",
    })).toBe(false);
    expect(isCompletedEnrollment({
      user_id: "u1",
      status: "completed",
      progress: 100,
      completed_at: null,
    })).toBe(false);
    expect(isCompletedEnrollment({
      user_id: "u1",
      status: "completed",
      progress: 100,
      completed_at: "2026-08-25T00:00:00Z",
    })).toBe(true);
  });

  it("marks training ready only when every participant completed it", () => {
    const stage = resolveLearningReadiness({
      participantUserIds: participants,
      courseId: "course-1",
      enrollments: participants.map(user_id => ({
        user_id,
        status: "completed",
        progress: 100,
        completed_at: "2026-08-25T00:00:00Z",
      })),
    });

    expect(stage.status).toBe("ready");
    expect(stage.detail).toBe("2 из 2 завершили обучение");
  });

  it("never proves a Word package from a row count alone", () => {
    const stage = resolveDocumentsReadiness({
      missingFieldCount: 0,
      documentCount: 9,
      contractCount: 1,
    });

    expect(stage.status).toBe("attention");
    expect(stage.detail).toContain("пакет не проверен");
  });

  it("does not equate complete FRDO fields with a confirmed upload", () => {
    const stage = resolveFrdoReadinessStage({
      participantCount: 2,
      completeDataCount: 2,
    });

    expect(stage.status).toBe("attention");
    expect(stage.detail).toContain("выгрузка не подтверждена");
  });

  it("counts only evidence-backed ready stages", () => {
    expect(confirmedReadinessCount([
      resolveParticipantsReadiness(2),
      { status: "ready", detail: "Обучение завершено" },
      resolveDocumentsReadiness({ missingFieldCount: 0, documentCount: 9, contractCount: 1 }),
      resolveFrdoReadinessStage({ participantCount: 2, completeDataCount: 2 }),
    ])).toBe(2);
  });

  it("uses unknown instead of a false result when enrollment evidence failed", () => {
    expect(resolveLearningReadiness({
      participantUserIds: participants,
      courseId: "course-1",
      enrollments: [],
      evidenceError: true,
    }).status).toBe("unknown");
  });
});
