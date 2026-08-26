// supabase/functions/translate-news-content/index.ts
//
// Server-side News CMS translation gateway.
//
// Prepared for OpenAI, but not deployed by default.
//
// Required secrets:
//   - OPENAI_API_KEY
// Auto-injected by Supabase:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - SUPABASE_ANON_KEY
//
// Security model:
//   - Frontend never receives the OpenAI API key.
//   - Caller must send a Supabase Auth JWT.
//   - Caller must be Timan Backend or have permissions.news_manage = true.
//   - The function only translates text values. Images, URLs, files, icons,
//     colors, booleans, IDs and layout values are copied as-is.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

const SUPPORTED_LANGUAGES = ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"] as const;
type PortalLanguage = typeof SUPPORTED_LANGUAGES[number];

type LocalizedContent = Partial<Record<PortalLanguage, Record<string, unknown>>>;

interface FieldDefinition {
  key: string;
  type: string;
}

interface TranslationMetaEntry {
  mode: "auto";
  provider: "openai";
  model: string;
  sourceLanguage: PortalLanguage;
  sourceHash: string;
  translatedAt: string;
}

type TranslationMeta = Partial<Record<PortalLanguage, Record<string, TranslationMetaEntry>>>;

interface RequestBody {
  sourceLanguage: PortalLanguage;
  targetLanguages: PortalLanguage[];
  fields: FieldDefinition[];
  localizedContent: LocalizedContent;
  previousLocalizedContent?: LocalizedContent | null;
  translationMeta?: TranslationMeta | null;
}

const LANGUAGE_NAMES: Record<PortalLanguage, string> = {
  da: "Danish",
  en: "English",
  de: "German",
  it: "Italian",
  hu: "Hungarian",
  sv: "Swedish",
  fr: "French",
  pl: "Polish",
  cs: "Czech",
};

const NON_TRANSLATED_FIELD_TYPES = new Set(["image", "file", "url", "pageCount"]);
const SHARED_KEYS = [
  "id",
  "url",
  "href",
  "image",
  "imageUrl",
  "mainImage",
  "secondaryImage",
  "heroImage",
  "productImage",
  "file",
  "icon",
  "iconColor",
  "customIconUrl",
  "color",
  "enabled",
  "type",
  "x",
  "y",
  "scale",
  "offset",
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPortalLanguage(value: unknown): value is PortalLanguage {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as PortalLanguage);
}

function shouldShareKey(key: string): boolean {
  const normalized = key.trim();
  return SHARED_KEYS.some((shared) => normalized === shared || normalized.toLowerCase().endsWith(shared.toLowerCase()));
}

function isProbablyNonTextValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^https?:\/\//i.test(trimmed) ||
    /^data:/i.test(trimmed) ||
    /^\/?news-assets\//i.test(trimmed) ||
    /^[\w./-]+\.(png|jpe?g|webp|gif|svg|pdf)$/i.test(trimmed)
  );
}

function getAtPath(root: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return current[Number(segment)];
    if (isObject(current)) return current[segment];
    return undefined;
  }, root);
}

