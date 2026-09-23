import type { PortalUiLanguage } from "@/lib/portalLanguages";

interface PortalAnalyticsCopy {
  topActivity: string;
  activityIndex: string;
  explanation: string;
  newActivity: string;
  unavailable: string;
  unchanged: string;
  activeDays: string;
  activeTime: string;
  sessions: string;
  visits: string;
  noActivity: string;
  period: (days: number) => string;
  previousPeriod: (days: number) => string;
}

const copies: Record<PortalUiLanguage, PortalAnalyticsCopy> = {
  da: { topActivity: "Top 5 aktivitet", activityIndex: "Aktivitetsindeks", explanation: "Relativt brugsindeks baseret på aktive dage, reel aktiv tid, sessioner og besøg i den valgte periode. Scoren er ikke en performancevurdering.", newActivity: "Ny aktivitet", unavailable: "Ikke nok historik", unchanged: "Uændret", activeDays: "Aktive dage", activeTime: "Aktiv tid", sessions: "Sessioner", visits: "Besøg", noActivity: "Ingen aktivitet i perioden.", period: (days) => days === 365 ? "12 mdr." : `${days} dage`, previousPeriod: (days) => days === 365 ? "vs. forrige 12 mdr." : `vs. forrige ${days} dage` },
  en: { topActivity: "Top 5 activity", activityIndex: "Activity index", explanation: "Relative usage index based on active days, real active time, sessions and visits in the selected period. The score is not a performance assessment.", newActivity: "New activity", unavailable: "Insufficient history", unchanged: "Unchanged", activeDays: "Active days", activeTime: "Active time", sessions: "Sessions", visits: "Visits", noActivity: "No activity in this period.", period: (days) => days === 365 ? "12 months" : `${days} days`, previousPeriod: (days) => days === 365 ? "vs. previous 12 months" : `vs. previous ${days} days` },
  de: { topActivity: "Top-5-Aktivität", activityIndex: "Aktivitätsindex", explanation: "Relativer Nutzungsindex basierend auf aktiven Tagen, realer Aktivzeit, Sitzungen und Besuchen im gewählten Zeitraum. Der Wert ist keine Leistungsbewertung.", newActivity: "Neue Aktivität", unavailable: "Zu wenig Historie", unchanged: "Unverändert", activeDays: "Aktive Tage", activeTime: "Aktive Zeit", sessions: "Sitzungen", visits: "Besuche", noActivity: "Keine Aktivität in diesem Zeitraum.", period: (days) => days === 365 ? "12 Monate" : `${days} Tage`, previousPeriod: (days) => days === 365 ? "vs. vorherige 12 Monate" : `vs. vorherige ${days} Tage` },
  it: { topActivity: "Top 5 attività", activityIndex: "Indice di attività", explanation: "Indice relativo di utilizzo basato su giorni attivi, tempo attivo reale, sessioni e visite nel periodo selezionato. Non è una valutazione delle prestazioni.", newActivity: "Nuova attività", unavailable: "Storico insufficiente", unchanged: "Invariato", activeDays: "Giorni attivi", activeTime: "Tempo attivo", sessions: "Sessioni", visits: "Visite", noActivity: "Nessuna attività nel periodo.", period: (days) => days === 365 ? "12 mesi" : `${days} giorni`, previousPeriod: (days) => days === 365 ? "vs. 12 mesi precedenti" : `vs. ${days} giorni precedenti` },
  hu: { topActivity: "Top 5 aktivitás", activityIndex: "Aktivitási index", explanation: "Relatív használati index az aktív napok, a valós aktív idő, a munkamenetek és a látogatások alapján. Nem teljesítményértékelés.", newActivity: "Új aktivitás", unavailable: "Nincs elég előzmény", unchanged: "Változatlan", activeDays: "Aktív napok", activeTime: "Aktív idő", sessions: "Munkamenetek", visits: "Látogatások", noActivity: "Nincs aktivitás ebben az időszakban.", period: (days) => days === 365 ? "12 hónap" : `${days} nap`, previousPeriod: (days) => days === 365 ? "az előző 12 hónaphoz képest" : `az előző ${days} naphoz képest` },
  sv: { topActivity: "Topp 5 aktivitet", activityIndex: "Aktivitetsindex", explanation: "Relativt användningsindex baserat på aktiva dagar, verklig aktiv tid, sessioner och besök under vald period. Poängen är ingen prestationsbedömning.", newActivity: "Ny aktivitet", unavailable: "Otillräcklig historik", unchanged: "Oförändrat", activeDays: "Aktiva dagar", activeTime: "Aktiv tid", sessions: "Sessioner", visits: "Besök", noActivity: "Ingen aktivitet under perioden.", period: (days) => days === 365 ? "12 månader" : `${days} dagar`, previousPeriod: (days) => days === 365 ? "jämfört med föregående 12 månader" : `jämfört med föregående ${days} dagar` },
  fr: { topActivity: "Top 5 activité", activityIndex: "Indice d’activité", explanation: "Indice relatif d’utilisation basé sur les jours actifs, le temps actif réel, les sessions et les visites de la période choisie. Ce score n’est pas une évaluation des performances.", newActivity: "Nouvelle activité", unavailable: "Historique insuffisant", unchanged: "Inchangé", activeDays: "Jours actifs", activeTime: "Temps actif", sessions: "Sessions", visits: "Visites", noActivity: "Aucune activité sur cette période.", period: (days) => days === 365 ? "12 mois" : `${days} jours`, previousPeriod: (days) => days === 365 ? "vs. les 12 mois précédents" : `vs. les ${days} jours précédents` },
  pl: { topActivity: "Top 5 aktywności", activityIndex: "Indeks aktywności", explanation: "Względny indeks użycia oparty na aktywnych dniach, rzeczywistym czasie aktywności, sesjach i wizytach w wybranym okresie. Wynik nie jest oceną wydajności.", newActivity: "Nowa aktywność", unavailable: "Za mało historii", unchanged: "Bez zmian", activeDays: "Aktywne dni", activeTime: "Aktywny czas", sessions: "Sesje", visits: "Wizyty", noActivity: "Brak aktywności w tym okresie.", period: (days) => days === 365 ? "12 miesięcy" : `${days} dni`, previousPeriod: (days) => days === 365 ? "vs. poprzednie 12 miesięcy" : `vs. poprzednie ${days} dni` },
  cs: { topActivity: "Top 5 aktivit", activityIndex: "Index aktivity", explanation: "Relativní index používání založený na aktivních dnech, skutečném aktivním čase, relacích a návštěvách ve zvoleném období. Skóre není hodnocením výkonu.", newActivity: "Nová aktivita", unavailable: "Nedostatečná historie", unchanged: "Beze změny", activeDays: "Aktivní dny", activeTime: "Aktivní čas", sessions: "Relace", visits: "Návštěvy", noActivity: "V tomto období není žádná aktivita.", period: (days) => days === 365 ? "12 měsíců" : `${days} dní`, previousPeriod: (days) => days === 365 ? "vs. předchozích 12 měsíců" : `vs. předchozích ${days} dní` },
};

export function getPortalAnalyticsCopy(language: PortalUiLanguage): PortalAnalyticsCopy {
  return copies[language] || copies.en;
}
