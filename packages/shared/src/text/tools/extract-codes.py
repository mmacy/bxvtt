"""Extract every rejection code, event type, and event code from the installed osrlib.

The text layer in `packages/shared/src/text` has to describe every outcome osrlib can report. This
script reads the installed osrlib package and writes two files that the tests use to check coverage:

- `data/codes.json`: every rejection code with the parameter names that osrlib passes with it, every event type
  with its codes and fields, the values of the osrlib enums that the text layer labels, and the game clock
  constants.
- `data/catalog.json`: the names of the built-in monsters, spells, equipment, magic items, classes, and
  languages, with osrlib's singular and plural display names for monsters and items. The text layer uses
  them when an event names a catalog ID.

`npm run gen:bxapi` runs it after it regenerates the bxapi types (see the text README). To run it alone, run it
from the repository root with a Python that has bxapi's osrlib installed, then format the output:

    uv run --project ~/repos/bxapi python packages/shared/src/text/tools/extract-codes.py
    npx prettier --write packages/shared/src/text/data

The script reads osrlib's source with the `ast` module, because osrlib keeps no registry of rejection codes. It
finds every `Rejection(code="...", params={...})` call. When `params` is a variable, it resolves the variable
from the same function or from the dictionaries that callers pass in. It never imports anything that changes
state, and it never edits osrlib.
"""

import ast
import importlib.metadata
import json
import pathlib
import sys
from collections import defaultdict

import osrlib
from osrlib.core.clock import ROUNDS_PER_DAY, ROUNDS_PER_TURN, SECONDS_PER_ROUND, TURNS_PER_DAY, GameClock, TimeUnit
from osrlib.core.items import WeaponQuality
from osrlib.crawl.events import ALL_EVENT_CLASSES
from osrlib.data import (
    load_classes,
    load_equipment,
    load_languages,
    load_magic_items,
    load_monsters,
    load_spells,
)

OSRLIB_ROOT = pathlib.Path(osrlib.__file__).parent
DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"


def _call_name(node: ast.Call) -> str | None:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _dict_keys(node: ast.AST) -> list[str] | None:
    """Return the string keys of a dict literal, or None when the node is not one."""
    if not isinstance(node, ast.Dict):
        return None
    return [key.value for key in node.keys if isinstance(key, ast.Constant) and isinstance(key.value, str)]


class _FunctionIndex(ast.NodeVisitor):
    """Index each function's parameters, local dict assignments, and subscript assignments."""

    def __init__(self) -> None:
        self.stack: list[ast.FunctionDef] = []
        self.rejection_sites: list[tuple[ast.Call, ast.FunctionDef | None]] = []
        self.calls_by_function: dict[str, list[ast.Call]] = defaultdict(list)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        self.stack.append(node)
        self.generic_visit(node)
        self.stack.pop()

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        name = _call_name(node)
        if name == "Rejection":
            self.rejection_sites.append((node, self.stack[-1] if self.stack else None))
        elif name:
            self.calls_by_function[name].append(node)
        self.generic_visit(node)


def _resolve_params(node: ast.AST | None, function: ast.FunctionDef | None, index: _FunctionIndex) -> list[str]:
    if node is None:
        return []
    literal = _dict_keys(node)
    if literal is not None:
        return literal
    if not isinstance(node, ast.Name) or function is None:
        return []
    keys: list[str] = []
    for statement in ast.walk(function):
        if isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name) and target.id == node.id:
                    keys.extend(_dict_keys(statement.value) or [])
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == node.id
                    and isinstance(target.slice, ast.Constant)
                ):
                    keys.append(str(target.slice.value))
        if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
            if statement.target.id == node.id and statement.value is not None:
                keys.extend(_dict_keys(statement.value) or [])
    argument_names = [argument.arg for argument in function.args.args]
    if node.id in argument_names:
        position = argument_names.index(node.id)
        for call in index.calls_by_function.get(function.name, []):
            if position < len(call.args):
                keys.extend(_dict_keys(call.args[position]) or [])
    return keys


def extract_rejections() -> dict[str, dict]:
    codes: dict[str, dict] = {}
    for path in sorted(OSRLIB_ROOT.rglob("*.py")):
        relative = path.relative_to(OSRLIB_ROOT).as_posix()
        tree = ast.parse(path.read_text())
        index = _FunctionIndex()
        index.visit(tree)
        for call, function in index.rejection_sites:
            code_node = next((keyword.value for keyword in call.keywords if keyword.arg == "code"), None)
            if code_node is None and call.args:
                code_node = call.args[0]
            if not isinstance(code_node, ast.Constant) or not isinstance(code_node.value, str):
                print(f"warning: non-literal rejection code at {relative}:{call.lineno}", file=sys.stderr)
                continue
            params_node = next((keyword.value for keyword in call.keywords if keyword.arg == "params"), None)
            keys = tuple(sorted(set(_resolve_params(params_node, function, index))))
            entry = codes.setdefault(code_node.value, {"param_sets": set(), "sources": []})
            entry["param_sets"].add(keys)
            entry["sources"].append(f"{relative}:{call.lineno}")
    result: dict[str, dict] = {}
    for code in sorted(codes):
        entry = codes[code]
        param_sets = sorted(entry["param_sets"], key=lambda keys: (len(keys), keys))
        all_params = sorted({key for keys in param_sets for key in keys})
        result[code] = {
            "params": all_params,
            "param_sets": [list(keys) for keys in param_sets],
            "sources": entry["sources"],
        }
    return result


