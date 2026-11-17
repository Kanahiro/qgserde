"""Generate src/attributes.generated.ts from QGIS sources.

Usage: python3 scripts/generate-attributes.py QGIS_SRC_DIR...

Each directory is a QGIS source tree (or part of one, such as src/core).
Writers are scanned for setAttribute calls; each attribute gets a kind:
number, boolean (written 1/0), flag (written true/false) or string. A kind
other than string is used only when the writer expression shows it, and
writers that disagree fall back to string. scripts/attribute-groups.json
names the element groups to emit and corrects kinds the scan gets wrong.
"""

import json
import re
import sys
from pathlib import Path

NAME = r'(?:QStringLiteral\(\s*"([^"]+)"\s*\)|u"([^"]+)"_s|"([^"]+)")'


def balanced(text, start):
    """Return the argument text of the call whose '(' is at text[start]."""
    depth = 0
    i = start
    in_str = False
    while i < len(text):
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i], i
        i += 1
    return None, len(text)


def split_args(args):
    out, depth, cur, in_str = [], 0, "", False
    i = 0
    while i < len(args):
        c = args[i]
        if in_str:
            cur += c
            if c == "\\":
                cur += args[i + 1]
                i += 2
                continue
            if c == '"':
                in_str = False
        elif c == '"':
            in_str = True
            cur += c
        elif c in "(<[{":
            depth += 1
            cur += c
        elif c in ")>]}":
            depth -= 1
            cur += c
        elif c == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += c
        i += 1
    if cur.strip():
        out.append(cur.strip())
    return out


def literal(arg):
    m = re.fullmatch(r"\s*" + NAME + r"\s*", arg)
    return m and next(g for g in m.groups() if g)


BOOL_TYPES = {"bool"}
NUM_TYPES = {
    "int",
    "double",
    "float",
    "qreal",
    "long",
    "uint",
    "unsigned",
    "qint64",
    "quint64",
    "qlonglong",
    "qulonglong",
    "short",
    "std::size_t",
}


def declared_types(directory):
    """Map member names to declared C++ types; other types map to "other"."""
    types = {}
    for header in list(directory.glob("*.h")):
        text = header.read_text(errors="ignore")
        for m in re.finditer(
            r"^\s*(?:const\s+)?([A-Za-z_][\w:]*(?:<[^;=(){}]*>)?)\s+(\w+)\s*(?:=|;|\{)",
            text,
            re.M,
        ):
            name, kind = m.group(2), m.group(1)
            if kind in (
                "return",
                "delete",
                "typedef",
                "using",
                "class",
                "struct",
                "enum",
            ):
                continue
            if kind in BOOL_TYPES:
                kind = "bool"
            elif (
                kind in NUM_TYPES
                or kind.split("::")[-1] in ENUMS
                or re.fullmatch(r"Q(?!gs)\w*::[A-Z]\w*", kind)
            ):
                kind = "int"
            else:
                kind = "other"
            if types.get(name, kind) != kind:
                kind = "conflict"
            types[name] = kind
    return types


GETTERS = {}
# Enums and flags convert to int when passed to setAttribute.
ENUMS = set()
QT_GETTERS = {
    "italic": "bool",
    "bold": "bool",
    "underline": "bool",
    "strikeOut": "bool",
    "kerning": "bool",
    "isValid": "bool",
    "pointSizeF": "double",
    "weight": "int",
    "letterSpacing": "double",
    "wordSpacing": "double",
    "alpha": "int",
    "alphaF": "double",
    "red": "int",
    "green": "int",
    "blue": "int",
    "x": "double",
    "y": "double",
    "width": "double",
    "height": "double",
    "size": "int",
    "count": "int",
}


