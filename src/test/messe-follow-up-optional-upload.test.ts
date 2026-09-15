import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/messe/MesseFollowUpPage.tsx', 'utf8');

describe('Messe follow-up optional business card upload', () => {
  it('labels the upload as optional and requires an explicit choice before showing it', () => {
    expect(source).toContain("3a. Visitkort / billeder (valgfrit, maks. 3)");
    expect(source).toContain("const [wantsBusinessCardUpload, setWantsBusinessCardUpload] = useState(false);");
    expect(source).toContain("{f('addBusinessCard')}");
    expect(source).toContain('{wantsBusinessCardUpload && (');
  });

  it('does not let an attachment replace the required manual customer information', () => {
    expect(source).toContain("if (!hasCustomerInfo) {");
    expect(source).toContain("errors.customerInfo = f('errCustomerInfo');");
    expect(source).not.toContain('if (!hasCustomerInfo && !hasBusinessCard)');
    expect(source).not.toContain("errors.businessCard = f('errBusinessCard');");
  });

  it('uses the standard file chooser and keeps the existing maximum of three images', () => {
    expect(source).not.toContain('capture="environment"');
    expect(source).toContain('accept="image/*"');
    expect(source).toContain(".slice(0, 3)");
    expect(source).toContain("toast.warning('Der kan maks. vedhæftes 3 billeder')");
  });

  it('clears opted-in files when the upload choice is turned off and skips empty uploads', () => {
    expect(source).toContain('function toggleBusinessCardUpload(enabled: boolean)');
    expect(source).toContain('if (!enabled) {');
    expect(source).toContain('setBusinessCardFiles([]);');
    expect(source).toContain('if (businessCardFiles.length > 0) {');
  });
});
