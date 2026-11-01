import { afterEach, describe, expect, it, vi } from "vitest";
import { buildXaiImageRequest, generateXaiImage } from "../../supabase/functions/_shared/xai-image";

const options = { settings: { use_byok: true, xai_api_key: "test-only" }, model: "xai/grok-imagine-image-2.0", prompt: "Editorial illustration" };
afterEach(() => vi.unstubAllGlobals());

describe("xAI image generation", () => {
  it("uses xAI image generation, the selected model and square aspect ratio", () => {
    expect(buildXaiImageRequest(options)).toEqual({
      url: "https://api.x.ai/v1/images/generations",
      body: { model: "grok-imagine-image-2.0", prompt: "Editorial illustration", n: 1, response_format: "b64_json", aspect_ratio: "1:1" },
    });
  });
  it("uses the image edit endpoint for an uploaded image", () => {
    const request = buildXaiImageRequest({ ...options, inputImageUrl: "https://example.test/photo.jpg", aspectRatio: "16:9" });
    expect(request.url).toBe("https://api.x.ai/v1/images/edits");
    expect(request.body.image).toEqual({ type: "image_url", url: "https://example.test/photo.jpg" });
    expect(request.body.aspect_ratio).toBe("16:9");
  });
  it("requires the user's key and BYOK without falling back to another provider", () => {
    expect(() => buildXaiImageRequest({ ...options, settings: { use_byok: true } })).toThrow("clé API xAI");
    expect(() => buildXaiImageRequest({ ...options, settings: { use_byok: false, xai_api_key: "test-only" } })).toThrow("Active");
  });
  it("reads JPEG output for persistent storage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "/9j/test" }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateXaiImage(options)).toEqual({ base64: "/9j/test", mimeType: "image/jpeg" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.x.ai/v1/images/generations");
  });
  it("reports xAI errors without returning provider response content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider response", { status: 402 })));
    await expect(generateXaiImage(options)).rejects.toThrow("Crédits xAI insuffisants");
  });
});