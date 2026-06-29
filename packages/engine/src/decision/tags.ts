import type { ActionTag } from '@island/shared';

// Map an action candidate's `type` to its strategic tag (P19.2/P19.3). The live
// actions today are EARN/HOLD; the rest are the vocabulary P19.5 (firm formation/
// exit) and Phase 20 (competition) will speak, wired here ahead of time so both the
// archetype tilt and the learned memory shape them the moment they land. An action
// type with no tag is strategically neutral.
const TAG_BY_ACTION: Record<string, ActionTag> = {
  SEEK_EMPLOYMENT: 'EARN',
  SAVE: 'HOLD',
  START_BUSINESS: 'EXPAND',
  EXPAND: 'EXPAND',
  BORROW: 'BORROW',
  EXIT: 'EXIT',
  COMPETE: 'COMPETE',
  CUT_PRICE: 'COMPETE',
  INNOVATE: 'INNOVATE',
  BRAND: 'BRAND',
  CUT_COST: 'CUT_COST',
};

export function tagOf(actionType: string): ActionTag | undefined {
  return TAG_BY_ACTION[actionType];
}
