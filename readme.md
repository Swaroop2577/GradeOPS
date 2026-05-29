# GradeOPS — Complete Setup Guide

GradeOPS is an AI-powered exam grading platform with three services that run together:

| Service | Tech | Port | What it does |
|---|---|---|---|
| **Client** | React + Vite | `5173` | Frontend UI for instructors and TAs |
| **Server** | Node.js + Express | `5000` | REST API, auth, job queue |
| **ML** | Python + FastAPI | `8000` | OCR, LLM grading, plagiarism detection |

**External dependencies you need:**
- MongoDB (database)
- Redis (job queue)
- Cloud Storage — AWS S3 **or** Google Cloud Storage (for PDF uploads)
- OpenAI API (LLM grading)
- HuggingFace account (to download ML models)

---

## Prerequisites

Install these before starting:

- **Node.js** ≥ 20 — [nodejs.org](https://nodejs.org)
- **Python** ≥ 3.10 — [python.org](https://python.org)
- **MongoDB** (local) — [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
- **Redis** (local) — [redis.io/docs/getting-started](https://redis.io/docs/getting-started/)

> **Windows users:** Install Redis via WSL2 or use [Memurai](https://www.memurai.com/) (free for development).

---

## Project Structure

```
GradeOPS/
├── client/          # React frontend (Vite)
│   ├── .env         # ← you edit this
│   └── src/
├── server/          # Node.js backend (Express + BullMQ)
│   ├── .env         # ← you edit this
│   └── src/
└── ml/              # Python ML service (FastAPI + LangGraph)
    ├── .env         # ← you edit this
    ├── api/
    ├── grading/
    ├── ocr/
    ├── pipeline/
    └── plagiarism/
```

---

## Step 1 — Get Your Free API Keys

### 1a. OpenAI API Key (for LLM grading)

Used by the ML service to grade exams via GPT.

1. Go to [platform.openai.com/signup](https://platform.openai.com/signup) and create a free account.
2. Navigate to **API keys** → **Create new secret key**.
3. Copy the key — it starts with `sk-`.

> **Free tier:** OpenAI gives $5 of free credits. For development/testing, use `gpt-4o-mini` (the cheapest model, already set as the default).

---

### 1b. HuggingFace Token (for ML models)

Used to download the Nougat OCR and Qwen-VL vision models.

1. Go to [huggingface.co/join](https://huggingface.co/join) and create a free account.
2. Go to **Settings → Access Tokens** → **New token**.
3. Give it a name, select **Read** role, and click **Create**.
4. Copy the token — it starts with `hf_`.

---

### 1c. Cloud Storage — Choose ONE of the following

You need one cloud storage provider for storing uploaded exam PDFs.

#### Option A: AWS S3 (Free Tier — Recommended)

AWS gives 5 GB free storage and 20,000 GET requests per month free for 12 months.

1. Go to [aws.amazon.com/free](https://aws.amazon.com/free) and create a free account (credit card required but not charged within free tier).
2. In the AWS Console, search for **S3** and click **Create bucket**.
   - Give it a unique name (e.g., `gradeops-exams-yourname`).
   - Choose a region (e.g., `us-east-1`).
   - Keep all other defaults and click **Create bucket**.
3. Go to **IAM** → **Users** → **Create user**.
   - Username: `gradeops-user`
   - Attach policy: **AmazonS3FullAccess**
   - After creating, go to the user → **Security credentials** → **Create access key**.
   - Choose **Application running outside AWS**, then copy the **Access Key ID** and **Secret Access Key**.

#### Option B: Google Cloud Storage (Free Tier)

GCS gives 5 GB free storage per month.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a free account.
2. Create a new project.
3. Go to **Cloud Storage** → **Create bucket** → pick a unique name and region.
4. Go to **IAM & Admin** → **Service Accounts** → **Create Service Account**.
   - Grant role: **Storage Object Admin**.
   - Click on the service account → **Keys** → **Add Key** → **JSON**.
   - Download the JSON key file and note its path on your machine.

---

## Step 2 — Configure `.env` Files

### `client/.env`

This file is safe — it contains no secrets (only public URLs).

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_APP_NAME=GradeOps
VITE_APP_VERSION=1.0.0
VITE_FEATURE_EXAM_UPLOAD=true
VITE_FEATURE_RUBRIC_BUILDER=true
VITE_FEATURE_PLAGIARISM=true
```

**Nothing to change here for local development.** The Vite dev server already proxies `/api` to `localhost:5000`.

---

### `server/.env`

```env
# ── Server ──────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ── MongoDB ─────────────────────────────────────────────────────
# If you installed MongoDB locally with default settings, this works as-is.
MONGO_URI=mongodb://localhost:27017/gradeops

# ── JWT ─────────────────────────────────────────────────────────
# CHANGE THIS: any long random string (e.g. run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=change_me_to_a_long_random_secret
JWT_EXPIRY=7d

# ── Redis (BullMQ) ──────────────────────────────────────────────
# If Redis is running locally with default settings, leave as-is.
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# ── Cloud Storage ───────────────────────────────────────────────
# Set to "s3" or "gcs"
CLOUD_STORAGE_PROVIDER=s3

# --- If using AWS S3 ---
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET=gradeops-exams-yourname

# --- If using GCS (leave blank if using S3) ---
GCS_PROJECT_ID=
GCS_KEY_FILE=
GCS_BUCKET_NAME=

# ── ML Service ──────────────────────────────────────────────────
ML_SERVICE_URL=http://localhost:8000
# CHANGE THIS: must match GRADEOPS_ML_API_KEY in ml/.env (any random string)
GRADEOPS_ML_API_KEY=change_me_to_a_strong_random_secret

# ── CORS ────────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# ── Upload limits ───────────────────────────────────────────────
MAX_UPLOAD_MB=200

# ── BullMQ worker ───────────────────────────────────────────────
GRADING_CONCURRENCY=2
```

**What you must change:**
| Variable | What to put |
|---|---|
| `JWT_SECRET` | Any long random string. Generate one with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `AWS_ACCESS_KEY_ID` | From AWS IAM step above |
| `AWS_SECRET_ACCESS_KEY` | From AWS IAM step above |
| `AWS_S3_BUCKET` | The bucket name you created |
| `AWS_REGION` | The region you chose (e.g. `us-east-1`) |
| `GRADEOPS_ML_API_KEY` | Any random string — **must match the same key in `ml/.env`** |

---

### `ml/.env`

```env
# ── HuggingFace ─────────────────────────────────────────────────
# Your HuggingFace token for downloading models
HF_TOKEN=hf_your_token_here

# ── LLM API ─────────────────────────────────────────────────────
# Your OpenAI API key
LLM_API_KEY=sk-your_openai_key_here
OPENAI_API_KEY=sk-your_openai_key_here   # same key, both vars needed

# Model for grading — gpt-4o-mini is cheapest and works well
GRADING_LLM_MODEL=gpt-4o-mini

# ── Embedding model (plagiarism) ─────────────────────────────────
# Downloads automatically from HuggingFace — no changes needed
EMBEDDING_MODEL=all-MiniLM-L6-v2

# ── Plagiarism ──────────────────────────────────────────────────
# Similarity score threshold (0–1) above which answers are flagged
PLAGIARISM_THRESHOLD=0.92

# ── Service config ──────────────────────────────────────────────
ML_PORT=8000
ENV=development

# CHANGE THIS: must match GRADEOPS_ML_API_KEY in server/.env
GRADEOPS_ML_API_KEY=change_me_to_a_strong_random_secret

# Webhook — tells ML service where to send grading results (leave as-is for local)
GRADEOPS_WEBHOOK_URL=http://localhost:5000/api/internal/grade-result

# ── CORS ────────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**What you must change:**
| Variable | What to put |
|---|---|
| `HF_TOKEN` | Your HuggingFace token from Step 1b |
| `LLM_API_KEY` | Your OpenAI API key from Step 1a |
| `OPENAI_API_KEY` | Same OpenAI key (both vars are used) |
| `GRADEOPS_ML_API_KEY` | **Same value** as `GRADEOPS_ML_API_KEY` in `server/.env` |

---

## Step 3 — Install Dependencies

Open **three separate terminals**, one for each service.

### Terminal 1 — Client

```bash
cd GradeOPS/client
npm install
```

### Terminal 2 — Server

```bash
cd GradeOPS/server
npm install
```

### Terminal 3 — ML Service

```bash
cd GradeOPS/ml

# Create a virtual environment (strongly recommended)
python -m venv venv

# Activate it:
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

> **Note:** The ML requirements include PyTorch (~2 GB) and several large vision models. The first install will take 5–15 minutes depending on your internet speed. The models (Nougat, Qwen-VL) are downloaded on first use — another 2–5 GB.

---

## Step 4 — Start External Services

Make sure MongoDB and Redis are running before starting the app.

### MongoDB

```bash
# macOS (with Homebrew):
brew services start mongodb-community

# Linux:
sudo systemctl start mongod

# Windows: Start "MongoDB" from Services, or run:
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"
```

### Redis

```bash
# macOS (with Homebrew):
brew services start redis

# Linux:
sudo systemctl start redis

# Windows (WSL2):
sudo service redis-server start
```

Verify both are running:
```bash
# MongoDB
mongosh --eval "db.adminCommand('ping')"

# Redis
redis-cli ping
# Should print: PONG
```

---

## Step 5 — Start All Three Services

### Terminal 1 — Client (React + Vite)

```bash
cd GradeOPS/client
npm run dev
```

Opens at: **http://localhost:5173**

---

### Terminal 2 — Server (Node.js + Express)

```bash
cd GradeOPS/server
npm run dev
```

Runs at: **http://localhost:5000**

Health check: http://localhost:5000/health

---

### Terminal 3 — ML Service (FastAPI)

```bash
cd GradeOPS/ml
source venv/bin/activate   # or venv\Scripts\activate on Windows

uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

Runs at: **http://localhost:8000**

API docs: **http://localhost:8000/docs** (auto-generated Swagger UI)

---

## How the App Works

```
User (Browser) → React Client (5173)
                       ↓ HTTP
               Node.js Server (5000)
                 ↙           ↘
           MongoDB         Redis (BullMQ)
                               ↓ job
                       ML Service (8000)
                         ↙       ↘
                    OCR           LLM grading
                 (Nougat/         (OpenAI
                  Qwen-VL)        gpt-4o-mini)
                               ↓ webhook
               Node.js Server (5000) ← results saved
```

1. **Instructor** uploads exam PDFs and creates a rubric via the UI.
2. The server stores the PDF in S3/GCS and enqueues a grading job in Redis.
3. The BullMQ worker sends the job to the ML service.
4. The ML service runs OCR on the PDF, then uses GPT to grade each answer against the rubric.
5. Results are sent back to the server via a webhook and saved to MongoDB.
6. **TAs** review the AI grades, add overrides/comments, and export reports.

---

## User Roles

| Role | What they can do |
|---|---|
| **Instructor** | Create courses, upload exams, build rubrics, view plagiarism reports, export grades |
| **TA** | Review AI-generated grades, override scores, add comments |

Register on the signup page and select your role.

---

## Troubleshooting

**`ECONNREFUSED` on MongoDB** — MongoDB isn't running. See Step 4.

**`ECONNREFUSED` on Redis** — Redis isn't running. See Step 4.

**ML service crashes on startup** — Usually a missing Python package. Re-run `pip install -r requirements.txt` inside your virtual environment.

**`403 Invalid API key` between server and ML** — The `GRADEOPS_ML_API_KEY` in `server/.env` and `ml/.env` don't match. Make them identical.

**S3 upload errors** — Double-check `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, and `AWS_REGION` in `server/.env`. Make sure the IAM user has S3 permissions.

**OpenAI `401 Unauthorized`** — Your `LLM_API_KEY` / `OPENAI_API_KEY` in `ml/.env` is wrong or expired.

**Models downloading slowly** — Normal on first run. Nougat and Qwen-VL are large (1–3 GB each). They cache after the first download.

---

## Quick Reference — All Ports

| Service | URL |
|---|---|
| Frontend (React) | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| ML API + Swagger | http://localhost:8000/docs |
| MongoDB | localhost:27017 |
| Redis | localhost:6379 |

---

## Summary — Keys You Need (All Free)

| Key | Where to get it | Cost |
|---|---|---|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | $5 free credit |
| `HF_TOKEN` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | Free |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | AWS IAM | Free tier (12 months) |
| `JWT_SECRET` | Generate locally | Free |
| `GRADEOPS_ML_API_KEY` | Make up any string | Free |