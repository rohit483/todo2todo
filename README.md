---
title: Todo App
emoji: 🚀
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---
# TODO2
Todo app with FastAPI + REST API + Sqlite + Firebase Google Auth

## Prerequisites for Local Development

Because the backend verifies Firebase tokens, you need Google Cloud credentials locally:

```bash
# If you don't have gcloud, you must install the Google Cloud CLI first
gcloud auth application-default login
```

## Running Locally

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the application:
   ```bash
   uvicorn app:app --port 8080 --reload
   ```
3. Open http://127.0.0.1:8080 in your browser.

## Running with Docker

1. Build the Docker image:
   ```bash
   docker build -t todo2-app .
   ```
2. Run the Docker container:
   ```bash
   docker run -p 8080:8080 todo2-app
   ```
3. Open http://localhost:8080 in your browser.
