import { describe, expect, it } from "vitest";
import { systemMapEdges, systemMapNodes, type SystemMapNodeId } from "@/lib/systemDataflowMap";

describe("Backend system dataflow map", () => {
  it("contains the required first-version modules", () => {
    const ids = new Set(systemMapNodes.map((node) => node.id));

    expect(ids.has("crm")).toBe(true);
    expect(ids.has("sales")).toBe(true);
    expect(ids.has("marketing")).toBe(true);
    expect(ids.has("dealer_data")).toBe(true);
    expect(ids.has("service")).toBe(true);
    expect(ids.has("messe")).toBe(true);
    expect(ids.has("import")).toBe(true);
    expect(ids.has("system_admin")).toBe(true);
  });

  it("contains the expected real integrations", () => {
    const ids = new Set(systemMapNodes.map((node) => node.id));

    expect(ids.has("sharepoint")).toBe(true);
    expect(ids.has("erp")).toBe(true);
    expect(ids.has("supabase")).toBe(true);
    expect(ids.has("email")).toBe(true);
    expect(ids.has("documents")).toBe(true);
  });

  it("only connects existing nodes", () => {
    const ids = new Set<SystemMapNodeId>(systemMapNodes.map((node) => node.id));

    for (const edge of systemMapEdges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
      expect(edge.label.trim().length).toBeGreaterThan(0);
    }
  });
});
