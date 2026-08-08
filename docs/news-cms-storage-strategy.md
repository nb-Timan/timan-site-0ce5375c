# News CMS storage strategy

Status: proposal only. Do not create buckets before the correct live Supabase
project has been verified.

## Recommended bucket

Create one private Supabase Storage bucket later:

- `news-assets`

Keep it private. The app should use signed URLs for draft/preview access and
public URLs or long-lived signed URLs only for published assets.

## Folder structure

```text
news-assets/
  drafts/
    {post_id}/
      images/
      flyers/
      previews/
  published/
    {post_id}/
      images/
      flyers/
      previews/
```

## Asset types

- News images: `drafts/{post_id}/images/{asset_id}.{ext}`
- Flyer files: `drafts/{post_id}/flyers/{asset_id}.pdf`
- Preview renders: `drafts/{post_id}/previews/{asset_id}.{ext}`
- Published assets: copy or move approved files to `published/{post_id}/...`

## Access model

- Draft assets: only users with `news_manage` or Timan Backend access.
- Preview assets: signed URLs generated on demand.
- Published assets: readable by the portal news pages.
- Upload/delete: only users with `news_manage` or Timan Backend access.

## Why this matches the project

The code already uses Supabase Storage for controlled file flows such as
machine uploads and generated PDFs. A private bucket with predictable paths
keeps the News CMS compatible with those patterns and avoids exposing drafts.
