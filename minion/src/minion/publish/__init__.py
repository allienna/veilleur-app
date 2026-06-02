"""Publishing layer (F-006): Imagen hero image, GitHub commit, Firestore persistence.

Mirrors `ingest/` and `generate/`: the publish steps depend on the Protocols in `ports.py`,
the production adapters (`imagen.py`, `github.py`) implement them, and `fakes.py` provides
hermetic doubles so the whole pipeline runs without Vertex, GitHub, or network in CI.
"""
