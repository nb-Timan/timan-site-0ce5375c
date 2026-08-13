-- Phase 68: allow one fixed custom News CMS renderer for the Timan 3330 seat news draft.
-- This only extends the template_id allow-list. It does not modify existing data.

alter table public.news_posts
  drop constraint if exists news_posts_template_id_check;

alter table public.news_posts
  add constraint news_posts_template_id_check
  check (
    template_id in (
      'legacy_card',
      'template-01-product-announcement',
      'template-02-split-story',
      'template-03-hero-news',
      'template-04-technical-feature',
      'template-05-story-layout',
      'template-06-flyer',
      'custom-timan-3330-seat'
    )
  );
