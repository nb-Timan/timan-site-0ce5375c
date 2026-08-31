import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  describeContractSecondaryTerritoryArea,
  describeContractTerritoryArea,
  createEmptyContractTerritoryArea,
  isValidContractTerritoryArea,
  normalizeContractTerritoryArea,
  type ContractSecondaryTerritoryArea,
  type ContractTerritoryArea,
} from '@/lib/contractTerritory';
import {
  getContractTerritoryMapCountryConfig,
  getContractTerritoryMapLabel,
  getContractTerritoryMapRegionKeys,
  getContractTerritoryMapStateKey,
  getContractTerritoryBasemap,
  getContractWholeCountryMapCountryLabel,
  hasContractTerritoryMapSelection,
  CONTRACT_WHOLE_COUNTRY_MAP,
  type ContractCountryMapScope,
  toggleContractTerritoryRegionSelection,
  type ContractTerritoryMapCountryConfig,
  type ContractTerritoryMapMode,
  type ContractTerritoryMapVariant,
} from '@/lib/contractTerritoryMap';
import { isFeatureInContractCountryMapScope } from '@/lib/contractWorldCountries';

const PRIMARY_COLOR = '#287a48';
const PRIMARY_FILL = '#2fb36d';
const SECONDARY_COLOR = '#a27812';
const SECONDARY_FILL = '#d6a62a';
type CachedGeoJson = GeoJSON.FeatureCollection;

const geoJsonCache = new Map<string, Promise<CachedGeoJson>>();

function loadGeoJson(url: string) {
  if (!geoJsonCache.has(url)) {
    geoJsonCache.set(
      url,
      fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }),
    );
  }
  return geoJsonCache.get(url)!;
}

function boundsFromConfig(config: ContractTerritoryMapCountryConfig) {
  return L.latLngBounds(
    [config.bounds[0], config.bounds[1]],
    [config.bounds[2], config.bounds[3]],
  );
}

