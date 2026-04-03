import { CustomerInfo } from '@/types/configurator';
import { t } from '@/data/translations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface CustomerInfoStepProps {
  customerInfo: CustomerInfo;
  onCustomerInfoChange: (info: Partial<CustomerInfo>) => void;
  onNext: () => void;
  onPrevious: () => void;
}

export function CustomerInfoStep({ customerInfo, onCustomerInfoChange, onNext, onPrevious }: CustomerInfoStepProps) {
  const isValid = customerInfo.companyName.trim() && customerInfo.contactPerson.trim() && customerInfo.email.trim();

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-4">
        <div>
          <Label htmlFor="company">{t('companyName')}</Label>
          <Input
            id="company"
            value={customerInfo.companyName}
            onChange={(e) => onCustomerInfoChange({ companyName: e.target.value })}
            placeholder="Firma A/S"
          />
        </div>
        <div>
          <Label htmlFor="contact">{t('contactPerson')}</Label>
          <Input
            id="contact"
            value={customerInfo.contactPerson}
            onChange={(e) => onCustomerInfoChange({ contactPerson: e.target.value })}
            placeholder="Anders Andersen"
          />
        </div>
        <div>
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input
            id="phone"
            type="tel"
            value={customerInfo.phone}
            onChange={(e) => onCustomerInfoChange({ phone: e.target.value })}
            placeholder="+45 12 34 56 78"
          />
        </div>
        <div>
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            type="email"
            value={customerInfo.email}
            onChange={(e) => onCustomerInfoChange({ email: e.target.value })}
            placeholder="anders@firma.dk"
          />
        </div>
        <div>
          <Label htmlFor="comment">{t('comment')}</Label>
          <Textarea
            id="comment"
            value={customerInfo.comment}
            onChange={(e) => onCustomerInfoChange({ comment: e.target.value })}
            placeholder="Evt. bemærkninger..."
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>{t('previous')}</Button>
        <Button onClick={onNext} disabled={!isValid}>{t('next')}</Button>
      </div>
    </div>
  );
}
