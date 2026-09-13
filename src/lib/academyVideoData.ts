import { academySandbox } from '@/lib/academySandbox';
import { DEFAULT_VIDEO_FILTERS, type VideoFilterState } from '@/lib/videoLibraryFilters';

const KEY = 'timan.academy.video-gallery.v1';
type Preferences = { filters: VideoFilterState; favorites: string[] };

export function readAcademyVideoPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { filters: { ...DEFAULT_VIDEO_FILTERS, ...saved?.filters }, favorites: Array.isArray(saved?.favorites) ? saved.favorites : [] };
  } catch {
    return { filters: { ...DEFAULT_VIDEO_FILTERS }, favorites: [] };
  }
}

export function saveAcademyVideoPreferences(update: Partial<Preferences>) {
  if (!academySandbox.isActive()) return;
  localStorage.setItem(KEY, JSON.stringify({ ...readAcademyVideoPreferences(), ...update }));
}
