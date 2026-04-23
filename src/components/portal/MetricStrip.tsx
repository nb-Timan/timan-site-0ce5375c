import { DashboardMetrics } from '@/lib/portalModules';
import { Language } from '@/types/configurator';
import { ShieldAlert, Clock, FileWarning, AlertTriangle, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';

const T: Record<string, Record<Language, string>> = {
  openClaims:        { da: 'Åbne claims', en: 'Open claims', de: 'Offene Reklamationen', it: 'Reclami aperti', hu: 'Nyitott reklamációk' },
  awaitingApproval:  { da: 'Afventer godkendelse', en: 'Awaiting approval', de: 'Wartet auf Genehmigung', it: 'In attesa di approvazione', hu: 'Jóváhagyásra vár' },
  activeTsb:         { da: 'Aktive TSB-sager', en: 'Active TSB cases', de: 'Aktive TSB-Fälle', it: 'Casi TSB attivi', hu: 'Aktív TSB ügyek' },
  overdueTsb:        { da: 'Forfaldne TSB', en: 'Overdue TSB', de: 'Überfällige TSB', it: 'TSB scaduti', hu: 'Lejárt TSB' },
  news:              { da: 'Seneste nyheder', en: 'Latest news', de: 'Neueste Nachrichten', it: 'Ultime notizie', hu: 'Legújabb hírek' },
  empty:             { da: '–', en: '–', de: '–', it: '–', hu: '–' },
};

interface Tile {
  key: keyof DashboardMetrics;
  label: string;
  icon: typeof ShieldAlert;
  tone: 'default' | 'warning' | 'danger';
}

interface Props {
  metrics: DashboardMetrics;
  language: Language;
}

export default function MetricStrip({ metrics, language }: Props) {
  const tiles: Tile[] = [
    { key: 'openClaims',             label: T.openClaims[language],       icon: ShieldAlert,   tone: 'default' },
    { key: 'claimsAwaitingApproval', label: T.awaitingApproval[language], icon: Clock,         tone: 'warning' },
    { key: 'activeTsbCases',         label: T.activeTsb[language],        icon: FileWarning,   tone: 'default' },
    { key: 'overdueTsbCases',        label: T.overdueTsb[language],       icon: AlertTriangle, tone: 'danger'  },
    { key: 'latestNewsCount',        label: T.news[language],             icon: Newspaper,     tone: 'default' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {tiles.map(t => {
        const value = metrics[t.key];
        const display = value === null || value === undefined ? T.empty[language] : value;
        const Icon = t.icon;
        return (
          <div
            key={t.key}
            className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 shadow-sm"
          >
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
              t.tone === 'danger'  ? 'bg-rose-100 text-rose-700' :
              t.tone === 'warning' ? 'bg-amber-100 text-amber-700' :
                                     'bg-emerald-100 text-emerald-700',
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-gray-900 leading-none">{display}</div>
              <div className="text-[11px] text-gray-500 mt-1 truncate">{t.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
