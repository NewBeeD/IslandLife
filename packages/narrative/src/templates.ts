import type { Template } from './context';
import { formatCurrency, renderMagnitude } from './magnitude';

// Layer-1 template library. Structured prose with qualitative slots, filled from
// the MonthContext. Each template declares the conditions it fires under (`match`)
// and renders in the narrative voice — second person, present tense, grounded,
// no exposed mechanics. Grouped by the role the entry plays in a month's feed.

// ── Income: exactly one fires each month, keyed on occupation + how the local
// market is treating the player's trade. ───────────────────────────────────────
export const INCOME_TEMPLATES: Template[] = [
  {
    id: 'FISH_GOOD_MONTH',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === 'FISHING' && c.priceVsBase >= 1.1,
    render: (c) =>
      `The catch has been worth the early mornings this month. Prices at the ${c.parishName} ` +
      `wharf are ${c.priceDir} and the boats that went out came back with something to sell. ` +
      `You have been on the water every day the sea allowed it.`,
  },
  {
    id: 'FISH_AVERAGE_MONTH',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === 'FISHING' && c.priceVsBase >= 0.9 && c.priceVsBase < 1.1,
    render: (c) =>
      `A steady month on the water. Nothing exceptional — prices at the wharf are ${c.priceDir} ` +
      `and the catch covered your costs with a little put by. Some months are like that, ` +
      `and some months are not.`,
  },
  {
    id: 'FISH_POOR_MONTH',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === 'FISHING' && c.priceVsBase < 0.9,
    render: (c) =>
      `It has been a hard month on the water. The catch was thin and the prices at the wharf ` +
      `have not helped — they are ${c.priceDir}. You are covering your costs, just, and watching ` +
      `the fuel gauge more closely than the horizon.`,
  },
  {
    id: 'AGRI_HARVEST_GOOD',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === 'AGRICULTURE' && c.priceVsBase >= 1.1,
    render: (c) =>
      `The dasheen came in well this month. The land gave back what you put into it, and the ` +
      `buyers at the wholesale market were there when you needed them. Prices are ${c.priceDir} ` +
      `and you sold most of what you carried down the road.`,
  },
  {
    id: 'AGRI_AVERAGE',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === 'AGRICULTURE' && c.priceVsBase >= 0.9 && c.priceVsBase < 1.1,
    render: (c) =>
      `The field is steady this month. The dasheen is coming along and the prices at the ` +
      `wholesale market are ${c.priceDir}. You sold what was ready and left the rest in the ground ` +
      `a while longer. The work does not change much from one week to the next.`,
  },
  {
    id: 'AGRI_POOR',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === 'AGRICULTURE' && c.priceVsBase < 0.9,
    render: (c) =>
      `The land has been stubborn this month. What you carried to the wholesale market did not ` +
      `fetch much — prices are ${c.priceDir} — and the cost of getting it down the road ate into ` +
      `the rest. You are holding on for the next harvest.`,
  },
  {
    id: 'WORK_SELF_EMPLOYED',
    type: 'PERSONAL',
    weight: 1,
    match: (c) =>
      c.occupation !== null &&
      c.occupation !== 'FISHING' &&
      c.occupation !== 'AGRICULTURE' &&
      c.player.employmentStatus !== 'EMPLOYED',
    render: (c) =>
      `You kept ${c.occupationPlace} going another month. Some days brought more than others. ` +
      `You covered what you owed, set a little aside, and kept the small problems from becoming ` +
      `large ones. It is slow work, but it is yours.`,
  },
  {
    id: 'WORK_EMPLOYED',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation !== null && c.player.employmentStatus === 'EMPLOYED',
    render: (c) =>
      `Another month at ${c.occupationPlace}. The pay came in on time and you put what you could ` +
      `to one side. The work is the work — some days long, some days short — and the month went ` +
      `by the way most of them do.`,
  },
  {
    id: 'UNEMPLOYED',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.occupation === null,
    render: () =>
      `You spent the month looking for steady work. A few days here and there, nothing that ` +
      `holds. You are keeping your costs low and your ears open, and asking the people who might ` +
      `know to put your name forward when something opens up.`,
  },
];

