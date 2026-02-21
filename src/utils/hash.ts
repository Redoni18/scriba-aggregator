export function hashContent(content: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  return hasher.update(content.trim()).digest("hex");
}