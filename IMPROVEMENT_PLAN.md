# V2 Improvement Plan

## Chosen Direction

We chose Option Two: a clean V2 app based on the useful logic of the old step-by-step software, but without the overloaded AI supervisor.

The current V2 principle:

- competitor scripts become a style blueprint and anti-copy guard;
- Vertex Gemini handles planning stages;
- the user reviews and approves each stage;
- the script writer writes only one requested part;
- only the script writer has a model switch.

## Current Pipeline

1. Competitor Style Blueprint
   - Model: Gemini 2.5 Flash through Vertex AI.
   - Extracts rhythm, paragraph flow, hook pressure, regret timing, dialogue density, and payoff cadence.
   - Blocks plot copying.

2. Stage Zero: Idea Setup
   - Model: Gemini 2.5 Flash through Vertex AI.
   - Develops the raw title or situation into a producer-ready premise, hook, opening fingerprint, proof system, and title package.

3. Stage One: Foundation DNA
   - Model: Gemini 2.5 Flash through Vertex AI.
   - Locks character functions, emotional chain, regret ladder, antagonist escalation, hidden cards, proof system, and face-slap variation.

4. Stage Two: Macro Outline
   - Model: Gemini 2.5 Pro through Vertex AI.
   - Optional.
   - Builds a full nine-part master outline with target length, payoff map, avatar placement, hidden card timing, and scene-card requirements.

5. Stage Three: Scene Cards
   - Model: Gemini 2.5 Pro through Vertex AI.
   - Creates the scene matrix for all nine parts.
   - This becomes the source of truth for the writer.

6. Stage Four: Part Writer
   - Switch one: Claude Sonnet 4.6 through Anthropic API.
   - Switch two: Vertex Gemini 3.1 Pro Preview High.
   - Writes only the selected part as clean `.txt` narration.

## Why This Should Write Better Scripts

The writer no longer has to invent the story, supervise itself, plan hidden cards, and write the final script all at once.

It receives a smaller, sharper task:

Write exactly this part.
Use these scene cards.
Keep first-person competitor-style rhythm.
Do not copy competitor plots.
Hit this character range.
Follow this paragraph rule.
Output clean `.txt` text.

## Paragraph Rule

For 120 to 220 characters including spaces, the practical English target is about 22 to 36 words per normal paragraph.

This is why the writer prompt uses:

- 120 to 220 characters;
- 22 to 36 words;
- short punch paragraphs only for hooks, refusals, reversals, humiliation, emotional snaps, or cliffhangers.

## Next Improvements

1. Add per-part repair prompts.
2. Add one-click full auto-write with stop/resume.
3. Add title scoring from competitor hooks.
4. Add local reference-script file loader.
5. Add full-script continuity checker as an optional, separate tool.
6. Add export profiles for narrator-only, narrator-plus-avatar, and production markers.
