const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export function generateResetToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashResetToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}
