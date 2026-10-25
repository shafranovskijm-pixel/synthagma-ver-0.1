import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContractLegalFaq } from "../ContractLegalFaq";
import { CATALOG_AS_OF, CATALOG_VERSION, LEGAL_SOURCES } from "@/lib/uc-compliance/catalog";
import { CONTRACT_SOURCE_EDITION_20261025 } from "@/lib/uc-compliance/contractSourceEdition20261025";

afterEach(cleanup);

function openSources() {
  render(<ContractLegalFaq />);
  fireEvent.click(screen.getByRole("button", { name: "Ссылки на нормативные акты" }));
}

describe("contract helper supplemental source evidence", () => {
  it("adds a checked research edition without promoting or replacing the historical catalogue", () => {
    expect(CATALOG_VERSION).toBe("uc-requirements-2026-10-18-v1");
    expect(CATALOG_AS_OF).toBe("2026-10-18");
    expect(LEGAL_SOURCES.education).toMatchObject({
      id: "LEGAL-01", checkedOn: "2026-10-18", reviewStatus: "needs_legal_review",
      primaryUrl: "https://publication.pravo.gov.ru/document/0001201212300007",
    });
    expect(LEGAL_SOURCES.paid).toMatchObject({
      id: "LEGAL-16", checkedOn: "2026-10-18", reviewStatus: "needs_legal_review",
      primaryUrl: "https://publication.pravo.gov.ru/document/0001202009210004",
    });
    expect(CONTRACT_SOURCE_EDITION_20261025.state).toBe("source_checked");
    expect(CONTRACT_SOURCE_EDITION_20261025.legalApproval).toBe("not_recorded");
    expect(CONTRACT_SOURCE_EDITION_20261025.historicalCatalogVersion).toBe(CATALOG_VERSION);
  });

  it("opens the three verified agency source pages and safe fulltext references from the actual helper", () => {
    openSources();
    expect(screen.getByRole("link", { name: "273-ФЗ «Об образовании в Российской Федерации»" })).toHaveAttribute(
      "href", "https://mchs.gov.ru/dokumenty/bazovye-normativnye-pravovye-akty/federalnye-zakony/7992",
    );
    expect(screen.getByRole("link", { name: "Правила платных образовательных услуг № 1441" })).toHaveAttribute(
      "href", "https://31.rospotrebnadzor.ru/kontrol-i-nadzor/nadzor-v-oblasti-zashchity-prav-potrebiteley/16677/",
    );
    expect(screen.getByRole("link", { name: "Закон РФ от 07.02.1992 № 2300-1 «О защите прав потребителей»" })).toHaveAttribute(
      "href", "https://31.rospotrebnadzor.ru/search/content/20382/",
    );
    expect(screen.getByRole("link", { name: "Копия Правил на сайте Роспотребнадзора" })).toHaveAttribute(
      "href", "https://31.rospotrebnadzor.ru/upload/iblock_content/49ecc323df0be0d1b632da1682db589a.docx",
    );
    expect(screen.getByRole("link", { name: "Официальное сообщение о продлении до 2032 года" })).toHaveAttribute(
      "href", "https://86.rospotrebnadzor.ru/news/prodlyon-srok-dejstviya-pravil-platnyix-obrazovatelnyix-uslug.html",
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(7);
    for (const link of links) {
      expect(new URL(link.getAttribute("href")!).protocol).toBe("https:");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("distinguishes the older rules copy, official extension news, and missing full amending text", () => {
    openSources();
    expect(screen.getByText(/копии, размещённой Роспотребнадзором 21\.04\.2023/)).toBeVisible();
    expect(screen.getByText(/прежний срок действия — до 31\.12\.2026/)).toBeVisible();
    expect(screen.getByText(/продление до 01\.09\.2032.*29\.08\.2026/)).toBeVisible();
    expect(screen.getByText(/Полный первичный текст постановления № 1053 в этой проверке не получен/)).toBeVisible();
    expect(screen.getByText(/Это не утверждение проекта договора/)).toBeVisible();
    expect(screen.getByText(/Следующий шаг: сопоставьте этот перечень/)).toBeVisible();
    expect(screen.queryByText(/подтверждённая ссылка для него не закреплена/)).toBeNull();
  });

  it("keeps fifteen preparation fields with the actual conditional terms instead of universal mandatory claims", () => {
    render(<ContractLegalFaq />);
    fireEvent.click(screen.getByRole("button", { name: "Поля для проверки проекта договора" }));
    expect(screen.getAllByText(/^(?:[1-9]|1[0-5])$/)).toHaveLength(15);
    expect(screen.getByText(/Перечень для подготовки по пункту 13 сохранённой копии/)).toBeVisible();
    expect(screen.getByText("Сведения о лицензии (орган, номер, дата), если законом не предусмотрено иное")).toBeVisible();
    expect(screen.getByText("Вид выдаваемого после успешного освоения программы документа (при наличии)")).toBeVisible();
    expect(screen.getByText("ФИО, место жительства и телефон обучающегося, если он не Заказчик (при наличии)")).toBeVisible();
    expect(screen.getByText(/либо ФИО исполнителя — ИП/)).toBeVisible();
    expect(screen.queryByText(/Полный договор соответствует всем требованиям/)).toBeNull();
  });
});
