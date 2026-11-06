#!/usr/bin/env bash
# pending_changes.sh: lista o que sobe num deploy, ou seja, o que está em <origem> e ainda não está em <destino>.
#
# Uso:
#   bash pending_changes.sh <org/repo> <destino> <origem>
#
# Exemplo: bash pending_changes.sh pastar-br/pastar-web-server production staging
#
# Imprime um JSON com:
#   ahead_by        quantidade de commits pendentes
#   open_deploy_pr  PR aberta de <origem> para <destino>, se existir
#   prs             PRs de funcionalidade incluídas (sem as PRs entre branches de longa duração),
#                   com as referências ao ClickUp achadas no título, na branch e na descrição
#   orphan_commits  commits que não pertencem a nenhuma PR de funcionalidade (push direto na branch)

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Uso: bash pending_changes.sh <org/repo> <destino> <origem>" >&2
  exit 1
fi

REPO="$1"
BASE="$2"
HEAD="$3"
LONG_LIVED_REGEX='^(main|master|develop|staging|production|prod|homolog)$'

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT
COMMITS="$WORK_DIR/commits.json"
PRS="$WORK_DIR/prs.jsonl"
OPEN_PR="$WORK_DIR/open_pr.json"
PR_SHAS="$WORK_DIR/pr_shas.txt"
touch "$PRS" "$PR_SHAS"

gh api --paginate "repos/${REPO}/compare/${BASE}...${HEAD}?per_page=100" \
  --jq '.commits[] | {sha: .sha[:7], message: .commit.message}' | jq -s '.' > "$COMMITS"

gh pr list -R "$REPO" --base "$BASE" --head "$HEAD" --state open --json number,title,url | jq '.[0] // null' > "$OPEN_PR"

mapfile -t PR_NUMBERS < <(jq -r '.[].message
  | (capture("^Merge pull request #(?<n>[0-9]+)") // (split("\n")[0] | capture("\\(#(?<n>[0-9]+)\\)$")) // empty)
  | .n' "$COMMITS" | sort -un)

for number in "${PR_NUMBERS[@]}"; do
  pr=$(gh pr view "$number" -R "$REPO" --json number,title,url,headRefName,body,author,mergedAt)
  jq -e --arg re "$LONG_LIVED_REGEX" '.headRefName | test($re)' <<<"$pr" >/dev/null && continue
  # O campo commits do gh pr view para em 100; a API paginada devolve até 250.
  gh api --paginate "repos/${REPO}/pulls/${number}/commits?per_page=100" --jq '.[].sha[:7]' >> "$PR_SHAS"
  jq -c '(.title + " " + .headRefName + " " + (.body // "")) as $text
    | {
        number, title, url, branch: .headRefName, author: .author.login, merged_at: .mergedAt,
        clickup_custom_ids: ([$text | scan("(?i)\\bDEV-[0-9]+\\b") | ascii_upcase] | unique),
        clickup_task_ids: ([$text | scan("(?i)app\\.clickup\\.com/t/(?:[0-9]+/)?([a-z0-9-]+)") | .[0]
          | select(test("^([0-9]+|DEV-[0-9]+)$"; "i") | not)] | unique)
      }' <<<"$pr" >> "$PRS"
done

jq -n \
  --arg repo "$REPO" --arg base "$BASE" --arg head "$HEAD" \
  --slurpfile commits "$COMMITS" --slurpfile open_pr "$OPEN_PR" --slurpfile prs "$PRS" \
  --rawfile pr_shas "$PR_SHAS" \
  '($pr_shas | split("\n") | map({(.): true}) | add // {}) as $in_pr
  | {
      repo: $repo, base: $base, head: $head,
      ahead_by: ($commits[0] | length),
      open_deploy_pr: $open_pr[0],
      prs: $prs,
      orphan_commits: [$commits[0][]
        | select($in_pr[.sha] | not)
        | select(.message | test("^Merge (pull request|branch|remote-tracking)") | not)
        | select(.message | split("\n")[0] | test("\\(#[0-9]+\\)$") | not)
        | {sha, headline: (.message | split("\n")[0])}]
    }'
