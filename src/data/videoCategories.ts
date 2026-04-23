import { Language } from '@/types/configurator';

export interface VideoItem {
  title: string;
  desc: string;
  id: string; // YouTube id, or "placeholder*"
  date: string; // YYYY-MM-DD
}

export interface VideoCategory {
  id: string;
  title: string;
  subtitle: Record<Language, string>;
  image?: string;
  icon?: 'wrench' | 'book';
  videos: VideoItem[];
}

export const VIDEO_CATEGORIES: VideoCategory[] = [
  {
    id: 'rc-751',
    title: 'Timan RC-751',
    subtitle: {
      da: 'Fjernstyret skråningsklipper',
      en: 'Remote-controlled slope mower',
      de: 'Ferngesteuerter Hangmäher',
      it: 'Tosaerba radiocomandato per pendii',
      hu: 'Távirányítású rézsűkaszáló',
    },
    image: 'https://images.unsplash.com/photo-1590400541360-b2095820ec71?auto=format&fit=crop&q=80&w=800',
    videos: [
      { title: 'RC-751 Introduktion', desc: 'Den kompakte klipper til hverdagsbrug.', id: 'placeholder2', date: '2023-12-01' },
    ],
  },
  {
    id: 'rc-1000s',
    title: 'Timan RC-1000s',
    subtitle: {
      da: 'Fjernstyret redskabsbærer',
      en: 'Remote-controlled tool carrier',
      de: 'Ferngesteuerter Geräteträger',
      it: 'Portautensili radiocomandato',
      hu: 'Távirányítású szerszámhordozó',
    },
    image: 'https://images.unsplash.com/photo-1533991321616-622ee20c248b?auto=format&fit=crop&q=80&w=800',
    videos: [
      { title: 'Præsentation af RC-1000s', desc: 'Se den fjernstyrede redskabsbærer i aktion.', id: 'D-hXvg_oW9s', date: '2023-11-15' },
      { title: 'RC-1000s på stejle skråninger', desc: 'Ekstrem test af klipperen på 50 graders hældning.', id: 'n8VWb0PJX20', date: '2023-10-02' },
      { title: 'Teknisk gennemgang', desc: 'Alt om motor og hydraulik i RC-1000s.', id: 'placeholder1', date: '2023-09-20' },
    ],
  },
  {
    id: '3330',
    title: 'Timan 3330',
    subtitle: {
      da: 'Redskabsbærer',
      en: 'Tool carrier',
      de: 'Geräteträger',
      it: 'Portautensili',
      hu: 'Szerszámhordozó',
    },
    image: 'https://images.unsplash.com/photo-1516937941344-00b4e0337589?auto=format&fit=crop&q=80&w=800',
    videos: [
      { title: 'Timan 3330 Komfort', desc: 'Fokus på førerens arbejdsmiljø.', id: 'placeholder3', date: '2023-11-20' },
    ],
  },
  {
    id: '2620',
    title: 'Timan 2620',
    subtitle: {
      da: 'Redskabsbærer',
      en: 'Tool carrier',
      de: 'Geräteträger',
      it: 'Portautensili',
      hu: 'Szerszámhordozó',
    },
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=800',
    videos: [
      { title: 'Timan 2620 Alsidighed', desc: 'Én maskine til alle sæsoner.', id: 'placeholder4', date: '2023-11-25' },
    ],
  },
  {
    id: 'redskaber',
    title: 'Redskaber',
    subtitle: {
      da: 'Videoer af koste, klippeborde mm.',
      en: 'Videos of brushes, cutting decks etc.',
      de: 'Videos zu Bürsten, Mähdecks usw.',
      it: 'Video di spazzole, piatti di taglio ecc.',
      hu: 'Videók kefékről, vágóasztalokról stb.',
    },
    icon: 'wrench',
    videos: [
      { title: 'Sneplov montering', desc: 'Hurtig skift af redskaber.', id: 'placeholder5', date: '2024-01-10' },
    ],
  },
  {
    id: 'help',
    title: 'How to install & Help',
    subtitle: {
      da: 'Vejledninger og teknisk hjælp',
      en: 'Guides and technical help',
      de: 'Anleitungen und technische Hilfe',
      it: 'Guide e supporto tecnico',
      hu: 'Útmutatók és műszaki segítség',
    },
    icon: 'book',
    videos: [
      { title: 'Service guide: Olieskift', desc: 'Trin-for-trin vedligeholdelse.', id: 'placeholder6', date: '2024-02-01' },
    ],
  },
];

export const getCategoryById = (id: string) => VIDEO_CATEGORIES.find(c => c.id === id);
