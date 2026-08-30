import { describe, expect, it } from "vitest";
import {
  createDemoTelegramMetadata,
  demoNotificationMessage,
  DEMO_NOTIFICATION_KIND,
  DEMO_NOTIFICATION_TYPE,
  isDemoNotificationRecord,
  parseDemoTelegramMetadata,
} from "./telegramDelivery";

const REQUEST_ID = "8df1b898-b788-4ce2-a689-9a470eae5cf1";

describe("demo Telegram durable delivery metadata", () => {
  it("creates an explicit pending record before the first attempt", () => {
    expect(createDemoTelegramMetadata(REQUEST_ID, "message")).toEqual({
      kind: DEMO_NOTIFICATION_KIND,
      request_id: REQUEST_ID,
      telegram_status: "pending",
      telegram_message: "message",
      attempt_count: 0,
      last_attempt_at: null,
      delivered_at: null,
      failure_code: null,
    });
  });

  it("rejects unrelated or malformed admin notifications", () => {
    const metadata = createDemoTelegramMetadata(REQUEST_ID, "message");
    expect(isDemoNotificationRecord({
      id: REQUEST_ID,
      related_entity_id: REQUEST_ID,
      type: DEMO_NOTIFICATION_TYPE,
      metadata,
    })).toBe(true);
    expect(isDemoNotificationRecord({
      id: REQUEST_ID,
      related_entity_id: "other",
      type: DEMO_NOTIFICATION_TYPE,
      metadata,
    })).toBe(false);
    expect(parseDemoTelegramMetadata({ ...metadata, telegram_status: "unknown" })).toBeNull();
  });

  it("normalizes unsafe counters without accepting an invalid payload", () => {
    const parsed = parseDemoTelegramMetadata({
      ...createDemoTelegramMetadata(REQUEST_ID, "message"),
      attempt_count: -4,
    });
    expect(parsed?.attempt_count).toBe(0);
  });

  it("never labels pending or in-progress delivery as sent", () => {
    expect(demoNotificationMessage("pending")).toContain("ожидает");
    expect(demoNotificationMessage("sending")).toContain("выполняется");
    expect(demoNotificationMessage("failed")).toContain("не доставил");
    expect(demoNotificationMessage("sent")).toContain("доставлено");
  });
});
