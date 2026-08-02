import { describe, expect, it } from "vitest";
import { groupCourseDefaults, resolveUniqueCommonCourseId, verifySavedSettings } from "../groupSettings";

describe("group course defaults", () => {
  it("предзаполняет группу данными выбранного курса", () => {
    expect(groupCourseDefaults({
      id: "course-1",
      title: "Проектирование",
      duration: "72 часа",
      frdo_duration_hours: 256,
      training_form: "Заочная с ДОТ",
    })).toEqual({
      course_id: "course-1",
      program_title: "Проектирование",
      program_hours: 256,
      program_form: "Заочная с ДОТ",
    });
  });

  it("не записывает фиктивные значения без курса", () => {
    expect(groupCourseDefaults(null)).toEqual({
      course_id: null,
      program_title: null,
      program_hours: null,
      program_form: null,
    });
  });
});

describe("unique common course fallback", () => {
  it("возвращает курс только если он общий для всех учеников и единственный", () => {
    expect(resolveUniqueCommonCourseId([
      { user_id: "u1", course_id: "c1" },
      { user_id: "u2", course_id: "c1" },
      { user_id: "u1", course_id: "c2" },
    ], ["u1", "u2"])).toBe("c1");
  });

  it("не выбирает самый частый курс, если он есть не у всей группы", () => {
    expect(resolveUniqueCommonCourseId([
      { user_id: "u1", course_id: "c1" },
      { user_id: "u2", course_id: "c1" },
      { user_id: "u3", course_id: "c2" },
    ], ["u1", "u2", "u3"])).toBeNull();
  });

  it("не угадывает, если у всех учеников два общих курса", () => {
    expect(resolveUniqueCommonCourseId([
      { user_id: "u1", course_id: "c1" },
      { user_id: "u2", course_id: "c1" },
      { user_id: "u1", course_id: "c2" },
      { user_id: "u2", course_id: "c2" },
    ], ["u1", "u2"])).toBeNull();
  });
});

describe("saved group settings verification", () => {
  const patch = {
    course_id: "course-1",
    start_date: "2026-08-03",
    end_date: "2026-08-07",
    group_number: "ДЕМО-02/2026",
    program_title: "Проектирование",
    program_hours: "32",
    program_form: "Очная",
    default_price: "15000",
  };

  it("проверяет точное равенство всех документных полей", () => {
    expect(verifySavedSettings(patch, {
      course_id: "course-1",
      start_date: "2026-08-03",
      end_date: "2026-08-07",
      group_number: "ДЕМО-02/2026",
      program_title: "Проектирование",
      program_hours: 32,
      program_form: "Очная",
      default_price: 15000,
    })).toEqual([]);
  });

  it("возвращает поля с отличающимися значениями", () => {
    expect(verifySavedSettings(patch, {
      course_id: null,
      start_date: null,
      end_date: "2026-08-08",
      group_number: "ДРУГОЙ",
      program_title: null,
      program_hours: 16,
      program_form: "Заочная",
      default_price: 0,
    })).toEqual([
      "course_id", "start_date", "end_date", "group_number",
      "program_title", "program_hours", "program_form", "default_price",
    ]);
  });
});
