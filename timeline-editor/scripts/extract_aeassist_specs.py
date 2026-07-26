#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract AEAssist TriggerCond / TriggerAction specs from AEAssist.dll.

Decompiles the assembly with ``ilspycmd -p`` (one shot, whole assembly as a
project), then parses the generated C# to collect every trigger condition and
trigger action class together with the members Newtonsoft.Json would actually
serialize into a timeline file.

AEAssist serializes with ``TypeNameHandling.Auto`` and the default
serialization binder, so the ``$type`` discriminator is
``<FullTypeName>, <AssemblyShortName>`` (see AEAssist.IO.JsonHelper).

Usage::

    python -X utf8 extract_aeassist_specs.py
    python -X utf8 extract_aeassist_specs.py path/to/AEAssist.dll -o specs.json
    python -X utf8 extract_aeassist_specs.py --decompiled-dir ./proj   # reuse

Requires ``ilspycmd`` on PATH (``dotnet tool install -g ilspycmd``).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import OrderedDict

DEFAULT_DLL = (
    r"C:\Users\xiaos\AppData\Roaming\XIVLauncherCN\offlineplugins"
    r"\AE\AEAssist\AEAssist\AEAssist.dll"
)
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aeassist_specs.json")

COND_NAMESPACE = "AEAssist.CombatRoutine.Trigger.TriggerCond"
ACTION_NAMESPACE = "AEAssist.CombatRoutine.Trigger.TriggerAction"
COND_INTERFACE = "ITriggerCond"
ACTION_INTERFACE = "ITriggerAction"

#: Property that carries the Chinese menu path / label of a trigger node.
DISPLAY_NAME_MEMBER = "DisplayName"

#: How deep to follow custom (assembly-defined) field types.
COMPLEX_TYPE_MAX_DEPTH = 4

MODIFIERS = {
    "public", "private", "protected", "internal", "static", "readonly", "const",
    "override", "virtual", "sealed", "abstract", "new", "unsafe", "extern",
    "partial", "async", "volatile", "required", "file", "ref", "fixed",
}

TYPE_KEYWORDS = {"class", "struct", "interface", "enum", "record", "delegate"}

PRIMITIVES = {
    "int", "uint", "long", "ulong", "short", "ushort", "byte", "sbyte",
    "float", "double", "decimal", "bool", "char", "string", "object", "void",
    "nint", "nuint", "dynamic", "var",
    # BCL aliases that show up as fully qualified names
    "Int32", "UInt32", "Int64", "UInt64", "Int16", "UInt16", "Byte", "SByte",
    "Single", "Double", "Decimal", "Boolean", "Char", "String", "Object",
}

BCL_ALIAS = {
    "Int32": "int", "UInt32": "uint", "Int64": "long", "UInt64": "ulong",
    "Int16": "short", "UInt16": "ushort", "Byte": "byte", "SByte": "sbyte",
    "Single": "float", "Double": "double", "Decimal": "decimal",
    "Boolean": "bool", "Char": "char", "String": "string", "Object": "object",
}

#: Container / framework types we never want to expand as "complex types".
OPAQUE_TYPES = {
    "List", "IList", "IReadOnlyList", "ICollection", "IEnumerable", "HashSet",
    "Dictionary", "IDictionary", "SortedDictionary", "Queue", "Stack", "Array",
    "Nullable", "Tuple", "ValueTuple", "KeyValuePair", "Action", "Func",
    "Vector2", "Vector3", "Vector4", "DateTime", "TimeSpan", "Guid", "Type",
}

#: Namespace prefixes that belong to other assemblies (never expanded).
EXTERNAL_NAMESPACE_PREFIXES = (
    "System", "Dalamud", "FFXIVClientStructs", "ImGuiNET", "Newtonsoft",
    "Lumina", "Microsoft",
)


# --------------------------------------------------------------------------- #
# Lexical helpers
# --------------------------------------------------------------------------- #

