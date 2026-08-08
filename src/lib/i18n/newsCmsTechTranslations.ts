import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Dict = Record<string, string>;

/** Template 04 – technical highlight blocks + specification rows. */
const da: Dict = {
  newsCmsFieldTechBlocks: 'Tekniske highlights',
  newsCmsFieldTechBlocksHelp: 'Fire faste bokse. Ikon og farve deles på tværs af sprog, tekst gemmes pr. sprog.',
  newsCmsTechBlock: 'Teknisk boks',
  newsCmsTechHeading: 'Overskrift',
  newsCmsTechValue: 'Værdi / beskrivelse',
  newsCmsFieldSpecRows: 'Specifikationer',
  newsCmsFieldSpecRowsHelp: 'Tilføj rækker med etiket og værdi. Tekst gemmes pr. sprog.',
  newsCmsSpecLabel: 'Etiket',
  newsCmsSpecValue: 'Værdi',
  newsCmsAddSpec: '+ Tilføj specifikation',
  newsCmsRemoveSpec: 'Fjern',
  newsCmsSpecificationsTitle: 'SPECIFIKATIONER',
  newsCmsTechHighlightsTitle: 'TEKNISKE HIGHLIGHTS',
};

const en: Dict = {
  newsCmsFieldTechBlocks: 'Technical highlights',
  newsCmsFieldTechBlocksHelp: 'Four fixed boxes. Icon and colour are shared across languages, text is stored per language.',
  newsCmsTechBlock: 'Technical box',
  newsCmsTechHeading: 'Heading',
  newsCmsTechValue: 'Value / description',
  newsCmsFieldSpecRows: 'Specifications',
  newsCmsFieldSpecRowsHelp: 'Add label and value rows. Text is stored per language.',
  newsCmsSpecLabel: 'Label',
  newsCmsSpecValue: 'Value',
  newsCmsAddSpec: '+ Add specification',
  newsCmsRemoveSpec: 'Remove',
  newsCmsSpecificationsTitle: 'SPECIFICATIONS',
  newsCmsTechHighlightsTitle: 'TECHNICAL HIGHLIGHTS',
};

const de: Dict = {
  newsCmsFieldTechBlocks: 'Technische Highlights',
  newsCmsFieldTechBlocksHelp: 'Vier feste Boxen. Symbol und Farbe gelten für alle Sprachen, Text wird pro Sprache gespeichert.',
  newsCmsTechBlock: 'Technische Box',
  newsCmsTechHeading: 'Überschrift',
  newsCmsTechValue: 'Wert / Beschreibung',
  newsCmsFieldSpecRows: 'Technische Daten',
  newsCmsFieldSpecRowsHelp: 'Zeilen mit Bezeichnung und Wert hinzufügen. Text wird pro Sprache gespeichert.',
  newsCmsSpecLabel: 'Bezeichnung',
  newsCmsSpecValue: 'Wert',
  newsCmsAddSpec: '+ Technische Daten hinzufügen',
  newsCmsRemoveSpec: 'Entfernen',
  newsCmsSpecificationsTitle: 'TECHNISCHE DATEN',
  newsCmsTechHighlightsTitle: 'TECHNISCHE HIGHLIGHTS',
};

const it: Dict = {
  newsCmsFieldTechBlocks: 'Punti tecnici',
  newsCmsFieldTechBlocksHelp: 'Quattro riquadri fissi. Icona e colore sono condivisi tra le lingue, il testo è salvato per lingua.',
  newsCmsTechBlock: 'Riquadro tecnico',
  newsCmsTechHeading: 'Titolo',
  newsCmsTechValue: 'Valore / descrizione',
  newsCmsFieldSpecRows: 'Specifiche',
  newsCmsFieldSpecRowsHelp: 'Aggiungi righe con etichetta e valore. Il testo è salvato per lingua.',
  newsCmsSpecLabel: 'Etichetta',
  newsCmsSpecValue: 'Valore',
  newsCmsAddSpec: '+ Aggiungi specifica',
  newsCmsRemoveSpec: 'Rimuovi',
  newsCmsSpecificationsTitle: 'SPECIFICHE',
  newsCmsTechHighlightsTitle: 'PUNTI TECNICI',
};

const hu: Dict = {
  newsCmsFieldTechBlocks: 'Műszaki kiemelések',
  newsCmsFieldTechBlocksHelp: 'Négy rögzített doboz. Az ikon és a szín minden nyelvre érvényes, a szöveg nyelvenként tárolódik.',
  newsCmsTechBlock: 'Műszaki doboz',
  newsCmsTechHeading: 'Cím',
  newsCmsTechValue: 'Érték / leírás',
  newsCmsFieldSpecRows: 'Műszaki adatok',
  newsCmsFieldSpecRowsHelp: 'Adjon hozzá címke-érték sorokat. A szöveg nyelvenként tárolódik.',
  newsCmsSpecLabel: 'Címke',
  newsCmsSpecValue: 'Érték',
  newsCmsAddSpec: '+ Műszaki adat hozzáadása',
  newsCmsRemoveSpec: 'Eltávolítás',
  newsCmsSpecificationsTitle: 'MŰSZAKI ADATOK',
  newsCmsTechHighlightsTitle: 'MŰSZAKI KIEMELÉSEK',
};

