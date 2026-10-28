#!/usr/bin/env python3
"""pr_notify_hook.py - PostToolUse hook that asks Claude to alert people of GitHub activity.

Registered in hooks/hooks.json for every Bash call. The plugin is personal, so
enabling it is the opt-in: there is no environment switch.

It recognizes two kinds of successful command and answers with
`additionalContext` telling Claude which skill to run next:

  comment  `gh pr comment`, `gh issue comment`, `gh pr review`, or a `gh api`
           POST to a PR/issue comment, review comment reply, review or review
           submission endpoint  ->  notify-github-comment
  push     `git push` whose output shows at least one updated ref range
           (old..new or old...new)  ->  notify-pr-update

A command carrying `PR_NOTIFY=0` is skipped: the skills prefix their own `gh`
calls with it so that posting the update comment does not trigger the comment
alert. Editing a comment (`--edit-last`, PATCH) is not an alert.

Usage:
  pr_notify_hook.py            # hook mode: reads the hook payload on stdin
  pr_notify_hook.py selftest
"""

import json
import os
import re
import sys

PLUGIN_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SKIP_MARKER = "PR_NOTIFY"
MAX_CHARS = 1500

COMMAND_START = r"(?:^|[;&|(]\s*|\n\s*)(?:\w+=\S*\s+)*"
GH_COMMENT_RE = re.compile(COMMAND_START + r"gh\s+(?:pr|issue)\s+comment\b([^;&|\n]*)")
GH_REVIEW_RE = re.compile(COMMAND_START + r"gh\s+pr\s+review\b")
GH_API_RE = re.compile(COMMAND_START + r"gh\s+api\b([^;&|\n]*)")
GIT_PUSH_RE = re.compile(COMMAND_START + r"git(?:\s+-[Cc]\s+\S+)*\s+push\b([^;&|\n]*)")
API_PATH_RE = re.compile(
    r"repos/[^/\s'\"]+/[^/\s'\"]+/"
    r"(?:issues/\d+/comments|pulls/\d+/comments(?:/\d+/replies)?|pulls/\d+/reviews(?:/\d+/events)?)"
    r"(?=['\"\s?]|$)"
)
API_METHOD_RE = re.compile(r"(?:^|\s)(?:-X\s*|--method[=\s]+)['\"]?(\w+)")
API_FIELDS_RE = re.compile(r"(?:^|\s)(?:-f|-F|--field|--raw-field|--input)(?=[\s=]|$)")
DRY_RUN_RE = re.compile(r"(?:^|\s)(?:--dry-run|-n)(?=\s|$)")
REF_RANGE_RE = re.compile(
    r"^\s*([+ ]?)\s*([0-9a-f]{7,40})(\.\.\.?)([0-9a-f]{7,40})\s+(\S+)\s+->\s+(\S+)",
    re.MULTILINE,
)
URL_RE = re.compile(r"https://github\.com/[^\s\"'<>)]+")


