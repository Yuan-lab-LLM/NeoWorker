import { describe, it, expect } from "vitest";
import { getAutomationDeliveryDetail, needsDeliveryAttention } from "./automation-delivery";
import { applyPersistedLanguage } from "../i18n";
describe("automation delivery receipts", () => {
  it("distinguishes a sent approval notice from the final result", () => {
    applyPersistedLanguage("zh-CN");
    const receipt = { channelType: "weixin", status: "needs_user_action", deliverableStatus: "sent" };
    expect(getAutomationDeliveryDetail({ status: "completed" }, receipt)).toContain("未发送");
    expect(needsDeliveryAttention({ status: "completed" }, receipt)).toBe(true);
  });
  it("shows sent, retry and failure independently of executor completion", () => {
    applyPersistedLanguage("zh-CN");
    expect(getAutomationDeliveryDetail({ status: "completed" }, { channelType: "weixin", status: "ok", deliverableStatus: "sent" })).toBe("结果已发送到微信");
    expect(getAutomationDeliveryDetail({ status: "completed" }, { channelType: "weixin", deliverableStatus: "queued" })).toContain("重试");
    expect(getAutomationDeliveryDetail({ status: "completed" }, { channelType: "weixin", deliverableStatus: "dead_letter" })).toContain("失败");
    expect(getAutomationDeliveryDetail({ status: "executing" }, { channelType: "weixin" })).toBeUndefined();
    expect(getAutomationDeliveryDetail({ status: "completed" })).toBeUndefined();
  });
});
