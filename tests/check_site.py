from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PAGES = sorted(ROOT.glob("*.html"))


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        for name in ("href", "src"):
            value = values.get(name)
            if value:
                self.references.append(value)


errors: list[str] = []
for page in PAGES:
    parser = PageParser()
    parser.feed(page.read_text(encoding="utf-8"))
    duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
    if duplicates:
        errors.append(f"{page.name}: IDs repetidos: {', '.join(duplicates)}")

    for reference in parser.references:
        parts = urlsplit(reference)
        if parts.scheme or reference.startswith("//"):
            continue
        if not parts.path and not parts.fragment:
            continue
        target = page.resolve() if not parts.path else (page.parent / unquote(parts.path)).resolve()
        if not target.is_relative_to(ROOT):
            errors.append(f"{page.name}: ruta fuera del sitio: {reference}")
            continue
        if not target.exists():
            errors.append(f"{page.name}: recurso inexistente: {reference}")
            continue
        if parts.fragment and target.suffix.lower() == ".html":
            target_parser = PageParser()
            target_parser.feed(target.read_text(encoding="utf-8"))
            if unquote(parts.fragment) not in target_parser.ids:
                errors.append(f"{page.name}: destino inexistente: {reference}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print(f"OK: {len(PAGES)} páginas revisadas; rutas locales, fragmentos e IDs sin errores.")
