#!/usr/bin/env python3
"""Read public RuStore HTML; never treat an HTTP 200 alone as publication.

Stdlib only. No credentials, store writes, or CAPTCHA bypass. The optional output
is a public JSON file. It is replaced atomically, including on unknown results.
"""

import argparse
import datetime
import json
import os
from pathlib import Path
import re
import tempfile
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_BODY_BYTES = 3_000_000
PUBLIC_HOSTS = {"www.rustore.ru", "rustore.ru"}
PACKAGE = "ru.sintagma.app"
APP_NAME = "СИНТАГМА"


def public_url(package):
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", package):
        raise ValueError("Invalid Android package name")
    return "https://www.rustore.ru/catalog/app/" + package


def normalize_name(value):
    return " ".join(str(value).split()).casefold()


def is_expected_card_url(url, package):
    if not isinstance(url, str):
        return False
    try:
        parsed = urlsplit(url)
        return (parsed.scheme == "https" and parsed.hostname in PUBLIC_HOSTS
                and parsed.port in (None, 443)
                and parsed.path.rstrip("/") == "/catalog/app/" + package
                and not parsed.query and not parsed.fragment)
    except ValueError:
        return False


def is_matching_install_url(url, package):
    if not isinstance(url, str):
        return False
    try:
        parsed = urlsplit(url)
        return (parsed.scheme == "https" and parsed.hostname in PUBLIC_HOSTS
                and parsed.port in (None, 443)
                and parsed.path == "/instruction"
                and parse_qs(parsed.query).get("utm_campaign") == [package])
    except ValueError:
        return False


class CardHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.jsonld = []
        self._json_parts = None
        self.canonicals = []
        self.install_links = []
        self._install_parts = None
        self._install_href = None
        self.visible_text = []
        self._hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self._hidden_depth += 1
        if tag == "script" and attrs.get("type", "").casefold() == "application/ld+json":
            self._json_parts = []
        if tag == "link" and attrs.get("rel", "").casefold() == "canonical":
            self.canonicals.append(attrs.get("href", ""))
        if tag == "a" and attrs.get("data-testid") == "deepLinkButton":
            self._install_href = attrs.get("href", "")
            self._install_parts = []

    def handle_data(self, data):
        if self._json_parts is not None:
            self._json_parts.append(data)
        if self._install_parts is not None:
            self._install_parts.append(data)
        if self._hidden_depth == 0:
            self.visible_text.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._json_parts is not None:
            self.jsonld.append("".join(self._json_parts))
            self._json_parts = None
        if tag in ("script", "style") and self._hidden_depth:
            self._hidden_depth -= 1
        if tag == "a" and self._install_parts is not None:
            self.install_links.append((self._install_href, " ".join(self._install_parts)))
            self._install_parts = self._install_href = None


def software_applications(value):
    """Inspect root/@graph only; do not accept unrelated recommendation cards."""
    roots = value if isinstance(value, list) else [value]
    for root in roots:
        if not isinstance(root, dict):
            continue
        if root.get("@type") == "SoftwareApplication":
            yield root
        graph = root.get("@graph", [])
        if isinstance(graph, list):
            for node in graph:
                if isinstance(node, dict) and node.get("@type") == "SoftwareApplication":
                    yield node


def classify_response(status, final_url, content_type, html, package=PACKAGE, app_name=APP_NAME):
    """Return (state, reason). 'unknown' always leaves availability false."""
    if not is_expected_card_url(final_url, package):
        return "unknown", "redirected_away_from_expected_public_card"
    if "text/html" not in content_type.casefold():
        return "unknown", "unexpected_content_type"
    parser = CardHTML()
    try:
        parser.feed(html)
    except Exception:
        return "unknown", "unparseable_html"
    visible = normalize_name(" ".join(parser.visible_text))
    challenge_markers = (
        "у вас большие запросы", "проверка браузера", "verify you are human",
        "checking your browser", "captcha", "ошибка 429", "доступ запрещен",
        "доступ запрещён", "войдите, чтобы продолжить", "войдите для продолжения",
    )
    if any(marker in visible for marker in challenge_markers):
        return "unknown", "challenge_or_login_page"
    if status in (404, 410):
        return "not_found", "public_card_http_" + str(status)
    if status != 200:
        return "unknown", "public_card_http_" + str(status)
    if not any(is_expected_card_url(url, package) for url in parser.canonicals):
        return "unknown", "expected_canonical_missing"
    if not any(is_matching_install_url(urljoin(public_url(package), url), package)
               and "установить" in normalize_name(label)
               for url, label in parser.install_links):
        return "unknown", "matching_install_action_missing"
    for text in parser.jsonld:
        try:
            data = json.loads(text)
        except (TypeError, ValueError):
            continue
        for app in software_applications(data):
            offers = app.get("offers", [])
            offers = offers if isinstance(offers, list) else [offers]
            in_stock = any(isinstance(offer, dict)
                           and offer.get("availability") == "https://schema.org/InStock"
                           for offer in offers)
            if (normalize_name(app.get("name", "")) == normalize_name(app_name)
                    and "android" in normalize_name(app.get("operatingSystem", ""))
                    and bool(str(app.get("softwareVersion", "")).strip())
                    and is_matching_install_url(app.get("installUrl", ""), package)
                    and in_stock):
                return "available", "matching_public_card_and_install_action"
    return "unknown", "matching_installable_software_metadata_missing"


class PublicOnlyRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in PUBLIC_HOSTS:
            raise HTTPError(newurl, code, "Redirect outside official HTTPS RuStore rejected", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check_public_card(package=PACKAGE, app_name=APP_NAME, timeout=15):
    url = public_url(package)
    result = {
        "schemaVersion": 1,
        "packageName": package,
        "url": url,
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "unknown",
        "available": False,
        "reason": "not_checked",
    }
    request = Request(url, headers={"User-Agent": "SINTAGMA-Public-Card-Check/1.0", "Accept": "text/html"})
    opener = build_opener(PublicOnlyRedirects())
    try:
        try:
            response = opener.open(request, timeout=timeout)
        except HTTPError as error:
            response = error
        with response:
            status = response.code
            final_url = response.geturl()
            content_type = response.headers.get("Content-Type", "")
            body = response.read(MAX_BODY_BYTES + 1)
        result["httpStatus"] = status
        if len(body) > MAX_BODY_BYTES:
            result["reason"] = "response_too_large"
            return result
        html = body.decode("utf-8", errors="replace")
        state, reason = classify_response(status, final_url, content_type, html, package, app_name)
        result.update(status=state, reason=reason, available=state == "available")
    except (URLError, TimeoutError, OSError, ValueError) as error:
        result["reason"] = "network_or_tls_error"
        result["errorType"] = type(error).__name__
    return result


def write_atomic(path, value):
    path = Path(path)
    if not path.parent.is_dir():
        raise ValueError("Output parent must already exist")
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n",
                                         prefix=".rustore-", suffix=".json", dir=path.parent,
                                         delete=False) as stream:
            temp_path = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp_path, 0o644)
        os.replace(temp_path, path)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="Atomic public JSON output; existing parent directory required")
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 30:
        parser.error("timeout must be between 1 and 30 seconds")
    result = check_public_card(timeout=args.timeout)
    if args.output:
        write_atomic(args.output, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
