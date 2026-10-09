export type TimanCompanyProfile = {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  cvr: string;
};

/** Canonical legal identity shared by Portal clients and server-side functions. */
export const TIMAN_COMPANY_PROFILE: Readonly<TimanCompanyProfile> = Object.freeze({
  companyName: 'Timan A/S',
  street: 'Osvald Pedersens Vej 2A-D',
  postalCode: '6980',
  city: 'Tim',
  country: 'Danmark',
  cvr: '27609627',
});

export function timanCompanyPostalCity(profile: Readonly<TimanCompanyProfile> = TIMAN_COMPANY_PROFILE): string {
  return `${profile.postalCode} ${profile.city}`;
}

export function timanCompanyAddress(profile: Readonly<TimanCompanyProfile> = TIMAN_COMPANY_PROFILE): string {
  return `${profile.street}, ${timanCompanyPostalCity(profile)}`;
}

export function timanCompanyLegalLine(profile: Readonly<TimanCompanyProfile> = TIMAN_COMPANY_PROFILE): string {
  return `${profile.companyName} · ${profile.street} · ${timanCompanyPostalCity(profile)} · ${profile.country} · CVR ${profile.cvr}`;
}
