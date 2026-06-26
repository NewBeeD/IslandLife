import type { CommunityDTO, RelationshipDTO, WorldState } from '@island/shared';

// GET /saves/:id/community — reputation and named relationships, as prose. The
// underlying social-capital scores never cross the wire; they become a sentence.
// Named relationships are resolved from the player's social network (empty for the
// vertical slice; populated as the decision/relationship systems land in Phase 6).
export function toCommunityDTO(world: WorldState): CommunityDTO {
  const p = world.player;

  const reputation =
    p.socialCapitalLocal > 0.65
      ? 'You are well known along the waterfront and the market. People trust your word, and that counts for more here than most things you can put a number to.'
      : p.socialCapitalLocal > 0.4
        ? 'You are known well enough in the village. Some doors open on a name and a handshake; others you are still earning your way through.'
        : 'You are still building your place here. Faces are becoming names, names are becoming trust, but slowly — the way it always goes when you are not from a family everyone already knows.';

  // socialNetwork holds agent ids; name resolution arrives with the relationship
  // system. For now the slice surfaces reputation prose and no named ties.
  const relationships: RelationshipDTO[] = [];

  return { reputation, relationships };
}
