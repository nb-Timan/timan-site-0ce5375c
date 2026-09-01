import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortalUiLanguage } from "@/lib/portalLanguages";
import { DEFAULT_VIDEO_FILTERS, type VideoFilterState, type VideoModelGenerationFilter, type VideoSortKey } from "@/lib/videoLibraryFilters";
import type { VideoContentType, VideoStatus } from "@/lib/videoLibraryService";
import {
  tv,
  videoModelGenerationFilterLabel,
  videoContentTypeLabel,
  videoSeasonLabel,
  VIDEO_CONTENT_TYPES,
  VIDEO_SEASONS,
} from "@/lib/videoLibraryI18n";

interface VideoLibraryFilterBarProps {
  filters: VideoFilterState;
  onChange: (filters: VideoFilterState) => void;
  machineOptions: { value: string; label: string }[];
  language: PortalUiLanguage;
  showStatus?: boolean;
}

export default function VideoLibraryFilterBar({
  filters,
  onChange,
  machineOptions,
  language,
  showStatus = false,
}: VideoLibraryFilterBarProps) {
  const patch = (part: Partial<VideoFilterState>) => onChange({ ...filters, ...part });
  const gridClass = showStatus
    ? "lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))_auto]"
    : "lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]";

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {(["current", "all", "legacy"] as VideoModelGenerationFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => patch({ modelGenerationFilter: value })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filters.modelGenerationFilter === value
                ? "bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
            }`}
          >
            {videoModelGenerationFilterLabel(value, language)}
          </button>
        ))}
      </div>
      <div className={`grid grid-cols-1 gap-3 ${gridClass}`}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder={tv("videoLibrarySearch", language)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        {showStatus && (
          <FilterSelect label={tv("videoMgmtStatus", language)} value={filters.statusFilter} onChange={(value) => patch({ statusFilter: value as "all" | VideoStatus })}>
            <option value="all">{tv("videoLibraryAll", language)}</option>
            <option value="draft">{tv("videoMgmtDraft", language)}</option>
            <option value="published">{tv("videoMgmtPublished", language)}</option>
            <option value="archived">{tv("videoMgmtArchived", language)}</option>
          </FilterSelect>
        )}
        <FilterSelect label={tv("videoLibraryType", language)} value={filters.typeFilter} onChange={(value) => patch({ typeFilter: value as "all" | VideoContentType })}>
          <option value="all">{tv("videoLibraryAll", language)}</option>
          {VIDEO_CONTENT_TYPES.map((type) => <option key={type} value={type}>{videoContentTypeLabel(type, language)}</option>)}
        </FilterSelect>
        <FilterSelect label={tv("videoLibrarySeason", language)} value={filters.seasonFilter} onChange={(value) => patch({ seasonFilter: value })}>
          <option value="all">{tv("videoLibraryAll", language)}</option>
          {VIDEO_SEASONS.map((season) => <option key={season} value={season}>{videoSeasonLabel(season, language)}</option>)}
        </FilterSelect>
        <FilterSelect label={tv("videoLibraryMachine", language)} value={filters.machineFilter} onChange={(value) => patch({ machineFilter: value })}>
          <option value="all">{tv("videoLibraryAll", language)}</option>
          {machineOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </FilterSelect>
        <FilterSelect label={tv("videoLibrarySort", language)} value={filters.sortKey} onChange={(value) => patch({ sortKey: value as VideoSortKey })}>
          <option value="latest">{tv("videoLibrarySortLatest", language)}</option>
          <option value="title">{tv("videoLibrarySortTitle", language)}</option>
        </FilterSelect>
        <Button type="button" variant="outline" onClick={() => onChange(DEFAULT_VIDEO_FILTERS)} className="h-10">
          {tv("videoLibraryReset", language)}
        </Button>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        aria-label={label}
      >
        {children}
      </select>
    </label>
  );
}
