function dataUrlToUint8Array(
  dataUrl: string,
): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { mimeType, bytes };
}

export function createVideoObjectUrl(playbackUrl: string): string | null {
  if (!playbackUrl.startsWith("data:")) return playbackUrl;

  const parsed = dataUrlToUint8Array(playbackUrl);
  if (!parsed) return null;

  const blob = new Blob([parsed.bytes.buffer as ArrayBuffer], {
    type: parsed.mimeType,
  });
  return URL.createObjectURL(blob);
}
