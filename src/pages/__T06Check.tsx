import NewsRenderSurface from '@/features/news-cms/editor/NewsRenderSurface';
import { getNewsTemplate } from '@/features/news-cms/templates/registry';

export default function T06Check() {
  const template = getNewsTemplate('template-06-flyer');
  const content = {
    pageCount: 3,
    flyerPages: [
      { headline: 'Timan 2620 sætter en ny standard for kompakte redskabsbærere', subtitle: 'Kraftfuld hydraulik, kompakt design og enkel betjening til professionelle', body: 'Lorem ipsum '.repeat(30), image: '' },
      { headline: 'Side 2 overskrift', subtitle: 'Undertitel to', body: 'Side 2 brødtekst.', image: '' },
      { headline: 'Side 3 overskrift', subtitle: 'Undertitel tre', body: 'Side 3 brødtekst.', image: '' },
    ],
  };
  return <div className="p-6"><NewsRenderSurface lang="da" template={template} content={content} mode="preview" /></div>;
}
