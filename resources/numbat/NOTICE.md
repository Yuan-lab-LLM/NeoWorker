# Numbat runtime

NeoWorker integrates a pinned build of Perplexity's Numbat endpoint agent
security tool.

- Upstream: <https://github.com/perplexityai/numbat>
- Upstream version: `v0.1.1`
- Pinned commit: `3d20d782d45001fd3bb200bc5690ce4b9ce0f12b`
- Upstream license: Apache License 2.0
- Local adapter patch: `patches/neoworker-v0.1.1.patch`

The adapter adds a distinct, backward-compatible live-hook source and a bounded
control response contract. It does not rename third-party at-rest audit sources.

Packaged binaries and recommended rule overrides are generated from the pinned,
checksum-verified source by `scripts/build_numbat_runtime.mjs`. The generated
files are not source-of-truth inputs.
