import { AlertTriangle } from "lucide-react";

interface MockDataBannerProps {
  title: string;
  description: React.ReactNode;
}

export function MockDataBanner({ title, description }: MockDataBannerProps) {
  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-[10px] border bg-status-warning-bg p-4 shadow-sm"
      style={{ borderColor: "var(--status-warning-fg)" }}
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: "var(--status-warning-fg)" }} />
      <div className="text-sm">
        <div className="font-semibold" style={{ color: "var(--status-warning-fg)" }}>{title}</div>
        <div className="mt-1 text-foreground/80">{description}</div>
      </div>
    </div>
  );
}