def load_getters(roots):
    seen = {}
    for root in roots:
        for header in Path(root).rglob("*.h"):
            text = header.read_text(errors="ignore")
            ENUMS.update(re.findall(r"\benum\s+(?:class\s+)?(\w+)", text))
            ENUMS.update(re.findall(r"Q_DECLARE_FLAGS\(\s*(\w+)", text))
            for m in re.finditer(
                r"\b(bool|int|double|float|qreal|long|uint|unsigned int|qint64|quint64|qlonglong|QString|QColor|QStringList|QDateTime|QDate|QUuid)\s+(\w+)\s*\(\s*\)\s*const",
                text,
            ):
                kind = m.group(1)
                kind = (
                    "bool"
                    if kind == "bool"
                    else "string"
                    if kind[0] == "Q"
                    else "number"
                )
                seen.setdefault(m.group(2), set()).add(kind)
    for name, kinds in seen.items():
        if len(kinds) == 1:
            GETTERS[name] = next(iter(kinds))
    for name, kind in QT_GETTERS.items():
        GETTERS[name] = "bool" if kind == "bool" else "number"


def kind_of(expr, types, reader):
    e = expr.strip()
    if re.search(r'"true"|u"true"_s|QStringLiteral\(\s*"true"\s*\)', e) and re.search(
        r'"false"', e
    ):
        return "flag"
    if re.search(r'\?\s*(?:QStringLiteral\(\s*)?(?:u)?"1"', e) and re.search(r'"0"', e):
        return "boolean"
    if re.match(r"!\s*[\w(]", e) and "isEmpty" not in e and "isNull" not in e:
        return "boolean"
    if re.search(
        r"encodeUnit|encodeColor|colorToString|encodeMapUnitScale|qgsEnumValueToKey|qgsFlagValueToKeys|valueToKey|valueToKeys|\.name\(\)|encodeSldUom|encodePoint|encodeSize|encodeRealVector|encodePenStyle|encodeBrushStyle|encodePenJoinStyle|encodePenCapStyle|toString\(|\.join\(|QString\(|tr\(|asWkt|authid\(\)|\.id\(\)|uuid|expression\(\)|Expression\(\)|^QStringLiteral|^u\"|toWkt|encode",
        e,
    ):
        return "string"
    if re.search(
        r"QString::number|qgsDoubleToString|static_cast\s*<\s*(?:int|unsigned|uint|double|long|qint64|quint64|int\s*>)",
        e,
    ):
        return "number"
    if re.fullmatch(r"-?\d+(\.\d+)?", e):
        return "number"
    candidates = []
    # Only the object's own members: a member of another object has another type.
    m2 = re.fullmatch(r"(?:(?:d|this|mPrivate)->)?(\w+)", e)
    if m2:
        name = m2.group(1)
        candidates = [
            name,
            "m" + name[:1].upper() + name[1:],
            name[1:] if name.startswith("m") else name,
        ]
    for c in candidates:
        t = types.get(c)
        if t in BOOL_TYPES:
            return "boolean"
        if t in NUM_TYPES:
            return "number"
        if t == "other":
            return "string"
    call = re.search(r"(?:->|\.)(\w+)\(\s*\)\s*$", e)
    if call and not re.search(r"[+*/?:]|-(?!>)", e):
        getter = GETTERS.get(call.group(1))
        if getter == "bool":
            return "boolean"
        if getter == "number":
            return "number"
        if getter == "string":
            return "string"
    # Getter calls: isX()/hasX()/enabled() are booleans; numeric getters fall to the reader.
    g = re.search(r"(?:->|\.)(is|has|should|uses|use)[A-Z]\w*\(\)\s*$", e) or re.search(
        r"(?:->|\.)(enabled|visible|isActive|active)\(\)\s*$", e
    )
    if g:
        return "boolean"
    if reader:
        return reader
    return "string"


def reader_kinds(text):
    """Attribute conversions in readers: attribute( NAME ... ).toX()."""
    kinds = {}
    for m in re.finditer(r"\.attribute\(\s*" + NAME, text):
        name = next(g for g in m.groups() if g)
        tail = text[m.end() : m.end() + 160]
        call = re.match(
            r"[^;]*?\)\s*\.(toDouble|toFloat|toInt|toUInt|toLongLong)\(", tail
        )
        if call:
            kinds.setdefault(name, "number")
        elif re.match(
            r"[^;]*?\)\s*==\s*(?:QLatin1String\(\s*)?(?:QStringLiteral\(\s*)?(?:u)?\"true\"",
            tail,
        ):
            kinds[name] = "flag"
    return kinds


