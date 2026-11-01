import { describe, expect, it } from "vitest";
import { normalizeGrokModels, resolveTextProvider, xaiErrorMessage } from "../../supabase/functions/_shared/ai-text";

describe("Grok post generation", () => {
  it("routes Grok directly to xAI using the user's key", () => {
    expect(resolveTextProvider("xai/grok-4.7", { use_byok: true, xai_api_key: "test-only" }, "gateway-test")).toEqual({
      model: "grok-4.7", key: "test-only", url: "https://api.x.ai/v1/chat/completions",
    });
  });
  it("requires the user's xAI key rather than silently falling back to Lovable", () => {
    expect(() => resolveTextProvider("xai/grok-4.7", { use_byok: true }, "gateway-test")).toThrow("clé API xAI");
  });
  it("requires BYOK to be enabled for Grok", () => {
    expect(() => resolveTextProvider("xai/grok-4.7", { use_byok: false, xai_api_key: "test-only" })).toThrow("Active");
  });
  it("lists every returned text model and alias but not image or video models", () => {
    expect(normalizeGrokModels([
      { id: "grok-4.7", aliases: ["grok-4.7-latest", "grok-4.7"], output_modalities: ["text"] },
      { id: "grok-other", aliases: [], output_modalities: ["text"] },
      { id: "grok-imagine-image", output_modalities: ["image"] },
      { id: "grok-video", output_modalities: ["video"] },
    ]).map((m) => m.value)).toEqual(["xai/grok-4.7", "xai/grok-4.7-latest", "xai/grok-other"]);
  });
  it("preserves existing Lovable and OpenAI routing", () => {
    expect(resolveTextProvider("google/gemini-3-flash-preview", {}, "gateway-test").url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(resolveTextProvider("openai/gpt-5", { use_byok: true, openai_api_key: "test-only" }).model).toBe("gpt-5");
  });
  it("does not confuse xAI credit errors with Lovable credits", () => {
    expect(xaiErrorMessage(402)).toContain("xAI");
    expect(xaiErrorMessage(402)).not.toContain("Lovable");
  });
  it("includes mini models whenever returned by the user's xAI catalog", () => {
    expect(normalizeGrokModels([{ id: "grok-3-mini", aliases: ["grok-3-mini-latest"], output_modalities: ["text"] }]).map((m) => m.value))
      .toEqual(["xai/grok-3-mini", "xai/grok-3-mini-latest"]);
  });
  it("lists all image models and aliases separately from text and video", () => {
    expect(normalizeGrokModels([
      { id: "grok-imagine-image-2.0", aliases: ["grok-imagine-image"], output_modalities: ["image"] },
      { id: "grok-text", output_modalities: ["text"] },
      { id: "grok-video", output_modalities: ["video"] },
    ], "image").map((m) => m.value)).toEqual(["xai/grok-imagine-image", "xai/grok-imagine-image-2.0"]);
  });
});