import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("warranty registration source scope", () => {
  it("lists only canonical SP warranty records, never legacy MO machine rows", () => {
    const service = read("src/lib/warrantyRegistrationsService.ts");

    expect(service).toContain('.in("source", ["sharepoint", "portal_manual"])');
    expect(service).toContain('.like("certificate_number", "SP-%")');
    expect(service).toContain("return row.certificate_number ?? \"\";");
    expect(service).not.toContain("if (row.legacy_warranty_reference) return row.legacy_warranty_reference;");
  });
});
