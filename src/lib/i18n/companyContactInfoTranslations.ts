import type { PortalUiLanguage } from "@/lib/portalLanguages";

type CompanyContactInfoCopy = {
  title: string;
  subtitle: string;
  intro: string;
  sections: string[];
};

const COPY: Record<PortalUiLanguage, CompanyContactInfoCopy> = {
  da: {
    title: "Ny samarbejdspartner",
    subtitle: "Virksomheds- og kontaktoplysninger",
    intro:
      "Udfyld virksomhedens oplysninger for at komme videre i processen som potentiel samarbejdspartner med Timan.\n\n" +
      "Oplysningerne bruges til at oprette virksomheden i vores system og sikre, at vi har de korrekte kontaktpersoner inden for blandt andet ledelse, økonomi, indkøb, salg, service og marketing.\n\n" +
      "Når oplysningerne er indsendt, gennemgår Timan dem. Når virksomheden er godkendt og aktiveret, kan den få adgang til partnerportalen. Herefter kan Timan ved behov åbne kontraktforløbet, så aftalen kan gennemgås og efterfølgende underskrives.\n\n" +
      "Har virksomheden allerede oplysninger registreret hos Timan, kan formularen også bruges til at kontrollere og opdatere dem.\n\n" +
      "* Påkrævet felt",
    sections: ["1. Virksomhed & ledelse", "2. Økonomi afdeling", "3. Medier", "4. Salgsafdeling", "5. Værksted og reservedele", "6. Marketing", "7. Til sidst"],
  },
  en: {
    title: "New collaboration partner",
    subtitle: "Company and contact information",
    intro:
      "Fill in the company's information to continue the process as a potential collaboration partner with Timan.\n\n" +
      "The information is used to create the company in our system and ensure that we have the correct contact people across management, finance, purchasing, sales, service and marketing.\n\n" +
      "After the information is submitted, Timan reviews it. When the company is approved and activated, it can get access to the partner portal. Timan can then open the contract flow when needed, so the agreement can be reviewed and later signed.\n\n" +
      "If the company already has information registered with Timan, the form can also be used to check and update it.\n\n" +
      "* Required field",
    sections: ["1. Company & management", "2. Finance department", "3. Media", "4. Sales department", "5. Workshop and spare parts", "6. Marketing", "7. Finally"],
  },
  de: {
    title: "Neuer Kooperationspartner",
    subtitle: "Unternehmens- und Kontaktdaten",
    intro:
      "Füllen Sie die Unternehmensdaten aus, um den Prozess als potenzieller Kooperationspartner von Timan fortzusetzen.\n\n" +
      "Die Angaben werden verwendet, um das Unternehmen in unserem System anzulegen und sicherzustellen, dass wir die richtigen Kontaktpersonen für Geschäftsführung, Finanzen, Einkauf, Vertrieb, Service und Marketing haben.\n\n" +
      "Nach dem Absenden prüft Timan die Angaben. Wenn das Unternehmen genehmigt und aktiviert ist, kann es Zugriff auf das Partnerportal erhalten. Danach kann Timan bei Bedarf den Vertragsprozess öffnen, damit die Vereinbarung geprüft und anschließend unterzeichnet werden kann.\n\n" +
      "Wenn für das Unternehmen bereits Angaben bei Timan registriert sind, kann das Formular auch zur Kontrolle und Aktualisierung verwendet werden.\n\n" +
      "* Pflichtfeld",
    sections: ["1. Unternehmen & Leitung", "2. Finanzabteilung", "3. Medien", "4. Vertriebsabteilung", "5. Werkstatt und Ersatzteile", "6. Marketing", "7. Zum Schluss"],
  },
  it: {
    title: "Nuovo partner di collaborazione",
    subtitle: "Informazioni aziendali e di contatto",
    intro:
      "Compila le informazioni dell'azienda per proseguire il processo come potenziale partner di collaborazione con Timan.\n\n" +
      "Le informazioni vengono usate per creare l'azienda nel nostro sistema e assicurarci di avere i contatti corretti per direzione, finanza, acquisti, vendite, assistenza e marketing.\n\n" +
      "Dopo l'invio, Timan esamina le informazioni. Quando l'azienda viene approvata e attivata, può ottenere accesso al portale partner. In seguito Timan può aprire il flusso contrattuale quando necessario, così l'accordo può essere esaminato e poi firmato.\n\n" +
      "Se l'azienda ha già informazioni registrate presso Timan, il modulo può essere usato anche per verificarle e aggiornarle.\n\n" +
      "* Campo obbligatorio",
    sections: ["1. Azienda e direzione", "2. Reparto finanza", "3. Media", "4. Reparto vendite", "5. Officina e ricambi", "6. Marketing", "7. Infine"],
  },
  hu: {
    title: "Új együttműködő partner",
    subtitle: "Cég- és kapcsolati adatok",
    intro:
      "Töltse ki a vállalat adatait, hogy Timan lehetséges együttműködő partnereként tovább lehessen lépni a folyamatban.\n\n" +
      "Az adatokat arra használjuk, hogy létrehozzuk a vállalatot a rendszerünkben, és biztosítsuk, hogy a vezetés, pénzügy, beszerzés, értékesítés, szerviz és marketing területén a megfelelő kapcsolattartóink legyenek.\n\n" +
      "A beküldés után Timan átnézi az adatokat. Amikor a vállalat jóváhagyásra és aktiválásra kerül, hozzáférést kaphat a partnerportálhoz. Ezután Timan szükség esetén megnyithatja a szerződéses folyamatot, hogy a megállapodást át lehessen tekinteni és később alá lehessen írni.\n\n" +
      "Ha a vállalat adatai már szerepelnek Timannál, az űrlap azok ellenőrzésére és frissítésére is használható.\n\n" +
      "* Kötelező mező",
    sections: ["1. Vállalat és vezetés", "2. Pénzügyi osztály", "3. Média", "4. Értékesítési osztály", "5. Műhely és alkatrészek", "6. Marketing", "7. Végül"],
  },
  sv: {
    title: "Ny samarbetspartner",
    subtitle: "Företags- och kontaktuppgifter",
    intro:
      "Fyll i företagets uppgifter för att gå vidare i processen som potentiell samarbetspartner med Timan.\n\n" +
      "Uppgifterna används för att skapa företaget i vårt system och säkerställa att vi har rätt kontaktpersoner inom ledning, ekonomi, inköp, försäljning, service och marknadsföring.\n\n" +
      "När uppgifterna har skickats in granskar Timan dem. När företaget är godkänt och aktiverat kan det få åtkomst till partnerportalen. Därefter kan Timan vid behov öppna avtalsflödet, så att avtalet kan granskas och senare undertecknas.\n\n" +
      "Om företaget redan har uppgifter registrerade hos Timan kan formuläret också användas för att kontrollera och uppdatera dem.\n\n" +
      "* Obligatoriskt fält",
    sections: ["1. Företag & ledning", "2. Ekonomiavdelning", "3. Media", "4. Försäljningsavdelning", "5. Verkstad och reservdelar", "6. Marknadsföring", "7. Till sist"],
  },
  fr: {
    title: "Nouveau partenaire de collaboration",
    subtitle: "Informations entreprise et contact",
    intro:
      "Renseignez les informations de l'entreprise pour poursuivre le processus en tant que partenaire potentiel de Timan.\n\n" +
      "Ces informations sont utilisées pour créer l'entreprise dans notre système et nous assurer que nous disposons des bons contacts pour la direction, la finance, les achats, les ventes, le service et le marketing.\n\n" +
      "Une fois les informations envoyées, Timan les examine. Lorsque l'entreprise est approuvée et activée, elle peut obtenir l'accès au portail partenaire. Timan peut ensuite ouvrir le parcours contractuel si nécessaire, afin que l'accord puisse être examiné puis signé.\n\n" +
      "Si l'entreprise dispose déjà d'informations enregistrées chez Timan, le formulaire peut également être utilisé pour les vérifier et les mettre à jour.\n\n" +
      "* Champ obligatoire",
    sections: ["1. Entreprise & direction", "2. Service finance", "3. Médias", "4. Service ventes", "5. Atelier et pièces détachées", "6. Marketing", "7. Pour finir"],
  },
  pl: {
    title: "Nowy partner współpracy",
    subtitle: "Dane firmy i kontaktu",
    intro:
      "Wypełnij dane firmy, aby kontynuować proces jako potencjalny partner współpracy z Timan.\n\n" +
      "Informacje są używane do utworzenia firmy w naszym systemie i zapewnienia, że mamy właściwe osoby kontaktowe w obszarach zarządu, finansów, zakupów, sprzedaży, serwisu i marketingu.\n\n" +
      "Po przesłaniu informacji Timan je sprawdza. Gdy firma zostanie zatwierdzona i aktywowana, może uzyskać dostęp do portalu partnerskiego. Następnie Timan może w razie potrzeby otworzyć proces umowy, aby można było ją przejrzeć i później podpisać.\n\n" +
      "Jeśli firma ma już dane zarejestrowane w Timan, formularz może również służyć do ich sprawdzenia i aktualizacji.\n\n" +
      "* Pole wymagane",
    sections: ["1. Firma i zarząd", "2. Dział finansów", "3. Media", "4. Dział sprzedaży", "5. Warsztat i części zamienne", "6. Marketing", "7. Na koniec"],
  },
  cs: {
    title: "Nový spolupracující partner",
    subtitle: "Firemní a kontaktní údaje",
    intro:
      "Vyplňte údaje společnosti, abyste mohli pokračovat v procesu jako potenciální spolupracující partner Timan.\n\n" +
      "Údaje se používají k vytvoření společnosti v našem systému a k zajištění správných kontaktních osob pro vedení, finance, nákup, prodej, servis a marketing.\n\n" +
      "Po odeslání Timan údaje zkontroluje. Jakmile je společnost schválena a aktivována, může získat přístup do partnerského portálu. Poté může Timan podle potřeby otevřít smluvní proces, aby bylo možné dohodu zkontrolovat a následně podepsat.\n\n" +
      "Pokud má společnost u Timan již údaje registrované, lze formulář použít také k jejich kontrole a aktualizaci.\n\n" +
      "* Povinné pole",
    sections: ["1. Společnost a vedení", "2. Finanční oddělení", "3. Média", "4. Prodejní oddělení", "5. Dílna a náhradní díly", "6. Marketing", "7. Nakonec"],
  },
};

export function getCompanyContactInfoCopy(language: PortalUiLanguage): CompanyContactInfoCopy {
  return COPY[language] ?? COPY.en;
}