const sv: Dict = {
  newsCmsFieldTechBlocks: 'Tekniska höjdpunkter',
  newsCmsFieldTechBlocksHelp: 'Fyra fasta rutor. Ikon och färg delas mellan språk, text sparas per språk.',
  newsCmsTechBlock: 'Teknisk ruta',
  newsCmsTechHeading: 'Rubrik',
  newsCmsTechValue: 'Värde / beskrivning',
  newsCmsFieldSpecRows: 'Specifikationer',
  newsCmsFieldSpecRowsHelp: 'Lägg till rader med etikett och värde. Text sparas per språk.',
  newsCmsSpecLabel: 'Etikett',
  newsCmsSpecValue: 'Värde',
  newsCmsAddSpec: '+ Lägg till specifikation',
  newsCmsRemoveSpec: 'Ta bort',
  newsCmsSpecificationsTitle: 'SPECIFIKATIONER',
  newsCmsTechHighlightsTitle: 'TEKNISKA HÖJDPUNKTER',
};

const fr: Dict = {
  newsCmsFieldTechBlocks: 'Points techniques',
  newsCmsFieldTechBlocksHelp: 'Quatre blocs fixes. L’icône et la couleur sont partagées entre les langues, le texte est enregistré par langue.',
  newsCmsTechBlock: 'Bloc technique',
  newsCmsTechHeading: 'Titre',
  newsCmsTechValue: 'Valeur / description',
  newsCmsFieldSpecRows: 'Spécifications',
  newsCmsFieldSpecRowsHelp: 'Ajoutez des lignes libellé/valeur. Le texte est enregistré par langue.',
  newsCmsSpecLabel: 'Libellé',
  newsCmsSpecValue: 'Valeur',
  newsCmsAddSpec: '+ Ajouter une spécification',
  newsCmsRemoveSpec: 'Supprimer',
  newsCmsSpecificationsTitle: 'SPÉCIFICATIONS',
  newsCmsTechHighlightsTitle: 'POINTS TECHNIQUES',
};

const pl: Dict = {
  newsCmsFieldTechBlocks: 'Najważniejsze dane techniczne',
  newsCmsFieldTechBlocksHelp: 'Cztery stałe pola. Ikona i kolor są wspólne dla wszystkich języków, tekst zapisywany jest osobno.',
  newsCmsTechBlock: 'Pole techniczne',
  newsCmsTechHeading: 'Nagłówek',
  newsCmsTechValue: 'Wartość / opis',
  newsCmsFieldSpecRows: 'Specyfikacja',
  newsCmsFieldSpecRowsHelp: 'Dodaj wiersze etykieta/wartość. Tekst zapisywany jest osobno dla każdego języka.',
  newsCmsSpecLabel: 'Etykieta',
  newsCmsSpecValue: 'Wartość',
  newsCmsAddSpec: '+ Dodaj specyfikację',
  newsCmsRemoveSpec: 'Usuń',
  newsCmsSpecificationsTitle: 'SPECYFIKACJA',
  newsCmsTechHighlightsTitle: 'DANE TECHNICZNE',
};

const cs: Dict = {
  newsCmsFieldTechBlocks: 'Technické přednosti',
  newsCmsFieldTechBlocksHelp: 'Čtyři pevné boxy. Ikona a barva jsou společné pro všechny jazyky, text se ukládá pro každý jazyk.',
  newsCmsTechBlock: 'Technický box',
  newsCmsTechHeading: 'Nadpis',
  newsCmsTechValue: 'Hodnota / popis',
  newsCmsFieldSpecRows: 'Specifikace',
  newsCmsFieldSpecRowsHelp: 'Přidejte řádky s popiskem a hodnotou. Text se ukládá pro každý jazyk.',
  newsCmsSpecLabel: 'Popisek',
  newsCmsSpecValue: 'Hodnota',
  newsCmsAddSpec: '+ Přidat specifikaci',
  newsCmsRemoveSpec: 'Odebrat',
  newsCmsSpecificationsTitle: 'SPECIFIKACE',
  newsCmsTechHighlightsTitle: 'TECHNICKÉ PŘEDNOSTI',
};

export const NEWS_CMS_TECH_TRANSLATIONS: Record<PortalUiLanguage, Dict> = { da, en, de, it, hu, sv, fr, pl, cs };