def functions(text):
    """Yield (name, body) for top-level function definitions."""
    for m in re.finditer(r"^[\w:<>,*& ]+?\b(\w+::~?\w+)\s*\(", text, re.M):
        brace = text.find("{", m.end())
        semi = text.find(";", m.end())
        if brace < 0 or (0 <= semi < brace and ")" not in text[m.end() : semi]):
            continue
        depth, i = 0, brace
        while i < len(text):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        yield m.group(1), text[brace : i + 1]


def scan(roots):
    load_getters(roots)
    rows = {}
    for root in roots:
        for path in sorted(Path(root).rglob("*.cpp")):
            text = path.read_text(errors="ignore")
            if "setAttribute" not in text:
                continue
            types = declared_types(path.parent)
            readers = reader_kinds(text)
            for fname, body in functions(text):
                tags = {}
                for m in re.finditer(
                    r"(?:QDomElement\s+)?(\w+)\s*=\s*[\w.>-]*createElement\(\s*" + NAME,
                    body,
                ):
                    tags[m.group(1)] = next(g for g in m.groups()[1:] if g)
                for m in re.finditer(r"(\w+)\s*\.\s*setAttribute\s*\(", body):
                    args, _ = balanced(body, m.end() - 1)
                    if args is None:
                        continue
                    parts = split_args(args)
                    if len(parts) != 2:
                        continue
                    name = literal(parts[0])
                    if not name:
                        continue
                    var = m.group(1)
                    tag = tags.get(var, "@" + fname + ":" + var)
                    kind = kind_of(parts[1], types, readers.get(name))
                    entry = rows.setdefault(f"{path.name}|{tag}", {})
                    prev = entry.get(name)
                    entry[name] = kind if prev in (None, kind) else "string"
    return rows


def camel(name):
    return name[:1].lower() + name[1:]


def ts_key(name):
    return name if re.fullmatch(r"[A-Za-z_$][\w$]*", name) else json.dumps(name)


STORED = {
    "number": "",
    "boolean": ", stored as 1 or 0",
    "flag": ", stored as true or false",
    "string": "",
}
TS_TYPE = {
    "number": "number",
    "boolean": "boolean",
    "flag": "boolean",
    "string": "string",
}


def generate(rows, groups):
    out = [
        "// Generated by scripts/generate-attributes.py from QGIS writers. Do not edit.",
        'import type { AttributeTable } from "./spec.ts";',
        "",
    ]
    for name, group in groups.items():
        if name.startswith("$"):
            continue
        kinds = {}
        for pattern in group["keys"]:
            matched = [key for key in rows if re.search(pattern, key)]
            if not matched:
                sys.exit(f"{name}: no writer matches {pattern}")
            for key in matched:
                for attribute, kind in rows[key].items():
                    prev = kinds.get(attribute)
                    kinds[attribute] = kind if prev in (None, kind) else "string"
        kinds.update(group.get("kinds", {}))
        for attribute in group.get("exclude", []):
            kinds.pop(attribute, None)
        kinds = {k: v for k, v in kinds.items() if not k.startswith("xmlns")}
        if "other" in kinds:
            sys.exit(f"{name}: an attribute is named other")
        out.append(f"/** {group['doc']} */")
        out.append(f"export interface Qgs{name}Attributes {{")
        for attribute in sorted(kinds):
            out.append(f"  /** `{attribute}`{STORED[kinds[attribute]]}. */")
            out.append(f"  {ts_key(attribute)}?: {TS_TYPE[kinds[attribute]]};")
        out.append(
            "  /** Other attributes, and values that do not parse as their kind. */"
        )
        out.append("  other?: Record<string, string>;")
        out.append("}")
        out.append("")
        out.append(f"export const {camel(name)}Attributes = {{")
        for attribute in sorted(kinds):
            out.append(f"  {ts_key(attribute)}: {json.dumps(kinds[attribute])},")
        out.append("} as const satisfies AttributeTable;")
        out.append("")
    return "\n".join(out)


def main(roots):
    here = Path(__file__).resolve().parent
    groups = json.loads((here / "attribute-groups.json").read_text())
    text = generate(scan(roots), groups)
    (here.parent / "src" / "attributes.generated.ts").write_text(text)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