function boundsFromTuple(bounds: [number, number, number, number]) {
  return L.latLngBounds([bounds[0], bounds[1]], [bounds[2], bounds[3]]);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function MapResizer({ trigger }: { trigger: string }) {
  const map = useMap();

  useEffect(() => {
    const timeout = window.setTimeout(() => map.invalidateSize(), 180);
    return () => window.clearTimeout(timeout);
  }, [map, trigger]);

  return null;
}

function styleForFeature(variant: ContractTerritoryMapVariant | null, hovered = false, focused = false): L.PathOptions {
  if (focused) {
    return {
      color: '#111827',
      weight: 2.4,
      opacity: 0.95,
      fillOpacity: 0.22,
      fillColor: variant === 'secondary' ? SECONDARY_FILL : PRIMARY_FILL,
    };
  }

  if (variant === 'primary') {
    return {
      color: PRIMARY_COLOR,
      weight: hovered ? 2.2 : 1.4,
      opacity: hovered ? 0.95 : 0.82,
      fillColor: PRIMARY_FILL,
      fillOpacity: hovered ? 0.28 : 0.18,
    };
  }

  if (variant === 'secondary') {
    return {
      color: SECONDARY_COLOR,
      weight: hovered ? 2.2 : 1.4,
      opacity: hovered ? 0.95 : 0.82,
      fillColor: SECONDARY_FILL,
      fillOpacity: hovered ? 0.3 : 0.2,
    };
  }

  return {
    color: '#6b7280',
    weight: hovered ? 1.4 : 0.7,
    opacity: hovered ? 0.66 : 0.32,
    fillColor: '#94a3b8',
    fillOpacity: hovered ? 0.12 : 0.035,
  };
}

function ContractTerritoryGeoJsonLayer({
  primaryTerritory,
  secondaryTerritory,
  regionSelectionTarget,
  displayVariant,
  language,
  onStatus,
  onPrimaryTerritoryChange,
  onSecondaryTerritoryChange,
}: {
  primaryTerritory: ContractTerritoryArea;
  secondaryTerritory: ContractSecondaryTerritoryArea;
  regionSelectionTarget: ContractTerritoryMapVariant;
  displayVariant: ContractTerritoryMapVariant | 'both';
  language: PortalUiLanguage | string;
  onStatus: (status: 'loading' | 'ready' | 'error') => void;
  onPrimaryTerritoryChange?: (territory: ContractTerritoryArea) => void;
  onSecondaryTerritoryChange?: (territory: ContractSecondaryTerritoryArea) => void;
}) {
  const map = useMap();
  const stateKey = `${getContractTerritoryMapStateKey(primaryTerritory)}|${secondaryTerritory.enabled ? getContractTerritoryMapStateKey(secondaryTerritory) : 'secondary-off'}|${regionSelectionTarget}`;

  useEffect(() => {
    let alive = true;
    const group = L.layerGroup().addTo(map);
    const container = map.getContainer();
    const selectedLayerRef: { current: L.Path | null } = { current: null };
    const selectedStyleRef: { current: { variant: ContractTerritoryMapVariant | null } | null } = { current: null };

    if (!map.getPane('contract-territory-pane')) {
      map.createPane('contract-territory-pane');
    }
    const pane = map.getPane('contract-territory-pane');
    if (pane) {
      pane.style.zIndex = '360';
      pane.style.pointerEvents = 'auto';
    }

    const normalizedPrimary = normalizeContractTerritoryArea(primaryTerritory);
    const normalizedSecondary = normalizeContractTerritoryArea(secondaryTerritory);
    const visibleSecondary = secondaryTerritory.enabled && hasContractTerritoryMapSelection(secondaryTerritory);
    const areaSpecs = displayVariant === 'primary'
      ? [{ area: normalizedPrimary, variant: 'primary' as const, valid: hasContractTerritoryMapSelection(normalizedPrimary) }]
      : displayVariant === 'secondary'
        ? [{ area: normalizedSecondary, variant: 'secondary' as const, valid: hasContractTerritoryMapSelection(normalizedSecondary) }]
        : [
          { area: normalizedPrimary, variant: 'primary' as const, valid: hasContractTerritoryMapSelection(normalizedPrimary) },
          ...(visibleSecondary ? [{ area: normalizedSecondary, variant: 'secondary' as const, valid: true }] : []),
        ];
    const configs = Array.from(new Map(areaSpecs.map((spec) => [spec.area.country, getContractTerritoryMapCountryConfig(spec.area.country)])).values());
    const selectedBounds = L.latLngBounds([]);
    const fallbackBounds = L.latLngBounds([]);

    configs.forEach((config) => fallbackBounds.extend(boundsFromConfig(config)));
    onStatus('loading');

    Promise.all(configs.map((config) => loadGeoJson(config.geoJsonUrl).then((geoJson) => ({
      config,
      geoJson: config.parseGeoJson(geoJson),
    }))))
      .then((items) => {
        if (!alive) return;

        for (const { config, geoJson } of items) {
          const specsForCountry = areaSpecs
            .filter((spec) => spec.area.country === config.country && spec.valid)
            .map((spec) => ({
              variant: spec.variant,
              wholeCountry: spec.area.wholeCountry,
              keys: new Set(getContractTerritoryMapRegionKeys(spec.area)),
            }));

          const layer = L.geoJSON(geoJson, {
            pane: 'contract-territory-pane',
            style: (feature) => {
              const meta = config.getFeatureMeta(feature as GeoJSON.Feature);
              const variant = getFeatureVariant(meta?.key ?? '', specsForCountry);
              return styleForFeature(variant);
            },
            onEachFeature: (feature, featureLayer) => {
              const meta = config.getFeatureMeta(feature);
              if (!meta) return;

              const path = featureLayer as L.Path;
              const bounds = (featureLayer as L.Polygon).getBounds?.();
              const variant = getFeatureVariant(meta.key, specsForCountry);
              const region = { id: meta.key, name: meta.label };

              if (variant && bounds?.isValid()) {
                selectedBounds.extend(bounds);
              }

              featureLayer.bindTooltip(meta.label, {
                direction: 'top',
                opacity: 0.95,
                className: 'pm-plz2-hover-label',
              });
              featureLayer.bindPopup(
                `<div class="pm-plz2-popup"><strong>${escapeHtml(meta.label)}</strong><br />${escapeHtml(config.datasetLabel[language as PortalUiLanguage] ?? config.datasetLabel.da)}</div>`,
                { closeButton: true, maxWidth: 220 },
              );
              featureLayer.on({
                mouseover: () => {
                  container.classList.add('contract-territory-hovering');
                  if (selectedLayerRef.current !== path) {
                    path.setStyle(styleForFeature(variant, true));
                  }
                },
                mouseout: () => {
                  container.classList.remove('contract-territory-hovering');
                  if (selectedLayerRef.current !== path) {
                    path.setStyle(styleForFeature(variant));
                  }
                },
                click: () => {
                  if (region) {
                    const targetArea = regionSelectionTarget === 'secondary'
                      ? normalizeContractTerritoryArea(secondaryTerritory)
                      : normalizedPrimary;
                    const nextArea = toggleContractTerritoryRegionSelection(targetArea, region);
                    if (regionSelectionTarget === 'secondary' && secondaryTerritory.enabled && onSecondaryTerritoryChange) {
                      onSecondaryTerritoryChange({ ...nextArea, enabled: true });
                    } else if (onPrimaryTerritoryChange) {
                      onPrimaryTerritoryChange(nextArea);
                    }
                  }
                  if (selectedLayerRef.current && selectedStyleRef.current) {
                    selectedLayerRef.current.setStyle(styleForFeature(selectedStyleRef.current.variant));
                  }
                  selectedLayerRef.current = path;
                  selectedStyleRef.current = { variant };
                  path.setStyle(styleForFeature(regionSelectionTarget, false, true));
                  if (bounds?.isValid()) {
                    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
                  }
                },
              });
            },
          });

          group.addLayer(layer);
        }

        const targetBounds = selectedBounds.isValid() ? selectedBounds : fallbackBounds;
        if (targetBounds.isValid()) {
          map.fitBounds(targetBounds, { padding: [28, 28], maxZoom: selectedBounds.isValid() ? 9 : 6 });
        }
        onStatus('ready');
      })
      .catch(() => {
        if (!alive) return;
        onStatus('error');
      });

    return () => {
      alive = false;
      container.classList.remove('contract-territory-hovering');
      group.removeFrom(map);
    };
  }, [map, onStatus, language, stateKey, regionSelectionTarget, displayVariant, onPrimaryTerritoryChange, onSecondaryTerritoryChange, primaryTerritory, secondaryTerritory]);

  return null;
}

function ContractWholeCountryGeoJsonLayer({
  primaryTerritory,
  secondaryTerritory,
  regionSelectionTarget,
  displayVariant,
  countryMapScope,
  language,
  onStatus,
  onPrimaryTerritoryChange,
  onSecondaryTerritoryChange,
}: {
  primaryTerritory: ContractTerritoryArea;
  secondaryTerritory: ContractSecondaryTerritoryArea;
  regionSelectionTarget: ContractTerritoryMapVariant;
  displayVariant: ContractTerritoryMapVariant | 'both';
  countryMapScope: ContractCountryMapScope;
  language: PortalUiLanguage | string;
  onStatus: (status: 'loading' | 'ready' | 'error') => void;
  onPrimaryTerritoryChange?: (territory: ContractTerritoryArea) => void;
  onSecondaryTerritoryChange?: (territory: ContractSecondaryTerritoryArea) => void;
}) {
  const map = useMap();
  const stateKey = `${countryMapScope}|${getContractTerritoryMapStateKey(primaryTerritory)}|${secondaryTerritory.enabled ? getContractTerritoryMapStateKey(secondaryTerritory) : 'secondary-off'}|${regionSelectionTarget}`;

  useEffect(() => {
    let alive = true;
    const group = L.layerGroup().addTo(map);
    const container = map.getContainer();

    if (!map.getPane('contract-territory-pane')) {
      map.createPane('contract-territory-pane');
    }
    const pane = map.getPane('contract-territory-pane');
    if (pane) {
      pane.style.zIndex = '360';
      pane.style.pointerEvents = 'auto';
    }

    const normalizedPrimary = normalizeContractTerritoryArea(primaryTerritory);
    const normalizedSecondary = normalizeContractTerritoryArea(secondaryTerritory);
    const visibleSecondary = secondaryTerritory.enabled && normalizedSecondary.wholeCountry;
    const areaSpecs = displayVariant === 'primary'
      ? [{ area: normalizedPrimary, variant: 'primary' as const, valid: normalizedPrimary.wholeCountry }]
      : displayVariant === 'secondary'
        ? [{ area: normalizedSecondary, variant: 'secondary' as const, valid: visibleSecondary }]
        : [
          { area: normalizedPrimary, variant: 'primary' as const, valid: normalizedPrimary.wholeCountry },
          ...(visibleSecondary ? [{ area: normalizedSecondary, variant: 'secondary' as const, valid: true }] : []),
        ];
    const selectedBounds = L.latLngBounds([]);
    const fallbackBounds = boundsFromTuple(CONTRACT_WHOLE_COUNTRY_MAP.bounds[countryMapScope]);
    onStatus('loading');

    loadGeoJson(CONTRACT_WHOLE_COUNTRY_MAP.geoJsonUrl)
      .then((geoJson) => CONTRACT_WHOLE_COUNTRY_MAP.parseGeoJson(geoJson))
      .then((geoJson) => {
        if (!alive) return;

        const visibleFeatures = {
          ...geoJson,
          features: geoJson.features.filter((feature) => isFeatureInContractCountryMapScope(feature, countryMapScope)),
        };

        const layer = L.geoJSON(visibleFeatures, {
          pane: 'contract-territory-pane',
          style: (feature) => {
            const meta = CONTRACT_WHOLE_COUNTRY_MAP.getFeatureMeta(feature as GeoJSON.Feature);
            const variant = getCountryFeatureVariant(meta?.code ?? '', areaSpecs);
            return styleForFeature(variant);
          },
          onEachFeature: (feature, featureLayer) => {
            const meta = CONTRACT_WHOLE_COUNTRY_MAP.getFeatureMeta(feature);
            if (!meta) return;

            const path = featureLayer as L.Path;
            const bounds = (featureLayer as L.Polygon).getBounds?.();
            const variant = getCountryFeatureVariant(meta.code, areaSpecs);
            const label = getContractWholeCountryMapCountryLabel(meta.code, language, meta.name);

            if (variant && bounds?.isValid()) {
              selectedBounds.extend(bounds);
            }

            featureLayer.bindTooltip(label, {
              direction: 'top',
              opacity: 0.95,
              className: 'pm-plz2-hover-label',
            });
            featureLayer.bindPopup(
              `<div class="pm-plz2-popup"><strong>${escapeHtml(label)}</strong><br />${escapeHtml(CONTRACT_WHOLE_COUNTRY_MAP.datasetLabel[language as PortalUiLanguage] ?? CONTRACT_WHOLE_COUNTRY_MAP.datasetLabel.da)}</div>`,
              { closeButton: true, maxWidth: 220 },
            );
            featureLayer.on({
              mouseover: () => {
                container.classList.add('contract-territory-hovering');
                path.setStyle(styleForFeature(variant, true));
              },
              mouseout: () => {
                container.classList.remove('contract-territory-hovering');
                path.setStyle(styleForFeature(variant));
              },
              click: () => {
                const targetArea = regionSelectionTarget === 'secondary'
                  ? normalizeContractTerritoryArea(secondaryTerritory)
                  : normalizedPrimary;
                const sameCountrySelected = targetArea.wholeCountry && targetArea.country === meta.code;
                const nextArea = sameCountrySelected
                  ? { ...createEmptyContractTerritoryArea(meta.code), wholeCountry: false }
                  : { ...createEmptyContractTerritoryArea(meta.code), wholeCountry: true };

                if (regionSelectionTarget === 'secondary' && secondaryTerritory.enabled && onSecondaryTerritoryChange) {
                  onSecondaryTerritoryChange({ ...nextArea, enabled: true });
                } else if (onPrimaryTerritoryChange) {
                  onPrimaryTerritoryChange(nextArea);
                }

                if (bounds?.isValid()) {
                  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 });
                }
              },
            });
          },
        });

        group.addLayer(layer);
        const targetBounds = selectedBounds.isValid() ? selectedBounds : fallbackBounds;
        map.fitBounds(targetBounds, { padding: [28, 28], maxZoom: selectedBounds.isValid() ? 6 : 4 });
        onStatus('ready');
      })
      .catch(() => {
        if (!alive) return;
        onStatus('error');
      });

    return () => {
      alive = false;
      container.classList.remove('contract-territory-hovering');
      group.removeFrom(map);
    };
  }, [map, onStatus, language, stateKey, regionSelectionTarget, displayVariant, countryMapScope, onPrimaryTerritoryChange, onSecondaryTerritoryChange, primaryTerritory, secondaryTerritory]);

  return null;
}