def extract_events() -> dict[str, dict]:
    events: dict[str, dict] = {}
    for cls in ALL_EVENT_CLASSES:
        fields = cls.model_fields
        event_type = fields["event_type"].default
        events[event_type] = {
            "class": cls.__name__,
            "visibility": str(getattr(fields["visibility"].default, "value", fields["visibility"].default)),
            "codes": sorted(cls.allowed_codes),
            "fields": {
                name: str(field.annotation).replace("typing.", "")
                for name, field in fields.items()
                if name not in ("code", "visibility", "event_type")
            },
        }
    return dict(sorted(events.items()))


def extract_clock() -> dict:
    """Record the clock constants and a table of conversions computed with osrlib's own clock."""
    samples = []
    for rounds in (0, 1, 59, 60, 61, 359, 360, 600, 3840, 8639, 8640, 8641, 12000, 12480, 17280, 25920, 86400):
        clock = GameClock(rounds=rounds)
        samples.append({"rounds": rounds, "turns": clock.turns, "days": clock.days})
    advance = []
    for amount, unit in ((1, TimeUnit.TURN), (6, TimeUnit.TURN), (48, TimeUnit.TURN), (144, TimeUnit.TURN), (1, TimeUnit.DAY)):
        clock = GameClock()
        clock.advance(amount, unit)
        advance.append({"amount": amount, "unit": unit.value, "rounds": clock.rounds})
    return {
        "seconds_per_round": SECONDS_PER_ROUND,
        "rounds_per_turn": ROUNDS_PER_TURN,
        "turns_per_day": TURNS_PER_DAY,
        "rounds_per_day": ROUNDS_PER_DAY,
        "samples": samples,
        "advance": advance,
    }


def extract_enums() -> dict:
    """Record the values of the osrlib enums that the text layer has a label for."""
    return {
        "weapon_qualities": [quality.value for quality in WeaponQuality],
        "time_units": [unit.value for unit in TimeUnit],
    }


def extract_catalog() -> dict:
    equipment = load_equipment()
    gear = []
    for group in ("weapons", "armour", "gear", "ammunition"):
        for item in getattr(equipment, group):
            gear.append(
                {
                    "id": item.id,
                    "name": item.name,
                    "display_name": item.display_name,
                    "display_name_plural": item.display_name_plural,
                    "type": item.item_type,
                    "lot_size": getattr(item, "lot_size", 1) or 1,
                    "cost_gp": item.cost_gp,
                }
            )
    return {
        "classes": [{"id": c.id, "name": c.name} for c in load_classes().classes],
        "languages": [{"id": language.id, "name": language.name} for language in load_languages().languages],
        "equipment": gear,
        "magic_items": [
            {
                "id": item.id,
                "name": item.name,
                "display_name": item.display_name,
                "display_name_plural": item.display_name_plural,
                "category": str(getattr(item.category, "value", item.category)),
            }
            for item in load_magic_items().items
        ],
        "spells": [
            {
                "id": spell.id,
                "name": spell.name,
                "list": str(getattr(spell.spell_list, "value", spell.spell_list)),
                "level": spell.level,
                "modes": {mode.key: mode.display_name for mode in spell.modes},
                **(
                    {"reversed_modes": {mode.key: mode.display_name for mode in spell.reversed_form.modes}}
                    if spell.reversed_form is not None
                    else {}
                ),
            }
            for spell in load_spells().spells
        ],
        "monsters": [
            {
                "id": monster.id,
                "name": monster.name,
                "label": monster.display_name,
                "label_plural": monster.display_name_plural,
                "categories": [str(getattr(c, "value", c)) for c in monster.categories],
            }
            for monster in load_monsters().monsters
        ],
    }


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rejections = extract_rejections()
    events = extract_events()
    codes = {
        "osrlib_version": importlib.metadata.version("osrlib"),
        "rejections": rejections,
        "events": events,
        "enums": extract_enums(),
        "clock": extract_clock(),
    }
    (DATA_DIR / "codes.json").write_text(json.dumps(codes, indent=2, ensure_ascii=False) + "\n")
    (DATA_DIR / "catalog.json").write_text(json.dumps(extract_catalog(), indent=2, ensure_ascii=False) + "\n")
    event_codes = {code for event in events.values() for code in event["codes"]}
    print(f"{len(rejections)} rejection codes, {len(events)} event types, {len(event_codes)} event codes")


if __name__ == "__main__":
    main()
