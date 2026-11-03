#!/usr/bin/env python3
"""check_dossier.py - enforces the countable rules of the review-critic plugin.

The finding-critic agent writes one JSON dossier per finding. Prose rules can be
bent by the model that reads them; the rules below are counted instead, and every
change is recorded so the report can show it.

  check       reads every *.json in --in, rejects anchors that do not exist,
              downgrades verdicts that lack their proof, drops data requests
              that would write to production or decide nothing
  prioritize  reads the classified dossiers, computes the priority from
              severity, origin, scope and proportionality, and sorts them

Usage:
  check_dossier.py check --in DIR --root REPO --out FILE --adjustments FILE
  check_dossier.py prioritize --in FILE --out FILE --adjustments FILE
  check_dossier.py selftest
"""

import argparse
import json
import os
import re
import shutil
import sys
import tempfile

VERDICTS = ("confirmed", "partial", "withstood", "refuted", "inconclusive")
REAL_VERDICTS = ("confirmed", "partial", "withstood")
PROPORTIONALITY = ("proportional", "anticipated", "oversized", "not_verified", "not_applicable")
SCALE_EVIDENCE_SOURCES = ("fact", "local_measure", "documented")
SCALE_DECIDED_STATUSES = ("verified", "contradicted")
ENVIRONMENTS = ("production", "staging", "local", "user")

SEVERITY_START = {"critical": 0, "high": 1, "medium": 2, "low": 3}
ORIGINS = ("new", "aggravated", "pre_existing")
SCOPES = ("in", "partial", "out", "unknown")
LEVELS = ("low", "medium", "high")
RECOMMENDATIONS = ("apply_now", "apply_later", "not_worth")

ANCHOR_RE = re.compile(r"^(?P<path>[^:\s]+):(?P<line>\d+)(?:-\d+)?$")
WRITE_CALL_RE = re.compile(
    r"\.(?:update|update!|update_all|update_attribute|update_column|update_columns|save|save!"
    r"|create|create!|create_or_find_by|find_or_create_by|destroy|destroy!|destroy_all|delete"
    r"|delete_all|insert|insert!|insert_all|insert_all!|upsert|upsert_all|increment!|decrement!"
    r"|toggle!|touch|perform_later|perform_async|perform_in|deliver_now|deliver_later)\b"
    r"|\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\s",
)


class Adjustments:
    def __init__(self):
        self.items = []

    def add(self, finding_id, reason, before, after):
        self.items.append({"id": finding_id, "reason": reason, "from": before, "to": after})


def _anchor_exists(root, anchor):
    match = ANCHOR_RE.match(anchor or "")
    if not match:
        return False
    path = os.path.join(root, match.group("path"))
    if not os.path.isfile(path):
        return False
    with open(path, "rb") as handle:
        line_count = sum(1 for _ in handle)
    return 1 <= int(match.group("line")) <= max(line_count, 1)


def _artifact_exists(root, path):
    return bool(path) and os.path.isfile(os.path.join(root, path))


def _set_verdict(dossier, adjustments, verdict, reason):
    adjustments.add(dossier["id"], reason, dossier["verdict"], verdict)
    dossier["verdict"] = verdict
    if verdict == "inconclusive" and not dossier.get("inconclusive_reason"):
        dossier["inconclusive_reason"] = "o verificador rebaixou o veredito (%s)" % reason


def _check_attempts(dossier, root, adjustments):
    kept = []
    for attempt in dossier.get("refutation_attempts") or []:
        if _anchor_exists(root, attempt.get("anchor")):
            kept.append(attempt)
        else:
            adjustments.add(dossier["id"], "unanchored-attempt", attempt.get("anchor"), "removida")
    dossier["refutation_attempts"] = kept