def plugin_name(root):
    try:
        with open(os.path.join(root, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
            return json.load(f).get("name")
    except (OSError, ValueError):
        return None


def _is_comment_post(command):
    for m in GH_COMMENT_RE.finditer(command):
        if "--edit-last" not in m.group(1):
            return True
    if GH_REVIEW_RE.search(command):
        return True
    for m in GH_API_RE.finditer(command):
        args = m.group(1)
        if not API_PATH_RE.search(args):
            continue
        method = API_METHOD_RE.search(args)
        if method:
            if method.group(1).upper() == "POST":
                return True
        elif API_FIELDS_RE.search(args):
            return True
    return False


def _pushed_refs(command, output):
    if not any(not DRY_RUN_RE.search(m.group(1)) for m in GIT_PUSH_RE.finditer(command)):
        return []
    return [
        {
            "old": m.group(2),
            "new": m.group(4),
            "forced": m.group(1) == "+" or m.group(3) == "...",
            "local": m.group(5),
            "remote": m.group(6),
        }
        for m in REF_RANGE_RE.finditer(output)
    ]


def _output_text(response):
    if isinstance(response, dict):
        return "\n".join(str(response.get(k) or "") for k in ("stdout", "stderr"))
    return str(response or "")


def decide(payload, root=PLUGIN_ROOT):
    """The hook output for a payload, or None to stay silent."""
    if payload.get("tool_name") != "Bash":
        return None
    command = (payload.get("tool_input") or {}).get("command") or ""
    if re.search(r"\b%s=0\b" % SKIP_MARKER, command):
        return None
    output = _output_text(payload.get("tool_response"))
    name = plugin_name(root) or "pr-notify"
    cwd = payload.get("cwd") or ""
    notes = []
    if _is_comment_post(command):
        data = {"cwd": cwd, "command": command[:MAX_CHARS], "urls": sorted(set(URL_RE.findall(output)))}
        notes.append(
            "[%s] The command above posted to GitHub. Before going on, run the "
            "`%s:notify-github-comment` skill to alert the recipients on ClickUp. Input: %s"
            % (name, name, json.dumps(data, ensure_ascii=False))
        )
    refs = _pushed_refs(command, output)
    if refs:
        data = {"cwd": cwd, "refs": refs}
        notes.append(
            "[%s] The command above pushed commits. Before going on, run the "
            "`%s:notify-pr-update` skill to alert the PR reviewers on GitHub and ClickUp. Input: %s"
            % (name, name, json.dumps(data, ensure_ascii=False))
        )
    if not notes:
        return None
    return {"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "\n".join(notes)}}


def _selftest():
    failures = []
    push_out = {
        "stdout": "",
        "stderr": "To github.com:acme/app.git\n   1a2b3c4..5d6e7f8  feat/x -> feat/x\n",
    }
    forced_out = {"stdout": "", "stderr": "To github.com:acme/app.git\n + 1a2b3c4...9f8e7d6 feat/x -> feat/x (forced update)\n"}
    comment_out = {"stdout": "https://github.com/acme/app/pull/12#issuecomment-99\n", "stderr": ""}

    def kinds(command, response=None, tool="Bash"):
        out = decide({"tool_name": tool, "tool_input": {"command": command}, "tool_response": response or {}})
        if not out:
            return set()
        ctx = out["hookSpecificOutput"]["additionalContext"]
        return {k for k, skill in (("comment", "notify-github-comment"), ("push", "notify-pr-update")) if skill in ctx}

    cases = {
        "pr comment": ("gh pr comment 12 --body 'ok'", comment_out, {"comment"}),
        "issue comment": ("gh issue comment 7 -b 'ok'", None, {"comment"}),
        "pr review": ("gh pr review 12 --request-changes -b 'ver o teste'", None, {"comment"}),
        "api reply": ("gh api repos/{owner}/{repo}/pulls/12/comments/345/replies -f body='feito'", None, {"comment"}),
        "api issue comment": ("gh api -X POST repos/acme/app/issues/12/comments -f body=x", None, {"comment"}),
        "api review submit": ("gh api --method POST repos/acme/app/pulls/12/reviews/88/events -f event=COMMENT", None, {"comment"}),
        "api review input": ("gh api repos/acme/app/pulls/12/reviews --input /tmp/r.json", None, {"comment"}),
        "api list reviews": ("gh api repos/acme/app/pulls/12/reviews --jq '.[].state'", None, set()),
        "api patch comment": ("gh api -X PATCH repos/acme/app/issues/comments/99 -f body=x", None, set()),
        "api graphql": ("gh api graphql -f query='mutation{}'", None, set()),
        "api other path": ("gh api repos/acme/app/pulls/12/requested_reviewers -f 'reviewers[]=bob'", None, set()),
        "edit last": ("gh pr comment 12 --edit-last --body 'x'", None, set()),
        "pr view": ("gh pr view 12 --json comments", None, set()),
        "skill own comment": ("PR_NOTIFY=0 gh pr comment 12 --body '@bob atualizei'", None, set()),
        "push": ("git push", push_out, {"push"}),
        "push with -C": ("git -C ../app push origin feat/x", push_out, {"push"}),
        "forced push": ("git push --force-with-lease", forced_out, {"push"}),
        "dry run": ("git push --dry-run", push_out, set()),
        "up to date": ("git push", {"stdout": "", "stderr": "Everything up-to-date\n"}, set()),
        "push in body text": ("gh pr view 12 --json body | grep 'git push'", push_out, set()),
        "push then comment": ("git push && gh pr comment 12 -b ok", push_out, {"push", "comment"}),
        "string response": ("git push", push_out["stderr"], {"push"}),
    }
    for label, (command, response, expected) in cases.items():
        got = kinds(command, response)
        if got != expected:
            failures.append("%s: expected %s, got %s" % (label, sorted(expected), sorted(got)))

    if kinds("gh pr comment 12 -b ok", tool="Read"):
        failures.append("acted on a tool other than Bash")

    out = decide({"tool_name": "Bash", "tool_input": {"command": "git push -f"}, "tool_response": forced_out, "cwd": "/w/app"})
    ctx = out["hookSpecificOutput"]["additionalContext"]
    data = json.loads(ctx.split("Input: ", 1)[1])
    ref = data["refs"][0]
    if (ref["old"], ref["new"], ref["forced"], ref["remote"], data["cwd"]) != ("1a2b3c4", "9f8e7d6", True, "feat/x", "/w/app"):
        failures.append("forced ref parsed wrong: %r" % data)
    out = decide({"tool_name": "Bash", "tool_input": {"command": "gh pr comment 12 -b ok"}, "tool_response": comment_out})
    ctx = out["hookSpecificOutput"]["additionalContext"]
    data = json.loads(ctx.split("Input: ", 1)[1])
    if data["urls"] != ["https://github.com/acme/app/pull/12#issuecomment-99"]:
        failures.append("comment url not passed on: %r" % data)
    if "`pr-notify:notify-github-comment`" not in ctx:
        failures.append("skill not namespaced with the plugin name: %r" % ctx)
    if out["hookSpecificOutput"]["hookEventName"] != "PostToolUse":
        failures.append("wrong hook event name")

    if failures:
        for f in failures:
            print("FAIL: %s" % f, file=sys.stderr)
        return 1
    print("pr_notify_hook selftest: ok (%d commands)" % (len(cases) + 3))
    return 0


def main(argv):
    if argv[1:] == ["selftest"]:
        return _selftest()
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    out = decide(payload)
    if out:
        print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
