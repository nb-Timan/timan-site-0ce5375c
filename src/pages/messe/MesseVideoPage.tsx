import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Play, X } from "lucide-react";
import MesseSubpageHeader from "@/components/messe/MesseSubpageHeader";
import VideoLibraryFilterBar from "@/components/video/VideoLibraryFilterBar";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n/translations";
import type { PortalUiLanguage } from "@/lib/portalLanguages";
import {
  DEFAULT_VIDEO_FILTERS,
  filterAndSortVideos,
  getVideoMachineFilterOptions,
} from "@/lib/videoLibraryFilters";
import {
  listMesseMarketingVideos,
  resolveVideoThumbnail,
  type MarketingVideo,
} from "@/lib/videoLibraryService";
import {
  tv,
  videoContentTypeLabel,
  videoSeasonLabel,
} from "@/lib/videoLibraryI18n";

export default function MesseVideoPage() {
  const { uiLanguage } = useLanguage();
  const { appUser } = useAppUser();
  const [rows, setRows] = useState<MarketingVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_VIDEO_FILTERS);
  const [active, setActive] = useState<MarketingVideo | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMesseMarketingVideos(uiLanguage).then((result) => {
      if (cancelled) return;
      setRows(result.rows);
      setError(result.error);
    });
    return () => { cancelled = true; };
  }, [uiLanguage]);

  const machineOptions = useMemo(() => getVideoMachineFilterOptions(uiLanguage), [uiLanguage]);
  const filteredRows = useMemo(() => filterAndSortVideos(rows, filters, uiLanguage), [filters, rows, uiLanguage]);

  if (!appUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MesseSubpageHeader backLabel={t("back", uiLanguage)} />

      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-900">{t("messeHomeVideo", uiLanguage)}</h1>
          <p className="max-w-3xl text-sm text-slate-600">{tv("videoLibraryIntro", uiLanguage)}</p>
        </div>

        <VideoLibraryFilterBar
          filters={filters}
          onChange={setFilters}
          machineOptions={machineOptions}
          language={uiLanguage}
        />

        {error ? <p className="mb-4 text-sm font-semibold text-amber-700">{error}</p> : null}

        {rows.length === 0 ? (
          <EmptyState text={tv("videoLibraryNoMesseVideos", uiLanguage)} />
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
    </div>
  );
}

function VideoCard({
  video,
  lang,
  onPlay,
}: {
  video: MarketingVideo;
  lang: PortalUiLanguage;
  onPlay: (video: MarketingVideo) => void;
}) {
  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
      <button type="button" onClick={() => onPlay(video)} className="flex h-full min-w-0 flex-col text-left">
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
    </article>
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
      <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
          <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 hover:text-emerald-900">
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
