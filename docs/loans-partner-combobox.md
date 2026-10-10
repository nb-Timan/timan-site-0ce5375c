# Loans: searchable partner selection

## Scope and layering diagnosis

The previous partner field in `LoanCasePage` was a native HTML `select`, not
an application popover. Its browser-managed option popup was outside the DOM
and did not use the Portal overlay or its collision/viewport sizing contract.
The reported popup-overlap screenshot is not part of this change's evidence;
its precise browser-native paint failure could not be independently isolated.

Read-only inspection of the served original field found `overflow: visible`,
`position: static`, `z-index: auto`, and no transforms on the label, grid,
section, fieldset, and page ancestors. No parent CSS clipping/stacking cause
was found. The select's own computed `overflow: clip` is native-control styling,
not evidence of clipping by the surrounding form. Raising its z-index would
not add a searchable, controllable application popup.

`LoanPartnerCombobox` adapts the same shared Popover + Command primitives
already used by CRM's account picker. The existing Popover primitive portals
content outside the form into the document overlay, with the standard z-50.
Radix handles anchoring, collision flip, outside click, Escape, and focus return.
The popup width follows the trigger and its height follows available space.
Only the result list scrolls; search stays above it. Autofocus prevents page
scroll. No new global z-index or overlay implementation was introduced.

## Data and dependent fields

The parent still calls `listLoanPartners(sellerId)` / the existing
`loan_list_partners_for_seller` RPC and `listLoanContacts(partnerId)`.
Search only filters the already-authorized result using account number and
company name (case-insensitive NFC Unicode, preserving Danish characters).
It never queries another source, creates accounts, or changes saved IDs.
Seller changes clear partner/contact choices. Partner changes clear contact.
Obsolete asynchronous results are ignored after scope/partner changes.
The combobox is disabled with the existing busy/read-only form state.
No database, RLS, allocator, reservation, Fabric, or history changes.

## Verification

- Component tests: initial empty selection, autofocus, portal ownership,
  name/account search, multiple results, Danish Unicode, zero matches,
  search reset, retained selection while searching, arrows/Enter/Escape,
  disabled state and scoped input list.
- Full form regression: contact reload/reset, canonical IDs saved and
  hydrated on reopening, seller changes and stale request protection.
- Browser QA uses the actual Loans form with isolated synthetic service data
  for Save/Reopen; no production loan or U-number is created for this test.
- Browser positioning: standard overlay paints over Expected return; internal
  list scroll keeps input visible; reduced viewport flips above the trigger;
  desktop and 390 CSS px stay inside viewport without horizontal overflow.
  Outside click, Escape and Tab to Contact preserve navigation.
- The deployed preview is checked after GitHub synchronization against actual
  served assets and visible canonical scoped partner results, without AI Build.
- Repository typecheck has 111 existing errors: before/after diagnostics are
  compared to ensure this change introduces none. Scoped lint/build and Loans
  regressions must pass. No Lovable build prompt or credits are required.
