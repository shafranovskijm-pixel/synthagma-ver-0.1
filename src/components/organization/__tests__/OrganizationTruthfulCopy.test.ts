import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("truthful organization copy", () => {
  it("describes FRDO actions as file preparation rather than direct submission", () => {
    const manager = read("src/components/organization/FRDOManager.tsx");
    const sidebar = read("src/components/organization/OrgSidebar.tsx");
    const students = read("src/components/organization/tabs/StudentsTab.tsx");
    const managerHook = read("src/hooks/useFRDOManager.ts");

    expect(manager).toContain("Подготовка файлов и проверка данных");
    expect(manager).toContain("Отправить администратору СИНТАГМЫ");
    expect(manager).not.toContain(">Отправить в ФРДО<");
    expect(sidebar).toContain("Подготовка XLSX для последующей загрузки в ФИС ФРДО");
    expect(students).toContain("Подготовить файл для ФРДО");
    expect(students).not.toContain(">Экспорт в ФРДО<");
    expect(managerHook).toContain("admin_org_messages");
  });

  it("qualifies XLSX readiness and legal applicability", () => {
    const sanitizer = read("src/components/organization/FrdoFileSanitizerDialog.tsx");
    const documents = read("src/components/organization/tabs/DocumentsTab.tsx");
    const organizationDocuments = read("src/components/organization/OrgDocumentsManager.tsx");
    const journals = read("src/components/organization/JournalsManager.tsx");

    expect(sanitizer).toContain("Это не гарантирует принятие файла ФИС ФРДО");
    expect(sanitizer).not.toMatch(/эталонный шаблон Рособрнадзора|Файл готов к загрузке в ФИС ФРДО|Оригинальный шаблон ФИС ФРДО/);
    expect(documents).toContain("проверьте их применимость к вашим программам");
    expect(documents).not.toContain("Обязательные документы организации по 273-ФЗ");
    expect(organizationDocuments).toContain("Базовый набор документов для ДПО и ПО");
    expect(journals).toContain("Базовые журналы");
    expect(journals).not.toContain("Обязательные журналы");
  });

  it("warns that inbox testing creates real data", () => {
    const testInbox = read("src/components/organization/documents/TestInboxButton.tsx");

    expect(testInbox).toContain("реальная тестовая запись");
    expect(testInbox).toContain("реальную запись в журнале подписаний");
    expect(testInbox).not.toContain("не повлияет на реальные данные");
    expect(testInbox).not.toContain("должен прилететь realtime");
  });

  it("links the organization footer to an existing agreement route", () => {
    const footer = read("src/components/organization/OrgDashboardFooter.tsx");

    expect(footer).toContain('href="/documents/user-agreement"');
    expect(footer).not.toContain('href="/terms"');
  });
});
