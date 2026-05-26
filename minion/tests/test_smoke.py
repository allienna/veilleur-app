"""Scaffold smoke test: the minion package imports cleanly. Real node tests land in F-003+."""

import importlib


def test_package_imports() -> None:
    assert importlib.import_module("minion") is not None
