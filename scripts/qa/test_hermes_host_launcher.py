"""Exercise the host launcher without requiring Hermes or model credentials."""

import importlib.util
import asyncio
import json
import copy
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "neoworker_host_launcher",
    Path(__file__).resolve().parents[1] / "hermes-acp-neoworker-host.py",
)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class ContextProjectionTests(unittest.TestCase):
    def test_requires_a_session_scoped_archive_reader_including_deferred_tools(self):
        agent = types.SimpleNamespace(valid_tool_names={"run_command"})
        self.assertFalse(launcher.can_read_context_archive(agent))
        agent.valid_tool_names = {"mcp_neoworker_read_file"}
        self.assertTrue(launcher.can_read_context_archive(agent))
        agent.valid_tool_names = {"tool_call"}
        agent.enabled_toolsets = ["mcp-neoworker"]
        agent.disabled_toolsets = None
        model_tools = types.ModuleType("model_tools")
        def get_tools(**kwargs):
            self.assertEqual(kwargs["enabled_toolsets"], ["mcp-neoworker"])
            self.assertTrue(kwargs["skip_tool_search_assembly"])
            return [{"function": {"name": "mcp_neoworker_read_file"}}]
        model_tools.get_tool_definitions = get_tools
        with patch.dict(sys.modules, {"model_tools": model_tools}):
            self.assertTrue(launcher.can_read_context_archive(agent))
            model_tools.get_tool_definitions = lambda **kwargs: []
            self.assertFalse(launcher.can_read_context_archive(agent))

    def exchange(self, number, tool="read_file", result=None):
        return [
            {"role": "assistant", "content": "Keep source citations and terminology.",
             "reasoning_content": "provider-required-reasoning",
             "tool_calls": [{"id": str(number), "type": "function", "function": {
                 "name": tool, "arguments": json.dumps({"path": "source.docx", "text": "x" * 9000})}}]},
            {"role": "tool", "tool_call_id": str(number), "content": json.dumps({"result": json.dumps(
                result or {"success": True, "path": "output.docx", "content": "evidence" * 5000})})},
        ]

    def test_general_tool_payloads_are_retrievable_and_history_is_unchanged(self):
        messages = [{"role": "system", "content": "System instructions"},
                    {"role": "user", "content": "Compare the sources; cite exact figures."}]
        for number, tool in enumerate(["web_search", "web_fetch", "read_file", "run_command",
                                       "create_presentation", "create_spreadsheet", "office_translation"]):
            messages.extend(self.exchange(number, tool))
        original = copy.deepcopy(messages)
        with tempfile.TemporaryDirectory() as workspace:
            projected, metrics = launcher.project_tool_history(messages, workspace, budget=1)
            self.assertEqual(metrics["archivedExchanges"], 5)
            self.assertLess(metrics["afterChars"], metrics["beforeChars"] / 2)
            self.assertEqual(projected[:2], messages[:2])
            self.assertEqual(projected[-4:], messages[-4:])
            for index in range(2, len(messages) - 4, 2):
                self.assertEqual(projected[index]["content"], messages[index]["content"])
                self.assertEqual(projected[index]["reasoning_content"], messages[index]["reasoning_content"])
                self.assertEqual(projected[index]["tool_calls"][0]["id"], projected[index+1]["tool_call_id"])
                marker = json.loads(projected[index+1]["content"])
                archive = Path(workspace) / marker["archivePath"]
                self.assertEqual(json.loads(archive.read_text()), messages[index:index+2])
                self.assertIn("output.docx", marker["metadata"])
            # Repeat projection reuses the same archives, including after restart.
            again, _ = launcher.project_tool_history(messages, workspace, budget=1)
            self.assertEqual(again, projected)
            self.assertEqual(len(list(Path(workspace).rglob("*.json"))), 5)
        self.assertEqual(messages, original)

    def test_errors_incomplete_calls_and_multimodal_results_are_not_elided(self):
        messages = self.exchange(0, result={"error": "failed" * 5000})
        messages += self.exchange(1, result={"success": False, "content": "x" * 20000})
        messages += self.exchange(2)
        messages[-1]["content"] = [{"type": "image_url", "image_url": {"url": "data:image/png;base64,example"}}]
        messages += self.exchange(3)[:1]  # No response yet, keep full arguments.
        messages += self.exchange(4) + self.exchange(5)
        with tempfile.TemporaryDirectory() as workspace:
            projected, metrics = launcher.project_tool_history(messages, workspace, budget=1)
        self.assertEqual(projected, messages)
        self.assertEqual(metrics["archivedExchanges"], 0)

    def test_simple_requests_do_not_touch_disk_or_add_context(self):
        messages = [{"role": "user", "content": "hello"}]
        with patch.object(launcher, "_archive_exchange", side_effect=AssertionError("unnecessary IO")):
            self.assertEqual(launcher.project_tool_history(messages, "/unused")[0], messages)

    def test_archive_failure_keeps_full_evidence(self):
        messages = self.exchange(0) + self.exchange(1) + self.exchange(2)
        with patch.object(launcher, "_archive_exchange", side_effect=OSError("disk full")):
            projected, metrics = launcher.project_tool_history(messages, "/unused", budget=1)
        self.assertEqual(projected, messages)
        self.assertEqual(metrics["archivedExchanges"], 0)

    def test_parallel_tool_pairs_are_preserved_as_one_exchange(self):
        first = self.exchange(0)
        second = self.exchange(1)
        first[0]["tool_calls"].extend(second[0]["tool_calls"])
        messages = first + second[1:] + self.exchange(2) + self.exchange(3)
        with tempfile.TemporaryDirectory() as workspace:
            projected, metrics = launcher.project_tool_history(messages, workspace, budget=1)
        self.assertEqual(metrics["archivedExchanges"], 1)
        self.assertEqual([call["id"] for call in projected[0]["tool_calls"]], ["0", "1"])
        self.assertEqual([item["tool_call_id"] for item in projected[1:3]], ["0", "1"])

    def test_archive_symlink_cannot_redirect_outside_the_workspace(self):
        with tempfile.TemporaryDirectory() as workspace, tempfile.TemporaryDirectory() as outside:
            Path(workspace, ".neoworker").symlink_to(outside, target_is_directory=True)
            messages = self.exchange(0) + self.exchange(1) + self.exchange(2)
            projected, metrics = launcher.project_tool_history(messages, workspace, budget=1)
            self.assertEqual(projected, messages)
            self.assertEqual(metrics["archivedExchanges"], 0)
            self.assertEqual(list(Path(outside).iterdir()), [])


