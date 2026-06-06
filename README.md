# Drama Manga Forge V2

Step-by-step software for English manhwa-style drama scripts.

The app now follows the old step-by-step planning logic, but without an AI supervisor stage:

1. Competitor scripts become a style blueprint and anti-copy guard.
2. Stage Zero develops the raw title or idea.
3. Stage One locks the story DNA.
4. Stage Two creates the optional nine-part macro outline.
5. Stage Three creates detailed scene cards with Gemini 2.5 Pro.
6. Stage Four writes one selected part as clean `.txt` narration.

## Model Setup

Planning stages use Gemini through Vertex AI:

- Stage Zero Idea Setup: `gemini-2.5-flash`
- Stage One Foundation DNA: `gemini-2.5-flash`
- Stage Two Macro Outline: `gemini-2.5-pro`, optional
- Stage Three Scene Cards: `gemini-2.5-pro`

The script writer is the only place with a switch:

- `Claude Sonnet 4.6` through Anthropic API
- `Vertex Gemini 3.1 Pro Preview High` through Vertex AI

## Competitor Scripts

Competitor scripts are used only as style references.

Allowed to extract:

- hook rhythm;
- first-person voice;
- paragraph flow;
- dialogue density;
- regret timing;
- payoff frequency;
- face-slap mechanics;
- part-ending hook style.

Blocked from copying:

- plots;
- scenes;
- names;
- locations;
- proof objects;
- exact dialogue;
- relationship setups;
- final collapse mechanics.

## Script Writer Rules

Each part target:

- ideal: 13,300 to 14,500 characters including spaces;
- hard minimum: 12,800 characters;
- hard maximum: 15,000 characters;
- estimated words: 2,300 to 2,600.

Paragraph rule:

- normal paragraph: 22 to 36 words;
- normal paragraph: 120 to 220 characters including spaces;
- short punch paragraphs only for hook, refusal, reversal, humiliation, emotional snap, or cliffhanger.

## Local Run

```bash
npm install
```

Create `.env.local`:

```bash
GOOGLE_GENAI_USE_VERTEXAI="True"
GOOGLE_CLOUD_PROJECT="project-b05a94d2-9b34-450b-b8e"
GOOGLE_CLOUD_LOCATION="global"

GEMINI_FAST_MODEL="gemini-2.5-flash"
GEMINI_PRO_MODEL="gemini-2.5-pro"
GEMINI_WRITER_MODEL="gemini-3.1-pro-preview"
GEMINI_WRITER_THINKING_LEVEL="HIGH"

CLAUDE_WRITER_PROVIDER="tkbk"
SCRIPT_WRITER_PROVIDER="tkbk"
TKBK_API_KEY="your_tkbk_key_here"
CLAUDE_WRITER_MODEL="claude-sonnet-4-6"
CLAUDE_WRITER_MAX_TOKENS=8000
TKBK_CLAUDE_ENDPOINT="https://api.tkbk.io/claude/v1/messages"
```

Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Recommended Workflow

1. Paste title or raw situation.
2. Paste competitor scripts.
3. Extract style blueprint.
4. Generate Stage Zero.
5. Approve Stage Zero.
6. Generate Stage One.
7. Approve Stage One.
8. Either skip Stage Two or generate the macro outline.
9. Generate Stage Three scene cards.
10. Select writer model.
11. Generate one part at a time.
12. Check, edit, approve, and download `.txt`.

## Sharing With Other People

You can share the GitHub repo. Each person should deploy their own Cloud Run service or create their own `.env.local` locally.

Do not commit real API keys. Put keys in `.env.local` for local use or Secret Manager for Cloud Run.
