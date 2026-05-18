#!/usr/bin/env bash
# deploy-staging-lambdas.sh
#
# Deploys the 6 Plan B "staging" Lambdas + their /api/staging/* routes
# on the existing REST API tt3xt4tr09 (stage: prod).
#
# Idempotent: every create is preceded by an existence check; existing
# resources are SKIPped with a log line. Fail-fast on any AWS error.
#
# Usage:
#   bash deploy-staging-lambdas.sh --dry-run   # print commands only
#   bash deploy-staging-lambdas.sh             # execute
#
# Phase A: create 6 Lambda functions
# Phase B: create /api/staging parent + 6 child resources, each with
#          AWS_PROXY method (POST or GET) + Lambda permission + CORS
#          response + OPTIONS MOCK
# Phase C: create-deployment on stage `prod`

set -euo pipefail

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------
AWS_ACCOUNT_ID="111710313267"
REGION="us-east-1"
API_ID="tt3xt4tr09"
PARENT_API_RESOURCE_ID="q6nn8h"   # /api
LAMBDA_ROLE_ARN="arn:aws:iam::111710313267:role/primo-maps-lambda-role"
STAGE="prod"
RUNTIME="nodejs20.x"
MEMORY_MB="128"
TIMEOUT_S="30"
DIST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lambda/dist"

# Route map: <funcName>|<HTTP_METHOD>|<path-part-under-/api/staging>
ROUTES=(
  "uploadStagingSvg|POST|upload"
  "validateStaging|POST|validate"
  "getStagingStatus|GET|status"
  "promoteStaging|POST|promote"
  "clearStaging|POST|clear"
  "applyReconcileToStaging|POST|reconcile"
)

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
aws_or_dryrun() {
  if [ "$DRY_RUN" = "1" ]; then
    # Echo to stderr so the line survives even when callers redirect
    # this function's stdout to /dev/null (which we do for AWS create-*
    # calls whose JSON payloads we don't want polluting the log).
    echo "DRYRUN: aws $*" >&2
  else
    aws "$@"
  fi
}

# Read-only AWS calls always run (even in dry-run) so we can detect existing
# resources and SKIP correctly. They never mutate.
aws_ro() {
  aws "$@"
}

log()        { echo "[$(date -u +%H:%M:%SZ)] $*"; }
created()    { echo "CREATED: $*"; }
skipped()    { echo "SKIP: $*"; }

# -----------------------------------------------------------------------------
# Phase A: Lambdas
# -----------------------------------------------------------------------------
log "=== Phase A: Lambda functions ==="

phase_a_create_lambda() {
  local func_name="$1"
  local full_name="primo-maps-${func_name}"
  local zip_path="${DIST_DIR}/${func_name}.zip"

  if [ ! -f "$zip_path" ]; then
    echo "ERROR: zip not found at $zip_path" >&2
    exit 1
  fi

  if aws_ro lambda get-function --function-name "$full_name" --region "$REGION" >/dev/null 2>&1; then
    skipped "lambda function ${full_name} already exists"
    return 0
  fi

  aws_or_dryrun lambda create-function \
    --function-name "$full_name" \
    --runtime "$RUNTIME" \
    --role "$LAMBDA_ROLE_ARN" \
    --handler "${func_name}.handler" \
    --memory-size "$MEMORY_MB" \
    --timeout "$TIMEOUT_S" \
    --zip-file "fileb://${zip_path}" \
    --region "$REGION" >/dev/null

  created "lambda function=${full_name}"
}

for entry in "${ROUTES[@]}"; do
  IFS='|' read -r func_name http_method path_part <<<"$entry"
  phase_a_create_lambda "$func_name"
done

# Sanity: verify all 6 exist (skipped in dry-run since they won't have been
# created yet)
if [ "$DRY_RUN" = "0" ]; then
  log "Verifying all 6 Lambdas exist before Phase B..."
  for entry in "${ROUTES[@]}"; do
    IFS='|' read -r func_name _ _ <<<"$entry"
    full_name="primo-maps-${func_name}"
    if ! aws_ro lambda get-function --function-name "$full_name" --region "$REGION" >/dev/null 2>&1; then
      echo "ERROR: expected Lambda ${full_name} not found after Phase A" >&2
      exit 1
    fi
  done
  log "All 6 Lambdas confirmed."
fi

# -----------------------------------------------------------------------------
# Phase B: API Gateway resources / methods / integrations / OPTIONS
# -----------------------------------------------------------------------------
log "=== Phase B: API Gateway resources ==="

# Cache existing resources once so we can look up by path without N round-trips
EXISTING_RESOURCES_JSON="$(aws_ro apigateway get-resources \
  --rest-api-id "$API_ID" --region "$REGION" --limit 500)"

