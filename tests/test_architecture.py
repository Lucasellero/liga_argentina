"""
Tests to validate the refactored static architecture:
- common.css is referenced by all HTML files
- JS is extracted to external files (no large inline scripts)
- External files exist and have reasonable size
- <style> blocks in HTML are empty
- Hash-based routing is implemented (switchSection updates hash, initApp reads it)
"""

import os
import re
import unittest
from pathlib import Path

DOCS = Path(__file__).parent.parent / "docs"
SHARED = DOCS / "shared"

LIGAS = [
    {
        "name": "liga_argentina",
        "html": DOCS / "liga_argentina" / "index.html",
        "js": DOCS / "liga_argentina" / "liga_argentina.js",
        "css_ref": "../shared/common.css",
        "js_ref": "liga_argentina.js",
    },
    {
        "name": "liga_nacional",
        "html": DOCS / "liga_nacional" / "index.html",
        "js": DOCS / "liga_nacional" / "liga_nacional.js",
        "css_ref": "../shared/common.css",
        "js_ref": "liga_nacional.js",
    },
    {
        "name": "liga_proximo",
        "html": DOCS / "liga_proximo" / "index.html",
        "js": DOCS / "liga_proximo" / "liga_proximo.js",
        "css_ref": "../shared/common.css",
        "js_ref": "liga_proximo.js",
    },
    {
        "name": "liga_femenina",
        "html": DOCS / "liga_femenina" / "index.html",
        "js": DOCS / "liga_femenina" / "liga_femenina.js",
        "css_ref": "../shared/common.css",
        "js_ref": "liga_femenina.js",
    },
]

MIN_JS_LINES = 3000   # each JS file should have at least this many lines
MAX_HTML_LINES = 2000  # HTML should now be well under this
MIN_CSS_LINES = 500    # common.css should be substantial


class TestExternalFilesExist(unittest.TestCase):
    def test_common_css_exists(self):
        self.assertTrue((SHARED / "common.css").exists(), "shared/common.css missing")

    def test_common_css_size(self):
        lines = (SHARED / "common.css").read_text().splitlines()
        self.assertGreater(len(lines), MIN_CSS_LINES,
                           f"common.css has only {len(lines)} lines, expected >{MIN_CSS_LINES}")

    def test_js_files_exist(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                self.assertTrue(liga["js"].exists(),
                                f"{liga['js']} does not exist")

    def test_js_files_size(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                lines = liga["js"].read_text().splitlines()
                self.assertGreater(len(lines), MIN_JS_LINES,
                                   f"{liga['name']}.js has {len(lines)} lines, expected >{MIN_JS_LINES}")

    def test_html_files_exist(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                self.assertTrue(liga["html"].exists(),
                                f"{liga['html']} does not exist")


class TestHTMLReferences(unittest.TestCase):
    def _read(self, liga):
        return liga["html"].read_text()

    def test_css_link_present(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = self._read(liga)
                expected = f'href="{liga["css_ref"]}"'
                self.assertIn(expected, content,
                              f'{liga["name"]}: missing <link href="{liga["css_ref"]}">')

    def test_js_script_src_present(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = self._read(liga)
                expected = f'src="{liga["js_ref"]}"'
                self.assertIn(expected, content,
                              f'{liga["name"]}: missing <script src="{liga["js_ref"]}">')

    def test_no_large_inline_script(self):
        """The main <script> block must be gone; no inline block should exceed 50 lines."""
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = self._read(liga)
                # Find all inline script blocks (no src attribute)
                blocks = re.findall(r'<script(?![^>]*\bsrc\b)[^>]*>(.*?)</script>',
                                    content, re.DOTALL)
                for block in blocks:
                    line_count = len(block.splitlines())
                    self.assertLessEqual(
                        line_count, 50,
                        f'{liga["name"]}: inline <script> block has {line_count} lines — JS not fully extracted'
                    )

    def test_style_block_is_empty(self):
        """The inline <style> block should contain no real CSS rules."""
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = self._read(liga)
                blocks = re.findall(r'<style>(.*?)</style>', content, re.DOTALL)
                for block in blocks:
                    stripped = block.strip()
                    self.assertEqual(
                        stripped, "",
                        f'{liga["name"]}: <style> block still has {len(stripped.splitlines())} lines of CSS'
                    )


class TestHTMLSize(unittest.TestCase):
    def test_html_line_count(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                lines = liga["html"].read_text().splitlines()
                self.assertLess(len(lines), MAX_HTML_LINES,
                                f'{liga["name"]} HTML has {len(lines)} lines, expected <{MAX_HTML_LINES}')


class TestHashRouting(unittest.TestCase):
    def test_switch_section_updates_hash(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = liga["js"].read_text()
                self.assertIn("history.replaceState",
                              content,
                              f"{liga['name']}.js: switchSection must call history.replaceState")

    def test_hash_uses_group_prefix(self):
        """Sub-sections should produce group/section format (e.g. jugadores/j-radar)."""
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = liga["js"].read_text()
                self.assertIn("_grpName + '/' + id",
                              content,
                              f"{liga['name']}.js: hash must use group/section format")

    def test_initapp_reads_hash_on_load(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = liga["js"].read_text()
                self.assertIn("window.location.hash.slice(1)",
                              content,
                              f"{liga['name']}.js: initApp().then() must read the hash on load")

    def test_hash_reader_parses_nested(self):
        """Hash reader must handle both 'section' and 'group/section' formats."""
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = liga["js"].read_text()
                self.assertIn("_h.includes('/')",
                              content,
                              f"{liga['name']}.js: hash reader must handle group/section format")

    def test_initapp_chains_then(self):
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = liga["js"].read_text()
                self.assertIn("initApp().then(",
                              content,
                              f"{liga['name']}.js: initApp must be called with .then() for hash handling")

    def test_programmatic_button_activation(self):
        """switchSection should find the active tab button via DOM, not only via event."""
        for liga in LIGAS:
            with self.subTest(liga=liga["name"]):
                content = liga["js"].read_text()
                self.assertIn("getAttribute('onclick')",
                              content,
                              f"{liga['name']}.js: programmatic button activation missing")


class TestWorkflowSafety(unittest.TestCase):
    """Ensure the GitHub Actions scraper workflow is untouched."""

    WORKFLOW = Path(__file__).parent.parent / ".github" / "workflows" / "scraper.yml"

    def test_workflow_exists(self):
        self.assertTrue(self.WORKFLOW.exists(), "scraper.yml workflow missing")

    def test_workflow_does_not_touch_html(self):
        content = self.WORKFLOW.read_text()
        # The workflow should not write to any .html file
        self.assertNotRegex(content, r'\.html',
                            "scraper.yml references an HTML file — unexpected")


if __name__ == "__main__":
    unittest.main(verbosity=2)