def build_mask(text: str) -> str:
    """Return a same-length copy of *text* with strings/chars/comments blanked.

    Structural scanning (braces, semicolons) runs over the mask while content is
    sliced out of the original text, so literals containing ``{`` or ``;`` -- and
    there are plenty in the decompiled Chinese error messages -- cannot corrupt
    the member boundaries.
    """
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
        elif text.startswith('"""', i) or text.startswith('@"""', i):
            start = i + (1 if c == "@" else 0)
            j = text.find('"""', start + 3)
            j = n if j < 0 else j + 3
        elif c == "@" and i + 1 < n and text[i + 1] == '"':
            j = i + 2
            while j < n:
                if text[j] == '"':
                    if j + 1 < n and text[j + 1] == '"':
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
        elif c in '"\'':
            quote = c
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    j += 1
                    break
                if text[j] == "\n":
                    break
                j += 1
        else:
            i += 1
            continue
        for k in range(i, min(j, n)):
            if out[k] != "\n":
                out[k] = " "
        i = max(j, i + 1)
    return "".join(out)


def split_chunks(mask: str, start: int, end: int):
    """Yield ``(chunk_start, chunk_end)`` spans of top level declarations."""
    chunks = []
    i = start
    brace = paren = brack = 0
    chunk_start = None
    while i < end:
        c = mask[i]
        if chunk_start is None:
            if c.isspace():
                i += 1
                continue
            chunk_start = i
        if c == "{":
            brace += 1
        elif c == "}":
            brace -= 1
            if brace == 0 and paren == 0 and brack == 0:
                j = i + 1
                while j < end and mask[j].isspace():
                    j += 1
                if j < end and mask[j] == "=" and not mask.startswith("==", j):
                    i += 1  # property with an initializer: keep going to the ';'
                    continue
                if j < end and mask[j] == ";":
                    i = j
                chunks.append((chunk_start, i + 1))
                chunk_start = None
        elif c == "(":
            paren += 1
        elif c == ")":
            paren -= 1
        elif c == "[":
            brack += 1
        elif c == "]":
            brack -= 1
        elif c == ";" and brace == 0 and paren == 0 and brack == 0:
            chunks.append((chunk_start, i + 1))
            chunk_start = None
        i += 1
    if chunk_start is not None:
        chunks.append((chunk_start, end))
    return chunks


def split_top_level(text: str, mask: str, sep: str = ","):
    """Split *text* on *sep* occurrences that sit outside any bracket."""
    parts = []
    depth = 0
    last = 0
    for i, c in enumerate(mask):
        if c in "{([<":
            depth += 1
        elif c in "})]>":
            depth -= 1
        elif c == sep and depth == 0:
            parts.append(text[last:i])
            last = i + 1
    parts.append(text[last:])
    return [p for p in parts if p.strip()]


def strip_attributes(text: str, mask: str):
    """Peel leading ``[Attr(...)]`` groups off a declaration chunk."""
    attrs = []
    i = 0
    n = len(text)
    while i < n:
        while i < n and mask[i].isspace():
            i += 1
        if i >= n or mask[i] != "[":
            break
        depth = 0
        j = i
        while j < n:
            if mask[j] == "[":
                depth += 1
            elif mask[j] == "]":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        inner = text[i + 1:j - 1]
        inner_mask = mask[i + 1:j - 1]
        attrs.extend(a.strip() for a in split_top_level(inner, inner_mask))
        i = j
    return attrs, text[i:], mask[i:]


def extract_doc(trivia: str):
    """Pull the text out of ``/// <summary>`` blocks (and plain ``///`` lines)."""
    lines = re.findall(r"///(.*)", trivia)
    if not lines:
        return ""
    body = "\n".join(lines)
    body = re.sub(r"</?(summary|remarks|returns|para|value)[^>]*>", "\n", body)
    body = re.sub(r"<[^>]+>", "", body)
    parts = [ln.strip() for ln in body.splitlines()]
    return " ".join(p for p in parts if p)


def attr_string_arg(attr: str):
    """First string literal argument of an attribute, e.g. LabelName("xx")."""
    m = re.search(r'"((?:[^"\\]|\\.)*)"', attr)
    if not m:
        return None
    return m.group(1).encode("utf-8").decode("unicode_escape") if "\\" in m.group(1) else m.group(1)


def attr_name(attr: str) -> str:
    return re.split(r"[\s(]", attr.strip(), 1)[0]


def split_type_and_name(head: str):
    """Split ``<modifiers> <Type> <Name>`` into ``(type, name)``."""
    tokens = head.strip().split()
    while tokens and tokens[0] in MODIFIERS:
        tokens.pop(0)
    rest = " ".join(tokens).strip()
    if not rest:
        return None, None
    m = re.search(r"([^\s\.\,\<\>\[\]\(\)\{\}=;:]+)\s*$", rest)
    if not m:
        return None, None
    name = m.group(1)
    type_text = rest[:m.start()].strip()
    return (type_text or None), name


