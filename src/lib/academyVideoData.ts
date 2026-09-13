import { PRODUCTS } from '@/data/machines';
import { academySandbox, ACADEMY_CASE_2_TARGET_VIDEO_ID, ACADEMY_CASE_2_MACHINE_KEY, ACADEMY_CASE_2_CONTENT_TYPE } from '@/lib/academySandbox';
import { DEFAULT_VIDEO_FILTERS, type VideoFilterState } from '@/lib/videoLibraryFilters';
import { listVideoProductOptions } from '@/lib/videoProductCatalog';
import type { MarketingVideo } from '@/lib/videoLibraryService';

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

/** Curriculum fixtures use the normal gallery model and canonical product catalog. */
export function listAcademyVideos(): { rows: MarketingVideo[]; error: null } {
  const productOptions = listVideoProductOptions('en');
  const makeVideo = (youtubeId: string, title: string, machineKey: string, contentType: MarketingVideo['content_type']): MarketingVideo => {
    const product = productOptions.find((option) => option.kind === 'machine' && option.machineKey === machineKey)!;
    return {
      id: `academy-video-${youtubeId}`, youtube_url: `https://www.youtube.com/watch?v=${youtubeId}`, youtube_video_id: youtubeId,
      title, description: null, localized_content: null, source_language: 'en', translation_meta: null,
      content_type: contentType, seasons: [], tags: [], custom_thumbnail_url: null, custom_thumbnail_path: null,
      status: 'published', archived_at: null, delete_after: null, archived_previous_status: null,
      model_generation_status: 'current', show_on_messe_portal: false, published_at: null,
      created_by: null, updated_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      products: [{ product_key: product.productKey, item_number: product.itemNumber, product_label: product.label, machine_key: machineKey }], primary_product: null,
    };
  };
  const machine = PRODUCTS['RC-1000S'];
  const productVideoId = new URL(machine.videoUrl!).searchParams.get('v')!;
  return { rows: [
    makeVideo(ACADEMY_CASE_2_TARGET_VIDEO_ID, 'Where to lubricate the Weed Brush Timan 3330', ACADEMY_CASE_2_MACHINE_KEY, ACADEMY_CASE_2_CONTENT_TYPE),
    makeVideo(productVideoId, machine.name as string, machine.id, 'product'),
  ], error: null };
}
