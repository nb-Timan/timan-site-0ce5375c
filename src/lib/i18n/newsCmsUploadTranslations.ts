import type { PortalUiLanguage } from '@/lib/portalLanguages';

type Dict = Record<string, string>;

const da: Dict = {
  newsCmsImageDropTitle: 'Træk billede hertil eller klik for at vælge',
  newsCmsImageDropHelp: 'JPG, PNG, WebP eller GIF uploades til News CMS.',
  newsCmsImageReplace: 'Skift billede',
  newsCmsImageRemove: 'Fjern billede',
  newsCmsImagePasteUrl: 'Indsæt URL eller upload billede',
  newsCmsImageManualUrlHelp: 'Du kan også indsætte et direkte billedlink manuelt.',
  newsCmsImageUploading: 'Uploader billede...',
  newsCmsImageUploadFailed: 'Upload fejlede. Tjek at news-assets storage er oprettet i Supabase.',
  newsCmsImageInvalidFile: 'Vælg en billedfil.',
};

const en: Dict = {
  newsCmsImageDropTitle: 'Drop image here or click to choose',
  newsCmsImageDropHelp: 'JPG, PNG, WebP or GIF is uploaded to News CMS.',
  newsCmsImageReplace: 'Replace image',
  newsCmsImageRemove: 'Remove image',
  newsCmsImagePasteUrl: 'Paste URL or upload image',
  newsCmsImageManualUrlHelp: 'You can also paste a direct image link manually.',
  newsCmsImageUploading: 'Uploading image...',
  newsCmsImageUploadFailed: 'Upload failed. Check that news-assets storage exists in Supabase.',
  newsCmsImageInvalidFile: 'Choose an image file.',
};

const de: Dict = {
  newsCmsImageDropTitle: 'Bild hier ablegen oder klicken',
  newsCmsImageDropHelp: 'JPG, PNG, WebP oder GIF wird in News CMS hochgeladen.',
  newsCmsImageReplace: 'Bild ersetzen',
  newsCmsImageRemove: 'Bild entfernen',
  newsCmsImagePasteUrl: 'URL einfügen oder Bild hochladen',
  newsCmsImageManualUrlHelp: 'Sie können auch einen direkten Bildlink einfügen.',
  newsCmsImageUploading: 'Bild wird hochgeladen...',
  newsCmsImageUploadFailed: 'Upload fehlgeschlagen. Prüfen Sie, ob news-assets in Supabase existiert.',
  newsCmsImageInvalidFile: 'Wählen Sie eine Bilddatei.',
};

const it: Dict = {
  newsCmsImageDropTitle: "Trascina l'immagine qui o clicca",
  newsCmsImageDropHelp: 'JPG, PNG, WebP o GIF viene caricato in News CMS.',
  newsCmsImageReplace: 'Sostituisci immagine',
  newsCmsImageRemove: 'Rimuovi immagine',
  newsCmsImagePasteUrl: 'Incolla URL o carica immagine',
  newsCmsImageManualUrlHelp: 'Puoi anche incollare un link diretto all’immagine.',
  newsCmsImageUploading: 'Caricamento immagine...',
  newsCmsImageUploadFailed: 'Caricamento non riuscito. Verifica che news-assets esista in Supabase.',
  newsCmsImageInvalidFile: 'Scegli un file immagine.',
};

const hu: Dict = {
  newsCmsImageDropTitle: 'Húzd ide a képet vagy kattints',
  newsCmsImageDropHelp: 'JPG, PNG, WebP vagy GIF feltöltése a News CMS-be.',
  newsCmsImageReplace: 'Kép cseréje',
  newsCmsImageRemove: 'Kép eltávolítása',
  newsCmsImagePasteUrl: 'URL beillesztése vagy kép feltöltése',
  newsCmsImageManualUrlHelp: 'Közvetlen kép URL-t is beilleszthetsz.',
  newsCmsImageUploading: 'Kép feltöltése...',
  newsCmsImageUploadFailed: 'A feltöltés sikertelen. Ellenőrizd a news-assets tárhelyet Supabase-ben.',
  newsCmsImageInvalidFile: 'Válassz képfájlt.',
};

const sv: Dict = {
  newsCmsImageDropTitle: 'Dra bilden hit eller klicka',
  newsCmsImageDropHelp: 'JPG, PNG, WebP eller GIF laddas upp till News CMS.',
  newsCmsImageReplace: 'Byt bild',
  newsCmsImageRemove: 'Ta bort bild',
  newsCmsImagePasteUrl: 'Klistra in URL eller ladda upp bild',
  newsCmsImageManualUrlHelp: 'Du kan också klistra in en direkt bildlänk.',
  newsCmsImageUploading: 'Laddar upp bild...',
  newsCmsImageUploadFailed: 'Uppladdning misslyckades. Kontrollera att news-assets finns i Supabase.',
  newsCmsImageInvalidFile: 'Välj en bildfil.',
};

const fr: Dict = {
  newsCmsImageDropTitle: 'Déposez l’image ici ou cliquez',
  newsCmsImageDropHelp: 'JPG, PNG, WebP ou GIF est envoyé au News CMS.',
  newsCmsImageReplace: 'Remplacer l’image',
  newsCmsImageRemove: 'Supprimer l’image',
  newsCmsImagePasteUrl: 'Coller une URL ou importer une image',
  newsCmsImageManualUrlHelp: 'Vous pouvez aussi coller un lien direct vers une image.',
  newsCmsImageUploading: 'Import de l’image...',
  newsCmsImageUploadFailed: 'Échec de l’import. Vérifiez que news-assets existe dans Supabase.',
  newsCmsImageInvalidFile: 'Choisissez un fichier image.',
};

const pl: Dict = {
  newsCmsImageDropTitle: 'Upuść obraz tutaj lub kliknij',
  newsCmsImageDropHelp: 'JPG, PNG, WebP lub GIF zostanie przesłany do News CMS.',
  newsCmsImageReplace: 'Zmień obraz',
  newsCmsImageRemove: 'Usuń obraz',
  newsCmsImagePasteUrl: 'Wklej URL lub prześlij obraz',
  newsCmsImageManualUrlHelp: 'Możesz też wkleić bezpośredni link do obrazu.',
  newsCmsImageUploading: 'Przesyłanie obrazu...',
  newsCmsImageUploadFailed: 'Przesyłanie nie powiodło się. Sprawdź, czy news-assets istnieje w Supabase.',
  newsCmsImageInvalidFile: 'Wybierz plik obrazu.',
};

const cs: Dict = {
  newsCmsImageDropTitle: 'Přetáhněte obrázek sem nebo klikněte',
  newsCmsImageDropHelp: 'JPG, PNG, WebP nebo GIF se nahraje do News CMS.',
  newsCmsImageReplace: 'Vyměnit obrázek',
  newsCmsImageRemove: 'Odebrat obrázek',
  newsCmsImagePasteUrl: 'Vložit URL nebo nahrát obrázek',
  newsCmsImageManualUrlHelp: 'Můžete také vložit přímý odkaz na obrázek.',
  newsCmsImageUploading: 'Nahrávání obrázku...',
  newsCmsImageUploadFailed: 'Nahrání selhalo. Zkontrolujte, že news-assets existuje v Supabase.',
  newsCmsImageInvalidFile: 'Vyberte obrázkový soubor.',
};

export const NEWS_CMS_UPLOAD_TRANSLATIONS: Record<PortalUiLanguage, Dict> = {
  da,
  en,
  de,
  it,
  hu,
  sv,
  fr,
  pl,
  cs,
};
