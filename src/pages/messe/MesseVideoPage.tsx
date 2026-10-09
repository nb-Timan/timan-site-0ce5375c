import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Play } from "lucide-react";
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
import TimanVideoModal from "@/components/video/TimanVideoModal";

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

      {active && (
        <TimanVideoModal
          language={uiLanguage}
          title={active.title}
          youtubeVideoId={active.youtube_video_id}
          showExternalFallback
          onClose={() => setActive(null)}
        />
      )}
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
