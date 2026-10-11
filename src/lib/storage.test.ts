import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = mkdtempSync(path.join(os.tmpdir(), "havewa-storage-"));
vi.spyOn(process, "cwd").mockReturnValue(root);
const { saveFile, readFile, deleteFile } = await import("./storage");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("storage", () => {
  it("saves, reads and deletes a file under storage/documents", async () => {
    const key = await saveFile(Buffer.from("hallo"), "brief.pdf");
    expect(key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(existsSync(path.join(root, "storage", "documents", key))).toBe(true);
    expect((await readFile(key)).toString()).toBe("hallo");
    await deleteFile(key);
    await expect(readFile(key)).rejects.toThrow();
  });

  it("only accepts the base name of a key", async () => {
    const key = await saveFile(Buffer.from("x"), "a.txt");
    expect((await readFile(`../../${key}`)).toString()).toBe("x");
  });
});
