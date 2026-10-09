import ReadOnlySalesDocumentModal from '@/components/crm/ReadOnlySalesDocumentModal';
import type { SavedConfiguration } from '@/lib/configurationsService';

interface Props {
  order: SavedConfiguration;
  onClose: () => void;
}

/** Compatibility wrapper for existing order-confirmation callers. */
export default function ReadOnlyOrderConfirmationModal({ order, onClose }: Props) {
  return <ReadOnlySalesDocumentModal document={order} documentType="order" language={order.state_json.language} onClose={onClose} />;
}
