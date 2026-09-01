import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Archive, Check, ChevronsUpDown, FilePenLine, Plus, Upload, X } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import VideoLibraryFilterBar from "@/components/video/VideoLibraryFilterBar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { canManageNewsContent } from "@/lib/portalAccess";
import { cn } from "@/lib/utils";
import { useEffectivePortalUserState } from "@/lib/viewAsUser";
import { listVideoProductOptions, productSearchText, videoProductOptionKey, type VideoProductOption } from "@/lib/videoProductCatalog";
import {
  extractYouTubeVideoId,
  exactMarketingVideoContent,
  findPrimaryProductConflict,
  listMarketingVideos,
  localizeMarketingVideo,
  resolveVideoThumbnail,
  saveMarketingVideo,
  uploadVideoThumbnail,
  youtubeThumbnailFromId,
  type MarketingVideo,
  type MarketingVideoLocalizedContent,
  type MarketingVideoTranslationMeta,
  type VideoContentType,
  type VideoModelGenerationStatus,
  type VideoStatus,
} from "@/lib/videoLibraryService";
import {
  tv,
  videoContentTypeLabel,
  videoModelGenerationStatusLabel,
  videoSeasonLabel,
  VIDEO_CONTENT_TYPES,
  VIDEO_SEASONS,
} from "@/lib/videoLibraryI18n";
import type { PortalUiLanguage } from "@/lib/portalLanguages";
import {
  DEFAULT_VIDEO_FILTERS,
  filterAndSortVideos,
  getVideoMachineFilterOptions,
  type VideoFilterState,
} from "@/lib/videoLibraryFilters";

interface DraftState {
  id?: string;
  youtube_url: string;
  title: string;
  description: string;
  localized_content: MarketingVideoLocalizedContent;
  previous_localized_content: MarketingVideoLocalizedContent | null;
  source_language: PortalUiLanguage;
  translation_meta: MarketingVideoTranslationMeta;
  content_type: VideoContentType;
  seasons: string[];
  tagsText: string;
  status: VideoStatus;
  model_generation_status: VideoModelGenerationStatus;
  custom_thumbnail_url: string | null;
  custom_thumbnail_path: string | null;
  products: VideoProductOption[];
  primaryProduct: VideoProductOption | null;
}

const EMPTY_DRAFT: DraftState = {
  youtube_url: "",
  title: "",
  description: "",
  localized_content: {},
  previous_localized_content: null,
  source_language: "da",
  translation_meta: {},
  content_type: "product",
  seasons: ["all_year"],
  tagsText: "",
  status: "draft",
  model_generation_status: "current",
  custom_thumbnail_url: null,
  custom_thumbnail_path: null,
  products: [],
  primaryProduct: null,
};

