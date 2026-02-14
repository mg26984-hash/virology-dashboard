/**
 * Image generation helper
 *
 * NOTE: This module is scaffolded but not yet wired into any tRPC router.
 * The previous Manus Forge image service has been removed. This is a
 * placeholder that throws until an image generation provider is integrated.
 */

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  _options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  throw new Error(
    "Image generation is not configured. No image generation service is currently available."
  );
}
