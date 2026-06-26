import { useState } from 'react';
import type { CreationChoicesInput } from '../api/client';

// Character creation — the five narrative forks (P3 in the engine, surfaced here).
// The player sees only story: each fork is a narrative prompt with four lived
// options. The hidden CharacterProfile (OCEAN, capital, knowledge) is built
// server-side from these A/B/C/D choices and never crosses the wire. Text is taken
// from island_life_character_creation.md; no mechanical effects are ever shown.

type ForkKey = keyof CreationChoicesInput; // background | school | formative | tendency | situation
// The background fork offers eight grounded livelihoods (A–H); every other fork
// offers four (A–D). OptionId spans the widest case.
type OptionId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

interface ForkOption {
  id: OptionId;
  label: string;
  body: string;
}
interface Fork {
  key: ForkKey;
  prompt: string;
  options: ForkOption[];
}

const FORKS: Fork[] = [
  {
    key: 'background',
    prompt:
      'You are twenty years old and your life is ahead of you. Before we begin, tell us where you come from. Your family is Dominican — which of these best describes how you grew up?',
    options: [
      {
        id: 'A',
        label: 'A fishing family in Portsmouth',
        body: 'Your father has fished the Atlantic since before you were born. Your mother sells at the market on Bay Street most mornings. Money was never plentiful but there was always fish on the table and people in the yard. Portsmouth knows your family and your family knows Portsmouth.',
      },
      {
        id: 'B',
        label: 'A farming family in the interior',
        body: 'Your family works land that has been in the family for two generations. Dasheen, bananas, a few provisions. The land gives and the land takes. Village life is slow and close. Everyone knows when the harvest is bad. You have never been far from soil.',
      },
      {
        id: 'C',
        label: 'A civil servant household in Roseau',
        body: 'One of your parents works for the government. Not wealthy — nobody in the civil service gets wealthy — but steady. The bills were paid. There were books in the house. Your parents spoke about pensions and security the way other families spoke about the harvest.',
      },
      {
        id: 'D',
        label: 'A trading family at the Roseau market',
        body: 'Your parents bought and sold things. Sometimes produce from the villages, sometimes goods from Martinique or St. Lucia. You grew up understanding that price is not fixed, that timing matters, and that the person who knows what something is worth before the seller does has an advantage.',
      },
      {
        id: 'E',
        label: 'A minibus driver’s family in Roseau',
        body: 'Your father ran the bus on the west coast route, Roseau to Portsmouth and back, before light most mornings. You know the value of a full load and an empty seat, which conductor can be trusted with the day’s takings, and how a vehicle eats money the moment it leaves the yard. The road was the family business.',
      },
      {
        id: 'F',
        label: 'A mason’s family',
        body: 'Your people build. Block, steel, concrete — your father and his brothers put up half the houses on the hill, and you carried mortar before you were tall enough to reach the scaffold. The work is hard and it comes and goes with the money in the country, but a good mason never starves for long. Your hands learned a trade early.',
      },
      {
        id: 'G',
        label: 'A guesthouse family',
        body: 'Your mother kept a few rooms for visitors — birdwatchers, divers, the occasional cruise passenger who wanted the real island. You grew up making beds, cooking breakfast for strangers, and reading people quickly. You learned that a season can be fat or lean depending on things happening in countries you have never seen.',
      },
      {
        id: 'H',
        label: 'A shopkeeper’s family, village shop',
        body: 'Your family ran the shop everyone in the village passed through — rice, salt fish, phone cards, cold drinks, and credit written in an exercise book. You learned arithmetic at the counter, who pays and who promises, and how a small margin on a lot of small things adds up. The shop never closed, and neither, it felt, did you.',
      },
    ],
  },
  {
    key: 'school',
    prompt: 'Secondary school is behind you now. How did it go?',
    options: [
      {
        id: 'A',
        label: 'You excelled academically',
        body: 'Five CXCs. Mathematics, English, two sciences and one elective. Your teachers said you had potential. A few of them still ask about you when they see your mother. You had choices that some of your classmates didn’t.',
      },
      {
        id: 'B',
        label: 'Average but hardworking',
        body: 'Three CXCs. English and Mathematics among them. You passed what mattered and you worked for it. Nobody handed you anything. No paths closed, none fully opened. You are exactly where most people are: somewhere in the middle, with everything still to play for.',
      },
      {
        id: 'C',
        label: 'You left before completing CXC',
        body: 'Your family needed income. You made a decision that wasn’t really yours to make. You have thought about it since — not with regret exactly, more with a clear eye for what it cost and what it gave you. You have been working for two years already. That is not nothing.',
      },
      {
        id: 'D',
        label: 'Bright but disengaged',
        body: 'You could have done better. Everyone knew it, including you. Two CXCs. The subjects bored you or the circumstances didn’t allow full focus — it doesn’t matter which now. What you have always had is a mind that notices things other people miss. That has its own value.',
      },
    ],
  },
  {
    key: 'formative',
    prompt:
      'Something happened before you turned 18 that you did not choose and could not prevent. It shaped you. Which of these is closest to your experience?',
    options: [
      {
        id: 'A',
        label: 'A hurricane hit your family hard',
        body: 'You were fourteen. You remember the sound more than anything. Afterwards, your family had almost nothing and rebuilt slowly. You watched your parents make decisions under conditions that would have broken many people. You learned something about what matters and what doesn’t.',
      },
      {
        id: 'B',
        label: 'A family member migrated and sent money back',
        body: 'Your aunt or uncle or older cousin left for England or Canada or the USVI when you were young. The money they sent back changed things at home — not dramatically, but enough. You grew up understanding that the world is larger than this island.',
      },
      {
        id: 'C',
        label: 'You worked for someone who cheated you',
        body: 'You were sixteen. A job — informal, cash in hand. The person who hired you underpaid you, moved the goalposts, or took something that was yours. It was not the last time you would see this happen. But it was the first time it happened to you, and you have not forgotten the lesson.',
      },
      {
        id: 'D',
        label: 'A mentor took an interest in you',
        body: 'Someone saw something in you before you saw it yourself. A teacher, a community elder, a business owner, a pastor. They gave you time and attention and a way of thinking about the future that your immediate circumstances didn’t naturally produce. You still think about things they said.',
      },
    ],
  },
  {
    key: 'tendency',
    prompt:
      'This is not who you are entirely — people are more than one thing. But when you face uncertainty, a decision with no clear answer, a risk you can’t fully calculate, what is your tendency?',
    options: [
      {
        id: 'A',
        label: 'You think before you act',
        body: 'You gather what information you can. You weigh options, consider consequences, move carefully. You have missed opportunities because you were still deciding. You have also avoided disasters that more impulsive people walked into. You are comfortable being the last person in the room to speak.',
      },
      {
        id: 'B',
        label: 'You trust your instincts',
        body: 'You decide quickly and commit fully. You have been wrong. You have also been right when more cautious people were still asking questions. Hesitation has never felt like safety to you — it has always felt like a different kind of risk.',
      },
      {
        id: 'C',
        label: 'You watch people',
        body: 'You read rooms. You understand networks. You know who trusts whom, who owes whom, who is afraid of what. Pure financial logic has never been your primary mode. You think in relationships and you navigate by them.',
      },
      {
        id: 'D',
        label: 'You think in systems',
        body: 'You notice patterns. Prices. Cause and effect chains. When something happens you find yourself asking why before you ask what to do about it. People sometimes think you are slow to react. You are not slow — you are making sure you understand what you are actually reacting to.',
      },
    ],
  },
  {
    key: 'situation',
    prompt:
      'You are twenty years old. Character creation ends here — the rest is your life. What is your immediate reality?',
    options: [
      {
        id: 'A',
        label: 'You have a job lined up',
        body: 'A relative made a call. Or a teacher put in a word. Or you applied and you got it. It is not exciting — civil service, a hotel kitchen, a fishing cooperative’s weighing station — but it is income from the first of the month. Stability is not nothing, especially at twenty.',
      },
      {
        id: 'B',
        label: 'You are self-employed from day one',
        body: 'You are already doing something. Selling, fishing on a cousin’s boat, farming the family land, running a small hustle at the market. There is no salary and no safety net. What you earn this month depends entirely on decisions you make this month.',
      },
      {
        id: 'C',
        label: 'You just returned from Barbados',
        body: 'Six months. You went to work, kept your head down, saved hard. You came back with money and with something harder to name — a sense of what is possible when the market is slightly larger, the pace slightly faster. The money is real. The question is what to do with it.',
      },
      {
        id: 'D',
        label: 'You are about to take a risk',
        body: 'You have seen something. A gap in the market, a piece of equipment someone is selling cheap, a contract nobody else has gone after. You have less cash than you might have — you spent some getting ready — but there is an opportunity in front of you right now that will not be there in three months.',
      },
    ],
  },
];

