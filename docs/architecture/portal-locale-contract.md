# Portal Locale Contract

The top navigation language selector is the source of truth for user-facing portal language.

Use `useLanguage().uiLanguage` for new UI labels and dynamic portal content. Use `useLanguage().language` only for legacy modules that still support the older five-language `Language` type.

Dynamic CMS content must resolve content in this order:

1. The selected `uiLanguage`.
2. A real stored fallback only when the selected language is missing.

New News CMS saves and publishes must prepare all supported portal languages automatically. Manual translation controls may exist as recovery tools, but they must not be required in the normal marketing workflow.