class HostLauncherTests(unittest.TestCase):
    @staticmethod
    def _modules(run_agent, entry_main, server_agent=None):
        """Build package-shaped stubs so CI does not need Hermes installed."""
        package = types.ModuleType("acp_adapter")
        package.__path__ = []
        entry = types.ModuleType("acp_adapter.entry")
        entry.main = entry_main
        server = types.ModuleType("acp_adapter.server")
        if server_agent is not None:
            server.HermesACPAgent = server_agent
        agent_package = types.ModuleType("agent")
        agent_package.__path__ = []
        prompt_builder = types.ModuleType("agent.prompt_builder")
        system_prompt = types.ModuleType("agent.system_prompt")
        conversation_loop = types.ModuleType("agent.conversation_loop")
        conversation_loop._stored_prompt_matches_runtime = lambda agent, prompt: "stale-model" not in prompt
        return {
            "run_agent": run_agent,
            "acp_adapter": package,
            "acp_adapter.entry": entry,
            "acp_adapter.server": server,
            "agent": agent_package,
            "agent.prompt_builder": prompt_builder,
            "agent.system_prompt": system_prompt,
            "agent.conversation_loop": conversation_loop,
        }

    def test_replaces_the_native_and_configured_toolsets_before_agent_init(self):
        created = []
        run_agent = types.ModuleType("run_agent")

        class Agent:
            def __init__(self, *args, **kwargs):
                created.append(kwargs)

        run_agent.AIAgent = Agent
        entry_main = lambda: run_agent.AIAgent(
            platform="acp", model="test-model",
            enabled_toolsets=["hermes-acp", "mcp-other"],
            disabled_toolsets=["terminal"],
        )
        class ServerAgent:
            pass
        with (
            patch.object(launcher, "version", return_value="0.18.0"),
            patch.dict(sys.modules, self._modules(run_agent, entry_main, ServerAgent)),
            patch.dict(launcher.os.environ, {"HERMES_KANBAN_TASK": "old-task", "HERMES_ACCEPT_HOOKS": "1"}),
        ):
            launcher.main()
            self.assertEqual(launcher.os.environ["HERMES_KANBAN_TASK"], "")
            self.assertEqual(launcher.os.environ["HERMES_ACCEPT_HOOKS"], "0")
            self.assertEqual(launcher.os.environ["HERMES_ENABLE_PROJECT_PLUGINS"], "0")
        self.assertEqual(created, [{
            "platform": "acp", "model": "test-model",
            "enabled_toolsets": ["mcp-neoworker"], "disabled_toolsets": None,
            "skip_context_files": True, "skip_memory": True,
            "load_soul_identity": False,
        }])

    def test_system_identity_and_old_session_cache_are_host_owned(self):
        modules = self._modules(types.ModuleType("run_agent"), lambda: None)
        for home, platform in [("/Users/test/Library/Application Support/neoworker/hermes-runtime", "darwin"),
                               (r"C:\Users\test\AppData\Roaming\neoworker\hermes-runtime", "win32")]:
            with patch.dict(sys.modules, modules), patch.dict(launcher.os.environ, {"HERMES_HOME": home}), patch.object(launcher.sys, "platform", platform):
                launcher.install_neoworker_identity()
                identity = launcher.neoworker_identity()
                self.assertIn("You are NeoWorker", identity)
                facts = json.loads(next(line.split(": ", 1)[1] for line in identity.splitlines() if line.startswith("Runtime configuration facts")))
                self.assertEqual(facts, {"platform": platform, "runtimeDataDirectory": home})
                for name in ["run_agent", "agent.prompt_builder", "agent.system_prompt"]:
                    self.assertEqual(modules[name].DEFAULT_AGENT_IDENTITY, identity)
                check = modules["agent.conversation_loop"]._stored_prompt_matches_runtime
                self.assertFalse(check(None, "You are Hermes Agent. Old cached prompt."))
                self.assertTrue(check(None, identity + "\nTool and safety instructions."))
                self.assertFalse(check(None, identity + "\nstale-model"))
                launcher.install_neoworker_identity()
                self.assertIs(check, modules["agent.conversation_loop"]._stored_prompt_matches_runtime)
        self.assertFalse(launcher.host_owned_agent_kwargs({"platform": "acp", "load_soul_identity": True})["load_soul_identity"])

    def test_directory_facts_do_not_guess_missing_configuration(self):
        with patch.dict(launcher.os.environ, {}, clear=True):
            identity = launcher.neoworker_identity()
        self.assertIn('"runtimeDataDirectory":null', identity)
        self.assertIn("does not prove a directory exists", identity)
        self.assertIn("limited-depth search", identity)

    def test_rejects_an_unverified_hermes_version_before_launch(self):
        with patch.object(launcher, "version", return_value="0.19.0"):
            with self.assertRaisesRegex(RuntimeError, "requires hermes-agent 0.18.0"):
                launcher.main()

    def test_projects_the_actual_api_build_hook_without_changing_provider_options(self):
        run_agent = types.ModuleType("run_agent")
        instances = []

        class Agent:
            def __init__(self, **kwargs):
                self.session_cwd = kwargs["workspace"]
                self.valid_tool_names = {"mcp_neoworker_read_file"}

            def _build_api_kwargs(self, messages):
                return {"messages": messages, "model": "configured-model", "reasoning_effort": "high"}

        run_agent.AIAgent = Agent
        with tempfile.TemporaryDirectory() as workspace:
            modules = self._modules(run_agent, lambda: instances.append(
                run_agent.AIAgent(platform="acp", workspace=workspace)), type("Server", (), {}))
            with patch.object(launcher, "version", return_value="0.18.0"), patch.dict(sys.modules, modules):
                launcher.main()
                messages = sum((ContextProjectionTests().exchange(index) for index in range(6)), [])
                original = copy.deepcopy(messages)
                result = instances[0]._build_api_kwargs(messages)
            self.assertEqual(messages, original)
            self.assertLess(len(json.dumps(result["messages"])), len(json.dumps(messages)))
            self.assertEqual(result["model"], "configured-model")
            self.assertEqual(result["reasoning_effort"], "high")
            instances[0].valid_tool_names = set()
            self.assertEqual(instances[0]._build_api_kwargs(messages)["messages"], original)

    def test_does_not_mutate_the_callers_kwargs(self):
        original = {"platform": "acp", "enabled_toolsets": ["hermes-acp"]}
        launcher.host_owned_agent_kwargs(original)
        self.assertEqual(original["enabled_toolsets"], ["hermes-acp"])

    def test_uses_neoworker_provider_settings_instead_of_hermes_config(self):
        with patch.dict(
            launcher.os.environ,
            {
                "NEOWORKER_HERMES_PROVIDER": "deepseek",
                "NEOWORKER_HERMES_MODEL": "deepseek-chat",
                "NEOWORKER_HERMES_API_MODE": "chat_completions",
                "NEOWORKER_HERMES_BASE_URL": "https://api.deepseek.com",
                "NEOWORKER_HERMES_API_KEY": "secret-from-neoworker",
            },
        ):
            result = launcher.host_owned_agent_kwargs(
                {
                    "platform": "acp",
                    "model": "model-from-hermes",
                    "provider": "provider-from-hermes",
                    "base_url": "https://hermes-config.example",
                    "api_key": "hermes-secret",
                    "command": "external-provider",
                    "args": ["--from-hermes"],
                }
            )

        self.assertEqual(result["provider"], "deepseek")
        self.assertEqual(result["model"], "deepseek-chat")
        self.assertEqual(result["api_mode"], "chat_completions")
        self.assertEqual(result["base_url"], "https://api.deepseek.com")
        self.assertEqual(result["api_key"], "secret-from-neoworker")
        self.assertIsNone(result["command"])
        self.assertEqual(result["args"], [])

    def test_classifies_application_errors_separately_from_transport_errors(self):
        self.assertTrue(launcher.is_neoworker_application_tool_error(
            '{"error":"{\\"error\\":\\"Tool web_fetch timed out after 30s\\"}"}'
        ))
        self.assertTrue(launcher.is_neoworker_application_tool_error(
            '{"error":"HTTP 403: Forbidden"}'
        ))
        self.assertFalse(launcher.is_neoworker_application_tool_error(
            '{"error":"MCP server \'neoworker\' transport is down; reconnect requested"}'
        ))
        self.assertFalse(launcher.is_neoworker_application_tool_error(
            '{"error":"MCP call failed: RuntimeError: connection closed"}'
        ))
        self.assertFalse(launcher.is_neoworker_application_tool_error(
            '{"result":"ok"}'
        ))

    def test_application_tool_failures_do_not_open_the_neoworker_server_breaker(self):
        tools_package = types.ModuleType("tools")
        tools_package.__path__ = []
        mcp_tool = types.ModuleType("tools.mcp_tool")
        resets = []

        def make_handler(_server_name, _tool_name, _tool_timeout):
            return lambda _args, **_kwargs: json.dumps({
                "error": json.dumps({"error": "Tool web_fetch timed out after 30s"})
            })

        mcp_tool._make_tool_handler = make_handler
        mcp_tool._reset_server_error = lambda server_name: resets.append(server_name)

        with patch.dict(sys.modules, {
            "tools": tools_package,
            "tools.mcp_tool": mcp_tool,
        }):
            launcher.install_neoworker_mcp_failure_isolation()
            handler = mcp_tool._make_tool_handler("neoworker", "web_fetch", 30)
            result = handler({"url": "https://example.invalid"})

        self.assertIn("timed out", result)
        self.assertEqual(resets, ["neoworker"])

    def test_transport_failures_still_use_hermes_server_breaker(self):
        tools_package = types.ModuleType("tools")
        tools_package.__path__ = []
        mcp_tool = types.ModuleType("tools.mcp_tool")
        resets = []

        def make_handler(_server_name, _tool_name, _tool_timeout):
            return lambda _args, **_kwargs: json.dumps({
                "error": "MCP call failed: RuntimeError: connection closed"
            })

        mcp_tool._make_tool_handler = make_handler
        mcp_tool._reset_server_error = lambda server_name: resets.append(server_name)

        with patch.dict(sys.modules, {
            "tools": tools_package,
            "tools.mcp_tool": mcp_tool,
        }):
            launcher.install_neoworker_mcp_failure_isolation()
            handler = mcp_tool._make_tool_handler("neoworker", "parse_document", 30)
            handler({"path": "document.pptx"})

        self.assertEqual(resets, [])

    def provider_failure_metadata(self, result):
        run_agent = types.ModuleType("run_agent")

        class Agent:
            def __init__(self, *args, **kwargs):
                pass

            def run_conversation(self, *args, **kwargs):
                return result

        run_agent.AIAgent = Agent
        responses = []

        class State:
            def __init__(self, agent):
                self.agent = agent

        class Manager:
            def __init__(self):
                self.state = None

            def get_session(self, _session_id):
                return self.state

        class Response:
            stop_reason = "end_turn"
            field_meta = {}

        class ServerAgent:
            def __init__(self):
                self.session_manager = Manager()
                self.session_manager.state = State(run_agent.AIAgent(platform="acp"))

            async def prompt(self, prompt, session_id, **kwargs):
                self.session_manager.state.agent.run_conversation()
                return Response()

        async def invoke():
            import acp_adapter.server as server
            response = await server.HermesACPAgent().prompt([], "session")
            responses.append(response)

        entry_main = lambda: asyncio.run(invoke())
        with (
            patch.object(launcher, "version", return_value="0.18.0"),
            patch.dict(sys.modules, self._modules(run_agent, entry_main, ServerAgent)),
            patch.dict(launcher.os.environ, {"HERMES_KANBAN_TASK": ""}),
        ):
            launcher.main()

        return responses[0].field_meta

    def test_surfaces_a_provider_failure_as_structured_acp_metadata(self):
        self.assertEqual(self.provider_failure_metadata({
            "error": "HTTP 402: Insufficient Balance",
            "retryable": False,
            "failure_reason": "provider_error",
        }), {
            "neoworker": {
                "runtimeError": {
                    "code": "HERMES_RUNTIME_ERROR",
                    "message": "HTTP 402: Insufficient Balance",
                    "retryable": False,
                    "reason": "provider_error",
                },
            },
        })

    def test_preserves_unknown_retryability_for_queue_full_errors(self):
        metadata = self.provider_failure_metadata({
            "error": "HTTP 502: The request queue is full.",
            "failure_reason": "provider_error",
        })["neoworker"]["runtimeError"]
        self.assertNotIn("retryable", metadata)
        self.assertEqual(metadata["message"], "HTTP 502: The request queue is full.")

    def test_preserves_explicit_retryability(self):
        metadata = self.provider_failure_metadata({
            "error": "HTTP 503: Service unavailable", "retryable": True,
        })["neoworker"]["runtimeError"]
        self.assertIs(metadata["retryable"], True)


if __name__ == "__main__":
    unittest.main()
