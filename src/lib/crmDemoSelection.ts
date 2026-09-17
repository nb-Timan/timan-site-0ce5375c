export function splitDemoMachineInterest(values: string[]) {
  const equipment = values.filter(value => value.startsWith('Equipment:'));
  const machines = values.filter(value => !value.startsWith('Equipment:') && value !== 'Equipment');
  return { machines, equipment };
}

export function getDemoSelectionErrors(machineCategory: string[], machineInterest: string[]) {
  const { machines, equipment } = splitDemoMachineInterest(machineInterest);
  const needsMachine = machineCategory.some(category => category === 'Timan machine' || category === "Dealer's machine");
  const needsEquipment = machineCategory.some(category => category === 'Timan equipment' || category === "Dealer's equipment");

  return {
    demoType: machineCategory.length === 0,
    machine: needsMachine && machines.length === 0,
    equipment: needsEquipment && equipment.length === 0,
  };
}