def _check_verdict(dossier, root, adjustments):
    verdict = dossier.get("verdict")
    if verdict not in VERDICTS:
        _set_verdict(dossier, adjustments, "inconclusive", "unknown-verdict")
        return

    execution = dossier.get("execution") or {}
    artifacts = execution.get("artifacts") or []
    deviations = dossier.get("deviations") or []

    if verdict in ("confirmed", "partial"):
        plan_path = (dossier.get("plan") or {}).get("registered_at")
        if not (execution.get("ran") and artifacts and all(_artifact_exists(root, a) for a in artifacts)):
            _set_verdict(dossier, adjustments, "withstood", "no-execution-artifact")
        elif not _artifact_exists(root, plan_path):
            _set_verdict(dossier, adjustments, "inconclusive", "unregistered-plan")
        elif deviations:
            _set_verdict(dossier, adjustments, "inconclusive", "plan-deviation")
        elif verdict == "partial" and not dossier.get("partial_condition"):
            _set_verdict(dossier, adjustments, "confirmed", "missing-partial-condition")

    if dossier["verdict"] == "refuted":
        counter = dossier.get("counter_evidence") or {}
        anchor = counter.get("anchor")
        by_code = _anchor_exists(root, anchor)
        by_artifact = anchor in artifacts and _artifact_exists(root, anchor)
        if not counter.get("shows") or not (by_code or by_artifact):
            _set_verdict(dossier, adjustments, "withstood", "no-counter-evidence")
        elif by_artifact and deviations:
            _set_verdict(dossier, adjustments, "inconclusive", "plan-deviation")

    if dossier["verdict"] == "withstood" and not dossier["refutation_attempts"]:
        _set_verdict(dossier, adjustments, "inconclusive", "no-valid-attempt")

    if dossier["verdict"] == "inconclusive" and not dossier.get("inconclusive_reason"):
        dossier["inconclusive_reason"] = "motivo não informado pelo crítico"
        adjustments.add(dossier["id"], "missing-inconclusive-reason", None, dossier["inconclusive_reason"])


def _check_scale(dossier, adjustments):
    scale = dossier.setdefault("scale", {})
    value = scale.get("proportionality") or "not_applicable"
    if value not in PROPORTIONALITY:
        adjustments.add(dossier["id"], "unknown-proportionality", value, "not_verified")
        value = "not_verified"
    if value in ("anticipated", "oversized"):
        backed = any(
            p.get("status") in SCALE_DECIDED_STATUSES
            and p.get("source") in SCALE_EVIDENCE_SOURCES
            and p.get("evidence")
            for p in scale.get("premises") or []
        )
        if not backed:
            adjustments.add(dossier["id"], "no-scale-evidence", value, "not_verified")
            value = "not_verified"
    scale["proportionality"] = value


def _check_requests(dossier, adjustments):
    kept = []
    for request in dossier.get("data_requests") or []:
        environment = request.get("environment")
        command = request.get("command") or ""
        label = request.get("question") or "(sem pergunta)"
        if environment not in ENVIRONMENTS:
            reason = "unknown-environment"
        elif not request.get("if_low") or not request.get("if_high") or request["if_low"] == request["if_high"]:
            reason = "undecisive-request"
        elif environment == "production" and (request.get("mode") != "read" or WRITE_CALL_RE.search(command)):
            reason = "production-write"
        elif environment in ("production", "staging") and "--sandbox" not in command:
            reason = "missing-sandbox"
        else:
            kept.append(request)
            continue
        adjustments.add(dossier["id"], reason, label, "pedido removido")
    dossier["data_requests"] = kept


def check(in_dir, root, adjustments):
    dossiers = []
    for name in sorted(os.listdir(in_dir)):
        if not name.endswith(".json"):
            continue
        finding_id = name[: -len(".json")]
        try:
            with open(os.path.join(in_dir, name), encoding="utf-8") as handle:
                dossier = json.load(handle)
            if not isinstance(dossier, dict):
                raise ValueError("not an object")
        except ValueError:
            dossier = {"id": finding_id, "verdict": "inconclusive",
                       "inconclusive_reason": "o crítico devolveu um dossiê inválido"}
            adjustments.add(finding_id, "malformed-dossier", None, "inconclusive")
        dossier.setdefault("id", finding_id)
        _check_attempts(dossier, root, adjustments)
        _check_verdict(dossier, root, adjustments)
        _check_scale(dossier, adjustments)
        _check_requests(dossier, adjustments)
        dossiers.append(dossier)
    return dossiers


def _priority(dossier):
    classification = dossier["classification"]
    level = SEVERITY_START[classification["severity"]]
    critical = classification["severity"] == "critical"
    if dossier.get("origin") == "pre_existing":
        level += 1
    if classification["scope"] == "out":
        level = max(level, 2)
    proportionality = (dossier.get("scale") or {}).get("proportionality")
    if not critical and proportionality == "anticipated":
        level = max(level, 2)
    if not critical and proportionality == "oversized":
        level = 3
    return "P%d" % min(max(level, 0), 3)


def _validate_classification(dossier):
    classification = dossier.get("classification")
    if not isinstance(classification, dict):
        return "classification ausente"
    allowed = {"severity": tuple(SEVERITY_START), "scope": SCOPES, "cost": LEVELS,
               "benefit": LEVELS, "recommendation": RECOMMENDATIONS}
    for field, values in allowed.items():
        if classification.get(field) not in values:
            return "%s inválido: %r" % (field, classification.get(field))
    if dossier.get("origin") not in ORIGINS:
        return "origin inválido: %r" % dossier.get("origin")
    return None


