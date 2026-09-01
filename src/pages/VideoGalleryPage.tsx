import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Play, Search, X } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import type { PortalUiLanguage } from "@/lib/portalLanguages";
import { listVideoProductOptions } from "@/lib/videoProductCatalog";
import {
  listPublishedMarketingVideos,
  resolveVideoThumbnail,
  type MarketingVideo,
} from "@/lib/videoLibraryService";
import {
  tv,
  videoContentTypeLabel,
  videoSeasonLabel,
  VIDEO_CONTENT_TYPES,
  VIDEO_SEASONS,
} from "@/lib/videoLibraryI18n";

type SortKey = "latest" | "title";

export default function VideoGalleryPage() {
  const { appUser, loading, logout } = useAppUser();
  const { uiLanguage, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<MarketingVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [active, setActive] = useState<MarketingVideo | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublishedMarketingVideos(uiLanguage).then((result) => {
      if (cancelled) return;
      setRows(result.rows);
      setError(result.error);
    });
    return () => { cancelled = true; };
  }, [uiLanguage]);

  const productOptions = useMemo(() => listVideoProductOptions(uiLanguage), [uiLanguage]);
  const machineOptions = useMemo(() => {
    const seen = new Set<string>();
    return productOptions
      .filter((item) => {
        if (seen.has(item.machineKey)) return false;
        seen.add(item.machineKey);
        return true;
      })
      .map((item) => ({ value: item.machineKey, label: item.machineLabel }));
  }, [productOptions]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => typeFilter === "all" || row.content_type === typeFilter)
      .filter((row) => seasonFilter === "all" || row.seasons.includes(seasonFilter))
      .filter((row) => machineFilter === "all" || row.products.some((item) => item.machine_key === machineFilter))
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
        if (sortKey === "title") return a.title.localeCompare(b.title, uiLanguage);
        return new Date(b.published_at || b.updated_at).getTime() - new Date(a.published_at || a.updated_at).getTime();
      });
  }, [machineFilter, query, rows, seasonFilter, sortKey, typeFilter, uiLanguage]);

  const resetFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setSeasonFilter("all");
    setMachineFilter("all");
    setSortKey("latest");
  };

  if (loading) return <div className="min-h-screen bg-gray-50" />;
  if (!appUser) return <Navigate to="/portal" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <main className="mx-auto flex-grow w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-900">{tv("videoLibraryTitle", uiLanguage)}</h1>
          <p className="max-w-3xl text-sm text-slate-600">{tv("videoLibraryIntro", uiLanguage)}</p>
        </div>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tv("videoLibrarySearch", uiLanguage)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <FilterSelect label={tv("videoLibraryType", uiLanguage)} value={typeFilter} onChange={setTypeFilter}>
              <option value="all">{tv("videoLibraryAll", uiLanguage)}</option>
              {VIDEO_CONTENT_TYPES.map((type) => <option key={type} value={type}>{videoContentTypeLabel(type, uiLanguage)}</option>)}
            </FilterSelect>
            <FilterSelect label={tv("videoLibrarySeason", uiLanguage)} value={seasonFilter} onChange={setSeasonFilter}>
              <option value="all">{tv("videoLibraryAll", uiLanguage)}</option>
              {VIDEO_SEASONS.map((season) => <option key={season} value={season}>{videoSeasonLabel(season, uiLanguage)}</option>)}
            </FilterSelect>
            <FilterSelect label={tv("videoLibraryMachine", uiLanguage)} value={machineFilter} onChange={setMachineFilter}>
              <option value="all">{tv("videoLibraryAll", uiLanguage)}</option>
              {machineOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </FilterSelect>
            <FilterSelect label={tv("videoLibrarySort", uiLanguage)} value={sortKey} onChange={(value) => setSortKey(value as SortKey)}>
              <option value="latest">{tv("videoLibrarySortLatest", uiLanguage)}</option>
              <option value="title">{tv("videoLibrarySortTitle", uiLanguage)}</option>
            </FilterSelect>
            <Button type="button" variant="outline" onClick={resetFilters} className="h-10">
              {tv("videoLibraryReset", uiLanguage)}
            </Button>
          </div>
        </section>

        {error ? <p className="mb-4 text-sm font-semibold text-amber-700">{error}</p> : null}

        {rows.length === 0 ? (
          <EmptyState text={tv("videoLibraryNoVideos", uiLanguage)} />
        ) : filteredRows.length === 0 ? (
          <EmptyState text={tv("videoLibraryNoResults", uiLanguage)} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRows.map((video) => (
              <VideoCard key={video.id} video={video} lang={uiLanguage} onPlay={setActive} />
            ))}
          </div>
        )}
      </main>

      {active && <VideoModal video={active} lang={uiLanguage} onClose={() => setActive(null)} />}
      <PortalFooter language={language} />
    </div>
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

function VideoCard({ video, lang, onPlay }: { video: MarketingVideo; lang: PortalUiLanguage; onPlay: (video: MarketingVideo) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPlay(video)}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      <div className="relative aspect-video bg-slate-100">
        <img src={resolveVideoThumbnail(video)} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 opacity-0 transition group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700 shadow">
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="line-clamp-2 text-base font-bold text-slate-950">{video.title}</h2>
          {video.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{video.description}</p>}
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5">
          <Chip>{videoContentTypeLabel(video.content_type, lang)}</Chip>
          {video.seasons.slice(0, 2).map((season) => <Chip key={season}>{videoSeasonLabel(season, lang)}</Chip>)}
          {video.tags.slice(0, 2).map((tag) => <Chip key={tag}>{tag}</Chip>)}
        </div>
      </div>
    </button>
  );
}

function VideoModal({ video, lang, onClose }: { video: MarketingVideo; lang: PortalUiLanguage; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tv("videoLibraryClosePlayer", lang)}
        className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2 text-white shadow-sm transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/70 sm:right-4 sm:top-4"
      >
        <X className="h-6 w-6" />
      </button>
      <div
        className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="aspect-video w-full bg-black">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${video.youtube_video_id}?autoplay=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>{tv("videoLibraryEmbedFallback", lang)}</p>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-700 hover:text-emerald-900"
          >
            {tv("videoLibraryOpenOnYoutube", lang)}
          </a>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{children}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}
