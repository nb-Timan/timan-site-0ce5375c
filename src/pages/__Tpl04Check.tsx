import { NEWS_TEMPLATES } from '@/features/news-cms/templates/registry';

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore. ';

export default function Tpl04Check() {
  const def = NEWS_TEMPLATES.find((template) => template.id === 'template-04-technical-feature')!;
  const Renderer = def.Renderer;
  const cases: Array<[string, number]> = [['empty', 0], ['short', 120], ['medium', 350], ['max', 660]];
  return (
    <div className="space-y-8 bg-slate-100 p-6">
      {cases.map(([label, len]) => (
        <div key={label} data-case={label} className="w-[900px]">
          <p className="mb-2 font-bold">{label}</p>
          <Renderer
            mode="preview"
            lang="da"
            content={{
              headline: 'Teknisk feature med en meget lang overskrift der fylder to linjer her',
              subtitle: 'Underoverskrift der ogsaa er lang nok til at fylde praecis to hele linjer i alt',
              body: LOREM.repeat(10).slice(0, len),
              secondaryHeading: 'Om produktet i lang form',
              secondaryText: 'Kort supplerende tekst til billedet som er ret lang og fylder pladsen helt ud her nu.',
              techBlocks: [1, 2, 3, 4].map(() => ({ heading: 'Meget lang overskrift', description: 'Lang beskrivelse der fylder to linjer i boksen her' })),
            }}
          />
        </div>
      ))}
    </div>
  );
}