def prioritize(dossiers, adjustments):
    errors = []
    for dossier in dossiers:
        if dossier.get("verdict") not in REAL_VERDICTS:
            continue
        problem = _validate_classification(dossier)
        if problem:
            errors.append("%s: %s" % (dossier.get("id"), problem))
            continue
        dossier["priority"] = _priority(dossier)
        classification = dossier["classification"]
        if dossier["priority"] == "P0" and classification["recommendation"] != "apply_now":
            adjustments.add(dossier["id"], "p0-must-apply-now", classification["recommendation"], "apply_now")
            classification["recommendation"] = "apply_now"
    if errors:
        return None, errors
    severity_rank = lambda d: SEVERITY_START.get((d.get("classification") or {}).get("severity"), 9)
    dossiers.sort(key=lambda d: (d.get("priority", "P9"), severity_rank(d), d.get("id", "")))
    return dossiers, []


def _write_json(path, data):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def _selftest():
    failures = []
    root = tempfile.mkdtemp(prefix="check-dossier-")
    os.makedirs(os.path.join(root, "app"))
    os.makedirs(os.path.join(root, "exp", "d"))
    with open(os.path.join(root, "app", "sale.rb"), "w") as handle:
        handle.write("class Sale\n  def total\n  end\nend\n")
    for name in ("out.txt", "plan.json"):
        with open(os.path.join(root, "exp", name), "w") as handle:
            handle.write("{}")

    attempt = {"anchor": "app/sale.rb:2", "attempt": "a", "result": "r"}
    executed = {"ran": True, "artifacts": ["exp/out.txt"]}
    plan = {"registered_at": "exp/plan.json"}
    cases = [
        ("confirmed-ok", {"verdict": "confirmed", "execution": executed, "plan": plan,
                          "refutation_attempts": [attempt]}, "confirmed"),
        ("confirmed-no-artifact", {"verdict": "confirmed", "execution": {"ran": True, "artifacts": ["exp/x.txt"]},
                                   "plan": plan, "refutation_attempts": [attempt]}, "withstood"),
        ("confirmed-no-plan", {"verdict": "confirmed", "execution": executed, "plan": {},
                               "refutation_attempts": [attempt]}, "inconclusive"),
        ("confirmed-deviation", {"verdict": "confirmed", "execution": executed, "plan": plan,
                                 "deviations": ["mudou"], "refutation_attempts": [attempt]}, "inconclusive"),
        ("partial-no-condition", {"verdict": "partial", "execution": executed, "plan": plan,
                                  "refutation_attempts": [attempt]}, "confirmed"),
        ("refuted-ok", {"verdict": "refuted", "counter_evidence": {"anchor": "app/sale.rb:3", "shows": "s"}},
         "refuted"),
        ("refuted-bad-line", {"verdict": "refuted", "counter_evidence": {"anchor": "app/sale.rb:99", "shows": "s"},
                              "refutation_attempts": [attempt]}, "withstood"),
        ("refuted-invented-file", {"verdict": "refuted", "counter_evidence": {"anchor": "app/x.rb:1", "shows": "s"}},
         "inconclusive"),
        ("withstood-unanchored", {"verdict": "withstood",
                                  "refutation_attempts": [{"anchor": "talvez o front valide"}]}, "inconclusive"),
        ("unknown", {"verdict": "maybe"}, "inconclusive"),
    ]
    in_dir = os.path.join(root, "in")
    os.makedirs(in_dir)
    for finding_id, dossier, _ in cases:
        _write_json(os.path.join(in_dir, finding_id + ".json"), dict(dossier, id=finding_id))
    with open(os.path.join(in_dir, "broken.json"), "w") as handle:
        handle.write("{not json")

    adjustments = Adjustments()
    result = {d["id"]: d for d in check(in_dir, root, adjustments)}
    for finding_id, _, expected in cases:
        if result[finding_id]["verdict"] != expected:
            failures.append("%s: expected %s, got %s" % (finding_id, expected, result[finding_id]["verdict"]))
    if result["broken"]["verdict"] != "inconclusive":
        failures.append("broken dossier should be inconclusive")

    scale_cases = [
        ({"proportionality": "oversized", "premises": [{"status": "verified", "source": "fact", "evidence": "e"}]},
         "oversized"),
        ({"proportionality": "oversized", "premises": [{"status": "verified", "source": "none", "evidence": "e"}]},
         "not_verified"),
        ({"proportionality": "anticipated", "premises": []}, "not_verified"),
    ]
    for scale, expected in scale_cases:
        dossier = {"id": "s", "scale": scale}
        _check_scale(dossier, Adjustments())
        if dossier["scale"]["proportionality"] != expected:
            failures.append("scale %r: expected %s" % (scale, expected))

    base_request = {"question": "q", "if_low": "a", "if_high": "b", "mode": "read"}
    request_cases = [
        (dict(base_request, environment="production", command="# --sandbox\nSale.count"), 1),
        (dict(base_request, environment="production", command="# --sandbox\nSale.update_all(x: 1)"), 0),
        (dict(base_request, environment="production", mode="write", command="# --sandbox\nSale.count"), 0),
        (dict(base_request, environment="production", command="Sale.count"), 0),
        (dict(base_request, environment="staging", mode="write", command="# --sandbox\nSale.create!"), 1),
        (dict(base_request, environment="user", if_high="a", command=""), 0),
    ]
    for request, expected in request_cases:
        dossier = {"id": "r", "data_requests": [request]}
        _check_requests(dossier, Adjustments())
        if len(dossier["data_requests"]) != expected:
            failures.append("request %r: expected %d kept" % (request, expected))

    def classified(severity, origin="new", scope="in", proportionality="proportional", recommendation="apply_now"):
        return {"id": "p", "verdict": "confirmed", "origin": origin, "scale": {"proportionality": proportionality},
                "classification": {"severity": severity, "scope": scope, "cost": "low", "benefit": "high",
                                   "recommendation": recommendation}}

    priority_cases = [
        (classified("critical"), "P0"),
        (classified("critical", origin="pre_existing"), "P1"),
        (classified("high", scope="out"), "P2"),
        (classified("high", proportionality="oversized"), "P3"),
        (classified("critical", proportionality="oversized"), "P0"),
        (classified("medium", proportionality="anticipated"), "P2"),
        (classified("high", proportionality="anticipated"), "P2"),
        (classified("low", origin="pre_existing"), "P3"),
    ]
    for dossier, expected in priority_cases:
        result, errors = prioritize([dossier], Adjustments())
        if errors or result[0]["priority"] != expected:
            failures.append("priority %r: expected %s" % (dossier["classification"], expected))

    adjustments = Adjustments()
    result, _ = prioritize([classified("critical", recommendation="apply_later")], adjustments)
    if result[0]["classification"]["recommendation"] != "apply_now":
        failures.append("P0 should force apply_now")
    _, errors = prioritize([{"id": "x", "verdict": "confirmed"}], Adjustments())
    if not errors:
        failures.append("missing classification should be an error")

    shutil.rmtree(root, ignore_errors=True)
    if failures:
        for failure in failures:
            print("FAIL: %s" % failure, file=sys.stderr)
        return 1
    total = len(cases) + 1 + len(scale_cases) + len(request_cases) + len(priority_cases) + 2
    print("check_dossier selftest: ok (%d cases)" % total)
    return 0