export default function BackendVideoManagementPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language, uiLanguage, setLanguage } = useLanguage();
  const { effectiveUser } = useEffectivePortalUserState(appUser);
  const navigate = useNavigate();
  const canManage = useMemo(() => canManageNewsContent(effectiveUser), [effectiveUser]);
  const [rows, setRows] = useState<MarketingVideo[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<VideoFilterState>(DEFAULT_VIDEO_FILTERS);
  const [editing, setEditing] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Record<string, unknown> | null>(null);

  const productOptions = useMemo(() => listVideoProductOptions(uiLanguage), [uiLanguage]);
  const machineOptions = useMemo(() => getVideoMachineFilterOptions(uiLanguage), [uiLanguage]);
  const displayRows = useMemo(() => rows.map((row) => localizeMarketingVideo(row, uiLanguage)), [rows, uiLanguage]);

  const reload = async () => {
    setLoadingRows(true);
    setError(null);
    const result = await listMarketingVideos();
    setRows(result.rows);
    setError(result.error);
    setLoadingRows(false);
  };

  useEffect(() => {
    if (!loading && appUser && canManage) void reload();
  }, [loading, appUser?.email, canManage]);

  const filteredRows = useMemo(() => {
    return filterAndSortVideos(displayRows, filters, uiLanguage, { includeStatus: true });
  }, [displayRows, filters, uiLanguage]);

  if (loading) return <div className="min-h-screen bg-gray-50" />;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canManage) return <Navigate to="/portal/marketing" replace />;

  const startCreate = () => {
    setEditing({
      ...EMPTY_DRAFT,
      products: [],
      seasons: ["all_year"],
      source_language: uiLanguage,
      localized_content: {},
      previous_localized_content: null,
      translation_meta: {},
    });
    setError(null);
    setMessage(null);
  };

  const startEdit = (row: MarketingVideo) => {
    const localized = exactMarketingVideoContent(row, uiLanguage);
    setEditing({
      id: row.id,
      youtube_url: row.youtube_url,
      title: localized.title,
      description: localized.description,
      localized_content: row.localized_content || {},
      previous_localized_content: row.localized_content || {},
      source_language: uiLanguage,
      translation_meta: row.translation_meta || {},
      content_type: row.content_type,
      seasons: row.seasons.length ? row.seasons : ["all_year"],
      tagsText: row.tags.join(", "),
      status: row.status,
      model_generation_status: row.model_generation_status || "current",
      custom_thumbnail_url: row.custom_thumbnail_url,
      custom_thumbnail_path: row.custom_thumbnail_path,
      products: row.products.map((product) => ({
        optionKey: `${product.machine_key || "unknown"}::${product.product_key}`,
        productKey: product.product_key,
        itemNumber: product.item_number,
        label: product.product_label || product.item_number,
        machineKey: product.machine_key || "",
        machineLabel: product.machine_key || "",
        kind: "accessory",
      })),
      primaryProduct: row.primary_product
        ? {
            optionKey: `${row.primary_product.machine_key || "unknown"}::${row.primary_product.product_key}`,
            productKey: row.primary_product.product_key,
            itemNumber: row.primary_product.item_number,
            label: row.primary_product.product_label || row.primary_product.item_number,
            machineKey: row.primary_product.machine_key || "",
            machineLabel: row.primary_product.machine_key || "",
            kind: "accessory",
          }
        : null,
    });
    setError(null);
    setMessage(null);
  };

  const persist = async (replaceExistingPrimary = false, draftOverride?: DraftState) => {
    const activeDraft = draftOverride ?? editing;
    if (!activeDraft) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    if (!extractYouTubeVideoId(activeDraft.youtube_url)) {
      setError(tv("videoMgmtInvalidYoutube", uiLanguage));
      setSaving(false);
      return;
    }
    if (!activeDraft.title.trim()) {
      setError(tv("videoMgmtRequiredTitle", uiLanguage));
      setSaving(false);
      return;
    }

    if (activeDraft.primaryProduct && !replaceExistingPrimary) {
      const result = await findPrimaryProductConflict(activeDraft.primaryProduct.productKey, activeDraft.id);
      if (result.conflict) {
        setConflict(result.conflict);
        setSaving(false);
        return;
      }
    }

    const productMap = new Map(activeDraft.products.map((product) => [videoProductOptionKey(product), product]));
    if (activeDraft.primaryProduct) productMap.set(videoProductOptionKey(activeDraft.primaryProduct), activeDraft.primaryProduct);

    const result = await saveMarketingVideo({
      id: activeDraft.id,
      youtube_url: activeDraft.youtube_url,
      title: activeDraft.title,
      description: activeDraft.description,
      source_language: activeDraft.source_language,
      localized_content: activeDraft.localized_content,
      previous_localized_content: activeDraft.previous_localized_content,
      translation_meta: activeDraft.translation_meta,
      content_type: activeDraft.content_type,
      seasons: activeDraft.seasons,
      tags: activeDraft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      status: activeDraft.status,
      model_generation_status: activeDraft.model_generation_status,
      custom_thumbnail_url: activeDraft.custom_thumbnail_url,
      custom_thumbnail_path: activeDraft.custom_thumbnail_path,
      products: Array.from(productMap.values()),
      primaryProduct: activeDraft.primaryProduct,
      replaceExistingPrimary,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error === "invalid_youtube" ? tv("videoMgmtInvalidYoutube", uiLanguage) : result.error);
      return;
    }
    setEditing(null);
    setConflict(null);
    setMessage(tv("videoMgmtSaved", uiLanguage));
    await reload();
  };

  const keepExistingPrimary = () => {
    if (!editing) {
      setConflict(null);
      return;
    }
    const next = { ...editing, primaryProduct: null };
    setEditing(next);
    setConflict(null);
    void persist(false, next);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <main className="mx-auto flex-grow w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{tv("videoMgmtTitle", uiLanguage)}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{tv("videoMgmtIntro", uiLanguage)}</p>
          </div>
          <Button type="button" onClick={startCreate} className="gap-2 bg-emerald-700 hover:bg-emerald-800">
            <Plus className="h-4 w-4" />
            {tv("videoMgmtAdd", uiLanguage)}
          </Button>
        </div>

        <VideoLibraryFilterBar
          filters={filters}
          onChange={setFilters}
          machineOptions={machineOptions}
          language={uiLanguage}
          showStatus
        />

        {message && <p className="mb-3 text-sm font-semibold text-emerald-700">{message}</p>}
        {error && <p className="mb-3 text-sm font-semibold text-amber-700">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loadingRows ? (
            <p className="p-5 text-sm text-slate-500">{tv("loading", uiLanguage)}</p>
          ) : filteredRows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{tv("videoLibraryNoResults", uiLanguage)}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <div key={row.id} className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[160px_minmax(0,1fr)_auto] lg:items-center">
                  <img src={resolveVideoThumbnail(row)} alt="" className="aspect-video w-full rounded-lg bg-slate-100 object-cover lg:w-40" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-slate-950">{row.title}</h2>
                      <StatusBadge status={row.status} lang={uiLanguage} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{row.description || "-"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <Chip>{videoContentTypeLabel(row.content_type, uiLanguage)}</Chip>
                      {row.tags.slice(0, 4).map((tag) => <Chip key={tag}>{tag}</Chip>)}
                      <Chip>{row.products.length} {tv("videoMgmtRelatedCount", uiLanguage)}</Chip>
                      {row.primary_product && <Chip>{tv("videoLibraryPrimary", uiLanguage)}: {row.primary_product.item_number}</Chip>}
                    </div>
                  </div>
                  <div className="flex gap-2 lg:justify-end">
                    <Button type="button" variant="outline" onClick={() => startEdit(row)} className="gap-2">
                      <FilePenLine className="h-4 w-4" />
                      {tv("edit", uiLanguage)}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {editing && (
        <VideoEditorDialog
          draft={editing}
          setDraft={setEditing}
          productOptions={productOptions}
          onSave={(status) => {
            const next = { ...editing, status };
            setEditing(next);
            void persist(false, next);
          }}
          onCancel={() => setEditing(null)}
          saving={saving}
          lang={uiLanguage}
        />
      )}

      <Dialog open={!!conflict} onOpenChange={(open) => { if (!open) setConflict(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tv("videoMgmtConflictTitle", uiLanguage)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">{tv("videoMgmtConflictIntro", uiLanguage)}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={keepExistingPrimary} disabled={saving}>
              {tv("videoMgmtKeepExisting", uiLanguage)}
            </Button>
            <Button type="button" onClick={() => void persist(true)} disabled={saving}>
              {tv("videoMgmtReplacePrimary", uiLanguage)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PortalFooter language={language} />
    </div>
  );
}

function VideoEditorDialog(props: {
  draft: DraftState;
  setDraft: (draft: DraftState) => void;
  productOptions: VideoProductOption[];
  onSave: (status: VideoStatus) => void;
  onCancel: () => void;
  saving: boolean;
  lang: Parameters<typeof tv>[1];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { draft, setDraft, productOptions, onSave, onCancel, saving, lang } = props;
  const videoId = extractYouTubeVideoId(draft.youtube_url);
  const thumbnail = draft.custom_thumbnail_url || youtubeThumbnailFromId(videoId, "hqdefault") || "/placeholder.svg";

  const patch = (part: Partial<DraftState>) => setDraft({ ...draft, ...part });
  const patchProducts = (products: VideoProductOption[]) => {
    const primaryKey = draft.primaryProduct ? videoProductOptionKey(draft.primaryProduct) : "";
    const previousKeys = new Set(draft.products.map(videoProductOptionKey));
    const nextKeys = new Set(products.map(videoProductOptionKey));
    const primaryProduct = primaryKey && previousKeys.has(primaryKey) && !nextKeys.has(primaryKey) ? null : draft.primaryProduct;
    patch({ products, primaryProduct });
  };

  const uploadThumbnail = async (file: File | null | undefined) => {
    if (!file) return;
    const result = await uploadVideoThumbnail(file);
    if (!result.error) patch({ custom_thumbnail_url: result.url, custom_thumbnail_path: result.path });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? tv("videoMgmtEdit", lang) : tv("videoMgmtAdd", lang)}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <TextField label={tv("videoMgmtYoutubeUrl", lang)} required value={draft.youtube_url} onChange={(value) => patch({ youtube_url: value })} />
            <TextField label={tv("videoMgmtTitleLabel", lang)} required value={draft.title} onChange={(value) => patch({ title: value })} />
            <label className="block">
              <FieldLabel text={tv("videoMgmtDescription", lang)} />
              <textarea value={draft.description} onChange={(event) => patch({ description: event.target.value })} className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel text={tv("videoMgmtContentType", lang)} />
                <select value={draft.content_type} onChange={(event) => patch({ content_type: event.target.value as VideoContentType })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                  {VIDEO_CONTENT_TYPES.map((type) => <option key={type} value={type}>{videoContentTypeLabel(type, lang)}</option>)}
                </select>
              </label>
              <label>
                <FieldLabel text={tv("videoMgmtStatus", lang)} />
                <select value={draft.status} onChange={(event) => patch({ status: event.target.value as VideoStatus })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                  <option value="draft">{tv("videoMgmtDraft", lang)}</option>
                  <option value="published">{tv("videoMgmtPublished", lang)}</option>
                  <option value="archived">{tv("videoMgmtArchived", lang)}</option>
                </select>
              </label>
              <label>
                <FieldLabel text={tv("videoMgmtModelStatus", lang)} />
                <select value={draft.model_generation_status} onChange={(event) => patch({ model_generation_status: event.target.value as VideoModelGenerationStatus })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                  <option value="current">{videoModelGenerationStatusLabel("current", lang)}</option>
                  <option value="legacy">{videoModelGenerationStatusLabel("legacy", lang)}</option>
                </select>
              </label>
            </div>
            <div>
              <FieldLabel text={tv("videoMgmtSeasons", lang)} />
              <div className="flex flex-wrap gap-2">
                {VIDEO_SEASONS.map((season) => {
                  const active = draft.seasons.includes(season);
                  return (
                    <button key={season} type="button" onClick={() => {
                      const next = active ? draft.seasons.filter((item) => item !== season) : [...draft.seasons, season];
                      patch({ seasons: next.length ? next : ["all_year"] });
                    }} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200"}`}>
                      {videoSeasonLabel(season, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
            <TextField label={tv("videoLibraryTags", lang)} value={draft.tagsText} onChange={(value) => patch({ tagsText: value })} help={tv("videoMgmtTagsHelp", lang)} />
            <ProductCombobox
              label={tv("videoMgmtRelatedProducts", lang)}
              mode="multi"
              options={productOptions}
              selected={draft.products}
              onMultiChange={patchProducts}
              placeholder={tv("videoMgmtRelatedProductPlaceholder", lang)}
              searchPlaceholder={tv("videoMgmtProductSearch", lang)}
              emptyText={tv("videoMgmtProductNoResults", lang)}
            />
            <ProductCombobox
              label={tv("videoMgmtPrimaryProduct", lang)}
              mode="single"
              options={productOptions}
              selected={draft.primaryProduct}
              onSingleChange={(primaryProduct) => patch({ primaryProduct })}
              placeholder={tv("videoMgmtNoPrimary", lang)}
              searchPlaceholder={tv("videoMgmtProductSearch", lang)}
              emptyText={tv("videoMgmtProductNoResults", lang)}
              clearLabel={tv("videoMgmtNoPrimary", lang)}
            />
          </div>

          <aside className="space-y-3">
            <FieldLabel text={tv("videoMgmtThumbnail", lang)} />
            <img src={thumbnail} alt="" className="aspect-video w-full rounded-xl bg-slate-100 object-cover" />
            <p className="text-xs text-slate-500">{tv("videoMgmtYoutubePreview", lang)}</p>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadThumbnail(event.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                {tv("videoMgmtCustomThumbnail", lang)}
              </Button>
              {draft.custom_thumbnail_url && (
                <Button type="button" variant="outline" onClick={() => patch({ custom_thumbnail_url: null, custom_thumbnail_path: null })}>
                  {tv("videoMgmtRemoveThumbnail", lang)}
                </Button>
              )}
            </div>
          </aside>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>{tv("cancel", lang)}</Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onSave("draft")} disabled={saving}>{tv("videoMgmtSaveDraft", lang)}</Button>
            <Button type="button" variant="outline" onClick={() => onSave("archived")} disabled={saving} className="gap-2"><Archive className="h-4 w-4" />{tv("videoMgmtArchive", lang)}</Button>
            <Button type="button" onClick={() => onSave("published")} disabled={saving}>{tv("videoMgmtPublish", lang)}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductCombobox(props: {
  label: string;
  mode: "multi" | "single";
  options: VideoProductOption[];
  selected: VideoProductOption[] | VideoProductOption | null;
  onMultiChange?: (value: VideoProductOption[]) => void;
  onSingleChange?: (value: VideoProductOption | null) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedList = Array.isArray(props.selected) ? props.selected : props.selected ? [props.selected] : [];
  const selectedKeys = new Set(selectedList.map(videoProductOptionKey));
  const normalizedQuery = query.trim().toLowerCase();
  const matches = props.options
    .filter((option) => props.mode === "single" || !selectedKeys.has(videoProductOptionKey(option)))
    .filter((option) => !normalizedQuery || productSearchText(option).includes(normalizedQuery))
    .slice(0, 12);

  const addOption = (option: VideoProductOption) => {
    if (props.mode === "multi") {
      props.onMultiChange?.([...selectedList, option]);
      setQuery("");
      return;
    }
    props.onSingleChange?.(option);
    setOpen(false);
    setQuery("");
  };

  const removeOption = (key: string) => {
    if (props.mode === "multi") {
      props.onMultiChange?.(selectedList.filter((option) => videoProductOptionKey(option) !== key));
      return;
    }
    props.onSingleChange?.(null);
  };

  const triggerLabel = props.mode === "single" && selectedList[0]
    ? `${selectedList[0].itemNumber} · ${selectedList[0].label} · ${selectedList[0].machineLabel}`
    : props.placeholder;

  return (
    <div>
      <FieldLabel text={props.label} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
            <span className={cn("min-w-0 truncate", selectedList.length ? "text-slate-900" : "text-slate-400")}>{triggerLabel}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={props.searchPlaceholder} />
            <CommandList className="max-h-56">
              <CommandEmpty>{props.emptyText}</CommandEmpty>
              <CommandGroup>
                {props.mode === "single" && (
                  <CommandItem value="__none__" onSelect={() => { props.onSingleChange?.(null); setOpen(false); setQuery(""); }} className="gap-2">
                    <Check className={cn("h-4 w-4", selectedList.length ? "opacity-0" : "opacity-100")} />
                    <span>{props.clearLabel || props.placeholder}</span>
                  </CommandItem>
                )}
                {matches.map((option) => {
                  const key = videoProductOptionKey(option);
                  const selected = selectedKeys.has(key);
                  return (
                    <CommandItem key={key} value={productSearchText(option)} onSelect={() => addOption(option)} className="items-start gap-2">
                      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                      <ProductOptionRow option={option} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {props.mode === "multi" && selectedList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedList.map((option) => {
            const key = videoProductOptionKey(option);
            return (
              <button key={key} type="button" onClick={() => removeOption(key)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                {option.itemNumber} · {option.label} <span className="text-slate-400">· {option.machineLabel}</span> <X className="ml-1 inline h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductOptionRow({ option }: { option: VideoProductOption }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="min-w-0 text-slate-700">
        <span className="font-semibold text-slate-900">{option.itemNumber}</span>
        <span> · {option.label}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-slate-500 sm:min-w-24 sm:text-right">{option.machineLabel}</span>
    </span>
  );
}

function TextField({ label, value, onChange, required, help }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; help?: string }) {
  return (
    <label className="block">
      <FieldLabel text={label} required={required} />
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
    </label>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{text}{required && <span className="text-rose-500"> *</span>}</span>;
}

function StatusBadge({ status, lang }: { status: VideoStatus; lang: Parameters<typeof tv>[1] }) {
  const label = status === "published" ? tv("videoMgmtPublished", lang) : status === "archived" ? tv("videoMgmtArchived", lang) : tv("videoMgmtDraft", lang);
  const cls = status === "published" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : status === "archived" ? "bg-slate-100 text-slate-500 ring-slate-200" : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${cls}`}>{label}</span>;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{children}</span>;
}
