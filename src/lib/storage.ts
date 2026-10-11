import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Lokaler Datei-Speicher. ponytail: lokale Platte reicht; S3/Blob-Adapter,
// wenn Multi-Node oder Objektspeicher gebraucht wird.
// turbopackIgnore an jedem fs-Aufruf: sonst verfolgt der Build den Ordner und packt alle
// Uploads ein; zeigt storage per Symlink nach außen (Proxmox), bricht der Build ab (#63).
const BASE = path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "documents");
// Path-Traversal verhindern: nur Basename zulassen.
const file = (key: string) => path.join(/* turbopackIgnore: true */ BASE, path.basename(key));

export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  await fs.mkdir(/* turbopackIgnore: true */ BASE, { recursive: true });
  const ext = path.extname(originalName).slice(0, 12);
  const key = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(/* turbopackIgnore: true */ file(key), buffer);
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(/* turbopackIgnore: true */ file(key));
}

export async function deleteFile(key: string): Promise<void> {
  await fs.rm(/* turbopackIgnore: true */ file(key), { force: true });
}
