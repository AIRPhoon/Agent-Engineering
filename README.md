<p align="center">
  <img src="icon.svg" width="80" alt="DSH Construction Site">
</p>

# dsh-construction-site

English | [中文](README.zh.md)

A construction-site-inspired workflow for DeepSeek Harness: the main Agent plans and executes, finance decides whether a review is needed, function auditors inspect completed functions, and module supervisors check integration and objectives.

Independent community plugin; not affiliated with DeepSeek AI. Category: **Workflow & Automation**.

## Install

**DSH Desktop:** Open the plugin manager and install from this GitHub repository:

```text
https://github.com/AIRPhoon/dsh-construction-site
```

**DSH CLI:** Install into the profile you actually use:

```sh
dsh plugin --profile web add github:AIRPhoon/dsh-construction-site
```

Replace `web` with your profile name. The repository's default `release` branch contains the runtime files, `package.json`, and `cordis.patch.yml`; no local compilation or release tag is needed. Follow the host's restart instructions. [Installation and configuration](docs/INSTALL.en.md).

Target host API: DSH 0.2.2-rc.1. Node.js 24.9 or later is required. Other host versions are not guaranteed compatible.

## What you get

- **Function audits:** `quality_review(kind="function")` checks completed functions against their goals, contracts, caller context, and supplied evidence. Findings go to the executor.
- **Module supervision:** `quality_review(kind="module")` checks module objectives, interfaces, and cooperation. Findings go to the planner; the plugin does not rewrite the user's goal.
- **Rules before models:** exact duplicates are blocked by code. A finance subagent is called only when scope or necessity needs judgement, including an explicit `financeQuestion`.
- **Effective financial decisions:** finance can allow a review, request a smaller scope, block this request, or ask for more information. Only approval starts the audit. Reasons must cite actual submitted material.
- **Read-only reviewers:** financial, audit, and supervisor children have no tool-execution permission and cannot modify code or rerun verification commands.
- **Real files:** use workspace-relative `files` paths. The plugin reads and hashes the content; outside-workspace, binary, or oversized files are rejected. Limits are 256 KiB per file and 512 KiB in total.
- **Turn-end reminders:** successful native `write` / `edit` calls on source files can prompt the main Agent to submit completed work. This is a reminder, not a hard delivery gate.
- **Usage by role:** `quality_usage` summarizes provider-reported usage for main execution, audit, supervision, and finance. Missing or zero-filled reports do not establish zero actual usage.
- **Review history:** review records and financial decisions are stored per workspace under `$DSH_HOME/quality/v1/`, or `~/.dsh/quality/v1/` if unset. Usage totals remain in memory.

## Usage

After completing a function, submit its objective, contract, relevant files, caller context, and available evidence:

```json
{
  "kind": "function",
  "target": "src/format.ts#formatLabel",
  "goal": "Return label text that satisfies the caller contract",
  "contract": "Describe the actual input and return-value requirements",
  "code": "See submitted files",
  "files": ["src/format.ts", "src/caller.ts"],
  "context": "Describe callers, dependencies, and relevant assumptions",
  "evidence": "State available evidence and unresolved conditions accurately"
}
```

Use `kind: "module"` for module supervision. Add `financeQuestion` for a specific scope or necessity concern. When finance requests a smaller scope or more evidence, address that feedback and resubmit actual changes or additional material while preserving the original objective and necessary context.

## Permissions and model services

- The host plugin reads the workspace files explicitly submitted through `files`, and writes or prunes its own review history under `$DSH_HOME/quality/v1/`.
- Submitted material is sent to the parent session's configured model provider, which may be remote. No additional model service or API key is required by this plugin.
- Review children cannot execute tools. The plugin does not give them code-modification permission; follow-up changes remain the main Agent's responsibility under the user's authorization.

## Scope and limitations

Reviewers see only submitted material. Matching a quotation does not prove the reasoning is sound. Correctness and token savings are not guaranteed; final acceptance remains with the user.

The development-stage limitations include cross-session state consistency, history ordering, record compaction, and history validation. See [known issues](docs/KNOWN_ISSUES.en.md). Scientific-document section/chapter workflows are outside the current scope.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Use, modification, and redistribution are licensed for noncommercial purposes. **Commercial use is not licensed.** Third-party components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
