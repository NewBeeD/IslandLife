import { PARISHES, gameDateLabel } from '@island/shared';
import type { StateDTO, WorldState } from '@island/shared';
import { OCCUPATION_LABEL } from './labels';

// GET /saves/:id/state — the header bar. Month, date, name, age, parish, cash in
// hand. No scores, no hidden tendencies. Cash is rounded to whole EC$ (the player
// counts in dollars, not cents).
export function toStateDTO(saveId: string, world: WorldState): StateDTO {
  const p = world.player;
  return {
    saveId,
    month: world.month,
    monthLabel: gameDateLabel(world.month),
    name: p.name,
    age: p.age,
    parish: PARISHES.find((x) => x.id === p.parish)?.name ?? p.parish,
    occupation: p.occupation ? OCCUPATION_LABEL[p.occupation] : null,
    cashInHand: Math.round(p.cash),
  };
}
