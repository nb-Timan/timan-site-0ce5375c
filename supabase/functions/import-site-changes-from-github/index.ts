import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-change-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_REPOSITORY = "nb-Timan/timan-site-0ce5375c";
const DEFAULT_BRANCH = "main";
const DEFAULT_LIMIT = 25;

type GitHubCommitInput = {
  id?: string;
  sha?: string;
  message?: string;
  timestamp?: string;
  url?: string;
  added?: string[];
  modified?: string[];
  removed?: string[];
  commit?: {
    message?: string;
    author?: { date?: string };
  };
  html_url?: string;
  files?: Array<{ filename?: string; status?: string }>;
};

type RequestBody = {
  mode?: "manual";
  repository?: { full_name?: string; name?: string };
  commits?: GitHubCommitInput[];
  head_commit?: GitHubCommitInput | null;
  ref?: string;
  limit?: number;
};

type SiteChangeInsert = {
  source: string;
  source_ref: string;
  implemented_at: string;
  title_internal: string;
  description_internal: string;
  technical_description: string;
  title_public: string | null;
  description_public: string | null;
  localized_content: Record<string, Record<string, string>>;
  module: string;
  change_type: string;
  affected_roles: string[];
  user_impact_score: number;
  technical_impact_score: number;
  publish_recommendation: "publish" | "maybe" | "internal";
  is_important: boolean;
  status: "new";
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() || value.trim();
}

function changedFiles(commit: GitHubCommitInput): string[] {
  const fromArrays = [
    ...(commit.added || []),
    ...(commit.modified || []),
    ...(commit.removed || []),
  ];
  const fromDetails = (commit.files || [])
    .map((file) => file.filename)
    .filter((file): file is string => Boolean(file));
  return [...new Set([...fromArrays, ...fromDetails])].sort();
}

function inferModule(files: string[], message: string): string {
  const haystack = `${files.join("\n")}\n${message}`.toLowerCase();
  if (haystack.includes("crm") || haystack.includes("lead")) return "crm";
  if (haystack.includes("partnermap") || haystack.includes("partner-map") || haystack.includes("map")) return "map";
  if (haystack.includes("dealer") || haystack.includes("forhandler")) return "dealer_data";
  if (haystack.includes("messe")) return "messe";
  if (haystack.includes("tsb")) return "tsb";
  if (haystack.includes("warranty") || haystack.includes("garanti")) return "warranty";
  if (haystack.includes("claim") || haystack.includes("reklamation")) return "claims";
  if (haystack.includes("marketing") || haystack.includes("news") || haystack.includes("changelog")) return "marketing";
  if (haystack.includes("budget")) return "budget";
  if (haystack.includes("quote") || haystack.includes("tilbud")) return "quotes";
  if (haystack.includes("order") || haystack.includes("ordre")) return "orders";
  if (haystack.includes("supabase") || haystack.includes("backend")) return "backend";
  return "backend";
}

function inferChangeType(files: string[], message: string): string {
  const haystack = `${files.join("\n")}\n${message}`.toLowerCase();
  if (haystack.includes("security") || haystack.includes("permission") || haystack.includes("rls")) return "security";
  if (haystack.includes("fix") || haystack.includes("ret ") || haystack.includes("bug")) return "bugfix";
  if (haystack.includes("performance") || haystack.includes("speed")) return "performance";
  if (haystack.includes("migration") || haystack.includes("supabase")) return "backend";
  if (haystack.includes("ui") || haystack.includes("layout") || haystack.includes("design")) return "ui_ux";
  if (haystack.includes("add") || haystack.includes("new") || haystack.includes("feature")) return "feature";
  return "improvement";
}

function inferRoles(module: string): string[] {
  if (module === "backend" || module === "users" || module === "marketing") return ["timan_backend"];
  if (["crm", "leads", "budget", "quotes", "orders"].includes(module)) return ["timan_backend", "timan_seller"];
  if (["dealer_data", "dealer_portal", "map"].includes(module)) {
    return ["timan_backend", "timan_seller", "timan_dealer", "timan_importer", "timan_service_partner"];
  }
  if (["service", "tsb", "warranty", "claims"].includes(module)) return ["timan_backend", "timan_service", "timan_dealer"];
  if (module === "messe") return ["exhibition_user", "timan_seller"];
  return ["all"];
}

function impactFor(type: string, module: string): { user: number; technical: number; recommendation: "publish" | "maybe" | "internal" } {
  if (type === "security" || module === "backend") return { user: 2, technical: 8, recommendation: "internal" };
  if (type === "feature") return { user: 7, technical: 5, recommendation: "maybe" };
  if (type === "bugfix") return { user: 5, technical: 4, recommendation: "maybe" };
  return { user: 4, technical: 4, recommendation: "maybe" };
}