export function CharacterCreation({
  busy,
  error,
  onComplete,
}: {
  busy: boolean;
  error: string | null;
  onComplete: (choices: CreationChoicesInput, name: string) => void | Promise<void>;
}) {
  // step 0 = intro/name, 1..5 = the five forks.
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [choices, setChoices] = useState<Partial<CreationChoicesInput>>({});

  if (step === 0) {
    return (
      <main className="start">
        <h1>Island Life</h1>
        <p className="muted">A life and economy in Dominica, one month at a time.</p>
        <p className="creation__intro">
          You are about to live a life that has not been lived yet. Five questions shape who you
          are at twenty — where you come from, how school went, what marked you, how you decide,
          and where you stand today. There are no right answers. There is only a beginning.
        </p>
        <label className="creation__name">
          What is your name?
          <input
            type="text"
            value={name}
            placeholder="Leave blank and the island will name you"
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <button className="primary" onClick={() => setStep(1)} disabled={busy}>
          Begin
        </button>
      </main>
    );
  }

  const fork = FORKS[step - 1]!;

  const choose = (optionId: OptionId) => {
    const next = { ...choices, [fork.key]: optionId };
    setChoices(next);
    if (step < FORKS.length) {
      setStep(step + 1);
    } else {
      // All five forks answered — hand the complete set up to App to create the save.
      void onComplete(next as CreationChoicesInput, name.trim());
    }
  };

  const isLast = step === FORKS.length;

  return (
    <main className="creation">
      <div className="creation__progress muted">
        {step} of {FORKS.length}
      </div>
      <p className="creation__prompt">{fork.prompt}</p>
      <div className="creation__options">
        {fork.options.map((o) => (
          <button
            key={o.id}
            className="creation__option"
            onClick={() => choose(o.id)}
            disabled={busy}
          >
            <strong>{o.label}</strong>
            <span className="muted">{o.body}</span>
          </button>
        ))}
      </div>

      {step > 1 && (
        <button className="creation__back" onClick={() => setStep(step - 1)} disabled={busy}>
          Back
        </button>
      )}

      {isLast && busy && <p className="muted">A life begins…</p>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
