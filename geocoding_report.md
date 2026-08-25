# TIMAN Germany Dealer Map - Geocoding Report

Generated for Phase 1 only. Source CSV was read from `C:\Users\nb\OneDrive - Timan A S\Skrivebord\forhandler i tyskalnd.csv`.

## Summary

- Total CSV locations: 27
- Verified and geographically numbered locations: 27
- Dealers: 25
- Service partners: 2
- Rooftop/address precision: 24
- Proximate precision: 1
- Rooftop range midpoint: 1
- Approximate locality precision: 1
- REVIEW_REQUIRED: 0

## Numbering Rule

Verified locations are numbered from north to south by descending latitude. Longitude is the secondary sort key for stable ordering if latitudes are nearly equal.

All locations are geographically numbered. Wilmers Kommunaltechnik GmbH is manually verified masterdata, but Mapbox could not establish rooftop/address precision for `Über den Erlen 7`; Mapbox's locality result for Fredeburg in Schmallenberg is used with honest `approximate` precision.

## Review Required

None.

## Wilmers Manual Verification

| Firma | Master address | Mapbox position used | Precision | Notes |
|---|---|---|---|---|
| Wilmers Kommunaltechnik GmbH | Über den Erlen 7, 57392 Schmallenberg-Bad Fredeburg, Germany | 51.185726, 8.316411 | approximate | Address/housenumber was kept as verified masterdata. Mapbox did not return a safe match for `Über den Erlen 7`; it returned unrelated `Erlenstraße 7` results in other towns. The selected coordinate is the Mapbox locality result for Fredeburg, Schmallenberg, Nordrhein-Westfalen. |

## Normalizations Applied

These are not guesses. They are Mapbox-confirmed normalized forms where the CSV spelling or formatting differed.

| Firma | CSV value | Mapbox-confirmed value | Status |
|---|---|---|---|
| Hummelmühle-Lockwitz GmbH | 1731 Kreischa | 01731 Kreischa | VERIFIED_NORMALIZED_POSTCODE |
| Kobatec GmbH | 6217 Merseburg | 06217 Merseburg | VERIFIED_NORMALIZED_POSTCODE |
| Teichert GmbH & Co. KG | 4749 Ostrau | 04749 Jahnatal - Ostrau | VERIFIED_LOCALITY_NORMALIZED_POSTCODE |
| Klotz-Motorgeräte | Kirchstrasse 3 | Kirchstraße 3 | VERIFIED_NORMALIZED |
| KomTec GmbH | Raiffeisenstr. 5 a | Raiffeisenstraße 5a | VERIFIED_BROAD_SEARCH |
| Schlotter GmbH & Co. KG | Idstein-Wörsdorf | Idstein - Wörsdorf | VERIFIED_LOCALITY |
| Weimer GmbH Schönau | Ortstrasse 47 | Ortsstraße 47, Georgenthal - Schönau vor dem Walde | VERIFIED_LOCALITY_NORMALIZED |
| Stöber Gartentecknik Gbr | Stockder Str. 90 | Stockder Straße 90 | VERIFIED_NORMALIZED |

## Special Case

`Weimer GmbH Lollar` has CSV address `Wißmarer Straße 32 - 34`. Mapbox verified both `Wißmarer Straße 32` and `Wißmarer Straße 34` in 35457 Lollar with rooftop precision. The master coordinate is the midpoint between the two verified address coordinates and is marked `VERIFIED_RANGE_MIDPOINT`.

## Phase 2 Readiness

Phase 1 is ready for Phase 2. All 27 locations have geometry, and no `REVIEW_REQUIRED` records remain.
