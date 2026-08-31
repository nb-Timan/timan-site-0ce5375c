import { describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS_AUTOCOMPLETE_COUNTRIES,
  resolveAddressFromGooglePlace,
  type GoogleAddressComponent,
} from "@/lib/addressAutocomplete";

function component(long_name: string, short_name: string, types: string[]): GoogleAddressComponent {
  return { long_name, short_name, types };
}

describe("address autocomplete parsing", () => {
  it("parses a Danish Google address into structured fields", () => {
    const resolved = resolveAddressFromGooglePlace({
      formatted_address: "Osvald Pedersens Vej 2A, 6893 Hemmet, Denmark",
      place_id: "dk-place",
      address_components: [
        component("2A", "2A", ["street_number"]),
        component("Osvald Pedersens Vej", "Osvald Pedersens Vej", ["route"]),
        component("Hemmet", "Hemmet", ["locality"]),
        component("6893", "6893", ["postal_code"]),
        component("Denmark", "DK", ["country"]),
      ],
      geometry: { location: { lat: () => 55.851, lng: () => 8.374 } },
    });

    expect(resolved.address_line_1).toBe("Osvald Pedersens Vej 2A");
    expect(resolved.postal_code).toBe("6893");
    expect(resolved.city).toBe("Hemmet");
    expect(resolved.country).toBe("DK");
    expect(resolved.latitude).toBe(55.851);
    expect(resolved.longitude).toBe(8.374);
    expect(resolved.google_place_id).toBe("dk-place");
  });

  it("parses a German address with locality", () => {
    const resolved = resolveAddressFromGooglePlace({
      formatted_address: "Musterstraße 4, 27404 Zeven, Germany",
      address_components: [
        component("4", "4", ["street_number"]),
        component("Musterstraße", "Musterstraße", ["route"]),
        component("Zeven", "Zeven", ["locality"]),
        component("27404", "27404", ["postal_code"]),
        component("Germany", "DE", ["country"]),
      ],
    });

    expect(resolved.address_line_1).toBe("Musterstraße 4");
    expect(resolved.postal_code).toBe("27404");
    expect(resolved.city).toBe("Zeven");
    expect(resolved.country).toBe("DE");
  });

  it("parses the Czech Rudolfovska example", () => {
    const resolved = resolveAddressFromGooglePlace({
      formatted_address: "Rudolfovská 200/90, České Budějovice, Czechia",
      place_id: "cz-place",
      address_components: [
        component("200/90", "200/90", ["street_number"]),
        component("Rudolfovská", "Rudolfovská", ["route"]),
        component("České Budějovice", "České Budějovice", ["locality"]),
        component("370 01", "370 01", ["postal_code"]),
        component("Czechia", "CZ", ["country"]),
      ],
    });

    expect(resolved.address_line_1).toBe("Rudolfovská 200/90");
    expect(resolved.postal_code).toBe("370 01");
    expect(resolved.city).toBe("České Budějovice");
    expect(resolved.country).toBe("CZ");
    expect(resolved.google_place_id).toBe("cz-place");
  });

  it("falls back to administrative area when locality is missing", () => {
    const resolved = resolveAddressFromGooglePlace({
      formatted_address: "Industrial Road, Test Region",
      address_components: [
        component("Industrial Road", "Industrial Road", ["route"]),
        component("Test Region", "Test Region", ["administrative_area_level_2"]),
        component("Poland", "PL", ["country"]),
      ],
    });

    expect(resolved.address_line_1).toBe("Industrial Road");
    expect(resolved.postal_code).toBeNull();
    expect(resolved.city).toBe("Test Region");
    expect(resolved.country).toBe("PL");
  });

  it("keeps manual entry viable by supporting all relevant Timan market restrictions", () => {
    expect(DEFAULT_ADDRESS_AUTOCOMPLETE_COUNTRIES).toEqual(
      expect.arrayContaining(["dk", "de", "se", "fr", "it", "hu", "pl", "cz", "ch", "at", "gb"]),
    );
  });
});

