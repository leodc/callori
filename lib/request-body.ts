export class BodyTooLarge extends Error {}
export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  limit = 32768,
) {
  if (!body) return "";
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new BodyTooLarge();
      }
      parts.push(value);
    }
    return Buffer.concat(parts).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
