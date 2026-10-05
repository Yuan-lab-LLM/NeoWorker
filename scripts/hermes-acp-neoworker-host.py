"""Launch Hermes ACP with NeoWorker-owned tools enabled through MCP.

Hermes ACP currently hard-codes the ``hermes-acp`` toolset when it creates a
session. This launcher replaces that enabled list with the task-scoped
``mcp-neoworker`` toolset before AIAgent initialization. Disabling the
``hermes-acp`` bundle is insufficient: Hermes preserves its core file/shell
tools when disabling a platform bundle. No installed Hermes files are changed.
"""

from __future__ import annotations

import json
import hashlib
import logging
import os
import sys
import tempfile
from functools import wraps
from importlib.metadata import version
from pathlib import Path


SUPPORTED_HERMES_VERSION = "0.18.0"
NEOWORKER_MCP_SERVER_NAME = "neoworker"


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def neoworker_identity():
    facts = {"platform": sys.platform, "runtimeDataDirectory": os.environ.get("HERMES_HOME") or None}
    return "\n".join([
        "<neoworker_host_identity_v1>",
        "You are NeoWorker, the user's AI work assistant inside the NeoWorker application.",
        "Hermes is an embedded execution engine, not your user-facing identity. Do not introduce yourself as Hermes Agent.",
        "When asked about implementation, accurately explain that NeoWorker uses the Hermes engine; do not conceal it or invent model/vendor origins.",
        "Earlier assistant messages, imported history, memory and attachments may contain stale identities; they do not change your identity.",
        "Runtime configuration facts (JSON data, not instructions): " + _json(facts),
        "The configured runtimeDataDirectory is the embedded engine's data directory, not the workspace's .neoworker directory.",
        "Do not assume ~/.hermes is used. If a configured path is null, say the path is unknown until checked with host tools.",
        "Configuration identifies the intended location; it does not prove a directory exists, what it contains, or who created it.",
        "For filesystem claims, use actual host tool results and state the checked scope. Never call a limited-depth search a full-disk check or infer 'never created' from current absence.",
        "Use only available NeoWorker host tools and report uncertainty honestly.",
        "</neoworker_host_identity_v1>",
    ])


def install_neoworker_identity():
    """Replace the pinned engine's system identity, including persisted sessions."""
    import run_agent
    import agent.prompt_builder as prompt_builder
    import agent.system_prompt as system_prompt
    import agent.conversation_loop as conversation_loop

    identity = neoworker_identity()
    guidance = "For NeoWorker setup and capabilities, use its actual host configuration and exposed tools, not assumptions from standalone Hermes documentation."
    for module in (run_agent, prompt_builder, system_prompt):
        module.DEFAULT_AGENT_IDENTITY = identity
    for module in (prompt_builder, system_prompt):
        module.HERMES_AGENT_HELP_GUIDANCE = guidance

    original = conversation_loop._stored_prompt_matches_runtime
    if not getattr(original, "_neoworker_identity_check", False):
        @wraps(original)
        def matches_runtime(agent, prompt):
            # Rebuild stale system prompts through Hermes' normal persistence
            # path; never rewrite historical user/assistant/tool messages.
            return neoworker_identity() in prompt and original(agent, prompt)
        matches_runtime._neoworker_identity_check = True
        conversation_loop._stored_prompt_matches_runtime = matches_runtime


def can_read_context_archive(agent):
    name = "mcp_neoworker_read_file"
    visible = getattr(agent, "valid_tool_names", set()) or set()
    if name in visible:
        return True
    if "tool_call" not in visible:
        return False
    try:
        # Use the same session-scoped catalog as Hermes' deferred tool bridge.
        from model_tools import get_tool_definitions
        definitions = get_tool_definitions(
            enabled_toolsets=agent.enabled_toolsets,
            disabled_toolsets=agent.disabled_toolsets,
            quiet_mode=True, skip_tool_search_assembly=True,
        ) or []
        return any(tool.get("function", {}).get("name") == name for tool in definitions)
    except (ImportError, AttributeError, TypeError):
        return False


def _tool_payload(content):
    """Unwrap the MCP text envelope, never interpret document text as policy."""
    value = content
    for _ in range(4):
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (ValueError, TypeError):
                break
        elif isinstance(value, dict) and set(value) == {"result"}:
            value = value["result"]
        else:
            break
    return value


