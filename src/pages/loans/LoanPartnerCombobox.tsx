import { useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { LoanPartner } from '@/lib/loanService';

/** Presentation only: the parent supplies the existing seller-scoped RPC result. */
export default function LoanPartnerCombobox({ partners, value, onChange, label, placeholder, disabled = false, invalid = false }: {
  partners: LoanPartner[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const selected = partners.find((partner) => partner.id === value);
  const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase('da').trim();

  return <Popover open={open && !disabled} onOpenChange={(next) => { setSearch(''); setOpen(next && !disabled); }}>
    <PopoverTrigger asChild>
      <button type="button" role="combobox" aria-label={label} aria-expanded={open && !disabled} aria-invalid={invalid || undefined} disabled={disabled}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50 ${invalid ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}>
        <span className="min-w-0 truncate">{selected ? `${selected.account_number} · ${selected.company_name}` : placeholder}</span>
        <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" collisionPadding={12}
      className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] flex-col overflow-hidden p-0"
      onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus({ preventScroll: true }); }}>
      <Command loop className="h-auto min-h-0" filter={(id, query) => {
        const partner = partners.find((entry) => entry.id === id);
        return partner && normalize(`${partner.company_name} ${partner.account_number}`).includes(normalize(query)) ? 1 : 0;
      }}>
        <CommandInput ref={input} value={search} onValueChange={setSearch} placeholder="Søg forhandler eller kontonummer..." aria-label="Søg forhandler eller kontonummer" />
        <CommandList className="min-h-0 max-h-[min(18rem,calc(var(--radix-popover-content-available-height)_-_3rem))] overscroll-contain">
          <CommandEmpty>Ingen samarbejdspartnere fundet</CommandEmpty>
          <CommandGroup>{partners.map((partner) => <CommandItem key={partner.id} value={partner.id} onSelect={() => {
            if (disabled) return;
            onChange(partner.id); setOpen(false); setSearch('');
          }} className="min-h-10 items-start gap-2">
            <Check aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${value === partner.id ? 'opacity-100' : 'opacity-0'}`} />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{partner.account_number} · {partner.company_name}</span>
          </CommandItem>)}</CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