// ── Events: one per active event touching the player's industry. ────────────────
export const EVENT_TEMPLATES: Template[] = [
  {
    id: 'HURRICANE_MAJOR',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.industryEvents.some((e) => e.definitionId === 'HURRICANE_MAJOR'),
    render: (c) =>
      `The wind has been building for two days and the sky over ${c.parishName} has that low, ` +
      `bruised colour. You have brought in what you could and tied down the rest. The radio keeps ` +
      `repeating the same warning. Whatever was going to happen this week is not happening this week.`,
  },
  {
    id: 'HURRICANE_MINOR',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) =>
      c.industryEvents.some((e) => e.definitionId === 'HURRICANE_MINOR') &&
      !c.industryEvents.some((e) => e.definitionId === 'HURRICANE_MAJOR'),
    render: (c) =>
      `A storm passed close enough to rough up the sea and strip some leaves, not close enough to ` +
      `do real harm. ${c.parishName} got a hard day of rain and wind and then it moved on. You ` +
      `spent the morning checking what the water touched and found less damage than you feared.`,
  },
  {
    id: 'DROUGHT',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.industryEvents.some((e) => e.definitionId === 'DROUGHT'),
    render: () =>
      `The dry has gone on longer than it should. You can see it at the edges of the field, where ` +
      `the soil cracks when it ought to be holding water. The dasheen is not failing yet, but it ` +
      `will if the rain stays away another three weeks. You are watching the sky the way your ` +
      `father taught you, and it does not look promising.`,
  },
  {
    id: 'FUEL_PRICE_SHOCK',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.industryEvents.some((e) => e.definitionId === 'FUEL_PRICE_SHOCK'),
    render: (c) =>
      c.occupation === 'FISHING'
        ? `Fuel has gone up again at the dock. The margin on a regular day is thinner than it was, ` +
          `and the runs that go furthest out are the ones that hurt — a long day can burn through a ` +
          `decent catch before you even reach the market.`
        : `Fuel has gone up again. Every run costs more than it did last month, and there is no ` +
          `passing all of it along — people only have so much to give. You are doing the same work ` +
          `for a little less and hoping the price settles before long.`,
  },
  {
    id: 'FISHING_STOCK_DECLINE',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.industryEvents.some((e) => e.definitionId === 'FISHING_STOCK_DECLINE'),
    render: () =>
      `The fish are not where they were. You are running further out for the catch you used to ` +
      `bring in close, and the older men at the wharf say they have seen it before — a lean ` +
      `stretch that ends when it ends. You are spending more time and more fuel for less.`,
  },
  {
    id: 'TOURISM_BOOM',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.industryEvents.some((e) => e.definitionId === 'TOURISM_BOOM'),
    render: (c) =>
      `The guesthouses are full and the road into ${c.parishName} is busier than usual. Visitors ` +
      `are asking after tours and fresh fish and rooms, and everyone with something to sell is ` +
      `making the most of it while the season holds.`,
  },
];

// ── Finance: loan reality and savings, never the interest rate. ─────────────────
export const FINANCE_TEMPLATES: Template[] = [
  {
    id: 'LOAN_PAYMENT_TIGHT',
    type: 'DECISION_REQUIRED',
    weight: 1,
    match: (c) => c.hasActiveLoan && c.cashAfterPayment < 500,
    render: (c) =>
      `The loan payment is due this month. After it clears you will have ` +
      `${formatCurrency(Math.max(c.cashAfterPayment, 0))} in hand. That is tight — not impossible, ` +
      `you have had tighter — but tight enough that one bad week changes the arithmetic.`,
  },
  {
    id: 'LOAN_PAYMENT_ROUTINE',
    type: 'MEMORY',
    weight: 1,
    match: (c) => c.hasActiveLoan && c.cashAfterPayment >= 500 && c.rand() < 0.55,
    render: (c) =>
      `The loan payment comes out this month, the same as it does every month. ` +
      `${formatCurrency(c.loanPayment)} gone before you see it. The balance is ` +
      `${renderMagnitude(c.loanRemaining / Math.max(c.player.monthlyIncome, 1), 'LOAN_RELATIVE_SIZE')} ` +
      `but it is coming down, slow and steady, the way these things do.`,
  },
  {
    id: 'SAVINGS_MILESTONE',
    type: 'PERSONAL',
    weight: 1,
    match: (c) => c.player.cash >= 5000 && c.rand() < 0.25,
    render: (c) =>
      `You check what you have put aside. ${formatCurrency(c.player.cash)}. You have been moving ` +
      `toward this without quite counting, a little each month, and now it is here. It is not a ` +
      `large sum in some lights. In others it is exactly enough to change how you sleep.`,
  },
];

// ── Market: a price observation when the local market moved enough to notice. ────
export const MARKET_TEMPLATES: Template[] = [
  {
    id: 'PRICE_OBSERVATION',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => !!c.market && c.priceChange >= 0.12 && c.industryEvents.length === 0,
    render: (c) =>
      `Prices at the market have ${renderMagnitude(c.priceChange, 'PRICE_CHANGE')} this stretch. ` +
      `The buyers are reading it the way they always do, slow to give and quick to take, and the ` +
      `talk at the stalls is all about which way it goes from here. You have your own guess.`,
  },
];

