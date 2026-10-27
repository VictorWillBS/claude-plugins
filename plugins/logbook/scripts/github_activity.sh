#!/usr/bin/env bash
# github_activity.sh: lista a atividade do usuário autenticado no gh dentro de uma organização.
#
# Uso:
#   bash github_activity.sh <desde> [até]
#
# <desde> e [até] em ISO 8601 UTC (ex.: 2026-10-26T18:00:00Z). [até] padrão: agora.
#
# Cobre: PRs abertas, reviews, comentários (em PR, issue e review), branches criadas
# e execuções de workflow com "deploy" no nome do arquivo disparadas pelo usuário.
#
# Env opcional: LOGBOOK_GITHUB_ORG (default: pastar-br)

set -euo pipefail

ORG="${LOGBOOK_GITHUB_ORG:-pastar-br}"
SINCE="${1:-}"
UNTIL="${2:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if [[ -z "$SINCE" ]]; then
  echo "Uso: bash github_activity.sh <desde ISO 8601 UTC> [até]" >&2
  exit 1
fi

LOGIN=$(gh api user --jq .login)

# A API de eventos devolve no máximo 300 eventos (3 páginas), suficiente para um dia.
EVENTS=$(gh api --paginate "users/${LOGIN}/events?per_page=100" \
  | jq -s --arg org "$ORG/" --arg since "$SINCE" --arg until "$UNTIL" '
      add
      | map(select(.repo.name | startswith($org)))
      | map(select(.created_at >= $since and .created_at < $until))
      | sort_by(.created_at)')

pr_number() {
  jq -r '.payload.number // .payload.pull_request.number // .payload.issue.number'
}

# Título e autor não vêm no payload dos eventos; busca uma vez por PR/issue.
describe_item() {
  local repo="$1" number="$2"
  gh api "repos/${repo}/issues/${number}" \
    --jq '"#\(.number) \(.title) (\(if .pull_request then "PR" else "issue" end) de \(.user.login)) \(.html_url)"' 2>/dev/null \
    || echo "#${number} (não foi possível ler o título) https://github.com/${repo}/pull/${number}"
}

section() {
  local title="$1" filter="$2"
  local rows
  rows=$(jq -c "$filter" <<<"$EVENTS")
  echo "### ${title}"
  if [[ -z "$rows" ]]; then
    echo "- nenhum"
    echo
    return
  fi
  declare -A seen=()
  while IFS= read -r event; do
    local repo number key
    repo=$(jq -r '.repo.name' <<<"$event")
    number=$(pr_number <<<"$event")
    key="${repo}#${number}"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1
    echo "- ${repo} $(describe_item "$repo" "$number")"
  done <<<"$rows"
  echo
}

echo "## GitHub (${ORG}, ${LOGIN}, ${SINCE} até ${UNTIL})"
echo

section "PRs abertas" '.[] | select(.type == "PullRequestEvent" and .payload.action == "opened")'
section "Reviews feitas" '.[] | select(.type == "PullRequestReviewEvent")'
section "Comentários" '.[] | select(.type == "IssueCommentEvent" or .type == "PullRequestReviewCommentEvent")'

echo "### Branches criadas"
BRANCHES=$(jq -r '.[] | select(.type == "CreateEvent" and .payload.ref_type == "branch") | "- \(.repo.name) \(.payload.ref)"' <<<"$EVENTS")
echo "${BRANCHES:-- nenhum}"
echo

echo "### Deploys"
DEPLOYS=""
for repo in $(gh repo list "$ORG" --limit 500 --no-archived --json name --jq '.[].name'); do
  runs=$(gh api "repos/${ORG}/${repo}/actions/runs?actor=${LOGIN}&created=${SINCE}..${UNTIL}&per_page=100" \
    --jq '.workflow_runs[] | select(.path | test("deploy"; "i")) | "- \(.repository.full_name) \(.path | split("/") | last) na branch \(.head_branch): \(.conclusion // .status) \(.html_url)"')
  [[ -n "$runs" ]] && DEPLOYS+="${runs}"$'\n'
done
echo "${DEPLOYS:-- nenhum}"
