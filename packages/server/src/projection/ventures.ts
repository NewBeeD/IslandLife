import type { Venture, VentureActionResultDTO, WorldState } from '@island/shared';

// POST /saves/:id/ventures/:ventureId/{discontinue,shelve,reopen} — the outcome of
// acting on one of the player's own ventures (Phase 17, P17.4). The player's own
// money fact (cash) plus the venture's new state and a short in-voice line. No hidden
// venture mechanics (success/volatility/timeLoad) cross the wire.
export function toVentureActionResultDTO(
  world: WorldState,
  venture: Venture,
  acknowledgement: string,
): VentureActionResultDTO {
  return {
    ventureId: venture.id,
    status: venture.status,
    cashInHand: Math.round(world.player.cash),
    acknowledgement,
  };
}
