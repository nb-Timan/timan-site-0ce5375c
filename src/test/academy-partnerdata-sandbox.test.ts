import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { academyPartnerDataSandbox } from '@/lib/academyPartnerDataSandbox';

describe('Academy Partnerdata sandbox', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/portal/dealer-data?academy_mode=true&academy_part=1');
  });

  it('keeps Part 1 incomplete until every local Partnerdata action is completed', () => {
    academyPartnerDataSandbox.start(1);
    academyPartnerDataSandbox.saveProfile({ contactName: 'Academy Kontakt', youtubeChannel: 'https://youtube.com/@academy' });
    expect(academyPartnerDataSandbox.getProgress().part1Completed).toBe(false);

    academyPartnerDataSandbox.choosePrimaryContact('academy-contact-1');
    expect(academyPartnerDataSandbox.getProgress().part1Completed).toBe(true);
    expect(academyPartnerDataSandbox.getState().contactName).toBe('Academy Kontakt');
  });

  it('unlocks and completes Part 2 only after the local relation and invoice actions', () => {
    academyPartnerDataSandbox.start(1);
    expect(() => academyPartnerDataSandbox.start(2)).toThrow('Partnerdata Part 1 skal gennemføres først.');

    academyPartnerDataSandbox.saveProfile({ contactName: 'Academy Kontakt', youtubeChannel: 'https://youtube.com/@academy' });
    academyPartnerDataSandbox.choosePrimaryContact('academy-contact-1');
    academyPartnerDataSandbox.start(2);
    academyPartnerDataSandbox.reviewPartnerRelation();
    expect(academyPartnerDataSandbox.getProgress().part2Completed).toBe(false);
    academyPartnerDataSandbox.reviewInvoiceFlow();
    expect(academyPartnerDataSandbox.getProgress().part2Completed).toBe(true);
  });

  it('persists locally and rejects writes outside Academy mode', () => {
    academyPartnerDataSandbox.start(1);
    academyPartnerDataSandbox.saveProfile({ contactName: 'Academy Kontakt', youtubeChannel: 'https://youtube.com/@academy' });
    academyPartnerDataSandbox.choosePrimaryContact('academy-contact-1');
    expect(academyPartnerDataSandbox.getProgress().part1Completed).toBe(true);

    window.history.replaceState({}, '', '/portal/dealer-data');
    expect(() => academyPartnerDataSandbox.reviewPartnerRelation()).toThrow('Academy Partnerdata writes must never use production persistence.');
  });
});

describe('Academy routes and guidance', () => {
  const read = (path: string) => readFileSync(path, 'utf8');

  it('opens Partnerdata through the canonical route and keeps local guidance in each Academy module', () => {
    const academy = read('src/pages/AcademyPage.tsx');
    const partnerRoute = read('src/pages/portal/PartnerDataRoute.tsx');
    const portal = read('src/pages/PortalPage.tsx');
    const videos = read('src/pages/VideoGalleryPage.tsx');

    expect(academy).toContain("/portal/dealer-data?academy_mode=true&academy_part=1");
    expect(academy).toContain("/portal/dealer-data?academy_mode=true&academy_part=2");
    expect(partnerRoute).toContain('AcademyPartnerDataWorkspace');
    expect(portal).toContain('Portal Basics - 5 hurtige');
    expect(videos).toContain('Case 2 - Find en vedligeholdelsesvideo');
  });
});
