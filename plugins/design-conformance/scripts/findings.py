#!/usr/bin/env python3
"""findings.py - enforces the countable rules of the pixel-perfect skill.

The product design is the law, so a finding only exists when it points at the design
(a board of the canvas or a line of a product document) and carries evidence produced by
the run (a crop, a screenshot or a flow log). Severity is judged by the model with
references/scales.md; priority is not: it is computed here, the same way on every run.

  check   validates every finding, moves the ones without design source or evidence to
          `rejected` (with the reason), computes the priority and writes them sorted

Usage:
  findings.py check --in FINDINGS.json --run RUN_DIR --pd PRODUCT_DESIGN_DIR --artifact ARTIFACT_DIR --out FINAL.json
  findings.py selftest
"""

import argparse
import json
import os
import re
import sys
import tempfile

CATEGORIES = ("flow", "use_case", "state", "copy", "layout", "typography", "color", "component", "interaction", "accessibility")
SEVERITIES = ("critical", "high", "medium", "low")
REACHES = ("screen", "journey", "global")
PATHS = ("happy", "variation")
COSTS = ("low", "medium", "high")
KINDS = ("deviation", "design_gap")
SEVERITY_START = {"critical": 0, "high": 1, "medium": 2, "low": 3}
SEVERITY_ORDER = {s: i for i, s in enumerate(SEVERITIES)}
REACH_ORDER = {"global": 0, "journey": 1, "screen": 2}
DOC_RE = re.compile(r"^(?P<path>[^:\s]+?)(?::(?P<line>\d+)(?:-\d+)?)?$")
REQUIRED = ("id", "title", "kind", "screens", "design_ref", "expected", "observed", "evidence")
REQUIRED_DEVIATION = ("category", "severity", "reach", "path", "recommendation")


class Invalid(Exception):
    pass


def _line_count(path):
    with open(path, "rb") as handle:
        return sum(1 for _ in handle)


def _doc_exists(pd, ref):
    match = DOC_RE.match(ref or "")
    if not match:
        return False
    path = os.path.join(pd, match.group("path"))
    if not os.path.isfile(path):
        return False
    return not match.group("line") or 1 <= int(match.group("line")) <= max(_line_count(path), 1)


def _flows(run):
    capture = os.path.join(run, "capture.json")
    if not os.path.isfile(capture):
        return set()
    with open(capture, encoding="utf-8") as handle:
        return {flow["id"] for flow in json.load(handle).get("flows", [])}


def _evidence_ok(run, item, flows):
    if item.startswith("capture.json#"):
        return item.split("#", 1)[1] in flows
    path = os.path.normpath(os.path.join(run, item))
    return path.startswith(os.path.normpath(run) + os.sep) and os.path.isfile(path)


def _validate_shape(finding):
    missing = [k for k in REQUIRED if finding.get(k) in (None, "", [], {})]
    if finding.get("kind") not in KINDS:
        raise Invalid("%s: kind deve ser um de %s" % (finding.get("id"), KINDS))
    if finding["kind"] == "deviation":
        missing += [k for k in REQUIRED_DEVIATION if finding.get(k) in (None, "", [], {})]
    elif not finding.get("question"):
        missing.append("question")
    if missing:
        raise Invalid("%s: faltam %s" % (finding.get("id"), ", ".join(missing)))
    if finding["kind"] == "deviation":
        for key, allowed in (("category", CATEGORIES), ("severity", SEVERITIES), ("reach", REACHES), ("path", PATHS)):
            if finding[key] not in allowed:
                raise Invalid("%s: %s=%r fora de %s" % (finding["id"], key, finding[key], allowed))
        rec = finding["recommendation"]
        if not isinstance(rec, dict) or not rec.get("action") or rec.get("cost") not in COSTS:
            raise Invalid("%s: recommendation precisa de action e cost em %s" % (finding["id"], COSTS))
    if not isinstance(finding["design_ref"], dict) or not (finding["design_ref"].get("board") or finding["design_ref"].get("doc")):
        raise Invalid("%s: design_ref precisa de board ou doc" % finding["id"])


def priority(finding):
    level = SEVERITY_START[finding["severity"]]
    if finding["severity"] == "high" and finding["path"] == "happy":
        level = 0
    if finding["reach"] == "global":
        level -= 1
    return "P%d" % min(max(level, 0), 3)