def modifiers_of(head: str):
    mods = set()
    for tok in head.strip().split():
        if tok in MODIFIERS:
            mods.add(tok)
        else:
            break
    return mods


def normalize_expr(expr: str) -> str:
    expr = expr.strip().rstrip(";").strip()
    expr = re.sub(r"\s+", " ", expr)
    expr = re.sub(r"\s*([{},])\s*", lambda m: m.group(1) + " " if m.group(1) == "," else " " + m.group(1) + " ", expr)
    return re.sub(r"\s+", " ", expr).strip()


# --------------------------------------------------------------------------- #
# Type model
# --------------------------------------------------------------------------- #

class TypeDecl:
    def __init__(self, kind, name, namespace, bases, attrs, doc, body, body_mask, outer=None):
        self.kind = kind
        self.name = name
        self.namespace = namespace
        self.bases = bases
        self.attributes = attrs
        self.doc = doc
        self.body = body
        self.body_mask = body_mask
        self.outer = outer
        self.members = []       # parsed lazily
        self.enum_members = []  # for enums
        self.ctor_defaults = {}

    @property
    def full_name(self):
        if self.outer:
            return f"{self.outer.full_name}.{self.name}"
        return f"{self.namespace}.{self.name}" if self.namespace else self.name


TYPE_HEAD_RE = re.compile(
    r"^(?P<mods>(?:\w+\s+)*?)"
    r"(?P<kind>class|struct|interface|enum|record)\s+"
    r"(?P<name>[^\s:<{(]+)"
    r"(?P<generic><[^{]*?>)?"
    r"\s*(?::\s*(?P<bases>[^{]+))?",
    re.S,
)


def parse_types(text, mask, namespace, start, end, outer=None):
    """Recursively collect type declarations inside ``[start, end)``."""
    result = []
    prev_end = start
    for cs, ce in split_chunks(mask, start, end):
        trivia = text[prev_end:cs]
        prev_end = ce
        chunk, chunk_mask = text[cs:ce], mask[cs:ce]
        attrs, decl, decl_mask = strip_attributes(chunk, chunk_mask)
        brace = decl_mask.find("{")
        if brace < 0:
            continue
        head = decl[:brace]
        m = TYPE_HEAD_RE.match(head.strip())
        if not m:
            continue
        close = decl_mask.rfind("}")
        if close <= brace:
            continue
        body = decl[brace + 1:close]
        body_mask = decl_mask[brace + 1:close]
        bases = []
        if m.group("bases"):
            bases = [b.strip() for b in split_top_level(m.group("bases"), m.group("bases")) if b.strip()]
        decl_obj = TypeDecl(
            m.group("kind"), m.group("name"), namespace, bases, attrs,
            extract_doc(trivia), body, body_mask, outer,
        )
        result.append(decl_obj)
        if decl_obj.kind != "enum":
            base_offset = cs + (len(chunk) - len(decl)) + brace + 1
            result.extend(parse_types(text, mask, namespace, base_offset,
                                      base_offset + len(body), decl_obj))
    return result


NAMESPACE_RE = re.compile(r"^\s*namespace\s+([\w\.]+)\s*;", re.M)
NAMESPACE_BLOCK_RE = re.compile(r"^\s*namespace\s+([\w\.]+)\s*\{", re.M)


