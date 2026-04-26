# Real-token smoke

Use this only for manual provider verification. It is not part of `bun test` or CI.

Dry run, no network:

```sh
bun run --cwd backend smoke:real-keys --provider openrouter --dry-run
```

Real OpenRouter smoke:

```sh
OPENROUTER_API_KEY=replace-me bun run --cwd backend smoke:real-keys --provider openrouter --turns 3 --budget 0.01
```

Real OpenCode Go smoke:

```sh
OPENCODE_GO_API_KEY=replace-me bun run --cwd backend smoke:real-keys --provider opencode-go --turns 3 --budget 0.01
```

Real Z.AI Coding Plan smoke:

```sh
ZAI_API_KEY=replace-me bun run --cwd backend smoke:real-keys --provider zai --turns 3 --budget 0.01
```

Paste the summary JSON from stdout into the PR description. The script redacts keys from output and refuses to run with `NODE_ENV=production` unless `--force-prod` is passed.
