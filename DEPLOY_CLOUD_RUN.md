# Deploy Drama Manga Forge V2 to Cloud Run

Google Cloud project:

```bash
project-b05a94d2-9b34-450b-b8e
```

Run these commands from Google Cloud Shell or any terminal where `gcloud` is installed and authenticated.

## 1. Select Project

```bash
gcloud config set project project-b05a94d2-9b34-450b-b8e
```

## 2. Enable Services

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com
```

## 3. Create Or Update TKBK Secret

Only needed if you want the Claude-compatible TKBK writer option.

```bash
printf "PASTE_YOUR_TKBK_KEY_HERE" | gcloud secrets create tkbk-api-key --data-file=- --replication-policy="automatic"
```

If the secret already exists:

```bash
printf "PASTE_YOUR_NEW_TKBK_KEY_HERE" | gcloud secrets versions add tkbk-api-key --data-file=-
```

## 4. Grant Runtime Permissions

```bash
PROJECT_ID="project-b05a94d2-9b34-450b-b8e"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")"

RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding tkbk-api-key \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/aiplatform.user"
```

If Cloud Run source deploy shows a `storage.objects.get` error for the compute service account, grant this too:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectViewer"
```

## 5. Deploy Public Service

From the repo folder:

```bash
gcloud run deploy drama-manga-forge-v2 \
  --source . \
  --region europe-west4 \
  --timeout=900s \
  --allow-unauthenticated \
  --set-secrets TKBK_API_KEY=tkbk-api-key:latest \
  --set-env-vars NODE_ENV=production,GOOGLE_GENAI_USE_VERTEXAI=True,GOOGLE_CLOUD_PROJECT=project-b05a94d2-9b34-450b-b8e,GOOGLE_CLOUD_LOCATION=global,GEMINI_FAST_MODEL=gemini-2.5-flash,GEMINI_PRO_MODEL=gemini-2.5-pro,GEMINI_WRITER_MODEL=gemini-3.1-pro-preview,GEMINI_WRITER_THINKING_LEVEL=HIGH,CLAUDE_WRITER_PROVIDER=tkbk,SCRIPT_WRITER_PROVIDER=tkbk,CLAUDE_WRITER_MODEL=claude-sonnet-4-6,CLAUDE_WRITER_MAX_TOKENS=8000,TKBK_CLAUDE_ENDPOINT=https://api.tkbk.io/claude/v1/messages
```

For a private app, replace `--allow-unauthenticated` with `--no-allow-unauthenticated`.

## 6. Using Gemini Writer Instead Of Claude By Default

Set this env var during deploy:

```bash
SCRIPT_WRITER_PROVIDER=vertex_gemini
```

The UI still lets you switch the writer model per session.

## 7. Check After Deploy

Open the Cloud Run URL.

Top status should show:

- `Vertex ready` for planning and Gemini writer.
- `TKBK key loaded` if the TKBK secret is connected.

If Vertex is missing, check `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and the runtime service account `roles/aiplatform.user` permission.
