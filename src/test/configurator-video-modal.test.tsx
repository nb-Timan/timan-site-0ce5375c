import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import TimanVideoModal from "@/components/video/TimanVideoModal";
import { resolveTimanVideoId } from "@/lib/timanVideoEmbed";

describe("Configurator internal video player", () => {
  it("resolves every supported YouTube URL form", () => {
    expect(resolveTimanVideoId({ videoUrl: "https://www.youtube.com/watch?v=guiPDcWgADQ" })).toBe("guiPDcWgADQ");
    expect(resolveTimanVideoId({ videoUrl: "https://youtu.be/guiPDcWgADQ" })).toBe("guiPDcWgADQ");
    expect(resolveTimanVideoId({ videoUrl: "https://www.youtube.com/embed/guiPDcWgADQ" })).toBe("guiPDcWgADQ");
    expect(resolveTimanVideoId({ youtubeVideoId: "guiPDcWgADQ" })).toBe("guiPDcWgADQ");
    expect(resolveTimanVideoId({ videoUrl: "https://example.com/video" })).toBeNull();
  });

  it("plays SKU 411866 inside the portal modal and closes without navigation", () => {
    const onClose = vi.fn();
    render(
      <TimanVideoModal
        language="da"
        title="Y-slagle-sæt af 16 stk."
        videoUrl="https://www.youtube.com/watch?v=guiPDcWgADQ"
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Y-slagle-sæt af 16 stk." })).toBeInTheDocument();
    expect(screen.getByTitle("Y-slagle-sæt af 16 stk.")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/guiPDcWgADQ?autoplay=1&rel=0",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the controlled fallback instead of navigating externally", () => {
    render(
      <TimanVideoModal
        language="da"
        title="Ukendt video"
        videoUrl="https://example.com/video"
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Videoen kunne ikke åbnes.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("uses modal buttons for every Configurator video action", () => {
    const configurator = readFileSync("src/pages/ConfiguratorPage.tsx", "utf8");
    const products = readFileSync("src/data/machines.ts", "utf8");

    expect(products).toContain("id: '411866'");
    expect(products).toContain("https://www.youtube.com/watch?v=guiPDcWgADQ");
    expect(configurator).toContain("setProductVideoPreview({ url: videoUrl, title: productTitle })");
    expect(configurator).toContain("setProductVideoPreview({ url: cardVideoUrl, title: cardTitle })");
    expect(configurator).not.toContain('<a href={videoUrl} target="_blank"');
    expect(configurator).not.toContain('<a href={cardVideoUrl} target="_blank"');
  });
});
