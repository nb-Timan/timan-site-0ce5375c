export default function DemoModeBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ${className}`}
      title="Timan Messe — demo session"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Demo mode
    </span>
  );
}
