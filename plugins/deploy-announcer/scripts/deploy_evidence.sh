#!/usr/bin/env bash
# deploy_evidence.sh: reúne, por repositório, as evidências para inferir o fluxo de deploy em produção.
#
# Uso:
#   bash deploy_evidence.sh [repo ...]
#
# Sem argumentos, varre os repositórios não arquivados da organização com push nos últimos
# DEPLOY_ACTIVE_DAYS dias e que tenham pelo menos um workflow ativo com "deploy" ou "release" no caminho.
#
# Para cada repositório imprime: branches de longa duração existentes, gatilhos (bloco "on:") de cada
# workflow de deploy, últimas execuções bem-sucedidas e últimas PRs mergeadas entre branches de longa duração.
#
# Env opcional: DEPLOY_GITHUB_ORG (default: pastar-br), DEPLOY_ACTIVE_DAYS (default: 30)

set -euo pipefail

ORG="${DEPLOY_GITHUB_ORG:-pastar-br}"
ACTIVE_DAYS="${DEPLOY_ACTIVE_DAYS:-30}"
LONG_LIVED=(main master develop staging production prod homolog)
LONG_LIVED_REGEX='^(main|master|develop|staging|production|prod|homolog)$'

if [[ $# -gt 0 ]]; then
  REPOS=("$@")
else
  CUTOFF=$(date -u -d "${ACTIVE_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
  mapfile -t REPOS < <(gh repo list "$ORG" --limit 500 --no-archived --json name,pushedAt \
    --jq ".[] | select(.pushedAt >= \"$CUTOFF\") | .name")
fi

for repo in "${REPOS[@]}"; do
  full="${ORG}/${repo}"
  mapfile -t workflows < <(gh api "repos/${full}/actions/workflows?per_page=100" \
    --jq '.workflows[] | select(.state == "active" and (.path | test("deploy|release"; "i"))) | .path')
  [[ ${#workflows[@]} -eq 0 ]] && continue

  echo "## ${full}"
  echo
  echo "Branch default: $(gh api "repos/${full}" --jq .default_branch)"

  existing=()
  for branch in "${LONG_LIVED[@]}"; do
    # Branch renomeada redireciona para a nova (master -> main), por isso confere o nome devolvido.
    [[ "$(gh api "repos/${full}/branches/${branch}" --jq .name 2>/dev/null)" == "$branch" ]] && existing+=("$branch")
  done
  echo "Branches de longa duração: ${existing[*]:-nenhuma}"
  echo

  for wf in "${workflows[@]}"; do
    echo "### Workflow ${wf}"
    echo
    echo '```yaml'
    gh api "repos/${full}/contents/${wf}" --jq .content | base64 -d | sed -n '/^on:/,/^[a-z_]*:$/p' | sed '$d' | head -40
    echo '```'
    echo
    echo "Últimas execuções bem-sucedidas:"
    runs=$(gh api "repos/${full}/actions/workflows/$(basename "$wf")/runs?status=success&per_page=5" \
      --jq '.workflow_runs[] | "- \(.created_at[:10]) evento=\(.event) branch=\(.head_branch) título=\"\(.display_title)\""')
    echo "${runs:-- nenhuma}"
    echo
  done

  echo "### PRs mergeadas entre branches de longa duração"
  echo
  found=""
  for base in "${existing[@]}"; do
    prs=$(gh pr list -R "$full" --state merged --base "$base" --limit 30 \
      --json number,title,headRefName,baseRefName,mergedAt \
      --jq "[.[] | select(.headRefName | test(\"${LONG_LIVED_REGEX}\"))][:3][] | \"- #\(.number) \(.headRefName) -> \(.baseRefName) em \(.mergedAt[:10]): \(.title)\"")
    [[ -n "$prs" ]] && found+="${prs}"$'\n'
  done
  echo "${found:-- nenhuma}"
  echo
done
