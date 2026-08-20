# aurl Skill

The **aurl** skill lets the agent use [aurl](https://github.com/ShawnPana/aurl) — a CLI that turns any API into a command. It supports OpenAPI 3.0/3.1, Swagger 2.0, and GraphQL. The agent can register APIs by name, explore endpoints via `--help`, and make validated requests.

## Opt-in

This skill is **optional**. It only appears when the `aurl` binary is installed. If aurl is not installed, the skill is hidden and the agent falls back to `http_request` for one-off API calls.

## Installation

```bash
# Homebrew (macOS/Linux)
brew install shawnpana/tap/aurl

# Go
go install github.com/shawnpana/aurl@latest
```

## When the agent uses it

The agent routes to aurl when the task involves:

- Calling an external API with an OpenAPI or GraphQL spec
- Registering an API by name for repeated use
- Exploring endpoints and parameters before making requests
- Validated requests (enum checks, required fields, auth from spec)

For simple one-off URL fetches, the agent uses `http_request` instead.

## Workflow

1. **Register**: `aurl add [name] [openapi.json URL or path]` — or `aurl add --graphql [name] [endpoint]` for GraphQL
2. **Explore**: `aurl [name] --help` — list endpoints; `aurl [name] describe METHOD /path` — detailed docs
3. **Call**: `aurl [name] METHOD /path` or `aurl [name] METHOD /path '{"body":"json"}'`

Auth is auto-detected from the spec's `securitySchemes` during `aurl add`. Config is stored in `~/.config/aurl/`.

## Skill location

- **Bundled**: `resources/skills/aurl.json`
- **Upstream**: [ShawnPana/aurl](https://github.com/ShawnPana/aurl)
