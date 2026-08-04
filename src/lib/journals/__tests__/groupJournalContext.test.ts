import { describe, it, expect } from "vitest";
import {
  filterByGroupContext,
  resolveGroupGateState,
  isGroupSupportedJournal,
  countUnlinkedRows,
  type GroupJournalContext,
} from "../groupJournalContext";

const ready = (over: Partial<GroupJournalContext> = {}): GroupJournalContext => ({
  groupId: "g1",
  courseId: "c1",
  memberUserIds: ["u1", "u2"],
  status: "ready",
  ...over,
});

interface Row { user_id: string | null; course_id: string | null }
const rows: Row[] = [
  { user_id: "u1", course_id: "c1" }, // группа 1, курс группы
  { user_id: "u2", course_id: "c1" },
  { user_id: "u1", course_id: "c2" }, // тот же ученик, другой курс
  { user_id: "u9", course_id: "c1" }, // другая группа
  { user_id: null, course_id: "c1" }, // не связано с учеником
];

const sel = { userId: (r: Row) => r.user_id, courseId: (r: Row) => r.course_id };

describe("groupJournalContext", () => {
  it("без контекста группы возвращает строки без изменений", () => {
    expect(filterByGroupContext(rows, null, sel)).toHaveLength(rows.length);
  });

  it("две группы одного курса не смешиваются", () => {
    const res = filterByGroupContext(rows, ready(), sel);
    expect(res.map((r) => r.user_id)).toEqual(["u1", "u2"]);
  });

  it("два курса одного ученика не смешиваются", () => {
    const res = filterByGroupContext(rows, ready(), sel);
    expect(res.every((r) => r.course_id === "c1")).toBe(true);
  });

  it("loading никогда не показывает данные организации", () => {
    expect(filterByGroupContext(rows, ready({ memberUserIds: null, status: "loading" }), sel)).toEqual([]);
    // даже если состав уже пришёл, но статус ещё loading
    expect(filterByGroupContext(rows, ready({ status: "loading" }), sel)).toEqual([]);
  });

  it("error никогда не показывает чужие строки", () => {
    expect(filterByGroupContext(rows, ready({ status: "error" }), sel)).toEqual([]);
  });

  it("строки без user_id отбрасываются и считаются как несвязанные", () => {
    const res = filterByGroupContext(rows, ready(), sel);
    expect(res.some((r) => r.user_id === null)).toBe(false);
    expect(countUnlinkedRows(rows, ready(), sel.userId)).toBe(1);
  });

  it("без courseId в контексте курс не фильтруется", () => {
    const res = filterByGroupContext(rows, ready({ courseId: null }), sel);
    expect(res).toHaveLength(3);
  });

  it("смена контекста обновляет фильтр состава", () => {
    const other = filterByGroupContext(rows, ready({ groupId: "g2", memberUserIds: ["u9"] }), sel);
    expect(other.map((r) => r.user_id)).toEqual(["u9"]);
  });

  it("gate: журналы без привязки к ученику блокируются в контексте группы", () => {
    expect(resolveGroupGateState("copies_duplicates", ready())).toBe("unsupported");
    expect(resolveGroupGateState("strict_forms", ready())).toBe("unsupported");
    expect(resolveGroupGateState("custom_123", ready())).toBe("unsupported");
    expect(isGroupSupportedJournal("attendance")).toBe(true);
  });

  it("gate: состояния loading/error/ready/none различаются", () => {
    expect(resolveGroupGateState("attendance", null)).toBe("none");
    expect(resolveGroupGateState("attendance", ready({ memberUserIds: null, status: "loading" }))).toBe("loading");
    expect(resolveGroupGateState("attendance", ready({ status: "error" }))).toBe("error");
    expect(resolveGroupGateState("attendance", ready())).toBe("ready");
    // состав ещё не загружен → всё равно loading
    expect(resolveGroupGateState("final_attestation", ready({ memberUserIds: null }))).toBe("loading");
  });

  it("группа без участников не показывает ничего", () => {
    expect(filterByGroupContext(rows, ready({ memberUserIds: [] }), sel)).toEqual([]);
  });
});
