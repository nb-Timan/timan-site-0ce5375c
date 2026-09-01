import type { PortalUiLanguage } from "@/lib/portalLanguages";
import { listVideoProductOptions } from "@/lib/videoProductCatalog";
import type { MarketingVideo, VideoContentType, VideoStatus } from "@/lib/videoLibraryService";

export type VideoSortKey = "latest" | "title";

export interface VideoFilterState {
  query: string;
  statusFilter: "all" | VideoStatus;
  typeFilter: "all" | VideoContentType;
  seasonFilter: string;
  machineFilter: string;
  sortKey: VideoSortKey;
}

export const DEFAULT_VIDEO_FILTERS: VideoFilterState = {
  query: "",
  statusFilter: "all",
  typeFilter: "all",
  seasonFilter: "all",
  machineFilter: "all",
  sortKey: "latest",
};

export function getVideoMachineFilterOptions(language: PortalUiLanguage) {
  const seen = new Set<string>();
  return listVideoProductOptions(language)
    .filter((item) => {
      if (seen.has(item.machineKey)) return false;
      seen.add(item.machineKey);
      return true;
    })
    .map((item) => ({ value: item.machineKey, label: item.machineLabel }));
}

export function filterAndSortVideos(
  rows: MarketingVideo[],
  filters: VideoFilterState,
  language: PortalUiLanguage,
  options: { includeStatus?: boolean } = {},
) {
  const q = filters.query.trim().toLowerCase();
  return rows
    .filter((row) => !options.includeStatus || filters.statusFilter === "all" || row.status === filters.statusFilter)
    .filter((row) => filters.typeFilter === "all" || row.content_type === filters.typeFilter)
    .filter((row) => filters.seasonFilter === "all" || row.seasons.includes(filters.seasonFilter))
    .filter((row) => filters.machineFilter === "all" || row.products.some((item) => item.machine_key === filters.machineFilter))
    .filter((row) => {
      if (!q) return true;
      const search = [
        row.title,
        row.description || "",
        row.content_type,
        ...row.seasons,
        ...row.tags,
        ...row.products.flatMap((item) => [
          item.product_key,
          item.item_number,
          item.product_label || "",
          item.machine_key || "",
        ]),
      ].join(" ").toLowerCase();
      return search.includes(q);
    })
    .sort((a, b) => {
      if (filters.sortKey === "title") return a.title.localeCompare(b.title, language);
      return new Date(b.published_at || b.updated_at).getTime() - new Date(a.published_at || a.updated_at).getTime();
    });
}
