// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PLATFORM_CONTACTS as contacts, officialSupportContactReply, guardSupportContactAnswer, hasUnapprovedSupportContact, supportMessagesFromLatest } from "./platform-support-contacts";

describe("published platform contact policy", () => {
  it.each(["Как с вами связаться?", "Какой ваш телефон?", "Дайте контакты поддержки", "Номер Максима", "Как написать Максиму Шафрановскому?", "Контакты"])("answers the actual contact request: %s", text => {
    const answer = officialSupportContactReply(text)!;
    expect(answer).toContain(contacts.primaryPhone.display);
    expect(answer).toContain(contacts.secondaryPhone.display);
    expect(answer).toContain(contacts.supportEmail);
  });
  it("uses the public owner email only for owner contact requests", () => {
    expect(officialSupportContactReply("Как связаться с Максимом Шафрановским?")).toContain(contacts.ownerEmail);
    expect(officialSupportContactReply("Контакты поддержки")).not.toContain(contacts.ownerEmail);
    expect(officialSupportContactReply("Дай телефон Максима Иванова")).not.toContain(contacts.ownerEmail);
  });
  it.each(["Как изменить телефон ученика?", "Не приходит письмо на почту", "Почему не открывается курс с телефона?", "Как поменять мой email?", "Какой номер протокола?", "Как добавить курс?"])("leaves ordinary help to the normal path: %s", text => {
    expect(officialSupportContactReply(text)).toBeNull();
  });
  it.each(["Телефон ученика Максима", "Дайте телефон моей организации"])("declines private contact retrieval without attributing platform contacts: %s", text => {
    const answer = officialSupportContactReply(text)!;
    expect(answer).toContain("недоступны");
    expect(answer).not.toContain(contacts.ownerEmail);
    expect(answer).not.toContain(contacts.primaryPhone.display);
  });
  it.each(["Звоните 8 (800) 555-35-35", "Телефон: (495) 123-45-67", "Телефон: 9991234567", "Почта: fake@example.org", "Пишите https://t.me/fake_support", "Пишите t.me/fake_support", "Пишите @fake_support", "Контакты: https://fake.example.org", "[9991234567](tel:89147213424)", "[8 (914) 721-34-24](tel:89247213424)"])("blocks an invented or mismatched contact: %s", answer => {
    expect(hasUnapprovedSupportContact(answer)).toBe(true);
    expect(guardSupportContactAnswer(answer)).toBe(officialSupportContactReply("Контакты"));
  });
  it.each(["8 (914) 721-34-24; +7 924 721 34 24", "Телефон: (914) 721-34-24", "[8 (914) 721-34-24](tel:89147213424)", "support@sintagma.com.ru; shafranovskij.m@gmail.com", "Telegram: https://t.me/+SVTbxqnGmF1iMzIy", "Контакты: https://синтагма.рф/help", "ДПО 72 часа, 35/41 колонка, 54-ФЗ, 19.10.2026, тариф 10000 рублей", "Инструкция: https://docs.example.org/course/35"])("preserves valid contacts and ordinary answers: %s", answer => {
    expect(guardSupportContactAnswer(answer)).toBe(answer);
  });
  it("keeps the latest context chronological and appends this exact question once even if absent from the window", () => {
    const rows = Array.from({ length: 25 }, (_, n) => ({ id: String(25 - n), role: n % 2 ? "ai" : "user", content: "turn " + (25 - n) }));
    const result = supportMessagesFromLatest(rows, "current", "CURRENT question");
    expect(result).toHaveLength(20);
    expect(result[0].content).toBe("turn 7");
    expect(result.at(-1)).toEqual({ role: "user", content: "CURRENT question" });
    expect(supportMessagesFromLatest([{ id: "current", role: "user", content: "CURRENT question" }, ...rows], "current", "CURRENT question")).toEqual(result);
  });
});
