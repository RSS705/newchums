/**
 * Crop image to square and export as WebP (or PNG/JPEG) at target size.
 * Used for avatar upload to ensure crisp display.
 */

const AVATAR_OUTPUT_SIZE = 256;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.setAttribute("crossOrigin", "anonymous");
    img.src = url;
  });
}

/**
 * Get cropped image as Blob. Outputs WebP (or PNG/JPEG if WebP fails).
 * Reduces quality iteratively if over maxBytes.
 * @param outputWidth  - default 256
 * @param outputHeight - default same as outputWidth
 * @param maxBytes     - default 2MB
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  outputWidth = AVATAR_OUTPUT_SIZE,
  outputHeight?: number,
  maxBytes = MAX_AVATAR_BYTES,
): Promise<Blob> {
  const w = outputWidth;
  const h = outputHeight ?? outputWidth;
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d not available");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    w,
    h,
  );

  const tryFormat = async (
    type: "image/webp" | "image/png" | "image/jpeg",
    quality: number,
  ): Promise<Blob> => {
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, type, quality),
    );
    if (!blob) throw new Error("toBlob failed");
    return blob;
  };

  let blob: Blob;
  try {
    blob = await tryFormat("image/webp", 0.92);
  } catch {
    blob = await tryFormat("image/png", 1);
  }

  if (blob.size <= maxBytes) return blob;

  for (const q of [0.85, 0.75, 0.65, 0.5]) {
    try {
      blob = await tryFormat("image/webp", q);
    } catch {
      blob = await tryFormat("image/jpeg", q);
    }
    if (blob.size <= maxBytes) return blob;
  }

  blob = await tryFormat("image/jpeg", 0.4);
  return blob;
}
