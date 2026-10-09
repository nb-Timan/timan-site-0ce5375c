import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PortalUiLanguage } from "@/lib/portalLanguages";
import { resolveTimanVideoId } from "@/lib/timanVideoEmbed";
import { tv } from "@/lib/videoLibraryI18n";

type TimanVideoModalProps = {
  language: PortalUiLanguage;
  onClose: () => void;
  showExternalFallback?: boolean;
  title: string;
  videoUrl?: string | null;
  youtubeVideoId?: string | null;
};

export default function TimanVideoModal({
  language,
  onClose,
  showExternalFallback = false,
  title,
  videoUrl,
  youtubeVideoId,
}: TimanVideoModalProps) {
  const videoId = resolveTimanVideoId({ videoUrl, youtubeVideoId });
  const externalUrl = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl gap-0 overflow-hidden border-0 bg-white p-0 shadow-2xl sm:rounded-xl [&>button]:right-3 [&>button]:top-3 [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-black/70 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100 [&>button:hover]:bg-black/90">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        {videoId ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center px-6 py-12 text-center text-sm font-semibold text-slate-700" role="status">
            {tv("videoLibraryUnavailable", language)}
          </div>
        )}
        {showExternalFallback && externalUrl && videoId ? (
          <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>{tv("videoLibraryEmbedFallback", language)}</p>
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 hover:text-emerald-900">
              {tv("videoLibraryOpenOnYoutube", language)}
            </a>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