resource_id_for_path() {
  local path="$1"
  echo "$EXISTING_RESOURCES_JSON" \
    | python3 -c "import sys,json; data=json.load(sys.stdin); items=data.get('items',[]);
matches=[i['id'] for i in items if i.get('path')=='$path'];
print(matches[0] if matches else '')"
}

# --- /api/staging parent ---
STAGING_PARENT_ID="$(resource_id_for_path '/api/staging')"
if [ -n "$STAGING_PARENT_ID" ]; then
  skipped "resource /api/staging id=${STAGING_PARENT_ID}"
else
  if [ "$DRY_RUN" = "1" ]; then
    echo "DRYRUN: aws apigateway create-resource --rest-api-id $API_ID --parent-id $PARENT_API_RESOURCE_ID --path-part staging --region $REGION"
    STAGING_PARENT_ID="<NEW_STAGING_PARENT_ID>"
  else
    STAGING_PARENT_ID="$(aws apigateway create-resource \
      --rest-api-id "$API_ID" \
      --parent-id "$PARENT_API_RESOURCE_ID" \
      --path-part staging \
      --region "$REGION" \
      --query 'id' --output text)"
  fi
  created "resource path=/api/staging id=${STAGING_PARENT_ID}"
fi

# Refresh resource cache (only meaningful in non-dry-run)
if [ "$DRY_RUN" = "0" ]; then
  EXISTING_RESOURCES_JSON="$(aws_ro apigateway get-resources \
    --rest-api-id "$API_ID" --region "$REGION" --limit 500)"
fi

