import { Language } from '@/types/configurator';

export type MesseVideoCategory = 'maskiner' | 'redskaber' | 'service' | 'salg';

export interface MesseVideo {
  id: string;
  title: Partial<Record<Language, string>>;
  description: Partial<Record<Language, string>>;
  youtubeUrl: string;
  category: MesseVideoCategory;
  language: Language[];
  thumbnail?: string;
  publishedAt: string; // ISO
}

export const MESSE_VIDEO_CATEGORY_LABEL: Record<MesseVideoCategory, Record<Language, string>> = {
  maskiner:  { da: 'Maskiner',  en: 'Machines',    de: 'Maschinen', it: 'Macchine',   hu: 'Gépek' },
  redskaber: { da: 'Redskaber', en: 'Attachments', de: 'Anbauten',  it: 'Attrezzi',   hu: 'Eszközök' },
  service:   { da: 'Service',   en: 'Service',     de: 'Service',   it: 'Service',    hu: 'Szerviz' },
  salg:      { da: 'Salg',      en: 'Sales',       de: 'Vertrieb',  it: 'Vendite',    hu: 'Értékesítés' },
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