def check(args):
    if not os.path.isfile(args.input):
        raise Invalid("não existe %s" % args.input)
    with open(args.input, encoding="utf-8") as handle:
        findings = json.load(handle).get("findings", [])
    run = os.path.abspath(args.run)
    flows = _flows(run)
    ids = [f.get("id") for f in findings]
    if len(set(ids)) != len(ids):
        raise Invalid("ids repetidos")
    accepted, gaps, rejected = [], [], []
    for finding in findings:
        _validate_shape(finding)
        reasons = []
        ref = finding["design_ref"]
        if ref.get("board") and not os.path.isfile(os.path.join(args.artifact, ref["board"])):
            reasons.append("quadro %s não existe no canvas" % ref["board"])
        if ref.get("doc") and not _doc_exists(args.pd, ref["doc"]):
            reasons.append("documento %s não existe no product-design ou a linha passa do fim" % ref["doc"])
        bad = [item for item in finding["evidence"] if not _evidence_ok(run, item, flows)]
        if bad:
            reasons.append("evidência inexistente: %s" % ", ".join(bad))
        if reasons:
            rejected.append({"id": finding["id"], "title": finding["title"], "reasons": reasons})
            continue
        if finding["kind"] == "design_gap":
            gaps.append(finding)
            continue
        finding["priority"] = priority(finding)
        accepted.append(finding)
    accepted.sort(key=lambda f: (f["priority"], SEVERITY_ORDER[f["severity"]], REACH_ORDER[f["reach"]], f["id"]))
    counts = {p: sum(1 for f in accepted if f["priority"] == p) for p in ("P0", "P1", "P2", "P3")}
    result = {"findings": accepted, "design_gaps": gaps, "rejected": rejected, "counts": counts}
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=1)
    print(json.dumps({"accepted": len(accepted), "design_gaps": len(gaps), "rejected": len(rejected), "priority": counts}, ensure_ascii=False))
    return 0


def selftest(_args):
    with tempfile.TemporaryDirectory() as tmp:
        pd, art, run = (os.path.join(tmp, d) for d in ("pd", "art", "run"))
        for d in (os.path.join(pd, "docs"), art, os.path.join(run, "crops")):
            os.makedirs(d)
        open(os.path.join(pd, "docs", "spec.md"), "w").write("a\nb\nc\n")
        open(os.path.join(art, "board.dc.html"), "w").write("<html>")
        open(os.path.join(run, "crops", "e01.png"), "wb").write(b"png")
        json.dump({"flows": [{"id": "flow-a"}]}, open(os.path.join(run, "capture.json"), "w"))
        base = {"kind": "deviation", "screens": ["s"], "expected": "e", "observed": "o", "category": "typography",
                "severity": "medium", "reach": "screen", "path": "happy", "recommendation": {"action": "a", "cost": "low"},
                "design_ref": {"board": "board.dc.html"}, "evidence": ["crops/e01.png"]}
        cases = [
            dict(base, id="ok-medium", title="t"),
            dict(base, id="high-happy", title="t", severity="high"),
            dict(base, id="high-variation", title="t", severity="high", path="variation"),
            dict(base, id="low-global", title="t", severity="low", reach="global"),
            dict(base, id="critical-global", title="t", severity="critical", reach="global"),
            dict(base, id="no-board", title="t", design_ref={"board": "missing.dc.html"}),
            dict(base, id="doc-line-past-end", title="t", design_ref={"doc": "docs/spec.md:9"}),
            dict(base, id="doc-ok", title="t", design_ref={"doc": "docs/spec.md:2"}, evidence=["capture.json#flow-a"]),
            dict(base, id="no-evidence", title="t", evidence=["crops/nope.png"]),
            dict(base, id="escape", title="t", evidence=["../pd/docs/spec.md"]),
            {"id": "gap", "title": "t", "kind": "design_gap", "screens": ["s"], "design_ref": {"board": "board.dc.html"},
             "expected": "e", "observed": "o", "evidence": ["crops/e01.png"], "question": "q"},
        ]
        src = os.path.join(tmp, "findings.json")
        out = os.path.join(tmp, "final.json")
        json.dump({"findings": cases}, open(src, "w"))
        ns = argparse.Namespace(input=src, run=run, pd=pd, artifact=art, out=out)
        sys.stdout = open(os.devnull, "w")
        try:
            check(ns)
        finally:
            sys.stdout = sys.__stdout__
        result = json.load(open(out))
        got = {f["id"]: f["priority"] for f in result["findings"]}
        expected = {"ok-medium": "P2", "high-happy": "P0", "high-variation": "P1", "low-global": "P2", "critical-global": "P0", "doc-ok": "P2"}
        assert got == expected, got
        assert {r["id"] for r in result["rejected"]} == {"no-board", "doc-line-past-end", "no-evidence", "escape"}, result["rejected"]
        assert [g["id"] for g in result["design_gaps"]] == ["gap"]
        json.dump({"findings": [dict(base, id="bad", title="t", severity="huge")]}, open(src, "w"))
        try:
            check(ns)
        except Invalid:
            pass
        else:
            raise AssertionError("severidade inválida passou")
    print("selftest ok")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("check")
    p.add_argument("--in", dest="input", required=True)
    p.add_argument("--run", required=True)
    p.add_argument("--pd", required=True)
    p.add_argument("--artifact", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(func=check)
    p = sub.add_parser("selftest")
    p.set_defaults(func=selftest)
    args = parser.parse_args()
    try:
        return args.func(args)
    except Invalid as error:
        print("findings: %s" % error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