function toEntry(commit: GitHubCommitInput, repository: string): SiteChangeInsert | null {
  const sha = cleanText(commit.id || commit.sha);
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) return null;
  const message = cleanText(commit.message || commit.commit?.message);
  const title = firstLine(message || `GitHub ændring ${sha.slice(0, 7)}`);
  const files = changedFiles(commit);
  const module = inferModule(files, message);
  const changeType = inferChangeType(files, message);
  const impact = impactFor(changeType, module);
  const fileText = files.length ? files.map((file) => `- ${file}`).join("\n") : "- Ingen fil-liste modtaget.";
  const url = cleanText(commit.url || commit.html_url);

  return {
    source: "github",
    source_ref: `github:${sha}`,
    implemented_at: cleanText(commit.timestamp || commit.commit?.author?.date) || new Date().toISOString(),
    title_internal: title,
    description_internal: `Automatisk importeret fra GitHub commit ${sha.slice(0, 7)}.`,
    technical_description: [
      `Kilde: GitHub`,
      `Repository: ${repository}`,
      `Commit: ${sha}`,
      url ? `URL: ${url}` : null,
      "",
      "Commit message:",
      message || "(tom)",
      "",
      "Ændrede filer:",
      fileText,
    ].filter((line) => line !== null).join("\n"),
    title_public: null,
    description_public: null,
    localized_content: {
      da: {
        title,
        description: "",
        note: title,
        module_label: module,
        change_type_label: changeType,
      },
    },
    module,
    change_type: changeType,
    affected_roles: inferRoles(module),
    user_impact_score: impact.user,
    technical_impact_score: impact.technical,
    publish_recommendation: impact.recommendation,
    is_important: false,
    status: "new",
  };
}

async function fetchJson(url: string, token: string | null): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "timan-site-change-importer",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API fejlede (${response.status}): ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function fetchRecentCommits(repository: string, branch: string, limit: number, token: string | null): Promise<GitHubCommitInput[]> {
  const base = `https://api.github.com/repos/${repository}`;
  const list = await fetchJson(`${base}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`, token);
  if (!Array.isArray(list)) throw new Error("GitHub API returnerede ikke en commit-liste.");

  const detailed: GitHubCommitInput[] = [];
  for (const item of list.slice(0, limit) as GitHubCommitInput[]) {
    const sha = cleanText(item.sha);
    if (!sha) continue;
    try {
      detailed.push(await fetchJson(`${base}/commits/${sha}`, token) as GitHubCommitInput);
    } catch {
      detailed.push(item);
    }
  }
  return detailed;
}

async function callerCanManageNews(req: Request, supabaseUrl: string, anonKey: string, serviceRole: string): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return false;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user?.email) return false;

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller } = await admin
    .from("app_users")
    .select("portal_role, approved, is_active, permissions")
    .eq("email", userData.user.email.toLowerCase())
    .maybeSingle();
  const permissions = (caller?.permissions ?? {}) as Record<string, unknown>;
  return caller?.approved === true &&
    caller?.is_active === true &&
    (caller.portal_role === "timan_backend" || permissions.news_manage === true);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SYNC_SECRET = Deno.env.get("SITE_CHANGE_SYNC_SECRET");
  const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || null;
  const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY") || DEFAULT_REPOSITORY;
  const GITHUB_BRANCH = Deno.env.get("GITHUB_BRANCH") || DEFAULT_BRANCH;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ error: "Edge Function mangler Supabase miljøvariabler." }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON body." }, 400);
  }

  const syncSecret = req.headers.get("x-site-change-sync-secret");
  const calledByGitHub = Boolean(SYNC_SECRET && syncSecret && syncSecret === SYNC_SECRET);
  const calledByUser = await callerCanManageNews(req, SUPABASE_URL, ANON_KEY, SERVICE_ROLE);
  if (!calledByGitHub && !calledByUser) {
    return json({ error: "Adgang nægtet. Kræver GitHub sync-secret eller Marketing/Backend adgang." }, 403);
  }

  const repository = cleanText(body.repository?.full_name) || GITHUB_REPOSITORY;
  const ref = cleanText(body.ref);
  if (calledByGitHub && ref && ref !== `refs/heads/${GITHUB_BRANCH}`) {
    return json({ ok: true, imported: 0, skipped: 0, message: "Ikke main branch." });
  }

  let commits = Array.isArray(body.commits) ? body.commits : [];
  if (body.head_commit && commits.length === 0) commits = [body.head_commit];
  if (body.mode === "manual") {
    commits = await fetchRecentCommits(repository, GITHUB_BRANCH, Math.min(Math.max(body.limit || DEFAULT_LIMIT, 1), 50), GITHUB_TOKEN);
  }

  const entries = commits
    .map((commit) => toEntry(commit, repository))
    .filter((entry): entry is SiteChangeInsert => Boolean(entry));

  if (entries.length === 0) {
    return json({ ok: true, imported: 0, skipped: 0, message: "Ingen commits at importere." });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sourceRefs = entries.map((entry) => entry.source_ref);
  const { data: existingRows, error: existingError } = await admin
    .from("site_change_entries")
    .select("source_ref")
    .in("source_ref", sourceRefs);
  if (existingError) return json({ error: `Kunne ikke tjekke dubletter: ${existingError.message}` }, 500);

  const existing = new Set((existingRows || []).map((row: { source_ref: string | null }) => row.source_ref).filter(Boolean));
  const newEntries = entries.filter((entry) => !existing.has(entry.source_ref));
  if (newEntries.length === 0) {
    return json({ ok: true, imported: 0, skipped: entries.length, message: "Alle commits findes allerede." });
  }

  const { error: insertError } = await admin.from("site_change_entries").insert(newEntries);
  if (insertError) return json({ error: `Import fejlede: ${insertError.message}` }, 500);

  return json({
    ok: true,
    imported: newEntries.length,
    skipped: entries.length - newEntries.length,
    commits: newEntries.map((entry) => entry.source_ref.replace("github:", "").slice(0, 7)),
  });
});
