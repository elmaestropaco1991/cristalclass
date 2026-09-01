#!/usr/bin/env python3
"""Extract the official Andalusian Primary Language curriculum from BOJA.

This development-only verifier deliberately refuses any PDF whose SHA-256 does
not match the authenticated disposition identified by CVE 00284747. The
generated TypeScript is committed so the application never needs network or a
PDF parser at runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
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


def normalize_cell(value: str) -> str:
    value = value.replace("\u00ad", "")
    value = re.sub(r"-\n(?=\w)", "", value)
    return re.sub(r"\s+", " ", value).strip()


def extract_knowledge(pdf: pdfplumber.PDF) -> dict[int, list[dict[str, str]]]:
    cycle_text = ["", "", ""]
    for page_index in range(98, 103):
        tables = pdf.pages[page_index].extract_tables(TABLE_SETTINGS)
        if not tables:
            raise RuntimeError(f"Missing knowledge table on PDF page {page_index + 1}.")
        row = tables[0][-1] if page_index == 98 else tables[0][0]
        for index, cell in enumerate(row[:3]):
            if cell:
                cycle_text[index] += ("\n" if cycle_text[index] else "") + cell

    result: dict[int, list[dict[str, str]]] = {}
    for cycle, text in enumerate(cycle_text, 1):
        pattern = re.compile(rf"LCL\.{cycle}\.[A-D](?:\.\d+){{1,2}}\.")
        matches = list(pattern.finditer(text))
        items: list[dict[str, str]] = []
        for index, match in enumerate(matches):
            code = match.group(0)[:-1]
            # B.1, B.2 and B.3 are container headings, not basic-knowledge items.
            if re.fullmatch(rf"LCL\.{cycle}\.B\.[123]", code):
                continue
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            body = text[match.end() : end]
            body = re.sub(
                r"\n[A-D]\. [^\n]+(?:\n(?:en el marco[^\n]*|producción[^\n]*|orales,[^\n]*))?\.?\s*$",
                "",
                body,
                flags=re.IGNORECASE,
            )
            items.append({"code": code, "text": normalize_cell(body)})
        result[cycle] = items
    return result


def extract_criteria_and_competences(
    pdf: pdfplumber.PDF,
) -> tuple[list[dict[str, str]], dict[int, list[dict[str, Any]]]]:
    cycle: int | None = None
    current_competence: tuple[int, str] | None = None
    current_row: dict[str, Any] | None = None
    competence_cells: dict[tuple[int, str], str] = {}
    rows: list[dict[str, Any]] = []

    for page_index in range(102, 118):
        for table in pdf.pages[page_index].extract_tables(TABLE_SETTINGS):
            for original_cells in table:
                cells = (original_cells + [None] * 4)[:4]
                joined = " ".join(cell or "" for cell in cells)
                heading = re.search(
                    r"Lengua Castellana y Literatura \((Primer|Segundo|Tercer) Ciclo\)",
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
                new_a = re.match(r"^\s*(\d{1,2}\.\d+\.a)\.", criterion_a)
                new_b = re.match(r"^\s*(\d{1,2}\.\d+\.b)\.", criterion_b)

                if new_competence:
                    current_competence = (cycle, new_competence.group(1))
                    competence_cells[current_competence] = competence_cell
                elif competence_cell and current_competence:
                    competence_cells[current_competence] += "\n" + competence_cell

                if new_a or new_b:
                    if not (new_a and new_b) or current_competence is None:
                        raise RuntimeError(f"Unpaired criterion on PDF page {page_index + 1}.")
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
    for number in range(1, 11):
        raw = competence_cells[(1, str(number))].split("\nCCL", 1)[0]
        text = re.sub(r"^\d+\.\s*", "", normalize_cell(raw))
        competences.append({"code": str(number), "text": text})

    criteria: dict[int, list[dict[str, Any]]] = {course: [] for course in range(1, 7)}
    for row in rows:
        for column in ("a", "b"):
            text = normalize_cell(row[column])
            match = re.match(r"^(\d{1,2}\.\d+\.[ab])\.\s*(.*)$", text)
            if not match:
                raise RuntimeError(f"Invalid criterion text: {text[:80]}")
            course = row["cycle"] * 2 - (1 if column == "a" else 0)
            criteria[course].append(
                {
                    "code": match.group(1),
                    "competenceCode": row["competenceCode"],
                    "text": match.group(2),
                    "knowledgeCodes": re.findall(
                        r"LCL\.\d\.[A-D](?:\.\d+){1,2}",
                        normalize_cell(row["knowledgeCodes"]),
                    ),
                }
            )
    return competences, criteria


def validate_extraction(data: dict[str, Any]) -> None:
    if [len(data["knowledgeByCycle"][str(cycle)]) for cycle in range(1, 4)] != [28, 30, 32]:
        raise RuntimeError("Unexpected basic-knowledge counts.")
    if any(len(data["criteriaByCourse"][str(course)]) != 22 for course in range(1, 7)):
        raise RuntimeError("Unexpected criterion counts.")
    relations = sum(
        len(criterion["knowledgeCodes"])
        for course in data["criteriaByCourse"].values()
        for criterion in course
    )
    if relations != 346:
        raise RuntimeError(f"Unexpected criterion-knowledge relation count: {relations}.")
    all_knowledge = {
        item["code"]
        for cycle in data["knowledgeByCycle"].values()
        for item in cycle
    }
    referenced = {
        code
        for course in data["criteriaByCourse"].values()
        for criterion in course
        for code in criterion["knowledgeCodes"]
    }
    if all_knowledge != referenced:
        raise RuntimeError("The criterion table and knowledge catalog do not cover the same codes.")
    if data["competences"][9]["text"] != (
        "Poner las propias prácticas comunicativas al servicio de la convivencia democrática, "
        "utilizando un lenguaje no discriminatorio y detectando y rechazando los abusos de poder "
        "a través de la palabra, para favorecer un uso no solo eficaz sino también ético del lenguaje."
    ):
        raise RuntimeError("The canonical tenth competence does not match the official statement.")


def render_typescript(data: dict[str, Any]) -> str:
    serialized = json.dumps(data, ensure_ascii=False, indent=2)
    return (
        "/* This file is generated by scripts/extractAndalusianLanguageCurriculum.py. */\n"
        "/* Do not edit it by hand: regenerate it from the authenticated BOJA PDF. */\n\n"
        f"export const ANDALUSIAN_LANGUAGE_CURRICULUM_SOURCE = {serialized} as const;\n"
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

    with pdfplumber.open(args.pdf) as pdf:
        if len(pdf.pages) != EXPECTED_PAGES:
            raise RuntimeError(f"Unexpected PDF page count: {len(pdf.pages)}.")
        knowledge = extract_knowledge(pdf)
        competences, criteria = extract_criteria_and_competences(pdf)

    data = {
        "source": {
            "title": "Orden de 30 de mayo de 2023 - Educación Primaria de Andalucía - Anexo II",
            "publication": "BOJA núm. 104, de 2 de junio de 2023",
            "cve": "00284747",
            "url": "https://www.juntadeandalucia.es/eboja/2023/104/BOJA23-104-00208-9731-01_00284747.pdf",
            "verificationUrl": "https://www.juntadeandalucia.es/eboja/2023/104/39-verificacion",
            "sha256": EXPECTED_SHA256,
            "pdfPages": EXPECTED_PAGES,
            "languagePdfPageRange": [93, 118],
        },
        "competences": competences,
        "knowledgeByCycle": {str(key): value for key, value in knowledge.items()},
        "criteriaByCourse": {str(key): value for key, value in criteria.items()},
    }
    validate_extraction(data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_typescript(data), encoding="utf-8")


if __name__ == "__main__":
    main()
