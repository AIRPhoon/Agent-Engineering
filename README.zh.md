<p align="center">
  <img src="icon.svg" width="80" alt="DSH 施工现场">
</p>

# dsh-construction-site · DSH 施工现场

[English](README.md) | 中文

面向 DeepSeek Harness 的施工现场式协作流程：主 Agent 负责规划与执行，财务判断检查是否必要，审计检查已完成的函数，监理核对模块目标与协作。

独立社区插件，与 DeepSeek AI 无隶属关系。能力分类：**工作流与自动化**。

## 安装

**DSH Desktop：** 在插件管理中选择从 GitHub 仓库安装，填写：

```text
https://github.com/AIRPhoon/dsh-construction-site
```

**DSH CLI：** 安装到实际使用的 profile：

```sh
dsh plugin --profile web add github:AIRPhoon/dsh-construction-site
```

将 `web` 换成自己的 profile 名称。仓库默认的 `release` 分支已包含运行文件、`package.json` 和 `cordis.patch.yml`，无需本地编译或选择发布 tag。是否重启以宿主提示为准。详见 [安装与配置](docs/INSTALL.zh-CN.md)。

目标宿主接口为 DSH 0.2.2-rc.1，要求 Node.js 24.9 或以上；其他宿主版本不保证兼容。

## 功能

- **函数审计：** `quality_review(kind="function")` 根据目标、输入输出约定、调用上下文与报送证据检查完成的函数，意见交执行方。
- **模块监理：** `quality_review(kind="module")` 检查模块目标、接口与跨模块协作，意见交规划方，不改写用户目标。
- **程序规则先行：** 确定的重复由程序阻止；检查必要性或范围需要判断时才唤醒财务 subagent，也可通过 `financeQuestion` 明确提出疑问。
- **财务决定实际生效：** 可允许检查、要求缩小范围后重报、阻止本次或要求补证。只有允许后才启动审计；理由须引用实际报送材料。
- **检查方无修改权限：** 财务、审计与监理子 Agent 均无工具执行权限，不能改代码或重新运行验证命令。
- **读取真实文件：** `files` 使用工作区相对路径，插件读取正文并计算哈希；越界、二进制或超限直接报错。单文件上限 256 KiB，合计上限 512 KiB。
- **轮末报审提醒：** 观察原生 `write` / `edit` 的成功源码写入，提醒报送已完成成果；属于提醒机制，不是不可绕过的交付门禁。
- **分角色计量：** `quality_usage` 汇总主执行、审计、监理和财务的上游用量；缺失或全零数据不能当作实际零消耗。
- **检查记忆：** 记录按工作区保存于 `$DSH_HOME/quality/v1/`，未设置时使用 `~/.dsh/quality/v1/`。用量账本仍仅保存在内存。

## 使用

函数完成后，报送目标、约定、相关文件、调用关系和已有证据：

```json
{
  "kind": "function",
  "target": "src/format.ts#formatLabel",
  "goal": "返回符合调用约定的标签文本",
  "contract": "说明实际输入与返回值要求",
  "code": "见报送文件",
  "files": ["src/format.ts", "src/caller.ts"],
  "context": "说明调用关系、依赖与相关假设",
  "evidence": "如实填写已有证据和尚未确认的条件"
}
```

模块监理使用 `kind: "module"`。对检查必要性或范围有疑问时增加 `financeQuestion`。财务要求缩小范围或补证后，应保留原目标和必要上下文，处理意见后再提交真实变化或新增材料。

## 权限与模型服务

- 宿主插件读取通过 `files` 明确报送的工作区文件，并在 `$DSH_HOME/quality/v1/` 写入或清理自己的检查历史。
- 报送材料会发送给父会话已配置的模型提供方，该提供方可能是远程服务；插件不要求额外的模型服务或 API key。
- 检查子 Agent 无工具执行权限，插件不授予其代码修改权限；后续修改仍由主 Agent 在用户授权范围内执行。

## 适用范围与限制

检查方只能看到报送材料，引用匹配不证明推理正确。不保证审查结论或节省 token，最终验收仍由用户决定。

当前开发版在跨会话状态、历史排序、记录压缩和历史结构校验方面存在限制，见 [已知问题](docs/KNOWN_ISSUES.zh-CN.md)。科研文档的节间/章间流程不在当前范围内。

## 许可

采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。允许非商业目的的使用、修改与分发，**不授予商业使用权**。完整英文许可条款具有约束力，中文说明仅为摘要。第三方组件遵循各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。