// ── The economic web (Phase 20.5): the CAUSES surfaced in voice ──────────────
// When one event ripples across the island (a credit crunch) or success draws a crowd
// into the player's trade (a competitive squeeze), the player reads the *cause* here —
// in the same grounded, second-person voice, never as a number (the iceberg, S3).
export const WEB_TEMPLATES: Template[] = [
  {
    id: 'CREDIT_CRUNCH',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.creditTight,
    render: (c) =>
      `Money got tight all over the island this season. The banks have pulled their horns in — ` +
      `a man who put his hand out for credit last year finds the door heavier now, and the ones ` +
      `already carrying a payment feel it bite harder. Around ${c.parishName} the talk is careful, ` +
      `people holding what they have and slow to reach for what they do not. It will ease, these ` +
      `things always do, but you feel the cold of it while it lasts.`,
  },
  {
    id: 'COMPETITIVE_SQUEEZE',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.tradeCrowded,
    render: (c) =>
      `The trade you are in has drawn a crowd. There are more hands at it around ${c.parishName} ` +
      `than there were a season ago — new faces chasing the same shillings from the same few ` +
      `pockets, and the wharf feels tighter for it. It is the way of a good thing: let it be seen ` +
      `to pay and others come running to do the same. You hold your corner and watch them come.`,
  },
  {
    id: 'SUPPLY_SQUEEZE',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.inputsScarce,
    render: (c) =>
      `The cost of everything a trade needs has crept up this season. Fuel, materials, a skilled ` +
      `pair of hands — all dearer than they were, the boats and trucks that bring goods into ` +
      `${c.parishName} running short or running late. What you sell has not moved much, but what ` +
      `it costs you to work has, and the difference comes straight off the top. The ones who kept ` +
      `a little put by, or who never leaned hard on things brought from far, feel it least.`,
  },
  {
    // Phase 24.5 — a black swan: a rare, island-reshaping shock. Weighted a little heavier
    // than an ordinary observation because when one lands it is the story of the month.
    id: 'BLACK_SWAN',
    type: 'OBSERVATION',
    weight: 2,
    match: (c) => c.blackSwan !== null,
    render: (c) => {
      switch (c.blackSwan) {
        case 'PANDEMIC':
          return (
            `A sickness has come to the island, and everything has gone quiet with it. The ` +
            `guesthouses around ${c.parishName} are empty, the buses run half-full, and people keep ` +
            `to their yards. Whatever trade leaned on visitors or on a crowd has fallen away at a ` +
            `stroke, and no one can say how long it holds. The ones who find another way to earn ` +
            `while it lasts are the ones who come through it.`
          );
        case 'TECH_DISRUPTION':
          return (
            `Word has come of a new way of doing things — cheaper, faster, brought in from away — ` +
            `and it has turned the ground under more than one trade. What was a good living last ` +
            `year earns less this year for the same sweat, and around ${c.parishName} people are ` +
            `weighing whether to change with it or hold to what they know. The trades that adapt ` +
            `will be the ones still standing when the dust settles.`
          );
        case 'MAJOR_SPILL':
          return (
            `Something has fouled the water and the word has spread fast. The catch is off, the ` +
            `beaches near ${c.parishName} sit empty, and the ground itself is under a shadow of ` +
            `doubt. It is the kind of blow that does not care how careful you were — it lands on ` +
            `everyone who works the coast, and the recovery will be slow and uneven.`
          );
        default:
          return (
            `Something has come out of nowhere and knocked the season sideways. Around ` +
            `${c.parishName} the old certainties do not quite hold, and everyone is working out ` +
            `what the new shape of things asks of them.`
          );
      }
    },
  },
];

// ── Flavor: season and community texture, so a quiet month still reads as a life
// rather than a ledger. One seasonal and one community note round out each feed. ─
export const SEASON_TEMPLATES: Template[] = [
  {
    id: 'SEASON_DRY',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.monthIndex <= 3,
    render: (c) =>
      `The dry season has the island in its quiet rhythm. The nights are cooler, the trade winds ` +
      `steady, and the sea off ${c.parishName} lies flatter than it has in months. People move a ` +
      `little easier when the weather is not a thing to be watched.`,
  },
  {
    id: 'SEASON_PRE',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.monthIndex === 4,
    render: (c) =>
      `The heat is building and the sea is changing its mind from one day to the next. ` +
      `${c.parishName} feels like it is holding its breath before the season turns. You are getting ` +
      `the things done now that are harder to do later.`,
  },
  {
    id: 'SEASON_HURRICANE',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.monthIndex >= 5 && c.monthIndex <= 10,
    render: (c) =>
      `It is the season for watching the sky. ${c.parishName} keeps half an eye on the weather and ` +
      `half on the work, and the barometer at the cooperative gets more visitors than it used to. ` +
      `Nothing has come yet. Something usually does.`,
  },
  {
    id: 'SEASON_CHRISTMAS',
    type: 'OBSERVATION',
    weight: 1,
    match: (c) => c.monthIndex === 11,
    render: (c) =>
      `Christmas is close and the island feels it. Money moves more freely, the people who left ` +
      `come home for a few weeks, and ${c.parishName} is louder and fuller than it has been all ` +
      `year. There is work for anyone who wants it, if only for the season.`,
  },
];

export const COMMUNITY_TEMPLATES: Template[] = [
  {
    id: 'COMMUNITY_TALK',
    type: 'COMMUNITY',
    weight: 1,
    match: () => true,
    render: (c) =>
      `At the shop on Saturday the talk was the same as it always is — the price of things, who is ` +
      `building, who is leaving, who came back. You listened more than you spoke. ${c.parishName} ` +
      `keeps its accounts in conversation as much as in cash.`,
  },
];
