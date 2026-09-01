import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listVideoProductOptions } from "@/lib/videoProductCatalog";
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
  });

  it("has i18n labels and structured filters for all portal languages", () => {
    for (const lang of ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"] as const) {
      expect(tv("videoLibraryTitle", lang)).not.toBe("videoLibraryTitle");
      expect(tv("videoMgmtAdd", lang)).not.toBe("videoMgmtAdd");
      expect(tv("videoMgmtContentType", lang)).not.toBe("videoMgmtContentType");
      expect(tv("videoMgmtStatus", lang)).not.toBe("videoMgmtStatus");
      expect(tv("videoMgmtSeasons", lang)).not.toBe("videoMgmtSeasons");
      expect(tv("videoMgmtRelatedProducts", lang)).not.toBe("videoMgmtRelatedProducts");
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
    const configurator = readFileSync("src/pages/ConfiguratorPage.tsx", "utf8");
    const migration = [
      readFileSync("supabase/migrations/20260901183941_marketing_video_library.sql", "utf8"),
      readFileSync("supabase/migrations/20260901184240_harden_marketing_video_library_policies.sql", "utf8"),
      readFileSync("supabase/migrations/20260901201158_marketing_video_editorial_i18n.sql", "utf8"),
    ].join("\n");

    expect(app).toContain("/portal/marketing/videos");
    expect(area).toContain("videoMgmtTitle");
    expect(salesPage).toContain("listPublishedMarketingVideos(uiLanguage)");
    expect(salesPage).toContain("window.addEventListener(\"keydown\", closeOnEscape)");
    expect(salesPage).toContain("videoLibraryEmbedFallback");
    expect(salesPage).toContain("https://www.youtube.com/watch?v=");
    expect(managementPage).toContain("findPrimaryProductConflict");
    expect(managementPage).toContain("exactMarketingVideoContent(row, uiLanguage)");
    expect(managementPage).toContain("localizeMarketingVideo(row, uiLanguage)");
    expect(managementPage).toContain("uploadVideoThumbnail");
    expect(configurator).toContain("listPublishedPrimaryVideos(uiLanguage)");
    expect(migration).toContain("product_key text not null unique");
    expect(migration).toContain("localized_content jsonb not null default '{}'::jsonb");
    expect(migration).toContain("source_language text not null default 'da'");
    expect(migration).toContain("translation_meta jsonb not null default '{}'::jsonb");
    expect(migration).toContain("marketing_videos_authenticated_read_visible");
    expect(migration).toContain("can_manage_marketing_videos");
  });
});
