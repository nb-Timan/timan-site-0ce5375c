import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listVideoProductOptions, productSearchText, videoProductOptionKey } from "@/lib/videoProductCatalog";
import { DEFAULT_VIDEO_FILTERS, filterAndSortVideos, getVideoMachineFilterOptions } from "@/lib/videoLibraryFilters";
import {
  extractYouTubeVideoId,
  resolveMarketingVideoContent,
  resolveVideoThumbnail,
  youtubeThumbnailFromId,
  type MarketingVideo,
} from "@/lib/videoLibraryService";
import { tv, VIDEO_CONTENT_TYPES, VIDEO_SEASONS } from "@/lib/videoLibraryI18n";

describe("marketing video library", () => {
  it("parses supported YouTube URLs without using the YouTube API", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=D-hXvg_oW9s")).toBe("D-hXvg_oW9s");
    expect(extractYouTubeVideoId("https://youtu.be/D-hXvg_oW9s?si=test")).toBe("D-hXvg_oW9s");
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/D-hXvg_oW9s")).toBe("D-hXvg_oW9s");
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/D-hXvg_oW9s")).toBe("D-hXvg_oW9s");
    expect(extractYouTubeVideoId("https://example.com/watch?v=D-hXvg_oW9s")).toBeNull();
  });

  it("uses custom thumbnail before YouTube fallback and portal placeholder", () => {
    expect(youtubeThumbnailFromId("D-hXvg_oW9s")).toBe("https://img.youtube.com/vi/D-hXvg_oW9s/hqdefault.jpg");
    expect(resolveVideoThumbnail({ custom_thumbnail_url: "https://cdn.example/custom.jpg", youtube_video_id: "D-hXvg_oW9s" })).toBe("https://cdn.example/custom.jpg");
    expect(resolveVideoThumbnail({ custom_thumbnail_url: null, youtube_video_id: "D-hXvg_oW9s" })).toBe("https://img.youtube.com/vi/D-hXvg_oW9s/hqdefault.jpg");
    expect(resolveVideoThumbnail({ custom_thumbnail_url: null, youtube_video_id: "" })).toBe("/placeholder.svg");
  });

  it("builds related product choices from the existing configurator product data", () => {
    const products = listVideoProductOptions("da");
    expect(products.some((item) => item.productKey === "RC-1000S" && item.itemNumber === "411000")).toBe(true);
    expect(products.some((item) => item.itemNumber === "730600")).toBe(true);
    expect(products.some((item) => item.itemNumber === "HEADER")).toBe(false);
    expect(products.some((item) => item.label === "Kost med blad")).toBe(false);
    expect(products.some((item) => item.label === "Redskaber til RC-1000s")).toBe(false);
    expect(products.some((item) => productSearchText(item).includes("rc-1000s"))).toBe(true);

    const optionsByNumber = products.reduce<Record<string, typeof products>>((acc, option) => {
      (acc[option.itemNumber] ||= []).push(option);
      return acc;
    }, {});
    const duplicateAcrossMachines = Object.values(optionsByNumber).find((items) => new Set(items.map((item) => item.machineKey)).size > 1);
    expect(duplicateAcrossMachines).toBeTruthy();
    expect(new Set(duplicateAcrossMachines?.map(videoProductOptionKey)).size).toBe(duplicateAcrossMachines?.length);
  });

  it("uses one shared filter model for sales and marketing video lists", () => {
    const rows = [
      {
        id: "1",
        title: "RC-1000 brush guide",
        description: "Setup for weed brush",
        content_type: "how_to",
        model_generation_status: "current",
        seasons: ["spring"],
        tags: ["brush"],
        status: "published",
        published_at: "2026-09-01T10:00:00Z",
        updated_at: "2026-09-01T10:00:00Z",
        products: [{ product_key: "RC-1000S", item_number: "411000", product_label: "RC-1000S", machine_key: "RC-1000S" }],
      },
      {
        id: "2",
        title: "Archived sales clip",
        description: "Older material",
        content_type: "sales",
        model_generation_status: "legacy",
        seasons: ["winter"],
        tags: ["archive"],
        status: "archived",
        published_at: null,
        updated_at: "2026-08-01T10:00:00Z",
        products: [{ product_key: "TIMAN_3330", item_number: "3330", product_label: "Timan 3330", machine_key: "TIMAN_3330" }],
      },
    ] as MarketingVideo[];

    expect(getVideoMachineFilterOptions("en").some((item) => item.value === "RC-1000S")).toBe(true);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, query: "411000" }, "en").map((row) => row.id)).toEqual(["1"]);
    expect(filterAndSortVideos(rows, DEFAULT_VIDEO_FILTERS, "en").map((row) => row.id)).toEqual(["1"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, modelGenerationFilter: "all" }, "en").map((row) => row.id)).toEqual(["1", "2"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, modelGenerationFilter: "legacy" }, "en").map((row) => row.id)).toEqual(["2"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, typeFilter: "how_to" }, "en").map((row) => row.id)).toEqual(["1"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, modelGenerationFilter: "all", seasonFilter: "winter" }, "en").map((row) => row.id)).toEqual(["2"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, modelGenerationFilter: "all", machineFilter: "TIMAN_3330" }, "en").map((row) => row.id)).toEqual(["2"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, favoritesOnly: true }, "en", { favoriteIds: new Set(["1"]) }).map((row) => row.id)).toEqual(["1"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, modelGenerationFilter: "all", favoritesOnly: true }, "en", { favoriteIds: new Set(["2"]) }).map((row) => row.id)).toEqual(["2"]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, favoritesOnly: true }, "en", { favoriteIds: new Set() }).map((row) => row.id)).toEqual([]);
    expect(filterAndSortVideos(rows, { ...DEFAULT_VIDEO_FILTERS, statusFilter: "published" }, "en", { includeStatus: true }).map((row) => row.id)).toEqual(["1"]);
  });

  it("has i18n labels and structured filters for all portal languages", () => {
    for (const lang of ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"] as const) {
      expect(tv("videoLibraryTitle", lang)).not.toBe("videoLibraryTitle");
      expect(tv("videoLibraryFavorites", lang)).not.toBe("videoLibraryFavorites");
      expect(tv("videoLibraryAddFavorite", lang)).not.toBe("videoLibraryAddFavorite");
      expect(tv("videoLibraryRemoveFavorite", lang)).not.toBe("videoLibraryRemoveFavorite");
      expect(tv("videoLibraryNoFavorites", lang)).not.toBe("videoLibraryNoFavorites");
      expect(tv("videoMgmtAdd", lang)).not.toBe("videoMgmtAdd");
      expect(tv("videoMgmtContentType", lang)).not.toBe("videoMgmtContentType");
      expect(tv("videoMgmtStatus", lang)).not.toBe("videoMgmtStatus");
      expect(tv("videoMgmtModelStatus", lang)).not.toBe("videoMgmtModelStatus");
      expect(tv("videoModelCurrent", lang)).not.toBe("videoModelCurrent");
      expect(tv("videoModelAll", lang)).not.toBe("videoModelAll");
      expect(tv("videoModelLegacy", lang)).not.toBe("videoModelLegacy");
      expect(tv("videoMgmtSeasons", lang)).not.toBe("videoMgmtSeasons");
      expect(tv("videoMgmtRelatedProducts", lang)).not.toBe("videoMgmtRelatedProducts");
      expect(tv("videoMgmtRelatedProductPlaceholder", lang)).not.toBe("videoMgmtRelatedProductPlaceholder");
      expect(tv("videoMgmtProductNoResults", lang)).not.toBe("videoMgmtProductNoResults");
    }
    expect(tv("videoMgmtContentType", "de")).toBe("Inhaltstyp");
    expect(tv("videoMgmtPublished", "de")).toBe("Veröffentlicht");
    expect(tv("videoSeasonAllYear", "de")).toBe("Ganzjährig");
    expect(tv("videoSeasonSpring", "de")).toBe("Frühling");
    expect(VIDEO_CONTENT_TYPES).toContain("installation");
    expect(VIDEO_SEASONS).toContain("winter");
  });

  it("resolves editorial video content from the selected portal language with source fallback", () => {
    const video = {
      title: "How to operate Weed Brush for Timan RC-1000",
      description: "How to operate Weed Brush for Timan RC-1000",
      source_language: "en",
      localized_content: {
        en: {
          title: "How to operate Weed Brush for Timan RC-1000",
          description: "How to operate Weed Brush for Timan RC-1000",
        },
        da: {
          title: "Sådan betjenes ukrudtsbørsten til Timan RC-1000",
          description: "Sådan betjenes ukrudtsbørsten til Timan RC-1000",
        },
        de: {
          title: "So bedienen Sie die Unkrautbürste für den Timan RC-1000",
          description: "So bedienen Sie die Unkrautbürste für den Timan RC-1000",
        },
      },
    } as Pick<MarketingVideo, "title" | "description" | "localized_content" | "source_language">;

    expect(resolveMarketingVideoContent(video, "de").title).toBe("So bedienen Sie die Unkrautbürste für den Timan RC-1000");
    expect(resolveMarketingVideoContent(video, "da").title).toBe("Sådan betjenes ukrudtsbørsten til Timan RC-1000");
    expect(resolveMarketingVideoContent(video, "fr").title).toBe("How to operate Weed Brush for Timan RC-1000");
  });

  it("wires Marketing management, Sales library and Configurator primary video integration", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const area = readFileSync("src/pages/PortalAreaPage.tsx", "utf8");
    const salesPage = readFileSync("src/pages/VideoGalleryPage.tsx", "utf8");
    const managementPage = readFileSync("src/pages/backend/BackendVideoManagementPage.tsx", "utf8");
    const filterBar = readFileSync("src/components/video/VideoLibraryFilterBar.tsx", "utf8");
    const filterHelper = readFileSync("src/lib/videoLibraryFilters.ts", "utf8");
    const configurator = readFileSync("src/pages/ConfiguratorPage.tsx", "utf8");
    const migration = [
      readFileSync("supabase/migrations/20260901183941_marketing_video_library.sql", "utf8"),
      readFileSync("supabase/migrations/20260901184240_harden_marketing_video_library_policies.sql", "utf8"),
      readFileSync("supabase/migrations/20260901201158_marketing_video_editorial_i18n.sql", "utf8"),
      readFileSync("supabase/migrations/20260901210152_marketing_video_user_favorites.sql", "utf8"),
    ].join("\n");

    expect(app).toContain("/portal/marketing/videos");
    expect(area).toContain("videoMgmtTitle");
    expect(salesPage).toContain("VideoLibraryFilterBar");
    expect(salesPage).toContain("listMarketingVideoFavoriteIds");
    expect(salesPage).toContain("setMarketingVideoFavorite");
    expect(salesPage).toContain("event.stopPropagation()");
    expect(salesPage).toContain("showFavorites");
    expect(managementPage).toContain("VideoLibraryFilterBar");
    expect(managementPage).toContain("showStatus");
    expect(managementPage).toContain("model_generation_status");
    expect(filterBar).toContain("videoLibrarySortLatest");
    expect(filterBar).toContain("videoLibraryFavorites");
    expect(filterBar).toContain("videoModelGenerationFilterLabel");
    expect(filterBar).toContain("videoLibraryMachine");
    expect(filterHelper).toContain("filterAndSortVideos");
    expect(salesPage).toContain("listPublishedMarketingVideos(uiLanguage)");
    expect(salesPage).toContain("window.addEventListener(\"keydown\", closeOnEscape)");
    expect(salesPage).toContain("videoLibraryEmbedFallback");
    expect(salesPage).toContain("https://www.youtube.com/watch?v=");
    expect(managementPage).toContain("findPrimaryProductConflict");
    expect(managementPage).toContain("videoProductOptionKey");
    expect(managementPage).toContain("function ProductCombobox");
    expect(managementPage).toContain("CommandInput");
    expect(managementPage).toContain("sm:text-right");
    expect(managementPage).toContain("exactMarketingVideoContent(row, uiLanguage)");
    expect(managementPage).toContain("localizeMarketingVideo(row, uiLanguage)");
    expect(managementPage).toContain("source_language: row.source_language");
    expect(managementPage).toContain("content_language: uiLanguage");
    expect(managementPage).toContain("uploadVideoThumbnail");
    expect(configurator).toContain("listPublishedPrimaryVideos(uiLanguage)");
    expect(migration).toContain("product_key text not null unique");
    expect(migration).toContain("localized_content jsonb not null default '{}'::jsonb");
    expect(migration).toContain("source_language text not null default 'da'");
    expect(migration).toContain("translation_meta jsonb not null default '{}'::jsonb");
    expect(migration).toContain("marketing_videos_authenticated_read_visible");
    expect(migration).toContain("can_manage_marketing_videos");
    expect(migration).toContain("marketing_video_user_favorites");
    expect(migration).toContain("primary key (user_id, video_id)");
    expect(migration).toContain("marketing_video_user_favorites_select_own");
    expect(migration).toContain("grant select, insert, delete");
    expect(readFileSync("supabase/migrations/20260901205252_add_marketing_video_model_generation_status.sql", "utf8")).toContain("model_generation_status");
  });
});
