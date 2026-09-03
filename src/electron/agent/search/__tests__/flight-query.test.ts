import { describe, expect, it } from "vitest";
import {
  buildFlightQueryVariants,
  extractFlightRoute,
  filterFlightResults,
  isFlightQuery,
} from "../flight-query";

describe("flight query routing", () => {
  it("extracts a Chinese city route and date", () => {
    expect(extractFlightRoute("查询北京到上海 9月3日的航班信息")).toEqual({
      fromCity: "北京",
      fromCode: "PEK",
      toCity: "上海",
      toCode: "SHA",
      date: "9月3日",
    });
  });

  it("extracts an IATA route", () => {
    expect(extractFlightRoute("PEK to SHA flight schedule")).toMatchObject({
      fromCode: "PEK",
      toCode: "SHA",
    });
    expect(isFlightQuery("PEK to SHA flight schedule")).toBe(true);
  });

  it("builds bounded variants without inventing flight data", () => {
    const variants = buildFlightQueryVariants("北京→上海全天的航班信息");
    expect(variants.length).toBeGreaterThan(1);
    expect(variants.length).toBeLessThanOrEqual(4);
    expect(variants.some((variant) => variant.includes("PEK"))).toBe(true);
    expect(variants.some((variant) => variant.includes("SHA"))).toBe(true);
  });

  it("prefers direction-confirmed results and falls back when a provider omits route tokens", () => {
    const route = extractFlightRoute("北京到上海航班")!;
    const results = [
      { title: "PEK to SHA schedule", url: "https://example.com/a", snippet: "PEK SHA" },
      { title: "Unrelated travel guide", url: "https://example.com/b", snippet: "city guide" },
    ];
    expect(filterFlightResults(results, route).results).toHaveLength(1);
    expect(
      filterFlightResults([results[1]], route).results,
    ).toEqual([results[1]]);
  });
});
