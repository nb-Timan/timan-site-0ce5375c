import { Link } from 'react-router-dom';
import { ArrowRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  description: string;
  cta: string;
  to: string;
  icon: LucideIcon;
  accent: 'primary' | 'sky' | 'violet';
}

const ACCENT: Record<Props['accent'], { iconBg: string; iconColor: string; ctaColor: string }> = {
  primary: { iconBg: 'bg-green-50',  iconColor: 'text-[#2d5a27]', ctaColor: 'text-[#2d5a27]' },
  sky:     { iconBg: 'bg-blue-50',   iconColor: 'text-blue-600',  ctaColor: 'text-blue-600' },
  violet:  { iconBg: 'bg-purple-50', iconColor: 'text-purple-600', ctaColor: 'text-purple-600' },
};

export default function AreaCard({ title, description, cta, to, icon: Icon, accent }: Props) {
  const s = ACCENT[accent];
  return (
    <Link
      to={to}
      className={cn(
        'group bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col text-left w-full h-full transition-all duration-300',
        'hover:-translate-y-1.5 hover:shadow-lg hover:border-gray-200',
      )}
    >
      <div className={cn('w-16 h-16 rounded-xl flex items-center justify-center mb-6', s.iconBg)}>
        <Icon className={cn('h-9 w-9', s.iconColor)} strokeWidth={2} />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 text-sm mb-6 flex-grow">{description}</p>
      <div className={cn('flex items-center font-semibold text-sm', s.ctaColor)}>
        {cta}
        <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
