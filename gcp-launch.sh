#!/bin/bash
# ====================================================================
# PETPOOJA ERP — Master GCP Cloud Shell Deployment
# ====================================================================

PROJECT_ID=$(gcloud config get-value project)
REGION="asia-south1"

echo "🚀 Launching Petpooja SaaS into Google Cloud Orbit..."
echo "Project: $PROJECT_ID | Region: $REGION"

# 1. Enable Required APIs (The foundation)
echo "🛡️ provisioning Foundation APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  compute.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com

# 2. Add Artifact Registry (Where the Master Engine will live)
echo "📦 provisioning Private Cloud Registry..."
gcloud artifacts repositories create petpooja-repo \
    --repository-format=docker \
    --location=$REGION \
    --description="Master Petpooja SaaS Engine Registry"

# 3. Build & Deploy in the CLOUD (No local disk needed!)
echo "🏎️💨 Cloud Build Initiated. (Bypassing local Mac disk...)"
gcloud builds submit --tag asia-south1-docker.pkg.dev/$PROJECT_ID/petpooja-repo/api:v1 .

# 4. Deploy Master API to Cloud Run
echo "🏁 Finalizing Deployment to Cloud Run..."
gcloud run deploy petpooja-api \
    --image asia-south1-docker.pkg.dev/$PROJECT_ID/petpooja-repo/api:v1 \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 5001

echo "🏆 VICTORY! Your SaaS Platform is now LIVE on Google Cloud."
