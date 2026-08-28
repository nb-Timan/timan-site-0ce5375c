import { describe, expect, it } from "vitest";
import {
  featuredDataFlow,
  systemDnaEdges,
  systemDnaNodes,
  systemMapEdges,
  systemMapNodes,
  type SystemMapNodeId,
} from "@/lib/systemDataflowMap";

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

  it("keeps the expanded DNA model connected to real nodes", () => {
    const ids = new Set<SystemMapNodeId>(systemDnaNodes.map((node) => node.id));
    const validKinds = new Set(["portal", "module", "feature", "data", "technical", "integration", "process", "tool"]);
    const validAreas = new Set(["crm", "sales", "marketing", "dealer_data", "service", "messe", "import", "system"]);
    const missingEdges = systemDnaEdges.flatMap((edge) => [
      ...(ids.has(edge.from) ? [] : [`missing source: ${edge.from} -> ${edge.to}`]),
      ...(ids.has(edge.to) ? [] : [`missing target: ${edge.from} -> ${edge.to}`]),
    ]);

    expect(systemDnaNodes.length).toBeGreaterThanOrEqual(70);
    expect(systemDnaEdges.length).toBeGreaterThanOrEqual(90);
    expect(missingEdges).toEqual([]);

    for (const node of systemDnaNodes) {
      expect(validKinds.has(node.kind), `Invalid node kind for ${node.id}: ${node.kind}`).toBe(true);
      if (node.area) expect(validAreas.has(node.area), `Invalid node area for ${node.id}: ${node.area}`).toBe(true);
      if (node.parentId) expect(typeof node.parentId).toBe("string");
    }

    for (const edge of systemDnaEdges) {
      expect(edge.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses existing nodes in the featured data flow", () => {
    const ids = new Set<SystemMapNodeId>(systemDnaNodes.map((node) => node.id));

    expect(featuredDataFlow.length).toBeGreaterThan(0);

    for (const nodeId of featuredDataFlow) {
      expect(ids.has(nodeId)).toBe(true);
    }
  });

  it("models the actual development and deployment flow in System DNA", () => {
    const ids = new Set(systemDnaNodes.map((node) => node.id));
    const edgeKeys = new Set(systemDnaEdges.map((edge) => `${edge.from}->${edge.to}`));

    for (const nodeId of [
      "product_owner",
      "codex_agent",
      "codebase",
      "github_repo",
      "github_actions",
      "test_build",
      "lovable_deploy",
      "supabase_migrations",
    ]) {
      expect(ids.has(nodeId)).toBe(true);
    }

    expect(edgeKeys.has("product_owner->codex_agent")).toBe(true);
    expect(edgeKeys.has("codex_agent->codebase")).toBe(true);
    expect(edgeKeys.has("codebase->github_repo")).toBe(true);
    expect(edgeKeys.has("github_repo->github_actions")).toBe(true);
    expect(edgeKeys.has("github_actions->test_build")).toBe(true);
    expect(edgeKeys.has("test_build->lovable_deploy")).toBe(true);
    expect(edgeKeys.has("lovable_deploy->portal")).toBe(true);
    expect(edgeKeys.has("codebase->supabase_migrations")).toBe(true);
    expect(edgeKeys.has("supabase_migrations->supabase")).toBe(true);
  });
});
