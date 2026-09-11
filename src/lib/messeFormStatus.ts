export function messeFormSectionStatusClass(complete: boolean, hasError: boolean): string {
  if (hasError) return 'border-rose-200 bg-rose-50/70';
  return complete
    ? 'border-emerald-200 bg-emerald-50/55'
    : 'border-amber-200 bg-amber-50/55';
}
