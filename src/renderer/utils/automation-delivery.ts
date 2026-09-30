import type { Task } from "../../shared/types";
import { translate } from "../i18n";

export interface AutomationDeliveryReceipt {
  channelType?: string;
  taskStillRunning?: boolean;
  status?: string;
  deliveryStatus?: string;
  deliverableStatus?: string;
}

export function getAutomationDeliveryDetail(task: Pick<Task, "status">, receipt?: AutomationDeliveryReceipt): string | undefined {
  if (!receipt || task.status !== "completed") return undefined;
  const channel = receipt.channelType === "weixin" ? translate("automation.delivery.wechat", "WeChat") : receipt.channelType || translate("automation.delivery.channel", "channel");
  // Older runs sometimes sent an approval notice, not the eventual result.
  if (receipt.taskStillRunning) {
    return translate("automation.delivery.pending", "Result saved; awaiting final delivery to {channel}", { channel });
  }
  if (receipt.status === "needs_user_action") {
    return translate("automation.delivery.missingFinal", "Final result was not sent to {channel}", { channel });
  }
  if (receipt.deliverableStatus === "sent" || receipt.deliveryStatus === "success") {
    return translate("automation.delivery.sent", "Result sent to {channel}", { channel });
  }
  if (receipt.deliverableStatus === "queued") {
    return translate("automation.delivery.retry", "Result saved; retrying delivery to {channel}", { channel });
  }
  if (receipt.deliverableStatus === "dead_letter" || receipt.deliveryStatus === "failed") {
    return translate("automation.delivery.failed", "Result saved; delivery to {channel} failed", { channel });
  }
  return translate("automation.delivery.unsent", "Result saved; no delivery confirmation for {channel}", { channel });
}

export function needsDeliveryAttention(task: Pick<Task, "status">, receipt?: AutomationDeliveryReceipt): boolean {
  return Boolean(receipt && task.status === "completed" && (
    receipt.taskStillRunning || receipt.status === "needs_user_action" ||
    receipt.deliverableStatus === "dead_letter" || receipt.deliverableStatus === "queued" || receipt.deliveryStatus === "failed"
  ));
}
