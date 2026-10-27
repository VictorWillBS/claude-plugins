#!/usr/bin/env bash
# daily.sh: gera o rascunho do diário (ClickUp + GitHub) desde a última execução e avisa no Windows.
#
# Pensado para o cron. A conversa acontece depois, quando o usuário abre /logbook:logbook.
#
# Saídas:
#   ~/journal/drafts/YYYY-MM-DD.md        rascunho do período
#   ~/.local/state/logbook/last_run       fim do último período coletado (ISO 8601 UTC)
#   ~/.local/state/logbook/daily.log      log de cada execução

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/logbook"
STATE_FILE="$STATE_DIR/last_run"
DRAFT_DIR="$HOME/journal/drafts"

mkdir -p "$STATE_DIR" "$DRAFT_DIR"

notify() {
  local message="$1"
  /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command "
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > \$null
    \$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    \$text = \$xml.GetElementsByTagName('text')
    \$text.Item(0).AppendChild(\$xml.CreateTextNode('Logbook')) > \$null
    \$text.Item(1).AppendChild(\$xml.CreateTextNode('$message')) > \$null
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new(\$xml))
  " || echo "Falha ao enviar a notificação do Windows." >&2
}

trap 'notify "Falha ao gerar o rascunho do diário. Veja $STATE_DIR/daily.log"' ERR

if [[ "${1:-}" == "--notify-test" ]]; then
  notify "Teste de notificação do logbook."
  exit 0
fi

UNTIL=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SINCE=$(cat "$STATE_FILE" 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
DRAFT_FILE="$DRAFT_DIR/$(date +%Y-%m-%d).md"

echo "[$(date -Is)] coletando de $SINCE até $UNTIL"

GITHUB=$(bash "$SCRIPT_DIR/github_activity.sh" "$SINCE" "$UNTIL")

DRAFT=$(cd "$DRAFT_DIR" && claude -p "/logbook:collect $SINCE $UNTIL

$GITHUB" \
  --model sonnet \
  --allowedTools "mcp__claude_ai_ClickUp__clickup_get_user mcp__claude_ai_ClickUp__clickup_filter_tasks")

printf '%s\n' "$DRAFT" > "$DRAFT_FILE"
echo "$UNTIL" > "$STATE_FILE"

echo "[$(date -Is)] rascunho salvo em $DRAFT_FILE"
notify "Rascunho do dia pronto. Abra o Claude Code e rode /logbook:logbook."
