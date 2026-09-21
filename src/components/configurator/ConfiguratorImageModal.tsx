import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type ConfiguratorImagePreview = {
  src: string;
  title: string;
  itemNumber?: string | null;
};

type ConfiguratorImageModalProps = {
  preview: ConfiguratorImagePreview | null;
  itemNumberLabel: string;
  unavailableLabel: string;
  onClose: () => void;
};

export function ConfiguratorImageModal({
  preview,
  itemNumberLabel,
  unavailableLabel,
  onClose,
}: ConfiguratorImageModalProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [preview?.src]);

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="grid h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden border-0 bg-white p-3 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[min(90vw,72rem)] sm:p-5"
      >
        {preview && (
          <>
            <DialogHeader className="min-w-0 pr-10 text-left">
              <DialogTitle className="break-words text-base sm:text-lg">{preview.title}</DialogTitle>
              {preview.itemNumber && (
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  {itemNumberLabel}: {preview.itemNumber}
                </p>
              )}
            </DialogHeader>
            <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-2 sm:p-4">
              {imageFailed ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center text-slate-500">
                  <ImageOff className="h-10 w-10" aria-hidden="true" />
                  <p className="text-sm font-medium">{unavailableLabel}</p>
                </div>
              ) : (
                <img
                  src={preview.src}
                  alt={preview.title}
                  className="max-h-full max-w-full object-contain sm:max-h-[calc(90vh-8rem)]"
                  onError={() => setImageFailed(true)}
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
