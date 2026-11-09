# Installation and configuration

[中文](INSTALL.zh-CN.md)

## Install

In DSH Desktop, install the GitHub repository through the app's plugin manager:

```text
https://github.com/AIRPhoon/dsh-construction-site
```

For DSH CLI, choose the profile that actually hosts your session:

```sh
dsh plugin --profile web add github:AIRPhoon/dsh-construction-site
```

The default `release` branch is ready to load: its compiled `lib/plugin.js` is included, and there is no installation-time build script to approve. A release tag, archive download, or local build is unnecessary. Follow the host's returned application state and restart instructions, then check that `quality_review` and `quality_usage` are available.

## Configuration

Use the host's plugin settings or official management tools:

| Option | Meaning |
| --- | --- |
| `provider` | Local fresh-context child provider; `spawn` in the supplied patch |
| `expectedModel` | Model identifier to compare against; set this to your own model |
| `promptOrder` | System-prompt section order; `1200` in the supplied patch |
| `reviewGate` | Turn-end source-write reminder; enabled by default |
| `strictModel` | Reject model mismatches when enabled; disabled by default |

Children inherit the parent's model provider. No API key belongs in this plugin's configuration. Finance also makes model calls when triggered, so total savings are not guaranteed.

## Update or remove

Use DSH's plugin manager. Whether a restart is needed depends on the host. Removing the bundle does not automatically remove its history under `$DSH_HOME/quality/v1/`; keep that history separate from source and workspace files.

## Source maintenance

Source files are included for inspection and modification. To rebuild them, use Node.js 24.9+, install the declared development dependencies with `npm ci --ignore-scripts --legacy-peer-deps`, and run `npm run build`. Normal installation uses the included runtime files and does not need these steps.
