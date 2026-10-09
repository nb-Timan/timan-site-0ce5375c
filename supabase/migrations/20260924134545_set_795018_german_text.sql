-- Complete the current/future Product Master localization. Frozen quote/order
-- snapshots and generated documents are intentionally untouched.
update public.price_list_items
set item_text_de = 'Erweiterte Komponentengarantie Timan 3330 (12 Monate)',
    updated_at = now(),
    last_published_at = now()
where item_number = '795018';

update public.price_list_published
set item_text_de = 'Erweiterte Komponentengarantie Timan 3330 (12 Monate)',
    published_at = now()
where item_number = '795018';
