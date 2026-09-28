import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteModal, type NewNoteForm } from "@/pages/crm/CrmDealerDetailPage";

function Harness({ onSave }: { onSave: (input: NewNoteForm) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h1>Integra Group Sp z o.o.</h1>
      <button type="button" onClick={() => setOpen(true)}>Tilføj aktivitet / note</button>
      {open && (
        <NoteModal
          dealerLabel="Integra Group Sp z o.o."
          shareLabel="Del med forhandler"
          lang="da"
          onCancel={() => setOpen(false)}
          onSave={async (input) => {
            await onSave(input);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe("CRM dealer note modal", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/portal/crm/my-dealers/10451");
  });

  it("opens in place without navigation or a blank-page regression", () => {
    render(<Harness onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tilføj aktivitet / note" }));

    expect(window.location.pathname).toBe("/portal/crm/my-dealers/10451");
    expect(screen.getByRole("dialog", { name: "Tilføj note" })).toBeVisible();
    expect(screen.getByText("Forhandler: Integra Group Sp z o.o. · intern som standard")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Integra Group Sp z o.o." })).toBeVisible();
  });

  it("submits one note and closes after the canonical save resolves", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Tilføj aktivitet / note" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "QA dealer note" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem note" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      note_type: "general",
      note_text: "QA dealer note",
      create_calendar: false,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/portal/crm/my-dealers/10451");
  });

  it("keeps the page and shows a controlled error when save fails", async () => {
    render(<Harness onSave={vi.fn().mockRejectedValue(new Error("network"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Tilføj aktivitet / note" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "QA dealer note" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Kunne ikke gemme noten.");
    expect(screen.getByRole("dialog", { name: "Tilføj note" })).toBeVisible();
    expect(window.location.pathname).toBe("/portal/crm/my-dealers/10451");
  });
});