def parse_file(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    mask = build_mask(text)
    m = NAMESPACE_RE.search(mask)
    if m:
        return parse_types(text, mask, m.group(1), m.end(), len(text))
    m = NAMESPACE_BLOCK_RE.search(mask)
    if m:
        close = mask.rfind("}")
        return parse_types(text, mask, m.group(1), m.end(), close if close > 0 else len(text))
    return parse_types(text, mask, "", 0, len(text))


# --------------------------------------------------------------------------- #
# Member parsing
# --------------------------------------------------------------------------- #

class Member:
    def __init__(self, kind, name, type_text, mods, attrs, doc, initializer=None,
                 accessors=None, expr_body=None):
        self.kind = kind                # field | property | method | ctor | type
        self.name = name
        self.type_text = type_text
        self.mods = mods
        self.attributes = attrs
        self.doc = doc
        self.initializer = initializer
        self.accessors = accessors or {}
        self.expr_body = expr_body


ACCESSOR_RE = re.compile(r"(?:^|[;{}\s])((?:private|protected|internal|public)\s+)?(get|set|init)\s*[;{]")


def parse_members(decl: TypeDecl):
    if decl.members:
        return decl.members
    text, mask = decl.body, decl.body_mask
    prev_end = 0
    for cs, ce in split_chunks(mask, 0, len(text)):
        trivia = text[prev_end:cs]
        prev_end = ce
        chunk, chunk_mask = text[cs:ce], mask[cs:ce]
        attrs, body, body_mask = strip_attributes(chunk, chunk_mask)
        doc = extract_doc(trivia)
        stripped = body.strip()
        if not stripped:
            continue
        head_only = body_mask.split("{")[0].split("=>")[0]
        if TYPE_HEAD_RE.match(re.sub(r"\s+", " ", head_only.strip())) and re.search(
                r"\b(class|struct|interface|enum|record)\b", head_only):
            decl.members.append(Member("type", None, None, set(), attrs, doc))
            continue

        mods = modifiers_of(body)
        arrow = body_mask.find("=>")
        brace = body_mask.find("{")
        paren = body_mask.find("(")
        eq = -1
        for i, c in enumerate(body_mask):
            if c == "=" and not body_mask.startswith("=>", i) and not body_mask.startswith("==", i) \
                    and (i == 0 or body_mask[i - 1] not in "=!<>+-*/%&|^"):
                eq = i
                break
        semi = body_mask.find(";")

        cut_points = [p for p in (arrow, brace, paren, eq, semi) if p >= 0]
        cut = min(cut_points) if cut_points else len(body)

        if paren >= 0 and paren == cut:
            head = body[:paren]
            _t, nm = split_type_and_name(head)
            kind = "ctor" if (nm == decl.name or (_t is None and nm == decl.name)) else "method"
            if _t is None and nm == decl.name:
                kind = "ctor"
            decl.members.append(Member(kind, nm, _t, mods, attrs, doc,
                                       initializer=body[paren:]))
            continue

        head = body[:cut]
        type_text, name = split_type_and_name(head)
        if not name:
            continue

        if arrow >= 0 and arrow == cut:
            expr = body[arrow + 2:].strip().rstrip(";").strip()
            decl.members.append(Member("property", name, type_text, mods, attrs, doc,
                                       accessors={"get": "public"}, expr_body=expr))
            continue

        if brace >= 0 and brace == cut:
            close = body_mask.rfind("}")
            block = body[brace:close + 1] if close > brace else body[brace:]
            block_mask = body_mask[brace:close + 1] if close > brace else body_mask[brace:]
            accessors = {}
            for am in ACCESSOR_RE.finditer(block_mask):
                accessors[am.group(2)] = (am.group(1) or "public").strip()
            tail = body[close + 1:] if close > brace else ""
            init = None
            tm = re.match(r"\s*=\s*(.+?);?\s*$", tail, re.S)
            if tm:
                init = normalize_expr(tm.group(1))
            if not accessors:  # method-ish block without parens -> ignore
                continue
            decl.members.append(Member("property", name, type_text, mods, attrs, doc,
                                       initializer=init, accessors=accessors))
            continue

        init = None
        if eq >= 0 and eq == cut:
            init = normalize_expr(body[eq + 1:])
        decl.members.append(Member("field", name, type_text, mods, attrs, doc,
                                   initializer=init))
    return decl.members


CTOR_ASSIGN_RE = re.compile(r"^([\w\u4e00-\u9fff]+)\s*=\s*(.+)$", re.S)


def parse_ctor_defaults(decl: TypeDecl):
    """Field defaults assigned in the parameterless constructor."""
    defaults = {}
    for mem in parse_members(decl):
        if mem.kind != "ctor" or not mem.initializer:
            continue
        raw = mem.initializer
        raw_mask = build_mask(raw)
        brace = raw_mask.find("{")
        if brace < 0:
            continue
        # only the parameterless ctor carries the field defaults we care about
        params = raw_mask[raw_mask.find("(") + 1:raw_mask.find(")")]
        if params.strip():
            continue
        close = raw_mask.rfind("}")
        body, body_mask = raw[brace + 1:close], raw_mask[brace + 1:close]
        for cs, ce in split_chunks(body_mask, 0, len(body)):
            stmt = body[cs:ce].strip().rstrip(";").strip()
            if "(" in build_mask(stmt).split("=")[0]:
                continue
            m = CTOR_ASSIGN_RE.match(stmt)
            if m:
                defaults[m.group(1)] = normalize_expr(m.group(2))
    decl.ctor_defaults = defaults
    return defaults


ENUM_ITEM_RE = re.compile(r"^([^\s=]+)\s*(?:=\s*(.+))?$", re.S)


def parse_enum_members(decl: TypeDecl):
    if decl.enum_members:
        return decl.enum_members
    text, mask = decl.body, decl.body_mask
    items = []
    depth = 0
    last = 0
    for i, c in enumerate(mask):
        if c in "{([<":
            depth += 1
        elif c in "})]>":
            depth -= 1
        elif c == "," and depth == 0:
            items.append(text[last:i])
            last = i + 1
    items.append(text[last:])

    known = {}
    next_value = 0
    for raw in items:
        if not raw.strip():
            continue
        raw_mask = build_mask(raw)
        # leading trivia (doc comments) then attributes
        doc = extract_doc(raw)
        body_start = 0
        for m in re.finditer(r"///.*", raw):
            body_start = max(body_start, m.end())
        body, body_mask = raw[body_start:], raw_mask[body_start:]
        attrs, body, body_mask = strip_attributes(body, body_mask)
        m = ENUM_ITEM_RE.match(body.strip())
        if not m:
            continue
        name = m.group(1).strip()
        if not name:
            continue
        if m.group(2):
            value = eval_enum_value(m.group(2), known)
            if value is None:
                value = next_value
        else:
            value = next_value
        known[name] = value
        next_value = value + 1
        label = None
        for a in attrs:
            if attr_name(a) == "LabelName":
                label = attr_string_arg(a)
        entry = OrderedDict(name=name, value=value)
        if label:
            entry["label"] = label
        if doc:
            entry["doc"] = doc
        decl.enum_members.append(entry)
    return decl.enum_members


def eval_enum_value(expr, known):
    expr = expr.strip()
    expr = re.sub(r"\b(0[xX][0-9a-fA-F]+|\d+)[uUlL]+\b", r"\1", expr)
    expr = re.sub(r"\b[\w]+\.([\w]+)\b", r"\1", expr)  # Enum.Member -> Member

    def sub_ident(m):
        name = m.group(0)
        if name in known:
            return str(known[name])
        return name

    expr = re.sub(r"[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff]*", sub_ident, expr)
    if not re.fullmatch(r"[\d\s\|\&\^\~\<\>\+\-\*\/\(\)x0-9a-fA-F]+", expr):
        return None
    try:
        return int(eval(expr, {"__builtins__": {}}, {}))  # noqa: S307 - digits/operators only
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Type name normalization
# --------------------------------------------------------------------------- #

def simple_name(type_text: str) -> str:
    return type_text.split(".")[-1]


def split_generic_args(inner: str):
    return split_top_level(inner, build_mask(inner))


def normalize_type(type_text, enum_index, class_index, referenced_enums, referenced_classes, depth=0):
    """Render a C# type as the compact form used in the spec JSON."""
    if not type_text:
        return "unknown"
    t = re.sub(r"\s+", "", type_text)
    nullable = t.endswith("?")
    if nullable:
        t = t[:-1]
    if t.endswith("[]"):
        inner = normalize_type(t[:-2], enum_index, class_index, referenced_enums,
                               referenced_classes, depth)
        return inner + "[]" + ("?" if nullable else "")
    m = re.fullmatch(r"([\w\.]+)<(.+)>", t)
    if m:
        base = simple_name(m.group(1))
        args = [normalize_type(a, enum_index, class_index, referenced_enums,
                               referenced_classes, depth) for a in split_generic_args(m.group(2))]
        return f"{base}<{','.join(args)}>" + ("?" if nullable else "")
    name = simple_name(t)
    name = BCL_ALIAS.get(name, name)
    if name in PRIMITIVES:
        return name + ("?" if nullable else "")
    if name in enum_index:
        referenced_enums.add(name)
        return f"enum:{name}" + ("?" if nullable else "")
    if name in class_index and name not in OPAQUE_TYPES:
        referenced_classes.add(name)
    return name + ("?" if nullable else "")


# --------------------------------------------------------------------------- #
# Spec building
# --------------------------------------------------------------------------- #

def is_serializable(mem: Member) -> bool:
    """Mirror Newtonsoft's OptOut member selection."""
    if mem.kind not in ("field", "property"):
        return False
    if not mem.name or mem.name.startswith("_003C") or mem.name.startswith("<"):
        return False
    if "k__BackingField" in mem.name or "__BackingField" in mem.name:
        return False
    if "static" in mem.mods or "const" in mem.mods:
        return False
    if "public" not in mem.mods:
        return False
    if any(attr_name(a) in ("JsonIgnore", "NonSerialized", "IgnoreDataMember") for a in mem.attributes):
        return False
    if mem.kind == "property":
        if mem.expr_body is not None:
            return False  # computed, get-only
        get_mod = mem.accessors.get("get")
        set_mod = mem.accessors.get("set") or mem.accessors.get("init")
        if get_mod is None or set_mod is None:
            return False
        if get_mod not in ("public", "") or set_mod not in ("public", ""):
            return False
    return True


def member_label(mem: Member):
    for a in mem.attributes:
        if attr_name(a) == "LabelName":
            return attr_string_arg(a)
    return None


def display_name_of(decl: TypeDecl):
    for mem in parse_members(decl):
        if mem.name != DISPLAY_NAME_MEMBER:
            continue
        if mem.expr_body:
            m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', mem.expr_body.strip())
            if m:
                return m.group(1)
            return ""
        if mem.initializer:
            m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', mem.initializer.strip())
            if m:
                return m.group(1)
        return ""
    return ""


def build_fields(decl: TypeDecl, enum_index, class_index, referenced_enums, referenced_classes):
    defaults = parse_ctor_defaults(decl)
    fields = []
    for mem in parse_members(decl):
        if mem.name == DISPLAY_NAME_MEMBER or not is_serializable(mem):
            continue
        entry = OrderedDict()
        entry["name"] = mem.name
        entry["type"] = normalize_type(mem.type_text, enum_index, class_index,
                                       referenced_enums, referenced_classes)
        default = mem.initializer or defaults.get(mem.name)
        entry["default"] = default if default is not None else ""
        entry["member"] = mem.kind
        label = member_label(mem)
        if label:
            entry["label"] = label
        if mem.doc:
            entry["doc"] = mem.doc
        extra = [a for a in mem.attributes if attr_name(a) != "LabelName"]
        if extra:
            entry["attributes"] = extra
        fields.append(entry)
    return fields


def build_entry(decl: TypeDecl, assembly, enum_index, class_index,
                referenced_enums, referenced_classes, missing_display):
    display = display_name_of(decl)
    if not display:
        missing_display.append(decl.full_name)
    entry = OrderedDict()
    entry["type"] = f"{decl.full_name}, {assembly}"
    entry["shortName"] = decl.name
    entry["displayName"] = display
    if "/" in display:
        entry["category"] = display.rsplit("/", 1)[0]
        entry["label"] = display.rsplit("/", 1)[1]
    entry["fields"] = build_fields(decl, enum_index, class_index,
                                   referenced_enums, referenced_classes)
    if decl.doc:
        entry["doc"] = decl.doc
    if decl.attributes:
        entry["attributes"] = decl.attributes
    return entry


def decompile(dll_path, out_dir):
    exe = shutil.which("ilspycmd") or shutil.which("ilspycmd.exe")
    if not exe:
        raise SystemExit("ilspycmd not found on PATH. Install with: dotnet tool install -g ilspycmd")
    cmd = [exe, "-p", "-o", out_dir, dll_path]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace") or proc.stdout.decode("utf-8", errors="replace")
        raise SystemExit(f"ilspycmd failed ({proc.returncode}):\n{err}")


def collect_types(root):
    decls = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(".cs"):
                decls.extend(parse_file(os.path.join(dirpath, fn)))
    return decls


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dll", nargs="?", default=DEFAULT_DLL, help="path to AEAssist.dll")
    ap.add_argument("-o", "--out", default=DEFAULT_OUT, help="output JSON path")
    ap.add_argument("--assembly-name", default="AEAssist",
                    help="assembly short name used in the $type discriminator")
    ap.add_argument("--decompiled-dir", default=None,
                    help="reuse an existing 'ilspycmd -p' output directory instead of decompiling")
    ap.add_argument("--keep-temp", action="store_true",
                    help="keep the temporary decompiled project directory")
    args = ap.parse_args(argv)

    tmp_dir = None
    if args.decompiled_dir:
        proj_dir = args.decompiled_dir
        if not os.path.isdir(proj_dir):
            raise SystemExit(f"decompiled dir not found: {proj_dir}")
    else:
        if not os.path.isfile(args.dll):
            raise SystemExit(f"DLL not found: {args.dll}")
        tmp_dir = tempfile.mkdtemp(prefix="aeassist_decompile_")
        proj_dir = tmp_dir
        print(f"[1/4] decompiling {args.dll} -> {proj_dir}", file=sys.stderr)
        decompile(args.dll, proj_dir)

    try:
        print("[2/4] parsing decompiled sources", file=sys.stderr)
        decls = collect_types(proj_dir)

        enum_index, class_index = {}, {}
        enum_dupes = {}
        for d in decls:
            if d.name.startswith("_003C") or d.name.startswith("<"):
                continue
            if d.kind == "enum":
                if d.name in enum_index and enum_index[d.name].full_name != d.full_name:
                    enum_dupes.setdefault(d.name, [enum_index[d.name].full_name]).append(d.full_name)
                    continue
                enum_index[d.name] = d
            elif d.kind in ("class", "struct", "record"):
                class_index.setdefault(d.name, d)

        conds, actions = [], []
        for d in decls:
            if d.kind != "class":
                continue
            if d.namespace == COND_NAMESPACE and COND_INTERFACE in d.bases:
                conds.append(d)
            elif d.namespace == ACTION_NAMESPACE and ACTION_INTERFACE in d.bases:
                actions.append(d)
        conds.sort(key=lambda d: d.name)
        actions.sort(key=lambda d: d.name)

        print(f"[3/4] found {len(conds)} conditions, {len(actions)} actions", file=sys.stderr)

        referenced_enums, referenced_classes = set(), set()
        missing_display = []
        cond_entries = [build_entry(d, args.assembly_name, enum_index, class_index,
                                    referenced_enums, referenced_classes, missing_display)
                        for d in conds]
        action_entries = [build_entry(d, args.assembly_name, enum_index, class_index,
                                      referenced_enums, referenced_classes, missing_display)
                          for d in actions]

        # Expand custom field types (SpellConfig, TargetSelector, ...) transitively.
        complex_types = OrderedDict()
        pending = [(n, 0) for n in sorted(referenced_classes)]
        seen = set()
        while pending:
            name, depth = pending.pop(0)
            if name in seen or depth > COMPLEX_TYPE_MAX_DEPTH:
                continue
            seen.add(name)
            decl = class_index.get(name)
            if decl is None or name in OPAQUE_TYPES:
                continue
            if decl.namespace.split(".")[0] in EXTERNAL_NAMESPACE_PREFIXES:
                continue
            nested_classes = set()
            entry = OrderedDict()
            entry["type"] = f"{decl.full_name}, {args.assembly_name}"
            entry["shortName"] = decl.name
            entry["fields"] = build_fields(decl, enum_index, class_index,
                                           referenced_enums, nested_classes)
            if decl.doc:
                entry["doc"] = decl.doc
            complex_types[name] = entry
            for nxt in sorted(nested_classes):
                if nxt not in seen:
                    pending.append((nxt, depth + 1))

        enums = OrderedDict()
        for name in sorted(referenced_enums):
            decl = enum_index.get(name)
            if decl is None:
                continue
            enums[name] = parse_enum_members(decl)

        result = OrderedDict()
        result["_meta"] = OrderedDict(
            source=os.path.basename(args.dll),
            sourcePath=os.path.abspath(args.dll) if os.path.isfile(args.dll) else args.dll,
            assembly=args.assembly_name,
            conditionCount=len(cond_entries),
            actionCount=len(action_entries),
            enumCount=len(enums),
            complexTypeCount=len(complex_types),
            missingDisplayName=missing_display,
            generator="extract_aeassist_specs.py",
        )
        result["conditions"] = cond_entries
        result["actions"] = action_entries
        result["enums"] = enums
        result["complexTypes"] = complex_types

        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(result, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"[4/4] wrote {args.out}", file=sys.stderr)
        print(f"      conditions={len(cond_entries)} actions={len(action_entries)} "
              f"enums={len(enums)} complexTypes={len(complex_types)} "
              f"missingDisplayName={len(missing_display)}", file=sys.stderr)
        if enum_dupes:
            print(f"      NOTE: ambiguous enum short names skipped: {enum_dupes}", file=sys.stderr)
    finally:
        if tmp_dir and not args.keep_temp:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
