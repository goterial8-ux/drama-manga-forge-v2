# Drama Manga Forge V2

Clean V2 pipeline for English manhwa-style drama scripts.

## Why V2 Exists

The old app tried to make one large prompt handle planning, supervision, script writing, QA, and cleanup at the same time. V2 separates the work:

1. Competitor scripts become a style blueprint.
2. Story DNA and scene cards stay locked.
3. Claude writes only the selected part.
4. A deterministic checker verifies length, paragraph rules, digits, avatar tags, and prompt residue.

There is no AI supervisor in this version.

## Competitor Scripts

Paste competitor scripts into **Competitor Style Library** and click **Extract Style Blueprint**.

The app sends the references to Claude only for style extraction:

- hook rhythm;
- paragraph flow;
- first-person voice;
- dialogue density;
- regret timing;
- payoff frequency;
- face-slap mechanics.

The app also creates a **Reference Guard**, which tells the writer not to copy:

- plots;
- scenes;
- names;
- locations;
- proof objects;
- exact dialogue;
- relationship setups;
- final collapse mechanics.

The final script writer receives the blueprint and guard, not a command to reuse source plots.

## Claude Writer Rules

Claude writes one part at a time.

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

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
ANTHROPIC_API_KEY="your_key_here"
ANTHROPIC_MODEL="claude-sonnet-4-6"
SCRIPT_WRITER_PROVIDER="anthropic"
GOOGLE_GENAI_USE_VERTEXAI="True"
GOOGLE_CLOUD_PROJECT="project-b05a94d2-9b34-450b-b8e"
GOOGLE_CLOUD_LOCATION="global"
```

3. Run:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Deploy to Cloud Run

Recommended path: deploy from source with Cloud Build and store the Anthropic key in Secret Manager.

In Google Cloud Shell:

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

Create the secret:

```bash
printf "YOUR_ANTHROPIC_KEY" | gcloud secrets create anthropic-api-key --data-file=- --replication-policy="automatic"
```

Allow the default Cloud Run runtime service account to read the secret:

```bash
PROJECT_ID="$(gcloud config get-value project)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")"

gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Deploy from the project folder:

```bash
gcloud run deploy drama-manga-forge-v2 \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --set-env-vars ANTHROPIC_MODEL=claude-sonnet-4-6,SCRIPT_WRITER_PROVIDER=anthropic,GOOGLE_GENAI_USE_VERTEXAI=True,GOOGLE_CLOUD_PROJECT=project-b05a94d2-9b34-450b-b8e,GOOGLE_CLOUD_LOCATION=global,NODE_ENV=production
```

For a private app, replace `--allow-unauthenticated` with `--no-allow-unauthenticated`.

## Recommended Workflow

1. Select a niche preset.
2. Paste competitor scripts.
3. Extract style blueprint.
4. Fill Story DNA.
5. Fill Scene Cards with `PART ONE`, `PART TWO`, etc.
6. Generate one part.
7. Run Check Part.
8. Repair or approve manually.
9. Download part `.txt` or full script `.txt`.
