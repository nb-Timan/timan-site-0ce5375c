import { extractYouTubeVideoId } from "@/lib/videoLibraryService";

function cleanYouTubeVideoId(value: string | null | undefined) {
  return String(value || "").trim().match(/^[A-Za-z0-9_-]{11}$/)?.[0] ?? null;
}

export function resolveTimanVideoId({
  videoUrl,
  youtubeVideoId,
}: {
  videoUrl?: string | null;
  youtubeVideoId?: string | null;
}) {
  return cleanYouTubeVideoId(youtubeVideoId) || extractYouTubeVideoId(videoUrl || "");
}
