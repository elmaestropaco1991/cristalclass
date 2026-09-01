#!/usr/bin/env python3
"""Extract the remaining official Andalusian Primary curricula from BOJA.

The generated catalog is committed to the application, so teachers do not need
network access. This development-only verifier refuses every PDF except the
authenticated disposition identified by CVE 00284747.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber


EXPECTED_SHA256 = "3ace14f41e8ff7a8aa509049291afc506982fca41ce848e9e2daac08c1ce927e"
EXPECTED_PAGES = 208
TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
}
DESCRIPTOR_PREFIXES = r"(?:CCL|CP|STEM|CD|CPSAA|CC|CE|CCEC)"


@dataclass(frozen=True)
class AreaConfig:
    code: str
    name: str
    competence_count: int
    knowledge_pages: tuple[int, int]
    criteria_pages: tuple[int, int]
    area_pages: tuple[int, int]
    section_headings: tuple[str, ...]
    expected_knowledge_counts: tuple[int, int, int]
    expected_criteria_counts: tuple[int, int, int, int, int, int]
    expected_relation_count: int


# Page indexes are zero based; published PDF page ranges below are one based.
AREA_CONFIGS = (
    AreaConfig(
        code="CMN",
        name="Conocimiento del Medio Natural, Social y Cultural",
        competence_count=9,
        knowledge_pages=(30, 37),
        criteria_pages=(37, 52),
        area_pages=(26, 53),
        section_headings=(
            "A. Cultura científica.",
            "B. Tecnología y digitalización.",
            "C. Sociedades y territorios.",
        ),
        expected_knowledge_counts=(44, 48, 49),
        expected_criteria_counts=(22, 22, 22, 22, 23, 23),
        expected_relation_count=436,
    ),
    AreaConfig(
        code="EAR",
        name="Educación Artística",
        competence_count=4,
        knowledge_pages=(56, 60),
        criteria_pages=(60, 66),
        area_pages=(54, 67),
        section_headings=(
            "A. Recepción y análisis.",
            "B. Creación e interpretación.",
            "C. Artes plásticas, visuales y audiovisuales.",
            "D. Música y artes escénicas y performativas.",
        ),
        expected_knowledge_counts=(27, 34, 36),
        expected_criteria_counts=(10, 10, 10, 10, 11, 11),
        expected_relation_count=466,
    ),
    AreaConfig(
        code="EFI",
        name="Educación Física",
        competence_count=5,
        knowledge_pages=(71, 75),
        criteria_pages=(75, 84),
        area_pages=(68, 85),
        section_headings=(
            "A. Vida activa y saludable.",
            "B. Organización y gestión de la actividad física.",
            "C. Resolución de problemas en situaciones motrices.",
            "D. Autorregulación emocional e interacción social en situaciones motrices.",
            "E. Manifestaciones de la cultura motriz.",
            "F. Interacción eficiente y sostenible con el entorno.",
        ),
        expected_knowledge_counts=(26, 27, 29),
        expected_criteria_counts=(14, 14, 14, 14, 14, 14),
        expected_relation_count=240,
    ),
    AreaConfig(
        code="LEX",
        name="Primera y Segunda Lengua Extranjera",
        competence_count=6,
        knowledge_pages=(122, 125),
        criteria_pages=(125, 135),
        area_pages=(118, 136),
        section_headings=(
            "A. Comunicación.",
            "B. Plurilingüismo.",
            "C. Interculturalidad.",
        ),
        expected_knowledge_counts=(16, 22, 24),
        expected_criteria_counts=(13, 13, 15, 15, 15, 15),
        expected_relation_count=286,
    ),
    AreaConfig(
        code="MAT",
        name="Matemáticas",
        competence_count=8,
        knowledge_pages=(141, 149),
        criteria_pages=(149, 159),
        area_pages=(136, 160),
        section_headings=(
            "A. Sentido numérico.",
            "B. Sentido de la medida.",
            "C. Sentido espacial.",
            "D. Sentido algebraico.",
            "E. Sentido estocástico.",
            "F. Sentido socioafectivo.",
        ),
        expected_knowledge_counts=(56, 68, 69),
        expected_criteria_counts=(17, 17, 16, 17, 17, 17),
        expected_relation_count=410,
    ),
)


def normalize_cell(value: str) -> str:
    value = value.replace("\u00ad", "")
    value = re.sub(r"-\n(?=\w)", "", value)
    return re.sub(r"\s+", " ", value).strip()


def canonicalize_known_code_anomalies(value: str) -> str:
    """Normalize only pinned punctuation anomalies needed to resolve identities."""
    return (
        value.replace("LEX.1.B1.", "LEX.1.B.1.")
        .replace("LEX.3.A10.", "LEX.3.A.10.")
    )


def knowledge_pattern(code: str, cycle: int) -> re.Pattern[str]:
    return re.compile(rf"{code}\.{cycle}\.[A-F](?:\.\d+){{1,2}}\.")


def relation_codes(value: str, code: str) -> list[str]:
    normalized = canonicalize_known_code_anomalies(normalize_cell(value))
    return re.findall(rf"{code}\.\d\.[A-F](?:\.\d+){{1,2}}(?!\.\d)", normalized)


def extract_knowledge(
    pdf: pdfplumber.PDF,
    config: AreaConfig,
) -> dict[int, list[dict[str, str]]]:
    cycle_text = ["", "", ""]
    for page_index in range(config.knowledge_pages[0], config.knowledge_pages[1] + 1):
        tables = pdf.pages[page_index].extract_tables(TABLE_SETTINGS)
        if not tables:
            raise RuntimeError(f"Missing {config.code} table on PDF page {page_index + 1}.")
        for table in tables:
            for row in table:
                if any("Competencias específicas" in (cell or "") for cell in row):
                    continue
                for column, cell in enumerate(row[:3]):
                    if not cell or cell.strip() in {"PRIMER CICLO", "SEGUNDO CICLO", "TERCER CICLO"}:
                        continue
                    cycle_text[column] += ("\n" if cycle_text[column] else "") + cell

    result: dict[int, list[dict[str, str]]] = {}
    for cycle, original_text in enumerate(cycle_text, 1):
        text = canonicalize_known_code_anomalies(original_text)
        matches = list(knowledge_pattern(config.code, cycle).finditer(text))
        codes = [match.group(0)[:-1] for match in matches]
        items: list[dict[str, str]] = []
        for index, match in enumerate(matches):
            code = codes[index]
            # Codes with descendants are subsection headings rather than knowledge items.
            if any(candidate.startswith(code + ".") for candidate in codes):
                continue
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            body = normalize_cell(text[match.end() : end])
            for heading in config.section_headings:
                if body.endswith(heading):
                    body = body[: -len(heading)].strip()
            # Four CMN subsection headings omit the dot after the block letter in the PDF.
            body = re.sub(
                rf"\s+{config.code}\.{cycle}\.[A-F]\d(?:\.\d+)?\.\s+[^.]+\.\s*$",
                "",
                body,
            )
            if not body:
                raise RuntimeError(f"Empty knowledge text for {code}.")
            items.append({"code": code, "text": body})
        result[cycle] = items
    return result


def split_competence_text(value: str, number: int) -> str:
    raw = re.split(
        rf"\n(?={DESCRIPTOR_PREFIXES}\d)",
        value,
        maxsplit=1,
    )[0]
    return normalize_cell(re.sub(rf"^{number}\.\s*", "", raw))


def extract_criteria_and_competences(
    pdf: pdfplumber.PDF,
    config: AreaConfig,
) -> tuple[list[dict[str, str]], dict[int, list[dict[str, Any]]]]:
    cycle: int | None = None
    current_competence: tuple[int, str] | None = None
    current_row: dict[str, Any] | None = None
    competence_cells: dict[tuple[int, str], str] = {}
    rows: list[dict[str, Any]] = []

    for page_index in range(config.criteria_pages[0], config.criteria_pages[1] + 1):
        for table in pdf.pages[page_index].extract_tables(TABLE_SETTINGS):
            for original_cells in table:
                cells = (original_cells + [None] * 4)[:4]
                joined = " ".join(cell or "" for cell in cells)
                heading = re.search(
                    re.escape(config.name.replace("Primera y Segunda ", ""))
                    + r" \((Primer|Segundo|Tercer) Ciclo\)",
                    joined,
                )
                if heading:
                    cycle = {"Primer": 1, "Segundo": 2, "Tercer": 3}[heading.group(1)]
                    current_competence = None
                    current_row = None
                    continue
                if cycle is None or "Competencias específicas" in joined:
                    continue

                competence_cell, criterion_a, criterion_b, knowledge_codes = [
                    cell or "" for cell in cells
                ]
                new_competence = re.match(r"^\s*(\d{1,2})\.\s", competence_cell)
                new_a = re.match(r"^\s*(\d{1,2}\.\d+\.a)\.?\s", criterion_a)
                new_b = re.match(r"^\s*(\d{1,2}\.\d+\.b)\.?\s", criterion_b)

                if new_competence:
                    current_competence = (cycle, new_competence.group(1))
                    competence_cells[current_competence] = competence_cell
                elif competence_cell and current_competence:
                    competence_cells[current_competence] += "\n" + competence_cell

                if new_a or new_b:
                    if current_competence is None:
                        raise RuntimeError(f"Criterion without competence on page {page_index + 1}.")
                    current_row = {
                        "cycle": cycle,
                        "competenceCode": current_competence[1],
                        "a": criterion_a,
                        "b": criterion_b,
                        "knowledgeCodes": knowledge_codes,
                    }
                    rows.append(current_row)
                elif current_row and (criterion_a or criterion_b or knowledge_codes):
                    if criterion_a:
                        current_row["a"] += "\n" + criterion_a
                    if criterion_b:
                        current_row["b"] += "\n" + criterion_b
                    if knowledge_codes:
                        current_row["knowledgeCodes"] += "\n" + knowledge_codes

    competences: list[dict[str, str]] = []
    for number in range(1, config.competence_count + 1):
        cycle_texts = [
            split_competence_text(competence_cells[(cycle_number, str(number))], number)
            for cycle_number in (1, 2, 3)
        ]
        if len(set(cycle_texts)) != 1:
            raise RuntimeError(f"Competence {config.code}.{number} changes between cycle tables.")
        competences.append({"code": str(number), "text": cycle_texts[0]})

    criteria: dict[int, list[dict[str, Any]]] = {course: [] for course in range(1, 7)}
    for row in rows:
        references = relation_codes(row["knowledgeCodes"], config.code)
        for column in ("a", "b"):
            if not row[column].strip():
                continue
            text = normalize_cell(row[column])
            match = re.match(r"^(\d{1,2}\.\d+\.[ab])\.?\s*(.*)$", text)
            if not match:
                raise RuntimeError(f"Invalid {config.code} criterion text: {text[:80]}")
            course = row["cycle"] * 2 - (1 if column == "a" else 0)
            criteria[course].append(
                {
                    "code": match.group(1),
                    "competenceCode": row["competenceCode"],
                    "text": match.group(2),
                    "knowledgeCodes": references,
                }
            )
    return competences, criteria


def extract_values(pdf: pdfplumber.PDF) -> dict[str, Any]:
    raw_knowledge = ""
    for table in pdf.pages[88].extract_tables(TABLE_SETTINGS):
        for row in table:
            cell = row[0] if row else None
            if cell and cell.strip() != "TERCER CICLO":
                raw_knowledge += ("\n" if raw_knowledge else "") + cell
    # The C block continues above the criteria table on the next page without
    # ruling lines, so pdfplumber correctly exposes it as page text, not a table.
    continuation_page = pdf.pages[89].extract_text() or ""
    continuation_start = continuation_page.find("C. Desarrollo sostenible y ética ambiental.")
    continuation_end = continuation_page.find(
        "Educación en Valores Cívicos y Éticos (Tercer Ciclo)"
    )
    if continuation_start < 0 or continuation_end <= continuation_start:
        raise RuntimeError("Missing the VCE knowledge continuation on PDF page 90.")
    raw_knowledge += "\n" + continuation_page[continuation_start:continuation_end]
    matches = list(re.finditer(r"VCE\.3\.[A-C]\.\d+\.", raw_knowledge))
    knowledge = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw_knowledge)
        body = normalize_cell(raw_knowledge[match.end() : end])
        for heading in ("A. Autoconocimiento y autonomía moral.", "B. Sociedad, justicia y democracia."):
            if body.endswith(heading):
                body = body[: -len(heading)].strip()
        knowledge.append({"code": match.group(0)[:-1], "text": body})

    current_competence: str | None = None
    current_row: dict[str, str] | None = None
    competence_cells: dict[str, str] = {}
    rows: list[dict[str, str]] = []
    for page_index in range(89, 91):
        for table in pdf.pages[page_index].extract_tables(TABLE_SETTINGS):
            for original_cells in table:
                cells = (original_cells + [None] * 3)[:3]
                joined = " ".join(cell or "" for cell in cells)
                if "Educación en Valores Cívicos y Éticos (Tercer Ciclo)" in joined:
                    current_competence = None
                    current_row = None
                    continue
                if "Competencias específicas" in joined:
                    continue
                competence_cell, criterion, knowledge_codes = [cell or "" for cell in cells]
                new_competence = re.match(r"^\s*(\d+)\.\s", competence_cell)
                new_criterion = re.match(r"^\s*(\d+\.\d+)\.", criterion)
                if new_competence:
                    current_competence = new_competence.group(1)
                    competence_cells[current_competence] = competence_cell
                elif competence_cell and current_competence:
                    competence_cells[current_competence] += "\n" + competence_cell
                if new_criterion:
                    if current_competence is None:
                        raise RuntimeError(f"VCE criterion without competence on page {page_index + 1}.")
                    current_row = {
                        "competenceCode": current_competence,
                        "criterion": criterion,
                        "knowledgeCodes": knowledge_codes,
                    }
                    rows.append(current_row)
                elif current_row and (criterion or knowledge_codes):
                    if criterion:
                        current_row["criterion"] += "\n" + criterion
                    if knowledge_codes:
                        current_row["knowledgeCodes"] += "\n" + knowledge_codes

    competences = [
        {
            "code": str(number),
            "text": split_competence_text(competence_cells[str(number)], number),
        }
        for number in range(1, 5)
    ]
    criteria = []
    for row in rows:
        text = normalize_cell(row["criterion"])
        match = re.match(r"^(\d+\.\d+)\.\s*(.*)$", text)
        if not match:
            raise RuntimeError(f"Invalid VCE criterion text: {text[:80]}")
        criterion_code = match.group(1)
        criterion_text = match.group(2)
        # The last ruled cell ends at the printed page break after "emocio-".
        # The authenticated CVE continues the same 4.1 sentence on the next
        # page. Pin the literal continuation instead of publishing a truncated
        # official criterion or trying to infer arbitrary prose.
        if criterion_code == "4.1" and criterion_text.endswith("propias emocio-"):
            criterion_text = criterion_text[:-len("emocio-")] + (
                "emociones y afectos, y reconociendo y valorando los de otras personas, "
                "en distintos contextos y en relación con actividades creativas y de "
                "reflexión individual o dialogada sobre cuestiones éticas y cívicas."
            )
        criteria.append(
            {
                "code": criterion_code,
                "competenceCode": row["competenceCode"],
                "text": criterion_text,
                "knowledgeCodes": relation_codes(row["knowledgeCodes"], "VCE"),
            }
        )
    return {
        "code": "VCE",
        "name": "Educación en Valores Cívicos y Éticos",
        "pdfPageRange": [85, 91],
        "competences": competences,
        "knowledgeByCycle": {"3": knowledge},
        "criteriaByCourse": {"6": criteria},
    }


def validate_area(config: AreaConfig, area: dict[str, Any]) -> None:
    knowledge_counts = tuple(
        len(area["knowledgeByCycle"][str(cycle)]) for cycle in range(1, 4)
    )
    if knowledge_counts != config.expected_knowledge_counts:
        raise RuntimeError(f"Unexpected {config.code} knowledge counts: {knowledge_counts}.")
    criterion_counts = tuple(
        len(area["criteriaByCourse"][str(course)]) for course in range(1, 7)
    )
    if criterion_counts != config.expected_criteria_counts:
        raise RuntimeError(f"Unexpected {config.code} criterion counts: {criterion_counts}.")
    relations = sum(
        len(criterion["knowledgeCodes"])
        for course in area["criteriaByCourse"].values()
        for criterion in course
    )
    if relations != config.expected_relation_count:
        raise RuntimeError(f"Unexpected {config.code} relation count: {relations}.")
    if len(area["competences"]) != config.competence_count:
        raise RuntimeError(f"Unexpected {config.code} competence count.")

    all_knowledge = {
        item["code"]
        for cycle in area["knowledgeByCycle"].values()
        for item in cycle
    }
    referenced = {
        code
        for course in area["criteriaByCourse"].values()
        for criterion in course
        for code in criterion["knowledgeCodes"]
    }
    if referenced - all_knowledge:
        raise RuntimeError(
            f"Unknown {config.code} relations: {sorted(referenced - all_knowledge)}."
        )
    expected_unreferenced = {
        "MAT.2.A.2.6",
        "MAT.2.F.2.7",
        "MAT.3.A.4.4",
        "MAT.3.C.2.2",
    } if config.code == "MAT" else set()
    if all_knowledge - referenced != expected_unreferenced:
        raise RuntimeError(
            f"Unexpected unreferenced {config.code} knowledge: "
            f"{sorted(all_knowledge - referenced)}."
        )


def validate_values(area: dict[str, Any]) -> None:
    if len(area["competences"]) != 4:
        raise RuntimeError("Unexpected VCE competence count.")
    if len(area["knowledgeByCycle"]["3"]) != 25:
        raise RuntimeError("Unexpected VCE knowledge count.")
    if len(area["criteriaByCourse"]["6"]) != 13:
        raise RuntimeError("Unexpected VCE criterion count.")
    relations = sum(
        len(criterion["knowledgeCodes"])
        for criterion in area["criteriaByCourse"]["6"]
    )
    if relations != 31:
        raise RuntimeError(f"Unexpected VCE relation count: {relations}.")
    knowledge = {item["code"] for item in area["knowledgeByCycle"]["3"]}
    referenced = {
        code
        for criterion in area["criteriaByCourse"]["6"]
        for code in criterion["knowledgeCodes"]
    }
    if knowledge != referenced:
        raise RuntimeError("The VCE table does not cover the complete knowledge catalog.")


def render_typescript(data: dict[str, Any]) -> str:
    serialized = json.dumps(data, ensure_ascii=False, indent=2)
    return (
        "/* Generated by scripts/extractAndalusianPrimaryCurriculum.py. */\n"
        "/* Do not edit by hand: regenerate it from the authenticated BOJA PDF. */\n\n"
        f"export const ANDALUSIAN_PRIMARY_CURRICULUM_SOURCE = {serialized} as const;\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    pdf_bytes = args.pdf.read_bytes()
    actual_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
    if actual_sha256 != EXPECTED_SHA256:
        raise RuntimeError(f"Unexpected PDF SHA-256: {actual_sha256}.")

    areas: dict[str, Any] = {}
    with pdfplumber.open(args.pdf) as pdf:
        if len(pdf.pages) != EXPECTED_PAGES:
            raise RuntimeError(f"Unexpected PDF page count: {len(pdf.pages)}.")
        for config in AREA_CONFIGS:
            knowledge = extract_knowledge(pdf, config)
            competences, criteria = extract_criteria_and_competences(pdf, config)
            area = {
                "code": config.code,
                "name": config.name,
                "pdfPageRange": list(config.area_pages),
                "competences": competences,
                "knowledgeByCycle": {str(key): value for key, value in knowledge.items()},
                "criteriaByCourse": {str(key): value for key, value in criteria.items()},
            }
            validate_area(config, area)
            areas[config.code] = area
        values = extract_values(pdf)
        validate_values(values)
        areas["VCE"] = values

    data = {
        "source": {
            "title": "Orden de 30 de mayo de 2023 - Educación Primaria de Andalucía - Anexo II",
            "publication": "BOJA núm. 104, de 2 de junio de 2023",
            "cve": "00284747",
            "url": "https://www.juntadeandalucia.es/eboja/2023/104/BOJA23-104-00208-9731-01_00284747.pdf",
            "verificationUrl": "https://www.juntadeandalucia.es/eboja/2023/104/39-verificacion",
            "sha256": EXPECTED_SHA256,
            "pdfPages": EXPECTED_PAGES,
            "normalizedCodePunctuation": [
                {"printed": "LEX.1.B1", "resolvedAs": "LEX.1.B.1"},
                {"printed": "LEX.3.A10", "resolvedAs": "LEX.3.A.10"},
            ],
            "unrelatedKnowledgeCodes": [
                "MAT.2.A.2.6",
                "MAT.2.F.2.7",
                "MAT.3.A.4.4",
                "MAT.3.C.2.2",
            ],
        },
        "areas": areas,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_typescript(data), encoding="utf-8")


if __name__ == "__main__":
    main()
