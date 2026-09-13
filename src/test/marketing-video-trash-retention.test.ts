import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tv } from "@/lib/videoLibraryI18n";

const service = readFileSync("src/lib/videoLibraryService.ts", "utf8");
const page = readFileSync("src/pages/backend/BackendVideoManagementPage.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260913092817_marketing_video_trash_retention.sql", "utf8");
const edge = readFileSync("supabase/functions/marketing-video-retention/index.ts", "utf8");

describe("marketing video 24-hour trash retention", () => {
  it("uses canonical archive and restore RPCs instead of writing lifecycle fields from the browser", () => {
    expect(service).toContain('supabase.rpc("archive_marketing_video"');
    expect(service).toContain('supabase.rpc("restore_marketing_video"');
    expect(page).toContain("archiveMarketingVideo");
    expect(page).toContain("restoreMarketingVideo");
    expect(page).toContain("permanentlyDeleteArchivedMarketingVideo");
    expect(page).not.toContain('onSave("archived")');
  });

  it("keeps relations during the restore window and only deletes the parent after storage succeeds", () => {
    expect(migration).toContain("delete_after = now() + interval '24 hours'");
    expect(migration).toContain("archived_previous_status");
    expect(migration).toContain("restore_marketing_video");
    expect(edge).toContain("removeOwnedThumbnail");
    expect(edge).toContain("ON DELETE CASCADE");
    expect(edge).toContain('from("marketing_videos").delete()');
    expect(edge.indexOf("removeOwnedThumbnail")).toBeLessThan(edge.indexOf('from("marketing_videos").delete()'));
  });

  it("accepts scheduler cleanup only with the Vault-backed secret and chooses expired records server-side", () => {
    expect(migration).toContain("marketing_video_retention_scheduler_secret");
    expect(migration).toContain("marketing-video-retention-hourly");
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("create extension if not exists pg_net");
    expect(edge).toContain("is_marketing_video_retention_scheduler");
    expect(edge).toContain('.eq("status", "archived")');
    expect(edge).toContain('.lte("delete_after", new Date().toISOString())');
  });

  it("has localized trash controls for every portal language", () => {
    for (const lang of ["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"] as const) {
      expect(tv("videoMgmtMoveToTrash", lang)).not.toBe("videoMgmtMoveToTrash");
      expect(tv("videoMgmtRestore", lang)).not.toBe("videoMgmtRestore");
      expect(tv("videoMgmtDeleteNow", lang)).not.toBe("videoMgmtDeleteNow");
    }
  });
});
