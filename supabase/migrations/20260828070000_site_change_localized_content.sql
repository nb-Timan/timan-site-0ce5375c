-- Localized public changelog content for "Hvad er nyt?".
-- Existing public fields stay in place for fallback/backwards compatibility.

alter table public.site_change_entries
  add column if not exists localized_content jsonb not null default '{}'::jsonb;

alter table public.site_change_public_entries
  add column if not exists localized_content jsonb not null default '{}'::jsonb;

create index if not exists site_change_entries_localized_content_gin
  on public.site_change_entries using gin (localized_content);

create or replace function public.site_change_public_content(
  localized jsonb,
  title_fallback text,
  description_fallback text,
  module_key text,
  change_type_key text
)
returns jsonb
language sql
immutable
as $$
  select coalesce(localized, '{}'::jsonb) || jsonb_build_object(
    'da',
    coalesce(localized -> 'da', '{}'::jsonb) || jsonb_build_object(
      'title', coalesce(nullif(localized #>> '{da,title}', ''), title_fallback, ''),
      'description', coalesce(nullif(localized #>> '{da,description}', ''), description_fallback, ''),
      'note', coalesce(nullif(localized #>> '{da,note}', ''), title_fallback, ''),
      'module_label', coalesce(nullif(localized #>> '{da,module_label}', ''), module_key, ''),
      'change_type_label', coalesce(nullif(localized #>> '{da,change_type_label}', ''), change_type_key, '')
    )
  );
$$;

update public.site_change_entries
set localized_content = public.site_change_public_content(
  localized_content,
  coalesce(nullif(title_public, ''), title_internal),
  nullif(coalesce(description_public, ''), ''),
  module,
  change_type
)
where localized_content = '{}'::jsonb
   or not (localized_content ? 'da');

update public.site_change_public_entries
set localized_content = public.site_change_public_content(
  localized_content,
  title,
  description,
  module,
  change_type
)
where localized_content = '{}'::jsonb
   or not (localized_content ? 'da');

create or replace function public.sync_site_change_public_entry()
returns trigger
language plpgsql
as $$
declare
  public_title text;
  public_description text;
  public_localized_content jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.site_change_public_entries where id = old.id;
    return old;
  end if;

  if new.status = 'published' then
    public_title := coalesce(nullif(new.title_public, ''), nullif(new.localized_content #>> '{da,title}', ''), new.title_internal);
    public_description := nullif(coalesce(new.description_public, new.localized_content #>> '{da,description}', ''), '');
    public_localized_content := public.site_change_public_content(
      new.localized_content,
      public_title,
      public_description,
      new.module,
      new.change_type
    );

    insert into public.site_change_public_entries (
      id,
      published_at,
      implemented_at,
      title,
      description,
      localized_content,
      module,
      change_type,
      affected_roles,
      is_important,
      source_ref,
      updated_at
    )
    values (
      new.id,
      coalesce(new.published_at, now()),
      new.implemented_at,
      public_title,
      public_description,
      public_localized_content,
      new.module,
      new.change_type,
      coalesce(new.affected_roles, array['all']::text[]),
      new.is_important,
      new.source_ref,
      now()
    )
    on conflict (id) do update set
      published_at = excluded.published_at,
      implemented_at = excluded.implemented_at,
      title = excluded.title,
      description = excluded.description,
      localized_content = excluded.localized_content,
      module = excluded.module,
      change_type = excluded.change_type,
      affected_roles = excluded.affected_roles,
      is_important = excluded.is_important,
      source_ref = excluded.source_ref,
      updated_at = now();

    if new.published_at is null then
      new.published_at = now();
    end if;
  else
    delete from public.site_change_public_entries where id = new.id;
  end if;

  return new;
end;
$$;

-- Backfill known week entries with reviewed public text in the languages
-- currently needed by the portal front page. Missing languages stay visible in
-- Marketing and fall back to English, then Danish/original.
update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'Dealers can view their own CRM and dealer data',
    'description', 'Dealer data and CRM views can now open in a more focused way for external roles and partners.',
    'note', 'Dealer data improved'
  ),
  'de', jsonb_build_object(
    'title', 'Händler können ihre eigenen CRM- und Händlerdaten einsehen',
    'description', 'Händlerdaten und CRM-Ansichten können jetzt gezielter für externe Rollen und Partner geöffnet werden.',
    'note', 'Händlerdaten verbessert'
  ),
  'fr', jsonb_build_object(
    'title', 'Les revendeurs peuvent consulter leurs propres données CRM et revendeur',
    'description', 'Les vues Données revendeur et CRM peuvent désormais s’ouvrir de façon plus ciblée pour les rôles externes et les partenaires.',
    'note', 'Données revendeur améliorées'
  )
)
where source_ref = 'week-2026-08-24:external-crm-scope';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'Leads are easier to find and follow up',
    'description', 'CRM Leads now has better filters, search and follow-up display so sellers can see what needs attention faster.',
    'note', 'Leads improved'
  ),
  'de', jsonb_build_object(
    'title', 'Leads sind leichter zu finden und nachzuverfolgen',
    'description', 'CRM Leads bietet jetzt bessere Filter, Suche und Follow-up-Anzeige, damit Verkäufer schneller sehen, was Aufmerksamkeit benötigt.',
    'note', 'Leads verbessert'
  ),
  'fr', jsonb_build_object(
    'title', 'Les leads sont plus faciles à trouver et à suivre',
    'description', 'CRM Leads dispose maintenant de meilleurs filtres, d’une recherche améliorée et d’un affichage de suivi plus clair.',
    'note', 'Leads améliorés'
  )
)
where source_ref = 'week-2026-08-24:crm-leads-overview';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'Exhibition form is ready for trade fairs',
    'description', 'Leads and contact details can be registered more safely and efficiently directly from the exhibition.',
    'note', 'Exhibition form improved'
  ),
  'de', jsonb_build_object(
    'title', 'Messeformular ist bereit für Messen',
    'description', 'Leads und Kontaktdaten können direkt auf der Messe sicherer und effizienter registriert werden.',
    'note', 'Messeformular verbessert'
  ),
  'fr', jsonb_build_object(
    'title', 'Le formulaire salon est prêt pour les événements',
    'description', 'Les leads et coordonnées peuvent être enregistrés plus sûrement et plus efficacement directement depuis le salon.',
    'note', 'Formulaire salon amélioré'
  )
)
where source_ref = 'week-2026-08-24:messe-lead-flow';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'News is easier to translate and adjust',
    'description', 'Marketing can work better with languages, typography and display in news templates.',
    'note', 'Marketing translations improved'
  ),
  'de', jsonb_build_object(
    'title', 'Nachrichten lassen sich leichter übersetzen und anpassen',
    'description', 'Marketing kann besser mit Sprachen, Typografie und Darstellung in Nachrichtenvorlagen arbeiten.',
    'note', 'Marketing-Übersetzungen verbessert'
  ),
  'fr', jsonb_build_object(
    'title', 'Les actualités sont plus faciles à traduire et adapter',
    'description', 'Marketing peut mieux gérer les langues, la typographie et l’affichage dans les modèles d’actualités.',
    'note', 'Traductions marketing améliorées'
  )
)
where source_ref = 'week-2026-08-24:news-cms-translation-typography';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'New features can be reviewed before publishing',
    'description', 'Marketing can now review site changes and choose what appears under What’s new.',
    'note', 'Site changes can be published'
  ),
  'de', jsonb_build_object(
    'title', 'Neue Funktionen können vor der Veröffentlichung geprüft werden',
    'description', 'Marketing kann jetzt Änderungen am Portal prüfen und auswählen, was unter Was ist neu erscheint.',
    'note', 'Portaländerungen können veröffentlicht werden'
  ),
  'fr', jsonb_build_object(
    'title', 'Les nouvelles fonctionnalités peuvent être vérifiées avant publication',
    'description', 'Marketing peut maintenant examiner les changements du site et choisir ce qui apparaît sous Quoi de neuf.',
    'note', 'Changements publiables'
  )
)
where source_ref = 'week-2026-08-24:site-feature-changelog';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'New postcode map for Germany',
    'description', 'The partner map can now show Germany split into PLZ2 postcode areas so coverage can be assessed more precisely.',
    'note', 'German postcode map added'
  ),
  'de', jsonb_build_object(
    'title', 'Neue Postleitzahlkarte für Deutschland',
    'description', 'Die Partnerkarte kann Deutschland jetzt nach PLZ2-Postleitzahlgebieten anzeigen, damit Abdeckung und Gebiete genauer bewertet werden können.',
    'note', 'Deutsche Postleitzahlkarte hinzugefügt'
  ),
  'fr', jsonb_build_object(
    'title', 'Nouvelle carte des codes postaux pour l’Allemagne',
    'description', 'La carte partenaires peut maintenant afficher l’Allemagne par zones postales PLZ2 pour évaluer la couverture plus précisément.',
    'note', 'Carte postale allemande ajoutée'
  )
)
where source_ref = 'week-2026-08-24:partner-map-plz2';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'Better address placement on the partner map',
    'description', 'The partner map now handles dealer addresses and missing coordinates more clearly.',
    'note', 'Partner map geocoding improved'
  ),
  'de', jsonb_build_object(
    'title', 'Bessere Adressplatzierung auf der Partnerkarte',
    'description', 'Die Partnerkarte behandelt Händleradressen und fehlende Koordinaten jetzt deutlicher.',
    'note', 'Geokodierung der Partnerkarte verbessert'
  ),
  'fr', jsonb_build_object(
    'title', 'Meilleur placement des adresses sur la carte partenaires',
    'description', 'La carte partenaires gère maintenant plus clairement les adresses revendeurs et les coordonnées manquantes.',
    'note', 'Géocodage de la carte amélioré'
  )
)
where source_ref = 'week-2026-08-24:partner-map-geocoding';

update public.site_change_entries
set localized_content = localized_content || jsonb_build_object(
  'en', jsonb_build_object(
    'title', 'Standard and Dark maps are stabilized',
    'description', 'The partner map’s Standard and Dark map layers can now load through public runtime configuration.',
    'note', 'CARTO maps stabilized'
  ),
  'de', jsonb_build_object(
    'title', 'Standard- und Dunkelkarten sind stabilisiert',
    'description', 'Die Standard- und Dunkel-Kartenebenen der Partnerkarte können jetzt über öffentliche Runtime-Konfiguration geladen werden.',
    'note', 'CARTO-Karten stabilisiert'
  ),
  'fr', jsonb_build_object(
    'title', 'Les cartes Standard et Sombre sont stabilisées',
    'description', 'Les couches Standard et Sombre de la carte partenaires peuvent maintenant être chargées via la configuration runtime publique.',
    'note', 'Cartes CARTO stabilisées'
  )
)
where source_ref = 'week-2026-08-24:carto-runtime-config';

update public.site_change_public_entries public_row
set localized_content = entry.localized_content
from public.site_change_entries entry
where entry.id = public_row.id;
