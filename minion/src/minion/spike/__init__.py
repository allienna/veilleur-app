"""Hello-Veilleur spike package.

Sets gRPC C-core log verbosity before any google-cloud client (which pulls in grpc) is
imported. The native gRPC layer writes fork/poll diagnostics straight to stderr — Python's
logging can't intercept them — so they must be silenced via env var at import time, before
`__main__.py` imports firestore. This keeps stdout to our structured step/summary lines only.
"""

import os

os.environ.setdefault("GRPC_VERBOSITY", "ERROR")
os.environ.setdefault("GLOG_minloglevel", "2")
