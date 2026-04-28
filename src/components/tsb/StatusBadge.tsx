import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
}

const styles: Record<Variant, string> = {
  success: "bg-status-success-bg text-status-success-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap font-medium",
        styles[variant],
        className,
      )}
      style={{ borderRadius: "20px", padding: "4px 12px", fontSize: "12px" }}
    >
      {children}
    </span>
  );
}
