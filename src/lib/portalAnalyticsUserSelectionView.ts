export type PortalAnalyticsUserSelectionView = "scope" | "single" | "multi";

export function resolvePortalAnalyticsUserSelectionView(selectedUserCount: number): PortalAnalyticsUserSelectionView {
  if (selectedUserCount === 1) return "single";
  if (selectedUserCount > 1) return "multi";
  return "scope";
}
