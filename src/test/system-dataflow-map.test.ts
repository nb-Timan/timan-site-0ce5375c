import { describe, expect, it } from "vitest";
import {
  featuredDataFlow,
  getFeaturedDataFlow,
  getSystemDnaNodePosition,
  getSystemDnaZoomForNode,
  getSystemDnaZoomStage,
  getVisibleSystemDnaNodes,
  SYSTEM_DNA_ZOOM_LEVELS,
  findSystemMapNode,
  systemDnaEdges,
  systemDnaNodes,
  systemMapEdges,
  systemMapNodes,
  systemOverviewLines,
  SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_BY_AREA,
  SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_IDS,
  type SystemMapNodeId,
} from "@/lib/systemDataflowMap";
import { PORTAL_HOME_AREA_ORDER } from "@/lib/portalHomeOrder";

describe("Backend system dataflow map", () => {
  function expectNoCenterCollisions(nodeIds: SystemMapNodeId[], zoom: number, minDistance: number) {
    const positions = nodeIds.map((id) => ({ id, position: getSystemDnaNodePosition(findSystemMapNode(id), zoom) }));

    for (let index = 0; index < positions.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < positions.length; otherIndex += 1) {
        const first = positions[index];
        const second = positions[otherIndex];
        const distance = Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y);
        expect(distance, `${first.id} overlaps ${second.id}`).toBeGreaterThanOrEqual(minDistance);
      }
    }
  }

  it("contains the required first-version modules", () => {
    const ids = new Set(systemMapNodes.map((node) => node.id));

    expect(ids.has("crm")).toBe(true);
    expect(ids.has("sales")).toBe(true);
    expect(ids.has("marketing")).toBe(true);
    expect(ids.has("dealer_data")).toBe(true);
    expect(ids.has("service")).toBe(true);
    expect(ids.has("calendar")).toBe(true);
    expect(ids.has("projects")).toBe(true);
    expect(ids.has("messe")).toBe(true);
    expect(ids.has("import")).toBe(true);
    expect(ids.has("system_admin")).toBe(true);
  });

  it("uses portal home order as the first System-overblik module ring", () => {
    expect(SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_IDS).toEqual([
      "sales",
      "dealer_data",
      "crm",
      "marketing",
      "service",
      "calendar",
      "projects",
      "messe",
      "system_admin",
    ]);
    expect(Object.keys(SYSTEM_OVERVIEW_PORTAL_MODULE_NODE_BY_AREA)).toEqual([...PORTAL_HOME_AREA_ORDER]);

    expect(findSystemMapNode("sales").title).toBe("Salg");
    expect(findSystemMapNode("dealer_data").title).toBe("Partnerdata");
    expect(findSystemMapNode("crm").title).toBe("CRM");
    expect(findSystemMapNode("service").title).toBe("Teknik & Service");
    expect(findSystemMapNode("messe").title).toBe("Messe");
    expect(findSystemMapNode("system_admin").title).toBe("Timan Backend");
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

  it("keeps overview connections evidence-based and connected to known nodes", () => {
    const ids = new Set<SystemMapNodeId>(systemDnaNodes.map((node) => node.id));
    const lineKeys = new Set(systemOverviewLines.map((line) => `${line.from}->${line.to}`));

    for (const line of systemOverviewLines) {
      expect(ids.has(line.from), `Unknown overview source: ${line.from}`).toBe(true);
      expect(ids.has(line.to), `Unknown overview target: ${line.to}`).toBe(true);
      if (line.colorFrom) expect(ids.has(line.colorFrom), `Unknown overview color source: ${line.colorFrom}`).toBe(true);
    }

    expect(lineKeys.has("sharepoint->crm")).toBe(false);
    expect(lineKeys.has("microsoft_365->sales")).toBe(false);
    expect(lineKeys.has("erp->service")).toBe(false);
    expect(lineKeys.has("erp->import")).toBe(true);
    expect(lineKeys.has("import->sales")).toBe(true);
    expect(lineKeys.has("crm->sales")).toBe(true);
    expect(lineKeys.has("dealer_data->messe")).toBe(true);
  });

  it("keeps the expanded DNA model connected to real nodes", () => {
    const ids = new Set<SystemMapNodeId>(systemDnaNodes.map((node) => node.id));
    const validKinds = new Set(["portal", "module", "feature", "data", "technical", "integration", "process", "tool"]);
    const validAreas = new Set(["crm", "sales", "marketing", "dealer_data", "service", "calendar", "projects", "messe", "import", "system"]);
    const validEdgeKinds = new Set(["data", "navigation", "sync", "permission", "conversion", "dependency", "development"]);
    const validDirections = new Set(["forward", "bidirectional"]);
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
      if (edge.kind) expect(validEdgeKinds.has(edge.kind), `Invalid edge kind for ${edge.from}->${edge.to}: ${edge.kind}`).toBe(true);
      if (edge.direction) {
        expect(validDirections.has(edge.direction), `Invalid edge direction for ${edge.from}->${edge.to}: ${edge.direction}`).toBe(true);
      }
    }
  });

  it("does not contain exact duplicate DNA relations", () => {
    const keys = systemDnaEdges.map((edge) => `${edge.from}->${edge.to}::${edge.kind ?? "data"}::${edge.direction ?? "forward"}::${edge.label}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not contain duplicate DNA relations with the same semantics", () => {
    const keys = systemDnaEdges.map((edge) => {
      const direction = edge.direction ?? "forward";
      const endpoints =
        direction === "bidirectional" ? [edge.from, edge.to].sort().join("<->") : `${edge.from}->${edge.to}`;
      return `${endpoints}::${edge.kind ?? "data"}::${edge.label}`;
    });

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("models CRM and Sales as a clear bidirectional conversion flow", () => {
    const crmSalesEdge = systemDnaEdges.find((edge) => edge.from === "crm" && edge.to === "sales");

    expect(crmSalesEdge).toBeDefined();
    expect(crmSalesEdge?.kind).toBe("conversion");
    expect(crmSalesEdge?.direction).toBe("bidirectional");
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

  it("reveals more System DNA information as the user zooms in", () => {
    const worldNodes = getVisibleSystemDnaNodes(SYSTEM_DNA_ZOOM_LEVELS[0].zoom);
    const areaNodes = getVisibleSystemDnaNodes(SYSTEM_DNA_ZOOM_LEVELS[1].zoom);
    const featureNodes = getVisibleSystemDnaNodes(SYSTEM_DNA_ZOOM_LEVELS[2].zoom);
    const technicalNodes = getVisibleSystemDnaNodes(SYSTEM_DNA_ZOOM_LEVELS[3].zoom);

    expect(worldNodes.length).toBeLessThan(areaNodes.length);
    expect(areaNodes.length).toBeLessThan(featureNodes.length);
    expect(featureNodes.length).toBeLessThan(technicalNodes.length);

    expect(new Set(worldNodes.map((node) => node.id)).has("crm")).toBe(true);
    expect(new Set(worldNodes.map((node) => node.id)).has("crm_leads")).toBe(false);
    expect(new Set(areaNodes.map((node) => node.id)).has("crm_leads")).toBe(true);
    expect(new Set(featureNodes.map((node) => node.id)).has("lead_conversions")).toBe(true);
    expect(new Set(technicalNodes.map((node) => node.id)).has("edge_functions")).toBe(true);
  });

  it("keeps semantic zoom layout deterministic without changing node or edge counts", () => {
    expect(systemDnaNodes.length).toBe(79);
    expect(systemDnaEdges.length).toBe(129);

    const first = getSystemDnaNodePosition(findSystemMapNode("crm_leads"), SYSTEM_DNA_ZOOM_LEVELS[2].zoom);
    const second = getSystemDnaNodePosition(findSystemMapNode("crm_leads"), SYSTEM_DNA_ZOOM_LEVELS[2].zoom);

    expect(second).toEqual(first);
  });

  it("spreads the CRM feature cluster at semantic feature zoom", () => {
    expectNoCenterCollisions(
      [
        "crm",
        "crm_dashboard",
        "crm_leads",
        "crm_demo_leads",
        "crm_activities",
        "crm_pipeline",
        "lead_conversions",
      ],
      SYSTEM_DNA_ZOOM_LEVELS[2].zoom,
      235,
    );
  });

  it("models Calendar and Projects as standalone main modules", () => {
    const calendar = findSystemMapNode("calendar");
    const projects = findSystemMapNode("projects");
    const calendarFeature = findSystemMapNode("crm_calendar");
    const overviewLineKeys = new Set(systemOverviewLines.map((line) => `${line.from}->${line.to}`));
    const dnaEdgeKeys = new Set(systemDnaEdges.map((edge) => `${edge.from}->${edge.to}`));

    expect(calendar.kind).toBe("module");
    expect(calendar.title).toBe("Kalender");
    expect(calendar.subtitle).toBe("Aftaler, aktiviteter og deadlines");
    expect(calendar.parentId).toBeUndefined();
    expect(calendar.routes).toContain("/portal/crm/calendar");
    expect(calendarFeature.parentId).toBe("calendar");

    expect(projects.kind).toBe("module");
    expect(projects.title).toBe("Projekter");
    expect(projects.subtitle).toBe("Projekter, opgaver og opfølgning");
    expect(projects.parentId).toBeUndefined();
    expect(projects.routes).toEqual([]);
    expect(projects.tables).toEqual([]);

    expect(overviewLineKeys.has("calendar->portal")).toBe(true);
    expect(overviewLineKeys.has("projects->portal")).toBe(true);
    expect(dnaEdgeKeys.has("crm->calendar")).toBe(true);
    expect(dnaEdgeKeys.has("calendar->email")).toBe(true);
  });

  it("spreads lead detail nodes at technical zoom", () => {
    expectNoCenterCollisions(
      ["crm_leads", "lead_status", "lead_owner", "lead_notes", "lead_followups"],
      SYSTEM_DNA_ZOOM_LEVELS[3].zoom,
      145,
    );
  });

  it("supports semantic drill-down paths", () => {
    expect(getSystemDnaZoomStage(getSystemDnaZoomForNode(findSystemMapNode("crm"))).id).toBe("area");
    expect(getSystemDnaZoomStage(getSystemDnaZoomForNode(findSystemMapNode("crm_leads"))).id).toBe("feature");
    expect(getSystemDnaZoomStage(getSystemDnaZoomForNode(findSystemMapNode("lead_notes"))).id).toBe("technical");
    expect(getSystemDnaZoomStage(getSystemDnaZoomForNode(findSystemMapNode("config_step_machine"))).id).toBe("feature");
    expect(getSystemDnaZoomStage(getSystemDnaZoomForNode(findSystemMapNode("messe_form"))).id).toBe("feature");
    expect(getSystemDnaZoomStage(getSystemDnaZoomForNode(findSystemMapNode("news"))).id).toBe("feature");
  });

  it("uses contextual data-flow chains for selected features", () => {
    expect(getFeaturedDataFlow("messe_form")).toEqual([
      "messe_form",
      "messe_leads",
      "crm_leads",
      "lead_conversions",
      "configurator",
      "quotes",
      "orders",
      "documents",
      "email",
    ]);
    expect(getFeaturedDataFlow("crm_leads")).toContain("documents");
    expect(getFeaturedDataFlow("configurator")).toContain("config_step_machine");
    expect(getFeaturedDataFlow("news")).toContain("messe_news");
  });
});
