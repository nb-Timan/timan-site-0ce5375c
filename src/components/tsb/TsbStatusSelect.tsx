import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PROCESS_STATUS_LABEL, PROCESS_STATUS_OPTIONS, type ProcessStatus } from "@/lib/tsb-store";

const TONE: Record<ProcessStatus, { bg: string; fg: string; ring: string }> = {
  ikke_paabegyndt: { bg: "bg-status-warning-bg", fg: "text-status-warning-fg", ring: "focus:ring-status-warning-fg/30" },
  aktiv:           { bg: "bg-status-success-bg", fg: "text-status-success-fg", ring: "focus:ring-status-success-fg/30" },
  dato_overskredet:{ bg: "bg-status-danger-bg",  fg: "text-status-danger-fg",  ring: "focus:ring-status-danger-fg/30" },
  afsluttet:       { bg: "bg-status-neutral-bg", fg: "text-status-neutral-fg", ring: "focus:ring-status-neutral-fg/30" },
};

interface TsbStatusSelectProps {
  value: ProcessStatus;
  onChange: (next: ProcessStatus) => void;
  size?: "sm" | "md";
  className?: string;
  stopPropagation?: boolean;
}

export function TsbStatusSelect({ value, onChange, size = "sm", className, stopPropagation }: TsbStatusSelectProps) {
  const tone = TONE[value];
  const heightCls = size === "sm" ? "h-8" : "h-9";

  return (
    <div onClick={(e) => { if (stopPropagation) e.stopPropagation(); }}>
      <Select value={value} onValueChange={(v) => onChange(v as ProcessStatus)}>
        <SelectTrigger
          className={cn(
            heightCls,
            "w-auto min-w-[170px] gap-2 whitespace-nowrap rounded-full border-0 px-3 text-xs font-medium shadow-none focus:ring-2",
            tone.bg, tone.fg, tone.ring, className,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROCESS_STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="whitespace-nowrap text-sm">
              {PROCESS_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