function getFeatureVariant(
  key: string,
  specs: Array<{ variant: ContractTerritoryMapVariant; wholeCountry: boolean; keys: Set<string> }>,
) {
  const primary = specs.find((spec) => spec.variant === 'primary');
  if (primary && (primary.wholeCountry || primary.keys.has(key))) return 'primary';

  const secondary = specs.find((spec) => spec.variant === 'secondary');
  if (secondary && (secondary.wholeCountry || secondary.keys.has(key))) return 'secondary';

  return null;
}

function getCountryFeatureVariant(
  countryCode: string,
  specs: Array<{ variant: ContractTerritoryMapVariant; area: ContractTerritoryArea; valid: boolean }>,
) {
  const primary = specs.find((spec) => spec.variant === 'primary');
  if (primary?.valid && primary.area.country === countryCode) return 'primary';

  const secondary = specs.find((spec) => spec.variant === 'secondary');
  if (secondary?.valid && secondary.area.country === countryCode) return 'secondary';

  return null;
}

export function ContractTerritoryMap({
  primaryTerritory,
  secondaryTerritory,
  regionSelectionTarget = 'primary',
  displayVariant = 'both',
  mapMode = 'detailed',
  countryMapScope = 'europe',
  language,
  onPrimaryTerritoryChange,
  onSecondaryTerritoryChange,
}: {
  primaryTerritory: ContractTerritoryArea;
  secondaryTerritory: ContractSecondaryTerritoryArea;
  regionSelectionTarget?: ContractTerritoryMapVariant;
  displayVariant?: ContractTerritoryMapVariant | 'both';
  mapMode?: ContractTerritoryMapMode;
  countryMapScope?: ContractCountryMapScope;
  language: PortalUiLanguage | string;
  onPrimaryTerritoryChange?: (territory: ContractTerritoryArea) => void;
  onSecondaryTerritoryChange?: (territory: ContractSecondaryTerritoryArea) => void;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const validPrimary = isValidContractTerritoryArea(primaryTerritory);
  const visibleSecondary = secondaryTerritory.enabled && isValidContractTerritoryArea(secondaryTerritory);
  const primaryDescription = describeContractTerritoryArea(primaryTerritory, language);
  const secondaryDescription = describeContractSecondaryTerritoryArea(secondaryTerritory, language);
  const mapTerritory = displayVariant === 'secondary'
    ? normalizeContractTerritoryArea(secondaryTerritory)
    : normalizeContractTerritoryArea(primaryTerritory);
  const mapConfig = getContractTerritoryMapCountryConfig(mapTerritory.country);
  const isWholeCountryMap = mapMode === 'whole_country';
  const mapTitle = displayVariant === 'primary'
    ? getContractTerritoryMapLabel('primaryTitle', language)
    : displayVariant === 'secondary'
      ? getContractTerritoryMapLabel('secondaryTitle', language)
      : getContractTerritoryMapLabel('title', language);
  const basemap = useMemo(() => getContractTerritoryBasemap(), []);
  const stateKey = useMemo(
    () => `${mapMode}:${countryMapScope}:${
      displayVariant === 'primary'
      ? getContractTerritoryMapStateKey(primaryTerritory)
      : displayVariant === 'secondary'
        ? getContractTerritoryMapStateKey(secondaryTerritory)
        : `${getContractTerritoryMapStateKey(primaryTerritory)}|${visibleSecondary ? getContractTerritoryMapStateKey(secondaryTerritory) : 'none'}`
    }`,
    [displayVariant, primaryTerritory, secondaryTerritory, visibleSecondary, mapMode, countryMapScope],
  );

  return (
    <aside className="flex h-full min-h-[520px] flex-col rounded-2xl border border-gray-200 bg-slate-50 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-black text-gray-950">
          {mapTitle}
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          {isWholeCountryMap
            ? `${CONTRACT_WHOLE_COUNTRY_MAP.datasetLabel[language as PortalUiLanguage] ?? CONTRACT_WHOLE_COUNTRY_MAP.datasetLabel.da} - ${CONTRACT_WHOLE_COUNTRY_MAP.scopeLabel[countryMapScope][language as PortalUiLanguage] ?? CONTRACT_WHOLE_COUNTRY_MAP.scopeLabel[countryMapScope].da}`
            : mapConfig?.datasetLabel[language as PortalUiLanguage] ?? mapConfig?.datasetLabel.da}
        </p>
      </div>

      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <MapContainer
          className="h-full min-h-[420px] w-full"
          center={[56.1, 10.5]}
          zoom={6}
          minZoom={4}
          scrollWheelZoom={false}
          zoomControl
          attributionControl
        >
          <TileLayer
            url={basemap.url}
            attribution={basemap.attribution}
            subdomains={basemap.subdomains}
            maxZoom={basemap.maxZoom}
          />
          {isWholeCountryMap ? (
            <ContractWholeCountryGeoJsonLayer
              primaryTerritory={primaryTerritory}
              secondaryTerritory={secondaryTerritory}
              regionSelectionTarget={regionSelectionTarget}
              displayVariant={displayVariant}
              countryMapScope={countryMapScope}
              language={language}
              onStatus={setStatus}
              onPrimaryTerritoryChange={onPrimaryTerritoryChange}
              onSecondaryTerritoryChange={onSecondaryTerritoryChange}
            />
          ) : mapConfig ? (
            <ContractTerritoryGeoJsonLayer
              primaryTerritory={primaryTerritory}
              secondaryTerritory={secondaryTerritory}
              regionSelectionTarget={regionSelectionTarget}
              displayVariant={displayVariant}
              language={language}
              onStatus={setStatus}
              onPrimaryTerritoryChange={onPrimaryTerritoryChange}
              onSecondaryTerritoryChange={onSecondaryTerritoryChange}
            />
          ) : null}
          <MapResizer trigger={stateKey} />
        </MapContainer>

        {status !== 'ready' && (
          <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            {status === 'loading'
              ? getContractTerritoryMapLabel('loading', language)
              : getContractTerritoryMapLabel('unavailable', language)}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 text-xs leading-5 text-gray-700">
        {displayVariant !== 'secondary' && validPrimary && primaryDescription ? (
          <div className="flex gap-2">
            <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-[#287a48]" />
            <span><strong>{getContractTerritoryMapLabel('primary', language)}:</strong> {primaryDescription}</span>
          </div>
        ) : displayVariant !== 'secondary' ? (
          <p className="font-semibold text-amber-800">{getContractTerritoryMapLabel('noSelection', language)}</p>
        ) : null}
        {displayVariant === 'secondary' && visibleSecondary && secondaryDescription && (
          <div className="flex gap-2">
            <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-[#d6a62a]" />
            <span><strong>{getContractTerritoryMapLabel('secondary', language)}:</strong> {secondaryDescription}</span>
          </div>
        )}
        {displayVariant === 'secondary' && (!visibleSecondary || !secondaryDescription) && (
          <p className="font-semibold text-amber-800">{getContractTerritoryMapLabel('noSecondarySelection', language)}</p>
        )}
        {displayVariant === 'both' && visibleSecondary && secondaryDescription && (
          <div className="flex gap-2">
            <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-[#d6a62a]" />
            <span><strong>{getContractTerritoryMapLabel('secondary', language)}:</strong> {secondaryDescription}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
