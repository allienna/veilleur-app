"""Persistence ports and adapters for the orchestrator.

`ports` defines the `RunStore` / `LockStore` Protocols the orchestrator depends on;
`memory` provides hermetic in-memory fakes for tests (AD-3); `firestore` provides the
production Cloud Firestore adapters.
"""
