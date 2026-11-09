# 安装与配置

[English](INSTALL.en.md)

## 安装

在 DSH Desktop 插件管理中，从 GitHub 安装此仓库：

```text
https://github.com/AIRPhoon/dsh-construction-site
```

DSH CLI 用户请选择实际承载会话的 profile：

```sh
dsh plugin --profile web add github:AIRPhoon/dsh-construction-site
```

默认 `release` 分支已包含编译后的 `lib/plugin.js`，可直接加载，没有需要批准的安装期构建脚本。不需要选择发布 tag、下载归档或本地编译。按宿主返回的安装状态和重启提示操作，随后确认会话提供 `quality_review` 与 `quality_usage`。

## 配置

通过宿主插件设置或官方管理工具调整：

| 参数 | 含义 |
| --- | --- |
| `provider` | 本地新上下文子 Agent 提供方，发布配置为 `spawn` |
| `expectedModel` | 用于核对的模型标识，请设置为自己的模型 |
| `promptOrder` | 系统提示段顺序，发布配置为 `1200` |
| `reviewGate` | 默认开启执行方子 Agent 的轮末提醒；主对话不提醒 |
| `strictModel` | 默认关闭，开启后模型不匹配会阻止报审 |
| `plainLanguage` | 默认开启：沿用用户本轮用词、先说结论、解释术语、不说行话 |
| `styleSample` | 可选，一段希望看到的回答范文 |
| `glossary` | 可选，每行一条“术语=大白话” |

子 Agent 继承父会话的模型提供方，不应在插件配置中填写 API key。财务被触发时也会调用模型，因此不保证节省总开销。

## 更新与移除

通过 DSH 插件管理操作，是否需要重启由宿主决定。移除组合包不会自动删除 `$DSH_HOME/quality/v1/` 中的检查历史；应将这类历史与源码及工作区文件分开管理。

## 源码维护

仓库保留源码以供查阅和修改。需要自行重新构建时，使用 Node.js 24.9+，执行 `npm ci --ignore-scripts --legacy-peer-deps` 安装声明的开发依赖，再执行 `npm run build`。正常安装直接使用已附带的运行文件，无需这些步骤。
