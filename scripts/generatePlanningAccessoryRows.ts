import { getAccessoriesFlat, LOOSE_TOOL_KEY } from '../src/data/machines';

const machineKeys = ['RC-751', 'RC-1000S', 'Timan 3330', 'Timan 2620', LOOSE_TOOL_KEY];
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

const rows = machineKeys.flatMap((machineKey) => getAccessoriesFlat(machineKey)
  .filter((item) => item.varenr && item.varenr !== 'HEADER')
  .map((item) => `  (${quote(machineKey)}, ${quote(item.id)}, ${quote(item.varenr)}, ${Boolean(item.isQtyInput)})`));

process.stdout.write(`insert into public.planning_accessory_products
  (machine_key, accessory_id, item_number, is_quantity_input) values
${rows.join(',\n')};\n`);
