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
 * Get cropped image as Blob. Outputs 256x256 WebP (or PNG/JPEG if WebP fails).
 * Reduces quality iteratively if over 2MB.
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
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
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
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

  if (blob.size <= MAX_AVATAR_BYTES) return blob;

  for (const q of [0.85, 0.75, 0.65, 0.5]) {
    try {
      blob = await tryFormat("image/webp", q);
    } catch {
      blob = await tryFormat("image/jpeg", q);
    }
    if (blob.size <= MAX_AVATAR_BYTES) return blob;
  }

  blob = await tryFormat("image/jpeg", 0.4);
  return blob;
}
