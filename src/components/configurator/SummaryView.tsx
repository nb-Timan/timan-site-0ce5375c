import { PriceSummary, LineItem, DocumentType, CustomerInfo, DeliveryInfo } from '@/types/configurator';
import { t } from '@/data/translations';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

interface SummaryViewProps {
  documentType: DocumentType;
  lineItems: LineItem[];
  priceSummary: PriceSummary;
  customerInfo: CustomerInfo;
  deliveryInfo: DeliveryInfo;
  onPrevious: () => void;
}

function formatKr(amount: number): string {
  return amount.toLocaleString('da-DK', { minimumFractionDigits: 0 }) + ' kr.';
}

export function SummaryView({
  documentType,
  lineItems,
  priceSummary,
  customerInfo,
  deliveryInfo,
  onPrevious,
}: SummaryViewProps) {
  const handleDownloadPdf = () => {
    // TODO: integrate with PDF generation (e.g., jsPDF or server-side via n8n webhook)
    alert('PDF download — integration kommer snart');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">{documentType === 'quote' ? t('quote') : t('order')} — {t('summaryTitle')}</h2>
      </div>

      {/* Customer info summary */}
      <div className="bg-card border rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold">{customerInfo.companyName}</p>
        <p className="text-muted-foreground">{customerInfo.contactPerson}</p>
        <p className="text-muted-foreground">{customerInfo.phone} · {customerInfo.email}</p>
        {customerInfo.comment && <p className="text-muted-foreground italic mt-1">"{customerInfo.comment}"</p>}
        <Separator className="my-2" />
        <p className="text-muted-foreground">
          Levering: {deliveryInfo.method === 'pickup' ? 'Afhentning' : deliveryInfo.method === 'send' ? 'Fragt' : 'Levering + opstart'}
          {deliveryInfo.date && ` — ${format(deliveryInfo.date, 'PPP', { locale: da })}`}
        </p>
      </div>

      {/* Line items */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-3 font-medium">Beskrivelse</th>
              <th className="text-left p-3 font-medium">Varenr.</th>
              <th className="text-right p-3 font-medium">Antal</th>
              <th className="text-right p-3 font-medium">Stk. pris</th>
              <th className="text-right p-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, idx) => (
              <tr key={idx} className="border-t border-border">
                <td className={`p-3 ${item.indent ? 'pl-8 text-muted-foreground' : 'font-medium'}`}>
                  {item.name}
                </td>
                <td className="p-3 text-muted-foreground">{item.itemNumber}</td>
                <td className="p-3 text-right">{item.quantity}</td>
                <td className="p-3 text-right">{formatKr(item.unitPrice)}</td>
                <td className="p-3 text-right font-medium">{formatKr(item.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Price breakdown */}
      <div className="bg-card border rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>{t('subtotal')}</span>
          <span className="font-medium">{formatKr(priceSummary.subtotal)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-success">
          <span>{t('baseDiscount')}</span>
          <span>-{formatKr(priceSummary.discounts.baseDiscount)}</span>
        </div>
        {priceSummary.discounts.quantityDiscountPercent > 0 && (
          <div className="flex justify-between text-success">
            <span>{t('quantityDiscount')} ({priceSummary.discounts.quantityDiscountPercent}%)</span>
            <span>-{formatKr(priceSummary.discounts.quantityDiscount)}</span>
          </div>
        )}
        {priceSummary.discounts.deliveryDiscountPercent > 0 && (
          <div className="flex justify-between text-success">
            <span>{t('deliveryDiscount')} ({priceSummary.discounts.deliveryDiscountPercent}%)</span>
            <span>-{formatKr(priceSummary.discounts.deliveryDiscount)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between text-lg font-bold">
          <span>{t('finalPrice')} <span className="text-xs font-normal text-muted-foreground">{t('exVat')}</span></span>
          <span className="text-primary">{formatKr(priceSummary.finalPrice)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>{t('previous')}</Button>
        <Button onClick={handleDownloadPdf}>
          <Download className="w-4 h-4 mr-2" />
          {t('downloadPdf')}
        </Button>
      </div>
    </div>
  );
}
