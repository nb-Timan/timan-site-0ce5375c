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

export const MESSE_VIDEOS: MesseVideo[] = [
  {
    id: 'machine-overview',
    title: { da: 'Timan maskinoversigt', en: 'Timan machine overview' },
    description: { da: 'Kort introduktion til Timan-maskinprogrammet.', en: 'A short introduction to the Timan machine range.' },
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    category: 'maskiner',
    language: ['da', 'en'],
    publishedAt: '2025-09-01',
  },
  {
    id: 'attachments-demo',
    title: { da: 'Redskaber i felten', en: 'Attachments in the field' },
    description: { da: 'Demonstration af de mest brugte redskaber.', en: 'Demonstration of the most used attachments.' },
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    category: 'redskaber',
    language: ['da', 'en', 'de'],
    publishedAt: '2025-10-12',
  },
  {
    id: 'service-walkthrough',
    title: { da: 'Servicegennemgang', en: 'Service walkthrough' },
    description: { da: 'Daglig vedligehold og fejlfinding.', en: 'Daily maintenance and troubleshooting.' },
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    category: 'service',
    language: ['da', 'en'],
    publishedAt: '2025-11-04',
  },
  {
    id: 'sales-pitch',
    title: { da: 'Salgsargumenter', en: 'Sales arguments' },
    description: { da: 'Stærke argumenter til kundedialogen.', en: 'Strong arguments for the customer conversation.' },
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    category: 'salg',
    language: ['da', 'en'],
    publishedAt: '2026-01-15',
  },
];

export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? null;
}

export function youtubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
