import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ConfiguratorImageModal } from '@/components/configurator/ConfiguratorImageModal';

const configuratorSource = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
const modalSource = readFileSync('src/components/configurator/ConfiguratorImageModal.tsx', 'utf8');

describe('Configurator product image modal', () => {
  it('opens product images internally while keeping video links unchanged', () => {
    expect(configuratorSource).toContain('setProductImagePreview({ src: imageUrl');
    expect(configuratorSource).toContain('setProductImagePreview({ src: cardImageUrl');
    expect(configuratorSource).not.toContain('<a href={imageUrl} target="_blank"');
    expect(configuratorSource).not.toContain('<a href={cardImageUrl} target="_blank"');
    expect(configuratorSource).toContain('<a href={videoUrl} target="_blank"');
    expect(configuratorSource).toContain('<a href={cardVideoUrl} target="_blank"');
  });

  it('shows the product identity and preserves responsive contain sizing', () => {
    expect(modalSource).toContain('{preview.title}');
    expect(modalSource).toContain('{itemNumberLabel}: {preview.itemNumber}');
    expect(modalSource).toContain('object-contain');
    expect(modalSource).toContain('h-[calc(100dvh-1rem)]');
    expect(modalSource).toContain('sm:max-h-[90vh]');
    expect(modalSource).toContain('sm:w-[min(90vw,72rem)]');
  });

  it('uses the shared dialog close behavior and a controlled broken-image state', () => {
    expect(modalSource).toContain('onOpenChange={(open) => { if (!open) onClose(); }}');
    expect(modalSource).toContain('onError={() => setImageFailed(true)}');
    expect(modalSource).toContain('<ImageOff');
  });

  it('renders a large uncropped image and closes with Escape', () => {
    const onClose = vi.fn();
    render(
      <ConfiguratorImageModal
        preview={{ src: 'https://example.invalid/product.jpg', title: 'Slagleklipper', itemNumber: '410910' }}
        itemNumberLabel="Varenr."
        unavailableLabel="Billedet kunne ikke indlæses."
        onClose={onClose}
      />,
    );

    const image = screen.getByRole('img', { name: 'Slagleklipper' });
    expect(image).toHaveClass('object-contain');
    expect(screen.getByText('Varenr.: 410910')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a readable fallback when the canonical image URL fails', () => {
    render(
      <ConfiguratorImageModal
        preview={{ src: 'https://example.invalid/broken.jpg', title: 'Arbejdslys', itemNumber: '412594' }}
        itemNumberLabel="Varenr."
        unavailableLabel="Billedet kunne ikke indlæses."
        onClose={() => undefined}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Arbejdslys' }));
    expect(screen.getByText('Billedet kunne ikke indlæses.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Arbejdslys' })).not.toBeInTheDocument();
  });
});
