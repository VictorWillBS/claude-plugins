#!/usr/bin/env python3
"""design_source.py - reads the erural-product-design clone for the pixel-perfect skill.

The skill needs four answers before it can compare anything: where the product-design
clone is and whether it is current, which product folder the compared repository
implements, which canvas boards belong to a journey, and which app route maps to which
canvas page. They are answered here, with the standard library only, so the inference
is the same on every run.

  locate    PRODUCT_DESIGN_DIR or ERURAL_PRODUCT_DESIGN_DIR when set (read as it is), otherwise the skill's own clone in
            ~/.cache/design-conformance, cloned on first use and moved to origin's default
            branch or to --ref on every run
  infer     scores every products/<name> against the compared repository
  boards    lists the canvas boards of a product, optionally of some canvas pages,
            with size, platform, theme support and the journey documents
  props     lists the props of a screen component, with the states it can render
  routes    parses products/<name>/handoff/routes.md into JSON

Usage:
  design_source.py locate [--ref TAG_OR_COMMIT]
  design_source.py infer --pd DIR --repo DIR
  design_source.py boards --pd DIR --product NAME [--page ID_OR_NUMBER ...]
  design_source.py props --pd DIR --product NAME --component NAME
  design_source.py routes --pd DIR --product NAME
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys

REPO_NAME = "erural-product-design"
DEFAULT_REMOTE = "pastar-br/erural-product-design"
CACHE_DIR = os.path.expanduser("~/.cache/design-conformance")
TEXT_FILES = ("CLAUDE.md", "README.md", "AGENTS.md", "app.json", "package.json")
SPEC_EXTENSIONS = (".md", ".json")


def _git(cwd, *args):
    result = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def _is_clone(path):
    return os.path.isfile(os.path.join(path, "CLAUDE.md")) and os.path.isdir(os.path.join(path, "products"))


def _describe(path, source, ref=None):
    default = (_git(path, "symbolic-ref", "--short", "refs/remotes/origin/HEAD") or "origin/main").split("/", 1)[-1]
    behind = _git(path, "rev-list", "--count", "HEAD..origin/%s" % default)
    return {
        "found": True,
        "source": source,
        "path": path,
        "ref": ref or _git(path, "rev-parse", "--abbrev-ref", "HEAD"),
        "default_branch": default,
        "commit": _git(path, "rev-parse", "--short", "HEAD"),
        "commit_date": _git(path, "log", "-1", "--format=%cs"),
        "behind_origin": int(behind) if behind and behind.isdigit() else None,
        "dirty": bool(_git(path, "status", "--porcelain")),
    }


def locate(args):
    """PRODUCT_DESIGN_DIR (or ERURAL_PRODUCT_DESIGN_DIR, the apps' convention) is the person's own clone: read as it is, never touched. Otherwise the
    skill keeps its own clone in the cache and moves it to origin's default branch (or --ref)."""
    env = os.environ.get("PRODUCT_DESIGN_DIR") or os.environ.get("ERURAL_PRODUCT_DESIGN_DIR")
    if env:
        path = os.path.abspath(os.path.expanduser(env))
        if not _is_clone(path):
            print(json.dumps({"found": False, "error": "PRODUCT_DESIGN_DIR=%s não é um clone do %s" % (path, REPO_NAME)}, ensure_ascii=False))
            return 1
        _git(path, "fetch", "--quiet", "origin")
        print(json.dumps(_describe(path, "env"), ensure_ascii=False, indent=1))
        return 0
    path = os.path.join(CACHE_DIR, REPO_NAME)
    if not _is_clone(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        clone = subprocess.run(["gh", "repo", "clone", args.remote, path, "--", "--filter=blob:none", "--quiet"], capture_output=True, text=True)
        if clone.returncode != 0:
            print(json.dumps({"found": False, "error": "não consegui clonar %s: %s" % (args.remote, clone.stderr.strip()[:300])}, ensure_ascii=False))
            return 1
    if _git(path, "fetch", "--quiet", "--tags", "--force", "origin") is None:
        print(json.dumps({"found": False, "error": "git fetch falhou em %s" % path}, ensure_ascii=False))
        return 1
    _git(path, "remote", "set-head", "origin", "--auto")
    default = (_git(path, "symbolic-ref", "--short", "refs/remotes/origin/HEAD") or "origin/main").split("/", 1)[-1]
    target = args.ref or "origin/%s" % default
    if _git(path, "checkout", "--quiet", "--detach", "--force", target) is None:
        print(json.dumps({"found": False, "error": "a referência %s não existe no %s" % (target, REPO_NAME)}, ensure_ascii=False))
        return 1
    print(json.dumps(_describe(path, "cache", target), ensure_ascii=False, indent=1))
    return 0


def props(args):
    path = os.path.join(args.pd, "canvas", args.product, "artifact", "%s.dc.html" % args.component)
    if not os.path.isfile(path):
        print(json.dumps({"error": "componente %s não existe em %s" % (args.component, os.path.dirname(path))}, ensure_ascii=False))
        return 2
    declared = _board_props(path)
    out = {}
    for key, spec in declared.items():
        if key.startswith("$") or not isinstance(spec, dict):
            continue
        out[key] = {"editor": spec.get("editor"), "default": spec.get("default"), "options": spec.get("options")}
    print(json.dumps({"component": args.component, "props": out}, ensure_ascii=False, indent=1))
    return 0


def _products(pd):
    root = os.path.join(pd, "products")
    return sorted(name for name in os.listdir(root) if os.path.isdir(os.path.join(root, name)))


def _read(path, limit=200000):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read(limit)
    except OSError:
        return ""


def _app_routes(repo):
    routes = set()
    for app_dir in ("src/app", "app"):
        base = os.path.join(repo, app_dir)
        if not os.path.isdir(base):
            continue
        for dirpath, _, files in os.walk(base):
            for name in files:
                if not re.search(r"\.(tsx|ts|jsx|js)$", name) or name.startswith(("_", "+")) or "+api" in name:
                    continue
                rel = os.path.relpath(os.path.join(dirpath, name), base)
                parts = [p for p in re.sub(r"\.(tsx|ts|jsx|js)$", "", rel).split(os.sep) if not re.match(r"^\(.*\)$", p)]
                if parts and parts[-1] == "index":
                    parts = parts[:-1]
                routes.add("/" + "/".join(parts))
    return routes


def _design_routes(pd, product):
    text = _read(os.path.join(pd, "products", product, "handoff", "routes.md"))
    return set(re.findall(r"`(/[a-z0-9\-/\[\]]*)", text))


def _route_key(route):
    return re.sub(r"\[[^\]]+\]", "[]", route.rstrip("/") or "/")


def infer(args):
    repo = os.path.abspath(args.repo)
    repo_name = os.path.basename(_git(repo, "rev-parse", "--show-toplevel") or repo)
    remote = _git(repo, "remote", "get-url", "origin") or ""
    if remote:
        repo_name = re.sub(r"\.git$", "", remote.rstrip("/").split("/")[-1].split(":")[-1])
    texts = {name: _read(os.path.join(repo, name)) for name in TEXT_FILES}
    app_routes = {_route_key(r) for r in _app_routes(repo)}
    result = []
    for product in _products(args.pd):
        score, reasons = 0, []
        stem = re.sub(r"[-_](app|web|site|frontend|front|mobile|client)$", "", repo_name)
        if stem == product:
            score += 5
            reasons.append("nome do repositório %s corresponde a products/%s" % (repo_name, product))
        elif product in repo_name:
            score += 3
            reasons.append("nome do repositório %s contém %s" % (repo_name, product))
        for name, text in texts.items():
            if "products/%s" % product in text:
                score += 4
                reasons.append("%s cita products/%s" % (name, product))
            elif re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(product), text):
                score += 2
                reasons.append("%s cita %s" % (name, product))
        overlap = sorted(app_routes & {_route_key(r) for r in _design_routes(args.pd, product)})
        if overlap:
            score += min(len(overlap), 5)
            reasons.append("rotas em comum com handoff/routes.md: %s" % ", ".join(overlap[:8]))
        has_canvas = os.path.isfile(os.path.join(args.pd, "canvas", product, "artifact", "canvas.json"))
        result.append({"product": product, "score": score, "has_canvas": has_canvas, "reasons": reasons})
    result.sort(key=lambda item: -item["score"])
    top = [item for item in result if item["score"] == result[0]["score"]] if result else []
    decided = top[0]["product"] if len(top) == 1 and top[0]["score"] >= 4 else None
    print(json.dumps({"repo": repo_name, "decided": decided, "candidates": result}, ensure_ascii=False, indent=1))
    return 0 if decided else 3


def _board_props(path):
    text = _read(path, 20000000)
    match = re.search(r'data-props="([^"]*)"', text) or re.search(r"data-props='([^']*)'", text)
    if not match:
        return {}
    try:
        return json.loads(html.unescape(match.group(1)))
    except ValueError:
        return {}


def _platform(name, width):
    if re.search(r"(^|-)(mobile|phone|celular)(-|\.|$)", name):
        return "mobile"
    if re.search(r"(^|-)desktop(-|\.|$)", name):
        return "desktop"
    return "mobile" if width <= 480 else "desktop" if width >= 1024 else "other"


def _journey_docs(pd, product, page):
    docs = []
    if page.get("docs"):
        docs.append(page["docs"])
    folder = os.path.join("products", product, "journeys", page.get("key", ""))
    if page.get("key") and os.path.isdir(os.path.join(pd, folder)):
        for name in sorted(os.listdir(os.path.join(pd, folder))):
            rel = os.path.join(folder, name)
            if name.endswith(SPEC_EXTENSIONS) and rel not in docs:
                docs.append(rel)
    return docs


def boards(args):
    artifact = os.path.join(args.pd, "canvas", args.product, "artifact")
    canvas_path = os.path.join(artifact, "canvas.json")
    if not os.path.isfile(canvas_path):
        print(json.dumps({"error": "products/%s não tem canvas publicado em %s" % (args.product, canvas_path)}, ensure_ascii=False))
        return 2
    with open(canvas_path, encoding="utf-8") as handle:
        canvas = json.load(handle)
    pages_path = os.path.join(args.pd, "products", args.product, "pages.json")
    product_pages = []
    if os.path.isfile(pages_path):
        with open(pages_path, encoding="utf-8") as handle:
            product_pages = json.load(handle).get("pages", [])
    by_canvas = {p.get("canvas_page"): p for p in product_pages}
    names = {p["id"]: p["name"] for p in canvas.get("pages", [])}

    wanted = set()
    for value in args.page or []:
        for page_id, name in names.items():
            if value in (page_id, name) or name.split(" ", 1)[0] == value or by_canvas.get(page_id, {}).get("key") == value:
                wanted.add(page_id)
    if args.page and not wanted:
        print(json.dumps({"error": "nenhuma página do canvas corresponde a %s" % args.page, "pages": names}, ensure_ascii=False, indent=1))
        return 2

    pages = {}
    for page_id, name in names.items():
        if wanted and page_id not in wanted:
            continue
        meta = by_canvas.get(page_id, {})
        pages[page_id] = {
            "name": name,
            "key": meta.get("key"),
            "status": meta.get("status"),
            "docs": _journey_docs(args.pd, args.product, meta) if meta else [],
            "boards": [],
        }
    for board, info in sorted(canvas.get("boards", {}).items()):
        page_id = info.get("page")
        if page_id not in pages or not board.endswith(".dc.html"):
            continue
        props = _board_props(os.path.join(artifact, board))
        pages[page_id]["boards"].append({
            "board": board,
            "title": info.get("title"),
            "w": info.get("w"),
            "h": info.get("h"),
            "platform": _platform(board, info.get("w") or 0),
            "interactive": bool(info.get("is_interactive")),
            "themes": props.get("theme", {}).get("options", ["light"]) if isinstance(props.get("theme"), dict) else ["light"],
        })
    print(json.dumps({"artifact": artifact, "pages": pages}, ensure_ascii=False, indent=1))
    return 0


def routes(args):
    path = os.path.join(args.pd, "products", args.product, "handoff", "routes.md")
    text = _read(path)
    if not text:
        print(json.dumps({"error": "sem %s" % path}, ensure_ascii=False))
        return 2
    rows, header = [], None
    for line in text.splitlines():
        if not line.startswith("|"):
            header = None if not line.strip() else header
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            header = cells
            continue
        if set("".join(cells)) <= set("-: "):
            continue
        row = dict(zip(header, cells))
        row["paths"] = re.findall(r"`(/[^`]*)`", cells[0])
        rows.append(row)
    print(json.dumps({"source": os.path.relpath(path, args.pd), "routes": rows}, ensure_ascii=False, indent=1))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("locate")
    p.add_argument("--ref", help="tag, branch ou commit do product-design (padrão: a branch padrão de origin)")
    p.add_argument("--remote", default=DEFAULT_REMOTE)
    p.set_defaults(func=locate)
    p = sub.add_parser("props")
    p.add_argument("--pd", required=True)
    p.add_argument("--product", required=True)
    p.add_argument("--component", required=True)
    p.set_defaults(func=props)
    p = sub.add_parser("infer")
    p.add_argument("--pd", required=True)
    p.add_argument("--repo", required=True)
    p.set_defaults(func=infer)
    p = sub.add_parser("boards")
    p.add_argument("--pd", required=True)
    p.add_argument("--product", required=True)
    p.add_argument("--page", action="append")
    p.set_defaults(func=boards)
    p = sub.add_parser("routes")
    p.add_argument("--pd", required=True)
    p.add_argument("--product", required=True)
    p.set_defaults(func=routes)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
