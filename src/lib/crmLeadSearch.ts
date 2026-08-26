export function normalizeLeadSearchText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function compactLeadSearchText(value: string | null | undefined): string {
  return normalizeLeadSearchText(value).replace(/[^a-z0-9]/g, '');
}

export function matchesLeadSearch(
  fields: Array<string | null | undefined>,
  rawQuery: string,
): boolean {
  const query = normalizeLeadSearchText(rawQuery);
  if (!query) return true;

  const compactQuery = compactLeadSearchText(query);
  return fields.some((field) => {
    const normalized = normalizeLeadSearchText(field);
    if (normalized.includes(query)) return true;
    return compactQuery.length > 0 && compactLeadSearchText(field).includes(compactQuery);
  });
}
