import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AcademyCompletionModal({
  open,
  onOpenChange,
  title,
  completed,
  total,
  nextUnlock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  completed: number;
  total: number;
  nextUnlock?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md text-center">
        <DialogHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <DialogTitle className="text-xl">Godt gået!</DialogTitle>
          <DialogDescription className="max-w-sm text-center text-sm leading-6 text-slate-600">
            Du har gennemført<br />
            <strong className="font-semibold text-slate-900">{title}</strong>
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm font-semibold text-emerald-800">
          Alle {completed} af {total} krav er opfyldt.
        </p>

        {nextUnlock && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-950">
            <span className="font-semibold">Næste opgave låst op:</span><br />
            {nextUnlock}
          </p>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-col sm:items-stretch">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Bliv her
          </button>
          <Link
            to="/academy"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#126a45] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5a3b]"
          >
            Tilbage til Min Academy
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
