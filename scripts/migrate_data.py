#!/usr/bin/env python3
"""
Data migration script for TodoList app.

Copies all user data from one backend deployment (source) to another (destination)
via the REST API. Useful for migrating between Railway deployments with different
MongoDB instances.

Usage:
    python scripts/migrate_data.py \
        --source-url https://backend-old.up.railway.app \
        --dest-url https://backend-new.up.railway.app \
        --source-token <session_token> \
        --dest-token <session_token>

    # Or use environment variables:
    SOURCE_URL=https://... DEST_URL=https://... \
    SOURCE_TOKEN=... DEST_TOKEN=... \
    python scripts/migrate_data.py

To obtain a session token:
    1. Log in to the app in your browser
    2. Open DevTools -> Application -> Local Storage
    3. Copy the value of the "session_token" key

Options:
    --dry-run       Preview what would be migrated without writing
    --skip-sessions Skip chat session migration (large data)
    --skip-memories Skip agent memory migration
    --space NAME    Only migrate a specific space (by name)
"""

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:
    print("Error: 'requests' package is required. Install with: pip install requests")
    sys.exit(1)


class MigrationClient:
    """HTTP client for interacting with a TodoList backend."""

    def __init__(self, base_url: str, token: str, label: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.label = label
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        resp = requests.get(self._url(path), headers=self.headers, params=params, timeout=60)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def post(self, path: str, data: Any = None) -> Any:
        resp = requests.post(self._url(path), headers=self.headers, json=data, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def put(self, path: str, data: Any = None, params: Optional[dict] = None) -> Any:
        resp = requests.put(
            self._url(path), headers=self.headers, json=data, params=params, timeout=60
        )
        resp.raise_for_status()
        return resp.json()

    def delete(self, path: str) -> Any:
        resp = requests.delete(self._url(path), headers=self.headers, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def verify(self) -> dict:
        """Verify authentication and return user info."""
        return self.get("/auth/me")


class DataMigrator:
    """Orchestrates data migration between two TodoList backends."""

    def __init__(
        self,
        source: MigrationClient,
        dest: MigrationClient,
        dry_run: bool = False,
        skip_sessions: bool = False,
        skip_memories: bool = False,
        space_filter: Optional[str] = None,
    ):
        self.source = source
        self.dest = dest
        self.dry_run = dry_run
        self.skip_sessions = skip_sessions
        self.skip_memories = skip_memories
        self.space_filter = space_filter

        # Maps source IDs to destination IDs
        self.space_id_map: Dict[str, str] = {}
        self.todo_id_map: Dict[str, str] = {}

        # Counters
        self.stats: Dict[str, Dict[str, int]] = {
            "spaces": {"migrated": 0, "skipped": 0, "errors": 0},
            "categories": {"migrated": 0, "skipped": 0, "errors": 0},
            "todos": {"migrated": 0, "skipped": 0, "errors": 0},
            "journals": {"migrated": 0, "skipped": 0, "errors": 0},
            "memories": {"migrated": 0, "skipped": 0, "errors": 0},
            "sessions": {"migrated": 0, "skipped": 0, "errors": 0},
        }

    def log(self, msg: str, indent: int = 0):
        prefix = "  " * indent
        if self.dry_run:
            print(f"{prefix}[DRY RUN] {msg}")
        else:
            print(f"{prefix}{msg}")

    def run(self):
        """Execute the full migration."""
        print("=" * 60)
        print("TodoList Data Migration")
        print("=" * 60)

        # Verify authentication on both backends
        print("\nVerifying connections...")
        source_user = self.source.verify()
        dest_user = self.dest.verify()
        print(f"  Source: {source_user.get('email')} @ {self.source.base_url}")
        print(f"  Dest:   {dest_user.get('email')} @ {self.dest.base_url}")

        if source_user.get("email") != dest_user.get("email"):
            print(
                f"\n  WARNING: Source and destination users have different emails!"
                f"\n  Source: {source_user.get('email')}"
                f"\n  Dest:   {dest_user.get('email')}"
            )
            resp = input("  Continue anyway? [y/N]: ")
            if resp.lower() != "y":
                print("Aborted.")
                return

        if self.dry_run:
            print("\n*** DRY RUN MODE - no data will be written ***\n")

        # Step 1: Migrate spaces
        self._migrate_spaces()

        # Step 2: Migrate categories (per space)
        self._migrate_categories()

        # Step 3: Migrate todos (per space)
        self._migrate_todos()

        # Step 4: Migrate journals (per space)
        self._migrate_journals()

        # Step 5: Migrate agent memories (per space)
        if not self.skip_memories:
            self._migrate_memories()
        else:
            print("\n[Skipping agent memories]")

        # Step 6: Migrate chat sessions (per space)
        if not self.skip_sessions:
            self._migrate_sessions()
        else:
            print("\n[Skipping chat sessions]")

        # Print summary
        self._print_summary()

    def _migrate_spaces(self):
        print("\n--- Migrating Spaces ---")
        source_spaces = self.source.get("/spaces") or []
        dest_spaces = self.dest.get("/spaces") or []
        dest_space_names = {s["name"]: s for s in dest_spaces}

        for space in source_spaces:
            name = space.get("name", "")
            source_id = space.get("_id")

            if self.space_filter and name != self.space_filter:
                self.log(f"Skipping space '{name}' (filter active)", indent=1)
                self.stats["spaces"]["skipped"] += 1
                continue

            if space.get("is_default"):
                # Default (personal) space: map source to dest default
                dest_default = next(
                    (s for s in dest_spaces if s.get("is_default")), None
                )
                if dest_default:
                    self.space_id_map[source_id] = dest_default["_id"]
                    self.log(
                        f"Mapped default space: {source_id} -> {dest_default['_id']}",
                        indent=1,
                    )
                    self.stats["spaces"]["skipped"] += 1
                else:
                    # No default space on dest yet; it should auto-create on first use
                    self.space_id_map[source_id] = source_id
                    self.log(f"No default space on dest, using source ID", indent=1)
                continue

            if name in dest_space_names:
                # Space already exists on destination
                dest_space = dest_space_names[name]
                self.space_id_map[source_id] = dest_space["_id"]
                self.log(f"Space '{name}' already exists on dest, mapped", indent=1)
                self.stats["spaces"]["skipped"] += 1
                continue

            try:
                if not self.dry_run:
                    new_space = self.dest.post("/spaces", {"name": name})
                    dest_id = new_space.get("_id")
                    self.space_id_map[source_id] = dest_id
                    self.log(f"Created space '{name}': {source_id} -> {dest_id}", indent=1)
                else:
                    self.space_id_map[source_id] = f"<new:{name}>"
                    self.log(f"Would create space '{name}'", indent=1)
                self.stats["spaces"]["migrated"] += 1
            except Exception as e:
                self.log(f"ERROR creating space '{name}': {e}", indent=1)
                self.stats["spaces"]["errors"] += 1

    def _get_space_ids(self) -> List[Optional[str]]:
        """Return list of space IDs to iterate over (None = personal space)."""
        space_ids: List[Optional[str]] = [None]  # Personal space (no space_id)
        space_ids.extend(self.space_id_map.keys())
        return space_ids

    def _map_space_id(self, source_space_id: Optional[str]) -> Optional[str]:
        """Map a source space_id to the destination space_id."""
        if source_space_id is None:
            return None
        return self.space_id_map.get(source_space_id, source_space_id)

    def _migrate_categories(self):
        print("\n--- Migrating Categories ---")
        for source_space_id in self._get_space_ids():
            space_label = source_space_id or "personal"
            params = {"space_id": source_space_id} if source_space_id else {}
            dest_space_id = self._map_space_id(source_space_id)
            dest_params = {"space_id": dest_space_id} if dest_space_id else {}

            try:
                source_cats = self.source.get("/categories", params=params) or []
                dest_cats = self.dest.get("/categories", params=dest_params) or []
            except Exception as e:
                self.log(f"Error fetching categories for {space_label}: {e}", indent=1)
                continue

            dest_cat_set = set(dest_cats)
            for cat in source_cats:
                if cat in dest_cat_set:
                    self.stats["categories"]["skipped"] += 1
                    continue

                try:
                    if not self.dry_run:
                        data = {"name": cat}
                        if dest_space_id:
                            data["space_id"] = dest_space_id
                        self.dest.post("/categories", data)
                    self.log(f"Category '{cat}' in {space_label}", indent=1)
                    self.stats["categories"]["migrated"] += 1
                except Exception as e:
                    self.log(f"ERROR category '{cat}': {e}", indent=1)
                    self.stats["categories"]["errors"] += 1

    def _migrate_todos(self):
        print("\n--- Migrating Todos ---")
        for source_space_id in self._get_space_ids():
            space_label = source_space_id or "personal"
            params = {}
            if source_space_id:
                params["space_id"] = source_space_id
            dest_space_id = self._map_space_id(source_space_id)

            try:
                source_todos = self.source.get("/todos", params=params) or []
            except Exception as e:
                self.log(f"Error fetching todos for {space_label}: {e}", indent=1)
                continue

            self.log(f"Space '{space_label}': {len(source_todos)} todos", indent=1)

            # Get existing todos on dest to avoid duplicates (match by text + dateAdded)
            dest_params = {}
            if dest_space_id:
                dest_params["space_id"] = dest_space_id
            try:
                dest_todos = self.dest.get("/todos", params=dest_params) or []
            except Exception:
                dest_todos = []

            dest_todo_keys = set()
            for t in dest_todos:
                key = (t.get("text", ""), t.get("dateAdded", ""))
                dest_todo_keys.add(key)

            # Migrate parent todos first, then subtasks
            parents = [t for t in source_todos if not t.get("parent_id")]
            subtasks = [t for t in source_todos if t.get("parent_id")]

            for todo in parents:
                self._create_todo(todo, dest_space_id, dest_todo_keys)

            for todo in subtasks:
                self._create_todo(todo, dest_space_id, dest_todo_keys)

    def _create_todo(
        self,
        todo: dict,
        dest_space_id: Optional[str],
        dest_todo_keys: set,
    ):
        source_id = todo.get("_id")
        text = todo.get("text", "")
        key = (text, todo.get("dateAdded", ""))

        if key in dest_todo_keys:
            # Map the ID even for skipped todos (for subtask parent_id mapping)
            self.stats["todos"]["skipped"] += 1
            return

        try:
            # Build the todo payload for creation
            payload: Dict[str, Any] = {
                "text": text,
                "category": todo.get("category", "General"),
                "priority": todo.get("priority", "Medium"),
                "dateAdded": todo.get("dateAdded", ""),
                "completed": todo.get("completed", False),
                "created_offline": True,  # Skip AI classification on dest
            }

            # Optional fields
            for field in [
                "dueDate", "notes", "link", "sortOrder",
                "dateCompleted", "creator_type", "agent_id",
                "closed", "dateClosed", "recurrence_rule", "recurrence_next",
            ]:
                if todo.get(field) is not None:
                    payload[field] = todo[field]

            if dest_space_id:
                payload["space_id"] = dest_space_id

            # Map parent_id for subtasks
            if todo.get("parent_id"):
                mapped_parent = self.todo_id_map.get(todo["parent_id"])
                if mapped_parent:
                    payload["parent_id"] = mapped_parent
                else:
                    # Parent not yet migrated or was skipped
                    self.log(
                        f"WARNING: parent {todo['parent_id']} not found for subtask '{text[:40]}...'",
                        indent=2,
                    )
                    # Skip subtask if parent mapping failed
                    self.stats["todos"]["errors"] += 1
                    return

            # Map depends_on IDs
            if todo.get("depends_on"):
                mapped_deps = []
                for dep_id in todo["depends_on"]:
                    mapped = self.todo_id_map.get(dep_id)
                    if mapped:
                        mapped_deps.append(mapped)
                if mapped_deps:
                    payload["depends_on"] = mapped_deps

            if not self.dry_run:
                result = self.dest.post("/todos", payload)
                new_id = result.get("_id")
                if source_id and new_id:
                    self.todo_id_map[source_id] = new_id
            else:
                self.log(f"Would create todo: '{text[:50]}'", indent=2)

            self.stats["todos"]["migrated"] += 1
        except Exception as e:
            self.log(f"ERROR todo '{text[:40]}': {e}", indent=2)
            self.stats["todos"]["errors"] += 1

    def _migrate_journals(self):
        print("\n--- Migrating Journals ---")
        for source_space_id in self._get_space_ids():
            space_label = source_space_id or "personal"
            params = {}
            if source_space_id:
                params["space_id"] = source_space_id
            dest_space_id = self._map_space_id(source_space_id)
            dest_params = {}
            if dest_space_id:
                dest_params["space_id"] = dest_space_id

            try:
                source_journals = self.source.get("/journals", params=params)
                if source_journals is None:
                    source_journals = []
                elif isinstance(source_journals, dict):
                    # Single entry returned
                    source_journals = [source_journals]
            except Exception as e:
                self.log(f"Error fetching journals for {space_label}: {e}", indent=1)
                continue

            self.log(f"Space '{space_label}': {len(source_journals)} journals", indent=1)

            # Get existing journal dates on dest
            try:
                dest_journals = self.dest.get("/journals", params=dest_params)
                if dest_journals is None:
                    dest_journals = []
                elif isinstance(dest_journals, dict):
                    dest_journals = [dest_journals]
            except Exception:
                dest_journals = []

            dest_dates = {j.get("date") for j in dest_journals}

            for journal in source_journals:
                date = journal.get("date", "")
                text = journal.get("text", "")

                if date in dest_dates:
                    self.stats["journals"]["skipped"] += 1
                    continue

                try:
                    if not self.dry_run:
                        payload = {"date": date, "text": text}
                        if dest_space_id:
                            payload["space_id"] = dest_space_id
                        self.dest.post("/journals", payload)
                    self.log(f"Journal {date}", indent=2)
                    self.stats["journals"]["migrated"] += 1
                except Exception as e:
                    self.log(f"ERROR journal {date}: {e}", indent=2)
                    self.stats["journals"]["errors"] += 1

    def _migrate_memories(self):
        print("\n--- Migrating Agent Memories ---")
        for source_space_id in self._get_space_ids():
            space_label = source_space_id or "personal"
            params = {}
            if source_space_id:
                params["space_id"] = source_space_id
            dest_space_id = self._map_space_id(source_space_id)
            dest_params = {}
            if dest_space_id:
                dest_params["space_id"] = dest_space_id

            try:
                source_memories = self.source.get("/memories", params=params) or []
            except Exception as e:
                self.log(f"Error fetching memories for {space_label}: {e}", indent=1)
                continue

            self.log(f"Space '{space_label}': {len(source_memories)} memories", indent=1)

            # Get existing memory keys on dest
            try:
                dest_memories = self.dest.get("/memories", params=dest_params) or []
            except Exception:
                dest_memories = []

            dest_keys = {m.get("key") for m in dest_memories}

            for memory in source_memories:
                key = memory.get("key", "")
                value = memory.get("value", "")

                if key in dest_keys:
                    self.stats["memories"]["skipped"] += 1
                    continue

                try:
                    if not self.dry_run:
                        payload = {"key": key, "value": value}
                        if memory.get("category"):
                            payload["category"] = memory["category"]
                        self.dest.put("/memories", payload, params=dest_params)
                    self.log(f"Memory '{key[:40]}'", indent=2)
                    self.stats["memories"]["migrated"] += 1
                except Exception as e:
                    self.log(f"ERROR memory '{key[:40]}': {e}", indent=2)
                    self.stats["memories"]["errors"] += 1

    def _migrate_sessions(self):
        print("\n--- Migrating Chat Sessions ---")
        for source_space_id in self._get_space_ids():
            space_label = source_space_id or "personal"
            params = {}
            if source_space_id:
                params["space_id"] = source_space_id
            dest_space_id = self._map_space_id(source_space_id)

            try:
                source_sessions = self.source.get("/agent/sessions", params=params) or []
            except Exception as e:
                self.log(f"Error fetching sessions for {space_label}: {e}", indent=1)
                continue

            self.log(
                f"Space '{space_label}': {len(source_sessions)} sessions", indent=1
            )

            for session in source_sessions:
                session_id = session.get("_id") or session.get("session_id")
                title = session.get("title", "")
                todo_id = session.get("todo_id")

                try:
                    # Fetch full session with messages
                    full_session = self.source.get(f"/agent/sessions/{session_id}")
                    if not full_session:
                        self.stats["sessions"]["skipped"] += 1
                        continue

                    messages = full_session.get("messages", [])
                    if not messages:
                        self.stats["sessions"]["skipped"] += 1
                        continue

                    # Map todo_id if this session is linked to a todo
                    mapped_todo_id = None
                    if todo_id:
                        mapped_todo_id = self.todo_id_map.get(todo_id)

                    if not self.dry_run:
                        # Create session on dest
                        create_payload = {
                            "title": title,
                        }
                        if dest_space_id:
                            create_payload["space_id"] = dest_space_id
                        if mapped_todo_id:
                            create_payload["todo_id"] = mapped_todo_id

                        # Use first message as initial message
                        first_msg = messages[0] if messages else None
                        if first_msg:
                            create_payload["initial_message"] = first_msg.get(
                                "content", ""
                            )
                            create_payload["initial_role"] = first_msg.get(
                                "role", "user"
                            )
                            if first_msg.get("agent_id"):
                                create_payload["agent_id"] = first_msg["agent_id"]

                        new_session = self.dest.post("/agent/sessions", create_payload)
                        new_session_id = new_session.get("session_id") or new_session.get("_id")

                        # Post remaining messages
                        for msg in messages[1:]:
                            try:
                                msg_payload = {
                                    "role": msg.get("role", "user"),
                                    "content": msg.get("content", ""),
                                }
                                if msg.get("agent_id"):
                                    msg_payload["agent_id"] = msg["agent_id"]
                                self.dest.post(
                                    f"/agent/sessions/{new_session_id}/messages",
                                    msg_payload,
                                )
                            except Exception as e:
                                self.log(
                                    f"  Warning: failed to post message to session: {e}",
                                    indent=3,
                                )
                    else:
                        self.log(
                            f"Would create session '{title[:40]}' with {len(messages)} messages",
                            indent=2,
                        )

                    self.stats["sessions"]["migrated"] += 1
                except Exception as e:
                    self.log(f"ERROR session '{title[:40]}': {e}", indent=2)
                    self.stats["sessions"]["errors"] += 1

            # Rate limit between spaces
            time.sleep(0.5)

    def _print_summary(self):
        print("\n" + "=" * 60)
        print("Migration Summary")
        print("=" * 60)
        total_migrated = 0
        total_skipped = 0
        total_errors = 0

        for entity, counts in self.stats.items():
            migrated = counts["migrated"]
            skipped = counts["skipped"]
            errors = counts["errors"]
            total_migrated += migrated
            total_skipped += skipped
            total_errors += errors

            status = ""
            if errors > 0:
                status = " [!]"
            print(
                f"  {entity:12s}: {migrated:4d} migrated, "
                f"{skipped:4d} skipped, {errors:4d} errors{status}"
            )

        print(f"\n  Total: {total_migrated} migrated, {total_skipped} skipped, {total_errors} errors")

        if self.dry_run:
            print("\n  *** This was a DRY RUN. No data was written. ***")

        if total_errors > 0:
            print("\n  Some errors occurred. Check the output above for details.")


def main():
    parser = argparse.ArgumentParser(
        description="Migrate TodoList data between backend deployments via the API.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--source-url",
        default=os.environ.get("SOURCE_URL"),
        help="Source backend URL (or SOURCE_URL env var)",
    )
    parser.add_argument(
        "--dest-url",
        default=os.environ.get("DEST_URL"),
        help="Destination backend URL (or DEST_URL env var)",
    )
    parser.add_argument(
        "--source-token",
        default=os.environ.get("SOURCE_TOKEN"),
        help="Session token for source backend (or SOURCE_TOKEN env var)",
    )
    parser.add_argument(
        "--dest-token",
        default=os.environ.get("DEST_TOKEN"),
        help="Session token for destination backend (or DEST_TOKEN env var)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview migration without writing any data",
    )
    parser.add_argument(
        "--skip-sessions",
        action="store_true",
        help="Skip chat session migration",
    )
    parser.add_argument(
        "--skip-memories",
        action="store_true",
        help="Skip agent memory migration",
    )
    parser.add_argument(
        "--space",
        default=None,
        help="Only migrate a specific space (by name)",
    )

    args = parser.parse_args()

    # Validate required arguments
    if not args.source_url:
        parser.error("--source-url is required (or set SOURCE_URL env var)")
    if not args.dest_url:
        parser.error("--dest-url is required (or set DEST_URL env var)")
    if not args.source_token:
        parser.error("--source-token is required (or set SOURCE_TOKEN env var)")
    if not args.dest_token:
        parser.error("--dest-token is required (or set DEST_TOKEN env var)")

    # Safety check: source and dest should not be the same
    if args.source_url.rstrip("/") == args.dest_url.rstrip("/"):
        print("ERROR: Source and destination URLs are the same!")
        sys.exit(1)

    source = MigrationClient(args.source_url, args.source_token, "source")
    dest = MigrationClient(args.dest_url, args.dest_token, "dest")

    migrator = DataMigrator(
        source=source,
        dest=dest,
        dry_run=args.dry_run,
        skip_sessions=args.skip_sessions,
        skip_memories=args.skip_memories,
        space_filter=args.space,
    )

    try:
        migrator.run()
    except KeyboardInterrupt:
        print("\n\nMigration interrupted by user.")
        migrator._print_summary()
        sys.exit(1)
    except requests.exceptions.ConnectionError as e:
        print(f"\nConnection error: {e}")
        print("Check that both backend URLs are accessible.")
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"\nHTTP error: {e}")
        if e.response is not None:
            print(f"Response: {e.response.text[:500]}")
        sys.exit(1)


if __name__ == "__main__":
    main()
