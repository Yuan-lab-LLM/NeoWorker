import { describe, expect, it } from "vitest";
import {
  isRecoverableWebSourceFailure,
  isWebSourceTool,
} from "../web-source-failure";

describe("web source failure classification", () => {
  it("classifies candidate-page availability failures as recoverable", () => {
    expect(isRecoverableWebSourceFailure("HTTP 404: Not Found")).toBe(true);
    expect(isRecoverableWebSourceFailure("Request timed out")).toBe(true);
    expect(isRecoverableWebSourceFailure("fetch failed: ENOTFOUND")).toBe(true);
  });

  it("keeps policy and malformed URL failures actionable", () => {
    expect(isRecoverableWebSourceFailure("Domain not allowed: example.com")).toBe(false);
    expect(isRecoverableWebSourceFailure("Malformed proxied URL")).toBe(false);
    expect(isWebSourceTool("web_fetch")).toBe(true);
    expect(isWebSourceTool("web_search")).toBe(false);
  });
});
