import { describe, expect, it } from 'vitest';
import { messeFormSectionStatusClass } from '@/lib/messeFormStatus';

describe('messe form section status styling', () => {
  it('uses a calm amber state until a required section is complete', () => {
    expect(messeFormSectionStatusClass(false, false)).toContain('amber-');
  });

  it('uses a calm green state for completed sections', () => {
    expect(messeFormSectionStatusClass(true, false)).toContain('emerald-');
  });

  it('keeps existing submit-error feedback above visual completion status', () => {
    expect(messeFormSectionStatusClass(true, true)).toContain('rose-');
  });
});
