// Quality gate for any generated narrative text (template or, later, LLM). Ported
// from the Narrative Generation doc (v1.2). Every entry that reaches the player
// passes this first: it guards the voice rules — no exposed mechanics, no bare
// dollars, no telling the player how to feel, no voice drift out of second person.

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  text: string;
}

const LONG_FORM_TRIGGERS = ['ANNUAL_REFLECTION', 'DECADE_MILESTONE', 'DEATH_AND_LEGACY'];

const FORBIDDEN_PATTERNS: RegExp[] = [
  // Game mechanics exposed
  /\b(stat|score|points?|level|percentage|probability|chance of)\b/i,
  // Explaining the simulation
  /\b(the simulation|the game|the system)\b/i,
  // Telling the player how to feel — emotional labels only. Sensory "you feel the
  // heat / the rope / the wind" is allowed.
  /\byou feel (anxious|worried|happy|sad|excited|nervous|afraid|scared|proud|angry|relieved|guilty|hopeful)\b/i,
  /\byou are (happy|sad|worried|anxious|excited|nervous|afraid|proud|angry|relieved)\b/i,
  // Labeling decisions
  /\b(good choice|bad choice|right decision|wrong decision|risky option)\b/i,
  // Breaking the Caribbean setting — bare dollar amounts; "EC$" is allowed
  /\bUSD\b/,
  /\bdollars?\b/i,
  /(?<!EC)\$\d/,
  // Anachronisms
  /\b(algorithm|blockchain|cryptocurrency|social media)\b/i,
];

export function validateNarrativeEntry(text: string, triggerId?: string): ValidationResult {
  const issues: string[] = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) issues.push(`Forbidden pattern: ${pattern.source}`);
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 400 && !LONG_FORM_TRIGGERS.includes(triggerId ?? '')) {
    issues.push('Entry too long — maximum 400 words except for annual/legacy entries');
  }
  if (wordCount < 20) {
    issues.push('Entry too short — minimum 20 words');
  }

  // Voice drift: the PLAYER is always second person ("you"). NPCs are described in
  // third person, so he/she/they are allowed. Flag first-person narration and any
  // third-person reference to the player.
  if (/\bthe player\b/i.test(text) || /\b(I|we|me|my)\b/.test(text)) {
    issues.push('Voice drift — narration must be second person');
  }

  return { valid: issues.length === 0, issues, text };
}