function setAtPath(root: Record<string, unknown>, path: string[], value: unknown) {
  let current: Record<string, unknown> | unknown[] = root;
  path.forEach((segment, index) => {
    const last = index === path.length - 1;
    if (last) {
      if (Array.isArray(current)) current[Number(segment)] = value;
      else current[segment] = value;
      return;
    }

    const nextSegment = path[index + 1];
    const nextIsArray = /^\d+$/.test(nextSegment);
    if (Array.isArray(current)) {
      const arrayIndex = Number(segment);
      if (!current[arrayIndex]) current[arrayIndex] = nextIsArray ? [] : {};
      current = current[arrayIndex] as Record<string, unknown> | unknown[];
      return;
    }

    if (!current[segment]) current[segment] = nextIsArray ? [] : {};
    current = current[segment] as Record<string, unknown> | unknown[];
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function collectTextPaths(value: unknown, path: string[] = []): string[][] {
  const key = path[path.length - 1] || "";
  if (typeof value === "string") {
    if (!value.trim() || shouldShareKey(key) || isProbablyNonTextValue(value)) return [];
    return [path];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectTextPaths(item, [...path, String(index)]));
  }

  if (isObject(value)) {
    return Object.entries(value).flatMap(([childKey, childValue]) => {
      if (shouldShareKey(childKey)) return [];
      return collectTextPaths(childValue, [...path, childKey]);
    });
  }

  return [];
}

function collectFieldTextPaths(source: Record<string, unknown>, fields: FieldDefinition[]): string[][] {
  return fields.flatMap((field) => {
    if (!field?.key || NON_TRANSLATED_FIELD_TYPES.has(field.type) || shouldShareKey(field.key)) return [];
    return collectTextPaths(source[field.key], [field.key]);
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractResponseText(data: unknown): string {
  if (isObject(data) && typeof data.output_text === "string") return data.output_text.trim();
  if (!isObject(data) || !Array.isArray(data.output)) return "";

  return data.output
    .flatMap((item) => isObject(item) && Array.isArray(item.content) ? item.content : [])
    .map((contentItem) => {
      if (!isObject(contentItem)) return "";
      if (typeof contentItem.text === "string") return contentItem.text;
      if (typeof contentItem.output_text === "string") return contentItem.output_text;
      return "";
    })
    .join("\n")
    .trim();
}

function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function translateBatch(
  apiKey: string,
  model: string,
  sourceLanguage: PortalLanguage,
  targetLanguage: PortalLanguage,
  values: Record<string, string>,
): Promise<Record<string, string>> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      input: [
        {
          role: "system",
          content:
            "You translate Timan marketing/news CMS text. Preserve product names, model names, URLs, numbers, units and brand terms. Return only valid JSON using the same keys as the input object.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceLanguage: LANGUAGE_NAMES[sourceLanguage],
            targetLanguage: LANGUAGE_NAMES[targetLanguage],
            textByPath: values,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI translation failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  const rawText = stripJsonFence(extractResponseText(data));
  if (!rawText) throw new Error("OpenAI response did not contain output_text.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("OpenAI response was not valid JSON.");
  }

  if (!isObject(parsed)) throw new Error("OpenAI response JSON must be an object.");
  return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string" && value.trim()) acc[key] = value;
    return acc;
  }, {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const OPENAI_TRANSLATION_MODEL = Deno.env.get("OPENAI_TRANSLATION_MODEL") || DEFAULT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ error: "Edge Function mangler SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY." }, 500);
  }
  if (!OPENAI_API_KEY) {
    return json({ error: "Edge Function mangler Supabase Secret: OPENAI_API_KEY." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Manglende Authorization header." }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user?.email) {
    return json({ error: "Ugyldig eller udløbet session." }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: callerErr } = await admin
    .from("app_users")
    .select("id, email, portal_role, approved, is_active, permissions")
    .eq("email", userData.user.email.toLowerCase())
    .maybeSingle();
  if (callerErr) return json({ error: `Kunne ikke verificere bruger: ${callerErr.message}` }, 500);

  const permissions = (caller?.permissions ?? {}) as Record<string, unknown>;
  const canManageNews =
    caller?.approved === true &&
    caller?.is_active === true &&
    (caller.portal_role === "timan_backend" || permissions.news_manage === true);
  if (!canManageNews) {
    return json({ error: "Adgang nægtet. Kræver Timan Backend eller news_manage." }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON body." }, 400);
  }

  if (!isPortalLanguage(body.sourceLanguage)) return json({ error: "Ugyldigt sourceLanguage." }, 400);
  const targetLanguages = [...new Set(body.targetLanguages || [])].filter(isPortalLanguage).filter((lang) => lang !== body.sourceLanguage);
  if (targetLanguages.length === 0) return json({ error: "Ingen gyldige targetLanguages." }, 400);
  if (!Array.isArray(body.fields)) return json({ error: "fields skal være en liste." }, 400);

  const source = body.localizedContent?.[body.sourceLanguage] || {};
  const localizedContent = cloneJson(body.localizedContent) as LocalizedContent;
  const translationMeta = cloneJson(body.translationMeta || {}) as TranslationMeta;
  const previousSource = body.previousLocalizedContent?.[body.sourceLanguage] || {};
  const sourcePaths = collectFieldTextPaths(source, body.fields);
  const translatedAt = new Date().toISOString();
  const translatedLanguages: PortalLanguage[] = [];
  const skippedManual: Array<{ language: PortalLanguage; path: string }> = [];

  for (const targetLanguage of targetLanguages) {
    const target = cloneJson(localizedContent[targetLanguage] || {}) as Record<string, unknown>;
    const targetMeta = { ...(translationMeta[targetLanguage] || {}) };
    const valuesToTranslate: Record<string, string> = {};
    const sourceHashes: Record<string, string> = {};

    for (const path of sourcePaths) {
      const pathKey = path.join(".");
      const sourceValue = getAtPath(source, path);
      if (typeof sourceValue !== "string" || !sourceValue.trim()) continue;

      const sourceHash = await sha256(sourceValue);
      sourceHashes[pathKey] = sourceHash;

      const targetValue = getAtPath(target, path);
      const previousSourceValue = getAtPath(previousSource, path);
      const meta = targetMeta[pathKey];
      const isExistingAuto = meta?.mode === "auto" && meta.sourceLanguage === body.sourceLanguage;
      const isSameAuto = isExistingAuto && meta.sourceHash === sourceHash && typeof targetValue === "string" && targetValue.trim();
      const copiedSource = typeof targetValue === "string" && targetValue.trim() === sourceValue.trim();
      const previousAutoNeedsRefresh = isExistingAuto && typeof previousSourceValue === "string" && meta.sourceHash !== sourceHash;

      if (isSameAuto) continue;
      if (!targetValue || copiedSource || previousAutoNeedsRefresh) {
        valuesToTranslate[pathKey] = sourceValue;
        continue;
      }

      skippedManual.push({ language: targetLanguage, path: pathKey });
    }

    if (Object.keys(valuesToTranslate).length === 0) {
      localizedContent[targetLanguage] = target;
      translationMeta[targetLanguage] = targetMeta;
      continue;
    }

    const translated = await translateBatch(
      OPENAI_API_KEY,
      OPENAI_TRANSLATION_MODEL,
      body.sourceLanguage,
      targetLanguage,
      valuesToTranslate,
    );

    for (const [pathKey, translatedValue] of Object.entries(translated)) {
      const path = pathKey.split(".");
      setAtPath(target, path, translatedValue);
      targetMeta[pathKey] = {
        mode: "auto",
        provider: "openai",
        model: OPENAI_TRANSLATION_MODEL,
        sourceLanguage: body.sourceLanguage,
        sourceHash: sourceHashes[pathKey],
        translatedAt,
      };
    }

    localizedContent[targetLanguage] = target;
    translationMeta[targetLanguage] = targetMeta;
    translatedLanguages.push(targetLanguage);
  }

  return json({
    localizedContent,
    translationMeta,
    translatedLanguages,
    skippedManual,
    provider: "openai",
    model: OPENAI_TRANSLATION_MODEL,
  });
});
