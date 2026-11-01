import { describe, expect, it } from "vitest";
import { normalizeGrokModels, resolveTextProvider, xaiErrorMessage } from "../../supabase/functions/_shared/ai-text";

describe("Grok post generation", () => {
  it("routes Grok directly to xAI using the user's key", () => {
    expect(resolveTextProvider("xai/grok-4.7", { use_byok: true, xai_api_key: "test-only" })).toEqual({
      model: "grok-4.7", key: "test-only", url: "https://api.x.ai/v1/chat/completions",
    });
  });
  it("requires the user's xAI key rather than falling back", () => {
    expect(() => resolveTextProvider("xai/grok-4.7", { use_byok: true })).toThrow("clé API xAI");
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
  it("routes OpenAI and Gemini through BYOK providers only", () => {
    expect(resolveTextProvider("openai/gpt-5", { use_byok: true, openai_api_key: "test-only" })).toEqual({
      model: "gpt-5",
      url: "https://api.openai.com/v1/chat/completions",
      key: "test-only",
    });
    expect(resolveTextProvider("google/gemini-2.5-flash", { use_byok: true, gemini_api_key: "gem-test" })).toEqual({
      model: "gemini-2.5-flash",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: "gem-test",
    });
    expect(() => resolveTextProvider("google/gemini-2.5-flash", { use_byok: true })).toThrow("Gemini");
  });
  it("does not confuse xAI credit errors with other providers", () => {
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