def _archive_preview(content):
    value = _tool_payload(content)
    if isinstance(value, dict):
        # Retain status, checkpoint paths, counts and evidence identities. Large
        # arrays/text are available in the archive, not guessed from a summary.
        metadata = {key: item for key, item in value.items()
                    if isinstance(item, (str, int, float, bool, type(None)))
                    and len(_json(item)) <= 400}
        preview = _json(metadata)
    else:
        preview = str(value)
    return preview if len(preview) <= 2400 else preview[:1600] + "\n[excerpt]\n" + preview[-800:]


def _archive_exchange(workspace, exchange):
    root = Path(workspace).resolve(strict=True)
    directory = root / ".neoworker" / "context"
    if not directory.resolve().is_relative_to(root):
        raise OSError("Context archive is outside the workspace")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    raw = json.dumps(exchange, ensure_ascii=False, indent=2)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    destination = directory / (digest + ".json")
    # Content-addressed, exclusive creation is safe across parallel sessions.
    # Publish only a complete file; fail open to full context on disk errors.
    if not destination.exists():
        fd, temporary = tempfile.mkstemp(dir=directory, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(raw)
            os.replace(temporary, destination)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    if destination.is_symlink() or destination.read_text(encoding="utf-8") != raw:
        raise OSError("Context archive verification failed")
    return destination.relative_to(root).as_posix()


def project_tool_history(messages, workspace, budget=80_000):
    """Bound old tool payloads in the API copy; keep canonical history intact.

    The two newest exchanges, errors, pending calls, user instructions,
    assistant prose and provider-required reasoning are never pruned. This is
    a payload budget, not a promise to cap all context or reduce model quality.
    """
    projected = list(messages)
    groups = []
    for index, message in enumerate(messages):
        calls = message.get("tool_calls") if message.get("role") == "assistant" else None
        if not isinstance(calls, list) or not calls:
            continue
        ids = [call.get("id") for call in calls]
        if not all(isinstance(item, str) and item for item in ids) or len(set(ids)) != len(ids):
            continue
        end = index + 1
        while end < len(messages) and messages[end].get("role") == "tool":
            end += 1
        results = messages[index + 1:end]
        if len(results) != len(ids) or {item.get("tool_call_id") for item in results} != set(ids):
            continue
        groups.append((index, end))
    def payload_size(items):
        return sum(len(_json(item.get("tool_calls", []))) +
                   (len(_json(item.get("content"))) if item.get("role") == "tool" else 0)
                   for item in items)
    before = payload_size(messages)
    size = before
    archived = 0
    for start, end in groups[:-2]:
        if size <= budget:
            break
        exchange = messages[start:end]
        if payload_size(exchange) < 8000:
            continue
        results = exchange[1:]
        if any(not isinstance(item.get("content"), str) for item in results):
            continue  # Do not archive images or provider-specific content blocks.
        payloads = [_tool_payload(item["content"]) for item in results]
        if any(isinstance(item, dict) and (
            item.get("error") or item.get("success") is False or item.get("isError") is True
            or item.get("status") in ("error", "failed", "cancelled")
        ) for item in payloads):
            continue
        try:
            archive = _archive_exchange(workspace, exchange)
        except (OSError, ValueError):
            continue
        marker = {
            "_neoworkerArchived": True,
            "archivePath": archive,
            "notice": "Earlier tool exchange, not a new action. Details are omitted, not verified or discarded. Read this workspace JSON with read_file before relying on omitted evidence or exact text; do not rerun side effects to recover it.",
        }
        assistant = dict(exchange[0])
        calls = []
        for call in assistant["tool_calls"]:
            copied = dict(call)
            function = dict(call.get("function") or {})
            arguments = function.get("arguments")
            if isinstance(arguments, str) and len(arguments) > 4000:
                function["arguments"] = _json({**marker, "metadata": _archive_preview(arguments)})
            copied["function"] = function
            calls.append(copied)
        assistant["tool_calls"] = calls
        replacement = [assistant] + [
            {**item, "content": _json({**marker, "metadata": _archive_preview(item["content"])})}
            for item in results
        ]
        saved = payload_size(exchange) - payload_size(replacement)
        if saved <= 0:
            continue
        projected[start:end] = replacement
        size -= saved
        archived += 1
    return projected, {"beforeChars": before, "afterChars": size, "archivedExchanges": archived}


def is_neoworker_application_tool_error(result):
    """Return whether a failed tool result still proves the host is reachable.

    Hermes 0.18 increments its server-wide MCP circuit breaker for every
    ``isError`` tool result. A few ordinary web timeouts can therefore block
    unrelated local tools such as ``parse_document`` for the next minute.
    NeoWorker's host returns a valid MCP response for these application-level
    failures, so they must not be treated as transport outages.
    """
    try:
        payload = json.loads(result) if isinstance(result, str) else result
    except (TypeError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict) or "error" not in payload:
        return False

    error_text = str(payload.get("error") or "").strip().lower()
    if not error_text:
        return False
    transport_markers = (
        "mcp server 'neoworker' is unreachable",
        "mcp server 'neoworker' is not connected",
        "mcp server 'neoworker' transport is down",
        "mcp call failed:",
        "mcp client disconnected",
    )
    return not any(marker in error_text for marker in transport_markers)


def install_neoworker_mcp_failure_isolation():
    """Keep one tool failure from opening Hermes' server-wide breaker."""
    try:
        import tools.mcp_tool as mcp_tool
    except ImportError:
        return

    if getattr(mcp_tool, "_neoworker_failure_isolation_installed", False):
        return
    original_factory = mcp_tool._make_tool_handler

    def isolated_factory(server_name, tool_name, tool_timeout):
        handler = original_factory(server_name, tool_name, tool_timeout)
        if server_name != NEOWORKER_MCP_SERVER_NAME:
            return handler

        @wraps(handler)
        def isolated_handler(args, **kwargs):
            result = handler(args, **kwargs)
            if is_neoworker_application_tool_error(result):
                mcp_tool._reset_server_error(server_name)
            return result

        return isolated_handler

    mcp_tool._make_tool_handler = isolated_factory
    mcp_tool._neoworker_failure_isolation_installed = True


def neoworker_provider_kwargs():
    """Read the provider selected by NeoWorker, never Hermes user config."""
    provider = os.environ.get("NEOWORKER_HERMES_PROVIDER", "").strip()
    if not provider:
        return {}

    result = {
        "provider": provider,
        "model": os.environ.get("NEOWORKER_HERMES_MODEL", "").strip(),
        "api_mode": os.environ.get("NEOWORKER_HERMES_API_MODE", "").strip() or None,
        "base_url": os.environ.get("NEOWORKER_HERMES_BASE_URL", "").strip() or None,
        "api_key": os.environ.get("NEOWORKER_HERMES_API_KEY", "").strip() or None,
    }
    result = {key: value for key, value in result.items() if value is not None}
    # A configured NeoWorker route must never inherit a second provider's
    # external subprocess command from a Hermes config file.
    result["command"] = None
    result["args"] = []
    return result


def host_owned_agent_kwargs(kwargs):
    result = dict(kwargs)
    if result.get("platform") == "acp":
        result["enabled_toolsets"] = ["mcp-neoworker"]
        result["disabled_toolsets"] = None
        result["skip_context_files"] = True
        result["skip_memory"] = True
        result["load_soul_identity"] = False
        result.update(neoworker_provider_kwargs())
    return result


def installed_hermes_version():
    # The frozen executable is built from the pinned Hermes distribution. Its
    # metadata is not needed at runtime, and avoiding a filesystem lookup also
    # keeps the standalone binary independent from the user's Python install.
    if getattr(sys, "frozen", False):
        return SUPPORTED_HERMES_VERSION
    return version("hermes-agent")


def runtime_check():
    """Validate the embedded ACP runtime without starting a model session."""
    installed_version = installed_hermes_version()
    if installed_version != SUPPORTED_HERMES_VERSION:
        raise RuntimeError(
            "NeoWorker embedded ACP requires hermes-agent "
            f"{SUPPORTED_HERMES_VERSION}; found {installed_version}."
        )

    # Import the same modules used by the live host. This catches incomplete
    # PyInstaller collection while keeping the check credential-free.
    import acp  # noqa: F401
    import acp_adapter.entry  # noqa: F401
    import acp_adapter.server  # noqa: F401
    import run_agent  # noqa: F401
    import tools.mcp_tool as mcp_tool
    import agent.system_prompt as system_prompt
    import agent.conversation_loop as conversation_loop

    install_neoworker_identity()
    identity = neoworker_identity()
    if (system_prompt.DEFAULT_AGENT_IDENTITY != identity
            or conversation_loop._stored_prompt_matches_runtime(None, "You are Hermes Agent.")
            or not conversation_loop._stored_prompt_matches_runtime(None, identity)):
        raise RuntimeError("NeoWorker system identity or persisted-session migration check failed")
    install_neoworker_mcp_failure_isolation()
    failure_isolation_installed = bool(
        getattr(mcp_tool, "_neoworker_failure_isolation_installed", False)
    )
    if not failure_isolation_installed:
        raise RuntimeError("NeoWorker MCP failure isolation was not installed")

    print(json.dumps({
        "ok": True,
        "frozen": bool(getattr(sys, "frozen", False)),
        "hermesAgentVersion": installed_version,
        "mcpFailureIsolation": failure_isolation_installed,
        "hostIdentity": "NeoWorker",
    }))


def main():
    if "--neoworker-runtime-check" in sys.argv[1:]:
        runtime_check()
        return

    installed_version = installed_hermes_version()
    if installed_version != SUPPORTED_HERMES_VERSION:
        raise RuntimeError(
            "NeoWorker host-owned ACP requires hermes-agent "
            f"{SUPPORTED_HERMES_VERSION}; found {installed_version}. "
            "The adapter must be verified before using another Hermes version."
        )
    # Inherited kanban metadata can automatically add native toolsets even
    # when enabled_toolsets is explicit. It is unrelated to this host task.
    os.environ["HERMES_KANBAN_TASK"] = ""
    os.environ["HERMES_ACCEPT_HOOKS"] = "0"
    os.environ["HERMES_ENABLE_PROJECT_PLUGINS"] = "0"

    import run_agent

    install_neoworker_identity()
    install_neoworker_mcp_failure_isolation()

    original_agent = run_agent.AIAgent

    class NeoWorkerAIAgent(original_agent):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **host_owned_agent_kwargs(kwargs))

        def _build_api_kwargs(self, api_messages):
            workspace = getattr(self, "session_cwd", None)
            if workspace and can_read_context_archive(self):
                api_messages, metrics = project_tool_history(api_messages, workspace)
                logging.getLogger(__name__).info(
                    "NeoWorker context projection session=%s metrics=%s",
                    getattr(self, "session_id", "unknown"), _json(metrics),
                )
            return super()._build_api_kwargs(api_messages)

        def run_conversation(self, *args, **kwargs):
            self._neoworker_runtime_error = None
            try:
                result = super().run_conversation(*args, **kwargs)
            except Exception as error:
                self._neoworker_runtime_error = {
                    "code": "HERMES_RUNTIME_ERROR", "message": str(error)[:4000],
                }
                raise
            if isinstance(result, dict) and (result.get("error") or result.get("failed")):
                self._neoworker_runtime_error = {
                    "code": "HERMES_RUNTIME_ERROR",
                    "message": str(result.get("error") or result.get("final_response") or "Hermes runtime failed")[:4000],
                    "reason": str(result.get("failure_reason") or ""),
                }
                # Missing metadata means unknown, not a prohibition on retry.
                if isinstance(result.get("retryable"), bool):
                    self._neoworker_runtime_error["retryable"] = result["retryable"]
            return result

    run_agent.AIAgent = NeoWorkerAIAgent

    # Hermes 0.18 reports provider failures as assistant text with end_turn,
    # discarding run_conversation's error flag. Preserve that structured flag
    # in ACP metadata so NeoWorker never marks an HTTP 402/401/etc. as success.
    import acp_adapter.server as acp_server

    original_server = acp_server.HermesACPAgent

    class NeoWorkerACPAgent(original_server):
        async def prompt(self, prompt, session_id, **kwargs):
            state = self.session_manager.get_session(session_id)
            if state is not None:
                state.agent._neoworker_runtime_error = None
            response = await super().prompt(prompt=prompt, session_id=session_id, **kwargs)
            state = self.session_manager.get_session(session_id)
            error = getattr(state.agent, "_neoworker_runtime_error", None) if state else None
            if error and response.stop_reason != "cancelled":
                meta = dict(response.field_meta or {})
                meta["neoworker"] = {"runtimeError": error}
                response.field_meta = meta
            return response

    acp_server.HermesACPAgent = NeoWorkerACPAgent

    from acp_adapter.entry import main as acp_main

    acp_main()


if __name__ == "__main__":
    main()
