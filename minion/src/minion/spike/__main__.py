"""CLI entry for the Hello-Veilleur spike.

Two subcommands:
- `run`: four-step probe chain (Gmail -> Imagen -> Firestore -> GitHub). Wired in T-3.1.
- `claude-probe`: OAuth headless probe (`claude -p` returns PONG). Wired in T-3.2.
"""

from __future__ import annotations

import datetime as dt

import click


def _today_iso() -> str:
    return dt.date.today().isoformat()


@click.group()
def cli() -> None:
    """Hello-Veilleur spike — probe the full external-system chain."""


@cli.command()
@click.option(
    "--date",
    "date_",
    default=_today_iso,
    show_default="today (UTC)",
    metavar="YYYY-MM-DD",
    help="Run date used in the runId and GitHub commit path.",
)
def run(date_: str) -> None:
    """Run the four-step probe chain end-to-end for DATE."""
    raise NotImplementedError("T-3.1 wires the four-step run orchestration.")


@cli.command("claude-probe")
def claude_probe() -> None:
    """Probe `claude -p` returns PONG inside the current environment."""
    raise NotImplementedError("T-3.2 wires the claude-probe subcommand.")


if __name__ == "__main__":
    cli()
