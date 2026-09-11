import { type PortalUiLanguage } from '@/lib/portalLanguages';

export type MesseVideoCategory = 'maskiner' | 'redskaber' | 'service' | 'salg';
type LocalizedVideoText = Partial<Record<PortalUiLanguage, string>>;

export interface MesseVideo {
  id: string;
  title: LocalizedVideoText;
  description: LocalizedVideoText;
  youtubeUrl: string;
  category: MesseVideoCategory;
  language: PortalUiLanguage[];
  thumbnail?: string;
  publishedAt: string; // ISO
}

export const MESSE_VIDEO_CATEGORY_LABEL: Record<MesseVideoCategory, Record<PortalUiLanguage, string>> = {
  maskiner: {
    da: 'Maskiner',
    en: 'Machines',
    de: 'Maschinen',
    it: 'Macchine',
    hu: 'Gepek',
    sv: 'Maskiner',
    fr: 'Machines',
    pl: 'Maszyny',
    cs: 'Stroje',
  },
  redskaber: {
    da: 'Redskaber',
    en: 'Attachments',
    de: 'Anbaugeraete',
    it: 'Attrezzi',
    hu: 'Eszkozok',
    sv: 'Redskap',
    fr: 'Accessoires',
    pl: 'Osprzet',
    cs: 'Prislusenstvi',
  },
  service: {
    da: 'Service',
    en: 'Service',
    de: 'Service',
    it: 'Service',
    hu: 'Szerviz',
    sv: 'Service',
    fr: 'Service',
    pl: 'Serwis',
    cs: 'Servis',
  },
  salg: {
    da: 'Salg',
    en: 'Sales',
    de: 'Vertrieb',
    it: 'Vendite',
    hu: 'Ertekesites',
    sv: 'Forsaljning',
    fr: 'Ventes',
    pl: 'Sprzedaz',
    cs: 'Prodej',
  },
};

export const MESSE_VIDEOS: MesseVideo[] = [];

export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? null;
}

export function youtubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
