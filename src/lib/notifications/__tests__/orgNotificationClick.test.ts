import { describe, it, expect, vi } from "vitest";
import { handleNotificationClick } from "../orgNotificationClick";

const courseFallbackPath = (id: string) => `/organization?tab=course-details&courseId=${id}`;

function deps(markAsRead: (id: string) => Promise<unknown> | unknown) {
  const navigate = vi.fn();
  const close = vi.fn();
  const onMarkError = vi.fn();
  const setSessionItem = vi.fn();
  return { navigate, close, onMarkError, setSessionItem, markAsRead, courseFallbackPath };
}

describe("handleNotificationClick", () => {
  it("открывает карточку ученика даже если markAsRead отклонён (новый payload)", async () => {
    const d = deps(() => Promise.reject(new Error("rls denied")));
    const target = handleNotificationClick(
      { id: "n1", type: "course_completed", user_id: "u-9", related_id: "c-1" },
      d,
    );
    expect(target).toBe("/organization?tab=student-details&studentId=u-9");
    expect(d.navigate).toHaveBeenCalledWith("/organization?tab=student-details&studentId=u-9");
    expect(d.close).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(d.onMarkError).toHaveBeenCalled();
  });

  it("legacy payload без user_id ведёт на курс, ошибка отметки не блокирует", async () => {
    const d = deps(() => Promise.reject(new Error("boom")));
    const target = handleNotificationClick(
      { id: "n2", type: "course_completed", user_id: null, related_id: "c-1" },
      d,
    );
    expect(target).toBe("/organization?tab=course-details&courseId=c-1");
    expect(d.navigate).toHaveBeenCalledWith(target!);
    await new Promise((r) => setTimeout(r, 0));
    expect(d.onMarkError).toHaveBeenCalled();
  });

  it("синхронный throw в markAsRead тоже не мешает переходу", () => {
    const d = deps(() => { throw new Error("sync"); });
    handleNotificationClick({ id: "n3", type: "course_completed", user_id: "u-1" }, d);
    expect(d.navigate).toHaveBeenCalledWith("/organization?tab=student-details&studentId=u-1");
    expect(d.onMarkError).toHaveBeenCalled();
  });

  it("успешный markAsRead: навигация и отметка", async () => {
    const mark = vi.fn().mockResolvedValue(undefined);
    const d = deps(mark);
    handleNotificationClick({ id: "n4", type: "course_completed", user_id: "u-2" }, d);
    expect(mark).toHaveBeenCalledWith("n4");
    expect(d.onMarkError).not.toHaveBeenCalled();
  });

  it("уведомление без цели не навигирует, но отмечает прочитанным", () => {
    const d = deps(vi.fn());
    const target = handleNotificationClick({ id: "n5", type: "course_completed" }, d);
    expect(target).toBeNull();
    expect(d.navigate).not.toHaveBeenCalled();
    expect(d.markAsRead).toBeDefined();
  });

  it("signature кладёт openSignatureId и открывает документы", () => {
    const d = deps(vi.fn());
    const target = handleNotificationClick({ id: "n6", type: "signature", related_id: "s-1" }, d);
    expect(d.setSessionItem).toHaveBeenCalledWith("openSignatureId", "s-1");
    expect(target).toBe("/organization?tab=org-documents");
  });

  it("subscription_expiry ведёт на счёт", () => {
    const d = deps(vi.fn());
    expect(handleNotificationClick({ id: "n7", type: "subscription_expiry", related_id: "inv-1" }, d))
      .toBe("/invoice/inv-1");
  });
});
