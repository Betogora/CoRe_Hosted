export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Lowercase hex SHA-1 via Web Crypto; callers that may lack `crypto.subtle` guard or fall back themselves. */
export async function sha1DigestHex(data: BufferSource): Promise<string> {
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", data)));
}
