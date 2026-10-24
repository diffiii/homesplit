#!/usr/bin/env bash
# Deploys a commit to a Render service and waits until it's live.
# Usage: render-deploy.sh <service-id> <commit>. Needs RENDER_API_KEY.
set -euo pipefail

service=$1
commit=$2
deploys="https://api.render.com/v1/services/$service/deploys"

api() {
  curl -fsS -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" "$@"
}

deploy=$(api -X POST -d "{\"commitId\":\"$commit\"}" "$deploys" | jq -r .id)
echo "Render deploy $deploy of $commit"

while :; do
  status=$(api "$deploys/$deploy" | jq -r .status)
  case "$status" in
    live) exit 0 ;;
    build_failed | update_failed | pre_deploy_failed | canceled | deactivated)
      echo "::error::Render deploy $deploy ended as $status"
      exit 1
      ;;
  esac
  sleep 15
done
