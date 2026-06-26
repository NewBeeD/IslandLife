import type { ParishId } from '@island/shared';

// The narrative variety system (Narrative Generation doc). These shape the prose
// without ever being shown to the player — they ride in the user prompt's VOICE
// CALIBRATION block. The same situation should not always read the same way.

// 1. Voice aging — the voice shifts as the player ages.
export function getVoiceAgeModifier(age: number): string {
  if (age < 25)
    return `The character is young — write with the energy and immediacy
of someone for whom everything is still being established.
Decisions feel consequential because so little is settled yet.`;

  if (age < 40)
    return `The character is in the prime working years — write with
the weight of someone who has made enough decisions to know
that some work out and some don't. Less surprised by difficulty.
More precise about what they want.`;

  if (age < 55)
    return `The character is established — write with the perspective
of someone who has built something (whatever it is)
and is maintaining and extending it. Children are growing.
Parents are aging. The future is starting to be the past.`;

  return `The character is older — write with the quality of attention
that comes from knowing time is finite. Not resigned.
Clear. What matters is clearer than it was at thirty.`;
}

// 2. Seasonal voice — keyed by month-of-year index (0–11). The Caribbean seasons
// are felt in the prose: dry season, hurricane season, the Christmas season.
export const SEASONAL_VOICE_NOTES: Record<number, string> = {
  0: 'January — dry season, cooler nights, trade winds',
  1: 'February — driest month, boats go out in good conditions',
  2: 'March — end of dry season, some uncertainty about the year ahead',
  3: 'April — mangos starting, heat building',
  4: 'May — pre-season, sea beginning to change',
  5: 'June — hurricane season begins, weather watching starts',
  6: 'July — peak heat, sea warm, storm risk real',
  7: 'August — mid-hurricane season, heightened alertness',
  8: 'September — most active month of hurricane season',
  9: 'October — hurricane season winding down, wet',
  10: 'November — cooling, rainy, end of hurricane season relief',
  11: 'December — Christmas season, money moving, tourism picking up',
};

// 3. Parish voice — entries are grounded in the specific geography of the player's
// parish. A Portsmouth entry mentions different landmarks and rhythms than a
// Roseau one. Keyed by ParishId so every parish a player can start in is covered.
export const PARISH_VOICE_CONTEXT: Record<ParishId, string> = {
  SAINT_GEORGE: `This is Roseau — the capital, the government buildings, the
cruise ship berth, the Old Market. People here are more formally employed,
more connected to institutions. The pace is different from the villages.`,

  SAINT_JOHN: `This is Portsmouth — the second town, the Indian River, Douglas
Bay, the fishing community along the waterfront. Less formal than Roseau.
More connected to the sea. The cooperative is a real presence here.`,

  SAINT_ANDREW: `This is the agricultural interior and Atlantic-facing
north-east — Marigot, the farming families, the Kalinago Territory nearby.
More remote from the capital's economy. The road to Roseau takes time.
Self-sufficiency matters more here.`,

  SAINT_DAVID: `This is the east coast — Castle Bruce, rough Atlantic water,
agriculture and fishing both. Remote. The land is steep and the sea is not
the calm Caribbean side. People here make do with what reaches them.`,

  SAINT_PATRICK: `This is the south — Berekua, Grand Bay. Agriculture and
fishing, proud and independent in character. A place with its own history
and its own way of carrying itself, not waiting on Roseau.`,

  SAINT_LUKE: `This is Laplaine — small, southern, agricultural. A handful of
villages on the slopes. Everyone knows everyone. Little here that the capital
notices, which is both the cost and the comfort of the place.`,

  SAINT_MARK: `This is Soufrière in the south-west — fishing, some tourism, the
sulphur springs. The calmer Caribbean coast. Visitors pass through for the
water and the heat of the ground, and a little of that money stays.`,

  SAINT_PAUL: `This is just north of Roseau — Pointe Michel, Mahaut, Canefield,
the airstrip and its market. Retail and services, close enough to the capital
to feel its pull. A working, in-between kind of place.`,

  SAINT_JOSEPH: `This is the west coast — Saint Joseph village, agriculture and
construction. The Caribbean side, the road running along it toward Roseau.
A place of provisions grounds and men who build.`,

  SAINT_PETER: `This is the north-west — Colihaut and its small farming and
fishing villages. Among the smallest parishes. The sea on one side, the steep
green on the other, and not much between but the people who stay.`,
};
