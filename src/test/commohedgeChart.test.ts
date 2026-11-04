import { describe, expect, it } from "vitest";
import { isCommoHedgeChartPayload } from "@/lib/commohedge-chart";

describe("isCommoHedgeChartPayload", () => {
  it("accepts tour payload", () => {
    expect(
      isCommoHedgeChartPayload({
        layout: "tour",
        data: {
          title: "Daily tour",
          news: [],
          groups: [],
        },
      }),
    ).toBe(true);
  });

  it("rejects inventing without layout", () => {
    expect(isCommoHedgeChartPayload({ data: {} })).toBe(false);
    expect(isCommoHedgeChartPayload(null)).toBe(false);
  });
});
