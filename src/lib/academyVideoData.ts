import { ACADEMY_CASE_2_TARGET_VIDEO_ID, academySandbox } from '@/lib/academySandbox';
import { academyScopedStorageKey } from '@/lib/academyCycleStorage';
import { DEFAULT_VIDEO_FILTERS, type VideoFilterState } from '@/lib/videoLibraryFilters';
import type { MarketingVideo } from '@/lib/videoLibraryService';

const KEY = 'timan.academy.video-gallery.v1';
type Preferences = { filters: VideoFilterState; favorites: string[] };

const ACADEMY_VIDEO_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/**
 * The isolated Academy preview has no authenticated production session. Keep
 * its one exercise fixture local, while normal portal video data stays server
 * backed.
 */
export function getAcademyVideoFallback(): MarketingVideo[] {
  return [{
    id: 'academy-video-3330-weed-brush',
    youtube_url: `https://www.youtube.com/watch?v=${ACADEMY_CASE_2_TARGET_VIDEO_ID}`,
    youtube_video_id: ACADEMY_CASE_2_TARGET_VIDEO_ID,
    title: 'Weed Brush-vedligeholdelse til Timan 3330',
    description: 'Lokalt Academy-eksempel til Video Galleri.',
    localized_content: null,
    source_language: 'da',
    translation_meta: null,
    content_type: 'maintenance',
    seasons: ['all_year'],
    tags: ['academy', 'weed brush', 'vedligeholdelse'],
    custom_thumbnail_url: null,
    custom_thumbnail_path: null,
    status: 'published',
    archived_at: null,
    delete_after: null,
    archived_previous_status: null,
    model_generation_status: 'current',
    show_on_messe_portal: false,
    published_at: ACADEMY_VIDEO_TIMESTAMP,
    created_by: null,
    updated_by: null,
    created_at: ACADEMY_VIDEO_TIMESTAMP,
    updated_at: ACADEMY_VIDEO_TIMESTAMP,
    products: [{
      product_key: 'TIMAN_3330',
      item_number: '712000',
      product_label: 'Timan 3330',
      machine_key: 'Timan 3330',
    }],
    primary_product: null,
  }];
}

export function readAcademyVideoPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(academyScopedStorageKey(KEY)) || 'null');
    return { filters: { ...DEFAULT_VIDEO_FILTERS, ...saved?.filters }, favorites: Array.isArray(saved?.favorites) ? saved.favorites : [] };
  } catch {
    return { filters: { ...DEFAULT_VIDEO_FILTERS }, favorites: [] };
  }
}

export function saveAcademyVideoPreferences(update: Partial<Preferences>) {
  if (!academySandbox.isActive()) return;
  localStorage.setItem(academyScopedStorageKey(KEY), JSON.stringify({ ...readAcademyVideoPreferences(), ...update }));
}
