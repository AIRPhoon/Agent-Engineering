# Known issues and scope

[中文](KNOWN_ISSUES.zh-CN.md)

This is a preview release. The following issues remain:

1. Reviews started within the same millisecond and completed out of order may restore the wrong comparison baseline during replay or compaction.
2. Cache records for distinct financial inputs may accumulate; compaction does not guarantee the intended size bound for an active project.

Additional limits:

- Loaded sessions in one workspace share deduplication, baselines, and financial decisions; multiple DSH processes sharing one history directory are still not coordinated reliably.
- Rows with untrustworthy structure are skipped as a whole, so corrupted history may lose a few records instead of blocking startup or standing in for a pass.
- Finance, audit, and supervisor children only see submitted material. They cannot retrieve missing context; matching citations do not prove sound reasoning.
- The reminder does not observe every change made through generic command tools or guarantee that every function was submitted.
- Narrowing requires the submitter to reorganize the scope and context; files are not automatically removed and goals are not rewritten.
- The main Agent still organizes follow-up planning from module findings. Scientific-document section/chapter workflows are outside this release.
- Defect detection rates, false-positive rates, false-negative rates, and token savings are not guaranteed. Users retain final judgement.

When reporting a problem, describe the host version, model identifier, reproduction steps, and expected behavior. Do not submit credentials, private code, or logs without permission.
