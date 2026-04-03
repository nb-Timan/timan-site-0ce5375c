import { useConfigurator } from '@/hooks/useConfigurator';
import { StepIndicator } from '@/components/configurator/StepIndicator';
import { MachineSelectionStep } from '@/components/configurator/MachineSelectionStep';
import { DeliveryStep } from '@/components/configurator/DeliveryStep';
import { AccessoryStep } from '@/components/configurator/AccessoryStep';
import { CustomerInfoStep } from '@/components/configurator/CustomerInfoStep';
import { SummaryView } from '@/components/configurator/SummaryView';
import { SummarySidebar } from '@/components/configurator/SummarySidebar';
import { t } from '@/data/translations';
import { Globe } from 'lucide-react';

const STEPS = ['Maskinevalg', 'Levering', 'Tilbehør', 'Kundeinfo', 'Oversigt'];

export default function ConfiguratorPage() {
  const {
    state,
    setStep,
    setDocumentType,
    setLanguage,
    setMachineSelections,
    updateUnitConfig,
    setDeliveryInfo,
    setCustomerInfo,
    priceSummary,
    lineItems,
  } = useConfigurator();

  const showSidebar = state.currentStep > 0 && state.currentStep < 4 && state.machineSelections.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-primary tracking-tight">TIMAN</h1>
            <span className="text-sm text-muted-foreground hidden sm:inline">Maskinkonfigurator</span>
          </div>
          {/* Language switcher — prepared for multi-language */}
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setLanguage(state.language === 'da' ? 'en' : 'da')}
          >
            <Globe className="w-4 h-4" />
            <span>{state.language.toUpperCase()}</span>
          </button>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b bg-card">
        <div className="container mx-auto">
          <StepIndicator steps={STEPS} currentStep={state.currentStep} onStepClick={setStep} />
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-6">
        <div className={`flex gap-6 ${showSidebar ? '' : ''}`}>
          <div className={showSidebar ? 'flex-1 min-w-0' : 'w-full'}>
            {state.currentStep === 0 && (
              <MachineSelectionStep
                documentType={state.documentType}
                selections={state.machineSelections}
                onDocumentTypeChange={setDocumentType}
                onSelectionsChange={setMachineSelections}
                onNext={() => setStep(1)}
              />
            )}
            {state.currentStep === 1 && (
              <DeliveryStep
                deliveryInfo={state.deliveryInfo}
                onDeliveryChange={setDeliveryInfo}
                onNext={() => setStep(2)}
                onPrevious={() => setStep(0)}
              />
            )}
            {state.currentStep === 2 && (
              <AccessoryStep
                machineSelections={state.machineSelections}
                unitConfigs={state.unitConfigs}
                onUpdateUnitConfig={updateUnitConfig}
                onNext={() => setStep(3)}
                onPrevious={() => setStep(1)}
              />
            )}
            {state.currentStep === 3 && (
              <CustomerInfoStep
                customerInfo={state.customerInfo}
                onCustomerInfoChange={setCustomerInfo}
                onNext={() => setStep(4)}
                onPrevious={() => setStep(2)}
              />
            )}
            {state.currentStep === 4 && (
              <SummaryView
                documentType={state.documentType}
                lineItems={lineItems}
                priceSummary={priceSummary}
                customerInfo={state.customerInfo}
                deliveryInfo={state.deliveryInfo}
                onPrevious={() => setStep(3)}
              />
            )}
          </div>

          {/* Sidebar */}
          {showSidebar && (
            <aside className="hidden lg:block w-72 shrink-0">
              <SummarySidebar selections={state.machineSelections} priceSummary={priceSummary} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
