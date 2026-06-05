# V2 Improvement Plan

## Chosen Direction

We chose Option Two: a clean V2 app based on the useful logic of the old software, but without the overloaded AI supervisor.

The V2 principle:

Planning data is locked by the user.
Competitor scripts become a style blueprint.
Claude writes only one requested part.
The checker validates technical rules.

## Why This Should Write Better Scripts

The old software overloads the final writer with too many jobs:

- think through the whole story;
- obey a huge prompt stack;
- preserve competitor style;
- avoid copying;
- write a long part;
- output memory;
- clean voiceover text;
- follow QA rules.

V2 removes that overload.

Claude receives a smaller, sharper task:

Write exactly this part.
Use these scene cards.
Use first-person competitor-style rhythm.
Do not copy competitor plots.
Hit this character range.
Follow this paragraph rule.
Output clean `.txt` text.

## Competitor Style Handling

Competitor scripts are integrated in two layers:

1. Style Blueprint

Extracts:

- hook rhythm;
- first conflict timing;
- first-person voice;
- paragraph flow;
- dialogue density;
- face-slap timing;
- regret pacing;
- dopamine beat frequency;
- part-ending hook style.

2. Reference Guard

Blocks:

- copied plots;
- copied scenes;
- copied names;
- copied locations;
- copied proof objects;
- copied relationship setups;
- copied final punishments;
- copied dialogue.

This lets the output feel like the niche without becoming a rewrite of a competitor script.

## V2 Pipeline

1. Choose Niche Preset
2. Paste Raw Idea
3. Paste Competitor Scripts
4. Extract Style Blueprint
5. Lock Story DNA
6. Lock Scene Cards by Part
7. Generate Selected Part with Claude
8. Run Deterministic Checker
9. Repair Manually or Regenerate
10. Export `.txt`

## Next Improvements

1. Add a one-click Story DNA builder from raw idea.
2. Add a one-click Scene Card builder from Story DNA.
3. Add per-part repair prompts.
4. Add local reference-script file loader.
5. Add title and thumbnail package generator.
6. Add full-script continuity checker.
7. Add a GitHub publish workflow after the repo is created remotely.

