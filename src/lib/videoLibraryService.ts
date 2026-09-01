import { supabase } from "@/lib/supabase";
import type { VideoProductOption } from "@/lib/videoProductCatalog";

export type VideoStatus = "draft" | "published" | "archived";
export type VideoContentType =
  | "product"
  | "how_to"
  | "installation"
  | "service"
  | "maintenance"
  | "troubleshooting"
  | "sales"
  | "training"
  | "safety"
  | "campaign";

export interface MarketingVideoProductLink {
  id?: string;
  video_id?: string;
  product_key: string;
  item_number: string;
  product_label: string | null;
  machine_key: string | null;
  is_primary?: boolean;
}

export interface MarketingVideo {
  id: string;
  youtube_url: string;
  youtube_video_id: string;
  title: string;
  description: string | null;
  content_type: VideoContentType;
  seasons: string[];
  tags: string[];
  custom_thumbnail_url: string | null;
  custom_thumbnail_path: string | null;
  status: VideoStatus;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  products: MarketingVideoProductLink[];
  primary_product: MarketingVideoProductLink | null;
}

export interface MarketingVideoInput {
  id?: string;
  youtube_url: string;
  title: string;
  description?: string | null;
  content_type: VideoContentType;
  seasons: string[];
  tags: string[];
  status: VideoStatus;
  custom_thumbnail_url?: string | null;
  custom_thumbnail_path?: string | null;
  products: VideoProductOption[];
  primaryProduct?: VideoProductOption | null;
  replaceExistingPrimary?: boolean;
}

const VIDEO_BASE_SELECT = `
  id, youtube_url, youtube_video_id, title, description, content_type, seasons, tags,
  custom_thumbnail_url, custom_thumbnail_path, status, published_at,
  created_by, updated_by, created_at, updated_at
`;

const VIDEO_SELECT = `
  ${VIDEO_BASE_SELECT},
  marketing_video_product_links(id, video_id, product_key, item_number, product_label, machine_key),
  marketing_video_primary_products(id, video_id, product_key, item_number, product_label, machine_key)
`;

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function toVideo(row: Record<string, unknown>): MarketingVideo {
  const links = (row.marketing_video_product_links as MarketingVideoProductLink[] | null | undefined) ?? [];
  const primaryRows = (row.marketing_video_primary_products as MarketingVideoProductLink[] | null | undefined) ?? [];
  const primary = primaryRows[0] ?? null;
  return {
    id: String(row.id),
    youtube_url: String(row.youtube_url || ""),
    youtube_video_id: String(row.youtube_video_id || ""),
    title: String(row.title || ""),
    description: (row.description as string | null) ?? null,
    content_type: (row.content_type as VideoContentType) || "product",
    seasons: normalizeArray(row.seasons),
    tags: normalizeArray(row.tags),
    custom_thumbnail_url: (row.custom_thumbnail_url as string | null) ?? null,
    custom_thumbnail_path: (row.custom_thumbnail_path as string | null) ?? null,
    status: (row.status as VideoStatus) || "draft",
    published_at: (row.published_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
    products: links.map((link) => ({
      ...link,
      is_primary: Boolean(primary && primary.product_key === link.product_key),
    })),
    primary_product: primary,
  };
}

export function extractYouTubeVideoId(url: string): string | null {
  const value = url.trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return cleanYouTubeId(parsed.pathname.slice(1));
    if (host.endsWith("youtube.com")) {
      const watchId = parsed.searchParams.get("v");
      if (watchId) return cleanYouTubeId(watchId);
      const match = parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (match) return cleanYouTubeId(match[1]);
    }
  } catch {
    const match = value.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
    return match ? cleanYouTubeId(match[1]) : null;
  }

  return null;
}

function cleanYouTubeId(value: string | null | undefined) {
  const id = String(value || "").trim().match(/^[A-Za-z0-9_-]{11}$/)?.[0] ?? null;
  return id;
}

export function youtubeThumbnailFromId(videoId: string | null | undefined, quality = "hqdefault") {
  const clean = cleanYouTubeId(videoId);
  return clean ? `https://img.youtube.com/vi/${clean}/${quality}.jpg` : null;
}

export function resolveVideoThumbnail(video: Pick<MarketingVideo, "custom_thumbnail_url" | "youtube_video_id">) {
  return video.custom_thumbnail_url || youtubeThumbnailFromId(video.youtube_video_id, "hqdefault") || "/placeholder.svg";
}

export async function listMarketingVideos(): Promise<{ rows: MarketingVideo[]; error: string | null }> {
  const { data, error } = await supabase
    .from("marketing_videos")
    .select(VIDEO_SELECT)
    .order("updated_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as Record<string, unknown>[]).map(toVideo), error: null };
}

export async function listPublishedMarketingVideos(): Promise<{ rows: MarketingVideo[]; error: string | null }> {
  const { data, error } = await supabase
    .from("marketing_videos")
    .select(VIDEO_SELECT)
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as Record<string, unknown>[]).map(toVideo), error: null };
}

