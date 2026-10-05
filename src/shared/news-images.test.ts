import { describe, expect, it } from "vitest";
import { canShowNewsImages, hasNewsImages } from "./news-images";

describe("news image view scope", () => {
  it("supports publisher images in every category and the aggregate feed", () => {
    for (const category of ["all", "research", "development", "finance", "policy"])
      expect(canShowNewsImages(category, "all")).toBe(true);
    expect(canShowNewsImages("technology", "all")).toBe(true);
    expect(canShowNewsImages("business", "all")).toBe(true);
  });
  it("allows supported individual sources without changing their categories", () => {
    expect(canShowNewsImages("research", "mitai")).toBe(true);
    expect(canShowNewsImages("development", "githubblog")).toBe(true);
    expect(canShowNewsImages("business", "bcg")).toBe(true);
    expect(hasNewsImages("arxiv")).toBe(false);
  });
});
