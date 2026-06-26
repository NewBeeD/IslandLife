import type { Industry } from '@island/shared';

// Display labels for the projection layer. The engine speaks in enums; the player
// reads words. Kept in one place so every DTO labels things the same way.

export const OCCUPATION_LABEL: Record<Industry, string> = {
  FISHING: 'Fishing',
  AGRICULTURE: 'Farming',
  CONSTRUCTION: 'Construction',
  INFORMAL_TRADE: 'Informal trade',
  RETAIL: 'Retail',
  TOURISM: 'Tourism',
  TRANSPORTATION: 'Transport',
  FINANCE: 'Finance',
};

export const INCOME_LINE_LABEL: Record<Industry, string> = {
  FISHING: 'Fishing sales',
  AGRICULTURE: 'Crop sales',
  CONSTRUCTION: 'Construction work',
  INFORMAL_TRADE: 'Trade income',
  RETAIL: 'Shop takings',
  TOURISM: 'Guesthouse income',
  TRANSPORTATION: 'Fares',
  FINANCE: 'Salary',
};

// Short, human bank labels for loan lines. Never exposes anything beyond the name.
export function bankLabel(bankId: string): string {
  switch (bankId) {
    case 'NCB':
      return 'NCB';
    case 'RBTT':
      return 'CCB';
    case 'CREDIT_UNION_DM':
      return 'the credit union';
    default:
      return bankId;
  }
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  LAND: 'Land',
  EQUIPMENT: 'Equipment',
  VEHICLE: 'Vehicle',
};

export function assetLabel(type: string, size?: string): string {
  const base = ASSET_TYPE_LABEL[type] ?? type;
  return size ? `${base} (${size.toLowerCase()})` : base;
}