def main(argv):
    if argv[1:] == ["selftest"]:
        return _selftest()

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    check_cmd = sub.add_parser("check")
    check_cmd.add_argument("--in", dest="in_dir", required=True)
    check_cmd.add_argument("--root", required=True)
    check_cmd.add_argument("--out", required=True)
    check_cmd.add_argument("--adjustments", required=True)
    prio_cmd = sub.add_parser("prioritize")
    prio_cmd.add_argument("--in", dest="in_file", required=True)
    prio_cmd.add_argument("--out", required=True)
    prio_cmd.add_argument("--adjustments", required=True)
    args = parser.parse_args(argv[1:])

    adjustments = Adjustments()
    if args.command == "prioritize" and os.path.exists(args.adjustments):
        with open(args.adjustments, encoding="utf-8") as handle:
            adjustments.items = json.load(handle)

    if args.command == "check":
        result = check(args.in_dir, args.root, adjustments)
    else:
        try:
            with open(args.in_file, encoding="utf-8") as handle:
                dossiers = json.load(handle)
        except ValueError as error:
            print("unparseable input: %s" % error, file=sys.stderr)
            return 2
        result, errors = prioritize(dossiers, adjustments)
        if errors:
            for error in errors:
                print("ERROR: %s" % error, file=sys.stderr)
            return 2

    _write_json(args.out, result)
    _write_json(args.adjustments, adjustments.items)
    counts = {}
    for dossier in result:
        counts[dossier.get("verdict")] = counts.get(dossier.get("verdict"), 0) + 1
    print(json.dumps({"dossiers": len(result), "verdicts": counts, "adjustments": len(adjustments.items)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