# --- per-route ---
deploy_route() {
  local func_name="$1"
  local http_method="$2"
  local path_part="$3"

  local full_name="primo-maps-${func_name}"
  local full_path="/api/staging/${path_part}"
  local lambda_arn="arn:aws:lambda:${REGION}:${AWS_ACCOUNT_ID}:function:${full_name}"
  local invoke_uri="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${lambda_arn}/invocations"
  local source_arn="arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${API_ID}/*/${http_method}/api/staging/${path_part}"
  local options_source_arn="arn:aws:execute-api:${REGION}:${AWS_ACCOUNT_ID}:${API_ID}/*/OPTIONS/api/staging/${path_part}"
  local allow_methods="'${http_method},OPTIONS'"
  local allow_headers="'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
  local allow_origin="'*'"

  log "--- Route ${http_method} ${full_path} -> ${full_name} ---"

  # (a) create-resource
  local res_id="$(resource_id_for_path "$full_path")"
  if [ -n "$res_id" ]; then
    skipped "resource ${full_path} id=${res_id}"
  else
    if [ "$DRY_RUN" = "1" ]; then
      echo "DRYRUN: aws apigateway create-resource --rest-api-id $API_ID --parent-id $STAGING_PARENT_ID --path-part $path_part --region $REGION"
      res_id="<NEW_RES_ID_${path_part}>"
    else
      res_id="$(aws apigateway create-resource \
        --rest-api-id "$API_ID" \
        --parent-id "$STAGING_PARENT_ID" \
        --path-part "$path_part" \
        --region "$REGION" \
        --query 'id' --output text)"
    fi
    created "resource path=${full_path} id=${res_id}"
  fi

  # (b) put-method (real verb)
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-method \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method "$http_method" --region "$REGION" >/dev/null 2>&1; then
    skipped "method ${http_method} ${full_path}"
  else
    aws_or_dryrun apigateway put-method \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method "$http_method" \
      --authorization-type NONE \
      --region "$REGION" >/dev/null
    created "method ${http_method} ${full_path}"
  fi

  # (c) put-integration (real verb, AWS_PROXY)
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-integration \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method "$http_method" --region "$REGION" >/dev/null 2>&1; then
    skipped "integration ${http_method} ${full_path}"
  else
    aws_or_dryrun apigateway put-integration \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method "$http_method" \
      --type AWS_PROXY \
      --integration-http-method POST \
      --uri "$invoke_uri" \
      --region "$REGION" >/dev/null
    created "integration ${http_method} ${full_path} -> ${full_name} (AWS_PROXY)"
  fi

  # (d) add-permission on the Lambda
  local statement_id="apigw-staging-${path_part}-${http_method}"
  local has_perm=0
  if [ "$DRY_RUN" = "0" ]; then
    if aws_ro lambda get-policy --function-name "$full_name" --region "$REGION" \
        --query 'Policy' --output text 2>/dev/null \
        | grep -q "\"Sid\":\"${statement_id}\""; then
      has_perm=1
    fi
  fi
  if [ "$has_perm" = "1" ]; then
    skipped "lambda permission ${statement_id} on ${full_name}"
  else
    aws_or_dryrun lambda add-permission \
      --function-name "$full_name" \
      --statement-id "$statement_id" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "$source_arn" \
      --region "$REGION" >/dev/null
    created "lambda permission ${statement_id} on ${full_name}"
  fi

  # (e) put-method-response (real verb) — declare CORS header names
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-method-response \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method "$http_method" --status-code 200 \
      --region "$REGION" >/dev/null 2>&1; then
    skipped "method-response 200 ${http_method} ${full_path}"
  else
    aws_or_dryrun apigateway put-method-response \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method "$http_method" \
      --status-code 200 \
      --response-parameters '{"method.response.header.Access-Control-Allow-Origin":false}' \
      --region "$REGION" >/dev/null
    created "method-response 200 ${http_method} ${full_path}"
  fi

  # (f) put-integration-response (real verb) — supply CORS header value
  # NOTE: AWS_PROXY integrations IGNORE integration-response mappings (the
  # Lambda response passes through verbatim). Real CORS headers must be set
  # by each Lambda's response. This call is included to satisfy the spec but
  # has no runtime effect on AWS_PROXY. Skipped if already present.
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-integration-response \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method "$http_method" --status-code 200 \
      --region "$REGION" >/dev/null 2>&1; then
    skipped "integration-response 200 ${http_method} ${full_path}"
  else
    aws_or_dryrun apigateway put-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method "$http_method" \
      --status-code 200 \
      --response-parameters "{\"method.response.header.Access-Control-Allow-Origin\":\"${allow_origin}\"}" \
      --region "$REGION" >/dev/null || true
    created "integration-response 200 ${http_method} ${full_path} (no-op on AWS_PROXY)"
  fi

  # (g) put-method OPTIONS
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-method \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method OPTIONS --region "$REGION" >/dev/null 2>&1; then
    skipped "method OPTIONS ${full_path}"
  else
    aws_or_dryrun apigateway put-method \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method OPTIONS \
      --authorization-type NONE \
      --region "$REGION" >/dev/null
    created "method OPTIONS ${full_path}"
  fi

  # (h) put-integration OPTIONS (MOCK)
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-integration \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method OPTIONS --region "$REGION" >/dev/null 2>&1; then
    skipped "integration OPTIONS ${full_path}"
  else
    aws_or_dryrun apigateway put-integration \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method OPTIONS \
      --type MOCK \
      --request-templates '{"application/json":"{\"statusCode\": 200}"}' \
      --region "$REGION" >/dev/null
    created "integration OPTIONS ${full_path} (MOCK)"
  fi

  # (i) put-method-response OPTIONS — declare CORS header names
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-method-response \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method OPTIONS --status-code 200 \
      --region "$REGION" >/dev/null 2>&1; then
    skipped "method-response 200 OPTIONS ${full_path}"
  else
    aws_or_dryrun apigateway put-method-response \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method OPTIONS \
      --status-code 200 \
      --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
      --region "$REGION" >/dev/null
    created "method-response 200 OPTIONS ${full_path}"
  fi

  # (j) put-integration-response OPTIONS — supply CORS header values
  if [ "$DRY_RUN" = "0" ] && aws_ro apigateway get-integration-response \
      --rest-api-id "$API_ID" --resource-id "$res_id" \
      --http-method OPTIONS --status-code 200 \
      --region "$REGION" >/dev/null 2>&1; then
    skipped "integration-response 200 OPTIONS ${full_path}"
  else
    aws_or_dryrun apigateway put-integration-response \
      --rest-api-id "$API_ID" \
      --resource-id "$res_id" \
      --http-method OPTIONS \
      --status-code 200 \
      --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"${allow_headers}\",\"method.response.header.Access-Control-Allow-Methods\":\"${allow_methods}\",\"method.response.header.Access-Control-Allow-Origin\":\"${allow_origin}\"}" \
      --region "$REGION" >/dev/null
    created "integration-response 200 OPTIONS ${full_path}"
  fi
}

for entry in "${ROUTES[@]}"; do
  IFS='|' read -r func_name http_method path_part <<<"$entry"
  deploy_route "$func_name" "$http_method" "$path_part"
done

# -----------------------------------------------------------------------------
# Phase C: deployment
# -----------------------------------------------------------------------------
log "=== Phase C: create-deployment (stage=${STAGE}) ==="
aws_or_dryrun apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name "$STAGE" \
  --description "Deploy /api/staging/* routes (Plan B staging Lambdas)" \
  --region "$REGION" >/dev/null
created "deployment api=${API_ID} stage=${STAGE}"

log "=== DONE ==="
