import { describe, expect, it } from "vitest";
import {
  MICROSOFT_CONSUMER_IMAP_UNSUPPORTED_MESSAGE,
  getUnsupportedManualEmailSetupMessage,
  isMicrosoftConsumerEmailAddress,
} from "../email-provider-support";

describe("email-provider-support", () => {
  it("detects Microsoft consumer mailbox domains", () => {
    expect(isMicrosoftConsumerEmailAddress("user@msn.com")).toBe(true);
    expect(isMicrosoftConsumerEmailAddress("user@outlook.co.uk")).toBe(true);
    expect(isMicrosoftConsumerEmailAddress("user@example.com")).toBe(false);
  });

  it("returns the manual-setup warning for Outlook.com-family accounts", () => {
    expect(
      getUnsupportedManualEmailSetupMessage({
        email: "user@hotmail.com",
        imapHost: "imap-mail.outlook.com",
        smtpHost: "smtp-mail.outlook.com",
      }),
    ).toBe(MICROSOFT_CONSUMER_IMAP_UNSUPPORTED_MESSAGE);
  });

  it("allows other providers to continue using password-based IMAP/SMTP", () => {
    expect(
      getUnsupportedManualEmailSetupMessage({
        email: "user@gmail.com",
        imapHost: "imap.gmail.com",
        smtpHost: "smtp.gmail.com",
      }),
    ).toBeNull();
  });
});
