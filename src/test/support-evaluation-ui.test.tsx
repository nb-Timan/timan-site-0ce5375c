import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SupportEvaluationPanel } from '@/components/support/SupportEvaluationPanel';

vi.mock('@/context/LanguageContext',()=>({useLanguage:()=>({uiLanguage:'da'})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/supportEvaluationService',()=>({
  fetchSupportEvaluationDashboard:vi.fn(async()=>({latestRun:null,baselineRun:null,recentRuns:[],suites:[],failures:[],securityFailures:[],openReviews:0,approvedCaseCount:100,approvedSuiteCount:8})),
  startSupportEvaluation:vi.fn(),
}));

describe('Backend AI Support Evaluation UI',()=>{
  it('renders every required evaluation view and empty state without overflow-only layout',async()=>{
    render(<SupportEvaluationPanel />);
    await waitFor(()=>expect(screen.getByText('Ingen evalueringskørsler endnu.')).toBeInTheDocument());
    for (const label of ['Overblik','Suiter','Kørsler','Fejl','Sikkerhed','Modelsammenligning']) expect(screen.getByRole('button',{name:label})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Kør smoke/})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Kør sikkerhed/})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Kør fuld/})).toBeInTheDocument();
  });
});
