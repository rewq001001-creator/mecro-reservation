param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "asia-northeast3",
  [string]$ServiceName = "lunch-reservation-bot",
  [string]$SchedulerJobName = "lunch-reservation-trigger",
  [string]$SchedulerServiceAccountName = "lunch-reservation-scheduler"
)

$ErrorActionPreference = "Stop"

$SchedulerServiceAccountEmail = "$SchedulerServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$Image = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ServiceName"

Write-Host "Setting gcloud project to $ProjectId"
gcloud config set project $ProjectId

Write-Host "Enabling required APIs"
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com

Write-Host "Creating scheduler service account if needed"
gcloud iam service-accounts create $SchedulerServiceAccountName --display-name "Lunch Reservation Scheduler" 2>$null

Write-Host "Building container image"
gcloud builds submit --tag $Image

Write-Host "Deploying Cloud Run service"
gcloud run deploy $ServiceName `
  --image $Image `
  --region $Region `
  --no-allow-unauthenticated `
  --timeout 3600 `
  --memory 1Gi `
  --cpu 1

$ServiceUrl = gcloud run services describe $ServiceName --region $Region --format "value(status.url)"

Write-Host "Granting Cloud Run invoke permission to scheduler service account"
gcloud run services add-iam-policy-binding $ServiceName `
  --region $Region `
  --member "serviceAccount:$SchedulerServiceAccountEmail" `
  --role "roles/run.invoker"

Write-Host "Creating or updating Cloud Scheduler job"
gcloud scheduler jobs delete $SchedulerJobName --location $Region --quiet 2>$null
gcloud scheduler jobs create http $SchedulerJobName `
  --location $Region `
  --schedule "0 8 * * *" `
  --time-zone "Asia/Seoul" `
  --uri "$ServiceUrl/run" `
  --http-method POST `
  --oidc-service-account-email $SchedulerServiceAccountEmail `
  --oidc-token-audience $ServiceUrl

Write-Host ""
Write-Host "Deployment complete."
Write-Host "Cloud Run service: $ServiceUrl"
Write-Host "Health check: $ServiceUrl/healthz"