export async function getPrimaryVideoForProduct(productKey: string): Promise<MarketingVideo | null> {
  const { data: primary, error: primaryError } = await supabase
    .from("marketing_video_primary_products")
    .select("video_id")
    .eq("product_key", productKey)
    .maybeSingle();
  if (primaryError || !primary?.video_id) return null;

  const { data, error } = await supabase
    .from("marketing_videos")
    .select(VIDEO_SELECT)
    .eq("id", primary.video_id)
    .eq("status", "published")
    .not("published_at", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  return toVideo(data as Record<string, unknown>);
}

export async function listPublishedPrimaryVideos(): Promise<Map<string, MarketingVideo>> {
  const { data: primaryRows, error: primaryError } = await supabase
    .from("marketing_video_primary_products")
    .select("product_key, video_id");
  if (primaryError) {
    console.warn("[videoLibraryService] primary video lookup failed:", primaryError.message);
    return new Map();
  }

  const videoIds = Array.from(new Set(((primaryRows ?? []) as { video_id: string }[]).map((row) => row.video_id).filter(Boolean)));
  if (videoIds.length === 0) return new Map();

  const { data: videos, error } = await supabase
    .from("marketing_videos")
    .select(VIDEO_SELECT)
    .in("id", videoIds)
    .eq("status", "published")
    .not("published_at", "is", null);
  if (error) {
    console.warn("[videoLibraryService] published primary video lookup failed:", error.message);
    return new Map();
  }

  const videosById = new Map(((videos ?? []) as Record<string, unknown>[]).map((row) => {
    const video = toVideo(row);
    return [video.id, video] as const;
  }));
  const result = new Map<string, MarketingVideo>();
  for (const row of (primaryRows ?? []) as { product_key: string; video_id: string }[]) {
    const video = videosById.get(row.video_id);
    if (video) result.set(row.product_key, video);
  }
  return result;
}

export async function findPrimaryProductConflict(productKey: string, currentVideoId?: string | null) {
  const { data, error } = await supabase
    .from("marketing_video_primary_products")
    .select("id, video_id, product_key, item_number, product_label, machine_key, marketing_videos(id, title, youtube_video_id, custom_thumbnail_url)")
    .eq("product_key", productKey)
    .maybeSingle();

  if (error || !data) return { conflict: null, error: error?.message ?? null };
  const row = data as Record<string, unknown>;
  if (currentVideoId && row.video_id === currentVideoId) return { conflict: null, error: null };
  return { conflict: row, error: null };
}

export async function saveMarketingVideo(input: MarketingVideoInput): Promise<{ row: MarketingVideo | null; error: string | null }> {
  const videoId = extractYouTubeVideoId(input.youtube_url);
  if (!videoId) return { row: null, error: "invalid_youtube" };

  const { data: authData } = await supabase.auth.getUser();
  const { data: userRow } = authData.user?.id
    ? await supabase.from("app_users").select("id").eq("auth_user_id", authData.user.id).maybeSingle()
    : { data: null };
  const actorId = (userRow?.id as string | undefined) ?? null;
  const now = new Date().toISOString();
  const status = input.status;
  const payload = {
    youtube_url: input.youtube_url.trim(),
    youtube_video_id: videoId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    content_type: input.content_type,
    seasons: input.seasons,
    tags: input.tags,
    custom_thumbnail_url: input.custom_thumbnail_url || null,
    custom_thumbnail_path: input.custom_thumbnail_path || null,
    status,
    is_active: status === "published",
    published_at: status === "published" ? now : null,
    updated_by: actorId,
    ...(input.id ? {} : { created_by: actorId }),
  };

  const query = input.id
    ? supabase.from("marketing_videos").update(payload).eq("id", input.id).select(VIDEO_SELECT).single()
    : supabase.from("marketing_videos").insert(payload).select(VIDEO_SELECT).single();
  const { data, error } = await query;
  if (error || !data) return { row: null, error: error?.message ?? "save_failed" };

  const savedId = String((data as Record<string, unknown>).id);
  const { error: deleteLinksError } = await supabase.from("marketing_video_product_links").delete().eq("video_id", savedId);
  if (deleteLinksError) return { row: null, error: deleteLinksError.message };

  const linkPayload = input.products.map((product) => ({
    video_id: savedId,
    product_key: product.productKey,
    item_number: product.itemNumber,
    product_label: product.label,
    machine_key: product.machineKey,
  }));
  if (linkPayload.length) {
    const { error: linkError } = await supabase.from("marketing_video_product_links").insert(linkPayload);
    if (linkError) return { row: null, error: linkError.message };
  }

  if (input.primaryProduct) {
    if (input.replaceExistingPrimary) {
      const { error: deletePrimaryError } = await supabase
        .from("marketing_video_primary_products")
        .delete()
        .eq("product_key", input.primaryProduct.productKey);
      if (deletePrimaryError) return { row: null, error: deletePrimaryError.message };
    }

    const primaryPayload = {
      video_id: savedId,
      product_key: input.primaryProduct.productKey,
      item_number: input.primaryProduct.itemNumber,
      product_label: input.primaryProduct.label,
      machine_key: input.primaryProduct.machineKey,
    };
    const { error: primaryError } = await supabase
      .from("marketing_video_primary_products")
      .upsert(primaryPayload, { onConflict: "product_key" });
    if (primaryError) return { row: null, error: primaryError.message };
  } else {
    const { error: removeOwnPrimaryError } = await supabase
      .from("marketing_video_primary_products")
      .delete()
      .eq("video_id", savedId);
    if (removeOwnPrimaryError) return { row: null, error: removeOwnPrimaryError.message };
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("marketing_videos")
    .select(VIDEO_SELECT)
    .eq("id", savedId)
    .single();
  if (refreshError || !refreshed) return { row: null, error: refreshError?.message ?? "refresh_failed" };
  return { row: toVideo(refreshed as Record<string, unknown>), error: null };
}

export async function uploadVideoThumbnail(file: File): Promise<{ url: string | null; path: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) return { url: null, path: null, error: "invalid_file" };
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const day = new Date().toISOString().slice(0, 10);
  const path = `video-thumbnails/${day}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("news-assets").upload(path, file, {
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) return { url: null, path: null, error: error.message };
  const { data } = supabase.storage.from("news-assets").getPublicUrl(path);
  return { url: data.publicUrl, path, error: null };
}
