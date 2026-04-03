import { Check } from 'lucide-react';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  onStepClick: (step: number) => void;
}

export function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav className="flex items-center justify-center gap-1 sm:gap-2 px-4 py-3">
      {steps.map((label, idx) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;
        return (
          <div key={idx} className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => idx <= currentStep && onStepClick(idx)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                isDone
                  ? 'text-success cursor-pointer hover:bg-success/10'
                  : isActive
                  ? 'text-primary cursor-default'
                  : 'text-muted-foreground cursor-default'
              }`}
              disabled={idx > currentStep}
            >
              <span
                className={`step-indicator text-xs w-6 h-6 ${
                  isDone ? 'step-done' : isActive ? 'step-active' : 'step-pending'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {idx < steps.length - 1 && (
              <div className={`w-6 sm:w-10 h-0.5 ${idx < currentStep ? 'bg-success' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
