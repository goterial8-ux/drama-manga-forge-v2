# Deploy Drama Manga Forge V2 to Cloud Run

Google Cloud project:

```bash
project-b05a94d2-9b34-450b-b8e
```

Run these commands from Google Cloud Shell or any terminal where `gcloud` is installed and authenticated.

## 1. Go to the project folder

```bash
cd drama-manga-forge-v2
```

If you are in the parent workspace folder:

```bash
cd "drama-manga-forge-v2"
```

## 2. Select the Google Cloud project

```bash
gcloud config set project project-b05a94d2-9b34-450b-b8e
```

## 3. Enable required services

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 4. Create the Anthropic API key secret

Do not paste the key into source code.

```bash
printf "PASTE_YOUR_ANTHROPIC_KEY_HERE" | gcloud secrets create anthropic-api-key --data-file=- --replication-policy="automatic"
```

If the secret already exists and you want to update it:

```bash
printf "PASTE_YOUR_NEW_ANTHROPIC_KEY_HERE" | gcloud secrets versions add anthropic-api-key --data-file=-
```

## 5. Allow Cloud Run to read the secret

```bash
PROJECT_ID="project-b05a94d2-9b34-450b-b8e"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")"

gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 6. Deploy to Cloud Run

```bash
gcloud run deploy drama-manga-forge-v2 \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --set-env-vars ANTHROPIC_MODEL=claude-sonnet-4-6,SCRIPT_WRITER_PROVIDER=anthropic,GOOGLE_GENAI_USE_VERTEXAI=True,GOOGLE_CLOUD_PROJECT=project-b05a94d2-9b34-450b-b8e,GOOGLE_CLOUD_LOCATION=global,NODE_ENV=production
```

For a private app, use this instead:

```bash
gcloud run deploy drama-manga-forge-v2 \
  --source . \
  --region europe-west1 \
  --no-allow-unauthenticated \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --set-env-vars ANTHROPIC_MODEL=claude-sonnet-4-6,SCRIPT_WRITER_PROVIDER=anthropic,GOOGLE_GENAI_USE_VERTEXAI=True,GOOGLE_CLOUD_PROJECT=project-b05a94d2-9b34-450b-b8e,GOOGLE_CLOUD_LOCATION=global,NODE_ENV=production
```

## 7. After deploy

Cloud Run will print a service URL.

Open that URL and check the top-right status:

- `Claude key loaded` means the secret is connected.
- `Claude key missing` means the Cloud Run service cannot read the secret or the secret variable was not set.
