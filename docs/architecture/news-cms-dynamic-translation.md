# News CMS Dynamic Translation

This project did not contain an approved dynamic AI/translation provider before this preparation.

The prepared Supabase Edge Function is:

- `translate-news-content`

It is intentionally not deployed yet.

Required Supabase Secret before deployment:

- `OPENAI_API_KEY`

Optional Supabase Secret:

- `OPENAI_TRANSLATION_MODEL` (defaults to `gpt-4.1-mini`)

Existing convention followed:

- Secrets are read only inside Supabase Edge Functions with `Deno.env.get(...)`.
- The browser never receives provider API keys.
- The caller sends a Supabase Auth JWT.
- The function verifies `app_users` access before calling OpenAI.

Manual translation protection:

- The function returns `translationMeta`.
- Store this metadata with the news post, for example in `template_data.news_translation_meta`.
- A target text with matching auto metadata can be regenerated when source text changes.
- A target text without matching auto metadata is treated as manual and is not overwritten.

The function only translates text fields. Images, files, URLs, icons, colors, booleans, IDs and layout values are copied or skipped.
