import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

import check_rustore_public as probe


URL = probe.public_url(probe.PACKAGE)


def card(name=probe.APP_NAME, package=probe.PACKAGE, install=True, in_stock=True):
    app = {
        "@type": "SoftwareApplication", "name": name, "operatingSystem": "Android",
        "softwareVersion": "1.0", "installUrl": "https://www.rustore.ru/instruction?utm_campaign=" + package,
        "offers": [{"availability": "https://schema.org/" + ("InStock" if in_stock else "OutOfStock")}],
    }
    link = ('<a data-testid="deepLinkButton" href="' + app["installUrl"] + '">Установить</a>') if install else ""
    return ('<html><head><link rel="canonical" href="' + URL + '"></head><body>'
            '<script type="application/ld+json">' + json.dumps({"@graph": [app]}, ensure_ascii=False)
            + '</script>' + link + '</body></html>')


class PublicCardTests(unittest.TestCase):
    def classify(self, html, status=200, final_url=URL):
        return probe.classify_response(status, final_url, "text/html; charset=utf-8", html)

    def test_matching_public_installable_card(self):
        self.assertEqual(self.classify(card())[0], "available")

    def test_real_rustore_relative_install_link(self):
        html = card().replace('href="https://www.rustore.ru/instruction?', 'href="/instruction?')
        self.assertEqual(self.classify(html)[0], "available")

    def test_sanitized_observed_published_card_schema(self):
        captured = Path(__file__).parent / "fixtures" / "published-card.sanitized.html"
        self.assertEqual(probe.classify_response(200, probe.public_url("ru.rostel"),
                         "text/html", captured.read_text(encoding="utf-8"),
                         "ru.rostel", "Госуслуги")[0], "available")

    def test_404_not_available_even_if_body_has_recommendations(self):
        self.assertEqual(self.classify(card(), status=404)[0], "not_found")

    def test_http_200_generic_homepage_not_available(self):
        self.assertEqual(self.classify("<h1>RuStore</h1><a>Скачать RuStore</a>")[0], "unknown")

    def test_wrong_app_not_available(self):
        self.assertEqual(self.classify(card(name="Другое приложение"))[0], "unknown")

    def test_wrong_package_in_install_metadata_not_available(self):
        self.assertEqual(self.classify(card(package="com.example.other"))[0], "unknown")

    def test_foreign_install_domain_not_available(self):
        html = card().replace("https://www.rustore.ru/instruction?", "https://example.org/instruction?")
        self.assertEqual(self.classify(html)[0], "unknown")

    def test_invalid_install_port_not_available(self):
        html = card().replace("https://www.rustore.ru/instruction?", "https://www.rustore.ru:invalid/instruction?")
        self.assertEqual(self.classify(html)[0], "unknown")

    def test_malformed_jsonld_not_available(self):
        html = card().replace('"@graph":', '"@graph" broken:')
        self.assertEqual(self.classify(html)[0], "unknown")

    def test_wrong_canonical_not_available(self):
        self.assertEqual(self.classify(card().replace(URL, probe.public_url("com.example.other")))[0], "unknown")

    def test_no_install_button_not_available(self):
        self.assertEqual(self.classify(card(install=False))[0], "unknown")

    def test_no_in_stock_offer_not_available(self):
        self.assertEqual(self.classify(card(in_stock=False))[0], "unknown")

    def test_login_redirect_not_available(self):
        self.assertEqual(self.classify(card(), final_url="https://www.rustore.ru/login")[0], "unknown")

    def test_login_page_with_http_200_not_available(self):
        self.assertEqual(self.classify("<h1>Войдите, чтобы продолжить</h1>" + card())[0], "unknown")

    def test_bot_page_not_available(self):
        self.assertEqual(self.classify("<h1>У вас большие запросы!</h1>" + card())[0], "unknown")

    def test_http_failure_not_available(self):
        self.assertEqual(self.classify(card(), status=503)[0], "unknown")

    def test_network_failure_not_available(self):
        with patch("check_rustore_public.build_opener") as opener:
            opener.return_value.open.side_effect = URLError("Synthetic unavailable network")
            result = probe.check_public_card()
        self.assertFalse(result["available"])
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(result["reason"], "network_or_tls_error")

    def test_atomic_unknown_overwrites_old_true(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "availability.json"
            probe.write_atomic(target, {"available": True})
            probe.write_atomic(target, {"available": False, "status": "unknown"})
            self.assertFalse(json.loads(target.read_text(encoding="utf-8"))["available"])
            self.assertEqual(len(list(Path(directory).iterdir())), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
