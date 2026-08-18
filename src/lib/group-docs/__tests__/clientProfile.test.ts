import { describe, expect, it } from "vitest";
import {
  GORELTECH_ORGANIZATION_ID,
  resolveGroupDocumentClientProfile,
} from "../clientProfile";
import { buildRegistrationRowsFromFacts } from "../factualData";
import { GROUP_DOCUMENT_TYPE_MAP } from "../groupDocuments";
import { GROUP_DOCUMENT_TYPE_MAP as WORKSPACE_DOCUMENT_TYPE_MAP } from "../../groupDocuments";
import { buildVariables } from "../variables";
import type { GenerationContext } from "../schema";

function context(organizationName: string): GenerationContext {
  return {
    organization: {
      id: /ГОРЭЛТЕХ/i.test(organizationName) ? GORELTECH_ORGANIZATION_ID : "00000000-0000-4000-8000-000000000001",
      name: organizationName,
      inn: /ГОРЭЛТЕХ/i.test(organizationName) ? "7806541216" : "1234567890",
      kpp: "",
      ogrn: "",
      address: "690000, г. Владивосток, ул. Тестовая, д. 1",
      director_name: "Иванов Иван Иванович",
      director_position: "Директор",
    },
    group: {
      id: "group-1",
      name: "Группа 1",
      number: "1-ПК-26",
      start_date: "2026-01-13",
      end_date: "2026-01-16",
      program_title: "Тестовая программа",
      program_hours: 40,
      program_form: "очная",
      instructor_name: "Петров Пётр Петрович",
    },
    students: [{ user_id: "student-1", full_name: "Сидоров Сидор Сидорович" }],
  };
}

describe("профиль документов клиента", () => {
  it("изолирует формулировки ГОРЭЛТЕХ", () => {
    const goreltech = resolveGroupDocumentClientProfile({
      id: GORELTECH_ORGANIZATION_ID,
      name: 'ООО «Инжиниринговый центр «ГОРЭЛТЕХ»',
      inn: "7806541216",
    });
    expect(goreltech.key).toBe("goreltech");
    expect(goreltech.responsiblePersonFallback).toBe("Ляпко Дарья Константиновна");

    const generic = resolveGroupDocumentClientProfile({
      name: 'ЧОУ ДПО «Другая организация»',
      inn: "1234567890",
    });
    expect(generic.key).toBe("generic");
    expect(generic.responsiblePersonFallback).toBe("");
    expect(generic.shortName).not.toContain("ГОРЭЛТЕХ");

    const spoofed = resolveGroupDocumentClientProfile({
      id: "00000000-0000-4000-8000-000000000002",
      name: 'ООО «Похожее название ГОРЭЛТЕХ»',
      inn: "7806541216",
    });
    expect(spoofed.key).toBe("generic");

    const missingImmutableId = resolveGroupDocumentClientProfile({
      name: 'ООО «Инжиниринговый центр «ГОРЭЛТЕХ»',
      inn: "7806541216",
    });
    expect(missingImmutableId.key).toBe("generic");
  });

  it("не переносит ГОРЭЛТЕХ в титульный лист другой организации", () => {
    const vars = buildVariables(context('ЧОУ ДПО «Другая организация»'));
    expect(vars.org_title_header_html).toContain("Другая организация");
    expect(vars.org_title_header_html).not.toContain("ГОРЭЛТЕХ");
    expect(vars.org_city).toBe("Владивосток");
    expect(vars.instructor_short).toBe("П.П. Петров");
  });

  it("переносит в журнал двух преподавателей", () => {
    const source = context('ООО «Инжиниринговый центр «ГОРЭЛТЕХ»');
    source.group.instructor_name = "Петров Пётр Петрович; Иванов Иван Иванович";

    const vars = buildVariables(source);

    expect(vars.instructor_name).toBe("Петров Пётр Петрович; Иванов Иван Иванович");
    expect(vars.instructor_short).toBe("П.П. Петров; И.И. Иванов");
  });

  it("оставляет основание приказа пустым и берёт должность из карточки", () => {
    const goreltech = context('ООО «Инжиниринговый центр «ГОРЭЛТЕХ»');
    goreltech.organization.director_position = "Генеральный директор";
    const vars = buildVariables(goreltech);

    expect(vars.org_director_position).toBe("Генеральный директор");
    expect(vars.students_list_rows).not.toContain("Заявление");
    expect(vars.students_list_rows).not.toContain("Договор №");

    const generic = context('ЧОУ ДПО «Другая организация»');
    generic.organization.director_position = "Директор";
    expect(buildVariables(generic).org_director_position).toBe("Директор");
  });

  it("фиксирует ориентацию и честный статус девяти документов", () => {
    expect(GROUP_DOCUMENT_TYPE_MAP.enrollment_order.orientation).toBe("landscape");
    expect(GROUP_DOCUMENT_TYPE_MAP.expulsion_order.orientation).toBe("landscape");
    expect(GROUP_DOCUMENT_TYPE_MAP.registration_book.orientation).toBe("landscape");
    expect(GROUP_DOCUMENT_TYPE_MAP.class_journal.orientation).toBe("portrait");
    expect(WORKSPACE_DOCUMENT_TYPE_MAP.class_journal.orientation).toBe("portrait");
    expect(GROUP_DOCUMENT_TYPE_MAP.class_journal.status).toBe("ready");
    expect(GROUP_DOCUMENT_TYPE_MAP.student_list.orientation).toBe("portrait");
    expect(GROUP_DOCUMENT_TYPE_MAP.student_list.status).toBe("beta");
  });

  it("хранит город без второго префикса для титульного листа", () => {
    const goreltech = context('ООО «Инжиниринговый центр «ГОРЭЛТЕХ»');
    goreltech.organization.address = "";

    expect(buildVariables(goreltech).org_city).toBe("Санкт-Петербург");
  });

  it("объединяет серию и номер и переносит дату закрытия группы", () => {
    const rows = buildRegistrationRowsFromFacts([
      {
        full_name: "Сидоров Сидор Сидорович",
        document_type: "Удостоверение",
        document_series: "ПК",
        document_number: "000123",
        issue_date: "2026-01-16",
        order_number: "УЦ-2/2026",
      },
    ], "2026-01-16", "Тестовая программа");
    expect(rows).toContain("ПК 000123");
    expect(rows).toContain("16.01.2026");
    expect(rows).toContain("Тестовая программа");
    expect(rows).not.toContain("<td>ПК</td><td>000123</td>");
  });
});
