# LiveChatLens — 开源实时聊天 AI / Bot / 真人识别工具：产品设计与开发计划

> **文档版本：** 1.0  
> **研究基准日期：** 2026-11-27  
> **项目工作名称：** LiveChatLens  
> **建议 GitHub 仓库名：** `live-chat-ai-detector`  
> **产品定位：** Privacy-first, explainable live-chat identity inspector  
> **目标交付：** 一个可在浏览器中分析实时客服会话的开源工具，而不是又一个只对粘贴文本打 AI 分数的检测网站。

---

## 0. 给开发者和 AI Coding Agent 的执行摘要

### 一句话定义

**LiveChatLens 是一个开源浏览器扩展与可复用检测引擎，用来分析用户正在使用的实时聊天窗口，识别可观察到的 AI 客服披露、脚本式自动回复、AI 辅助写作迹象、真人接管证据，以及无法确定的情况，并向用户展示具体证据。**

### 这不是哪一种工具

- 不是传统网站流量 Bot 防护：不以阻止爬虫、刷流量、Playwright 或 Selenium 为主要目标。
- 不是普通 AI Text Detector：不把单条消息像不像 ChatGPT 当作对方身份的证明。
- 不是客服机器人开发平台：不替商家部署客服 Agent。
- 不是“破解”聊天平台：不绕过登录、加密、访问控制或平台安全机制。
- 不是可以百分之百鉴定真人的工具：浏览器只能看到有限的界面与对话信号。

### 要解决的具体问题

用户在商家网站、报价询盘页面或客服聊天框中沟通时，通常不知道：

1. 当前回复是否由明确披露的 AI 客服产生？
2. 是否为固定 FAQ / 规则脚本 / 自动回复？
3. 是否可能是 LLM 生成或 AI 辅助的回复？
4. 是否已经转接给真人客服？
5. 现有证据是否不足，不能作出可靠判断？

### 核心产品原则

**识别来源线索，而不是伪装成身份鉴定。** 产品必须将“直接披露”“平台结构证据”“会话行为证据”“语言风格线索”分层呈现，并允许 `Unknown / Inconclusive` 成为正常结果。

### 第一版的范围决定

第一版以**顾客/询价者查看商家 Live Chat**为主场景：打开聊天框、进行正常沟通、点击扩展，查看对方的 AI / 自动化 / 真人接管证据。

“商家想识别发来询盘的访客是不是自动化 Bot”属于相邻但不同的产品场景，放在未来独立模块，不要把两种方向混在 MVP。前者分析客服对话的对端；后者分析来访者的浏览器、请求和行为。

---

# 1. 产品命名与 SEO 策略

## 1.1 最终推荐名称

| 层级 | 推荐名称 | 用途 |
|---|---|---|
| 产品品牌 | **LiveChatLens** | 面向用户、网站、截图、介绍视频的品牌名 |
| GitHub 仓库 | **`live-chat-ai-detector`** | 将明确的搜索意图放进仓库名称 |
| 英文产品标题 | **LiveChatLens — Open-Source Live Chat AI Detector** | README、网站标题、发布介绍 |
| 一句话描述 | **Inspect live chat for AI chatbots, scripted replies, and human handoffs.** | 产品简介 |
| Tagline | **Know what is replying. See the evidence.** | 视觉与宣传用语 |

### 为什么采用“品牌名 + 描述型仓库名”

- `LiveChatLens` 易读、容易做图标与产品视觉，也不会把产品限定为某一种 AI 模型。
- `live-chat-ai-detector` 描述性强，包含 `live chat` 和 `AI detector` 两个核心意图，适合作为 GitHub 仓库 slug。
- 仓库名不必与品牌名完全一致。品牌负责记忆，仓库名称、About 描述、Topics 和 README 首屏负责让开发者理解项目。
- 不建议把项目命名为单独的 `AI Detector`、`Chatbot Detector` 或 `Human Detector`：含义太宽泛，容易与文章检测、网站反爬虫、视觉识别、客服产品混淆。

> **命名可用性声明：** 本次检索没有发现完全同名的 `LiveChatLens` GitHub 项目，但这不等于域名、商标、npm 名称或浏览器扩展名称已获准使用。正式定名前仍须检查 GitHub、npm、Chrome Web Store、域名注册商与商标数据库。

## 1.2 备选名称比较

| 名称 | 优点 | 缺点 | 判断 |
|---|---|---|---|
| **LiveChatLens** | 产品形象清楚；适合做跨平台会话检查器 | 品牌名本身不包含 AI 关键词 | **首选品牌** |
| Live Chat AI Detector | 一眼看懂搜索意图 | 更像通用功能词，不像长期品牌 | 可作为页面标题和关键词，不作为唯一品牌 |
| HumanOrBot | 好记、容易传播 | 容易被理解成网站流量反 Bot 工具 | 不优先 |
| ChatOrigin | 有品牌感 | `ChatOrigin` 也出现在 Agent Host Protocol 文档术语中，语义存在干扰 | 不优先 |
| Chatbot Detector | 关键词直观 | 常见含义是识别访问网站的垃圾 Bot，不一定是客服 AI | 不优先 |
| ChatProbe | 开发者味道明显 | 对普通用户不够直观 | 可作内部引擎名 |

## 1.3 关键词分层

不要把所有关键词塞进仓库名。按用户意图建设内容：

### 主关键词（产品类别）

- `live chat AI detector`
- `AI chatbot detector`
- `AI vs human chat`
- `chatbot vs human`
- `detect AI customer support`

### 次级关键词（具体场景）

- `is this customer service chatbot AI`
- `is this live chat a bot`
- `human customer support detector`
- `AI customer service transparency`
- `AI scripted replies detector`
- `human handoff detection`

### 开发者关键词

- `open source AI chatbot detector`
- `Chrome extension chatbot detector`
- `browser extension AI detection`
- `conversation analysis TypeScript`
- `chatbot detection library`

### 不要错误定位的关键词

- `AI text detector`：太宽泛，且与 Copyleaks、GPTZero、SlopTotal 等内容检测产品直接竞争。
- `bot detection`：搜索意图大多偏网站反欺诈、爬虫与自动化访问者识别。
- `AI agent detector`：容易被理解成识别正在操作浏览器的 AI Agent，而非识别客服对话另一端。

**注意：** 本计划没有声称上述关键词具备某个具体月搜索量或排名难度。本次没有购买关键词数据库或 Search Console 数据。上线前应通过 Google Keyword Planner、Google Trends、Ahrefs / Semrush（如有）、GitHub Search 和真实搜索结果做验证。

## 1.4 GitHub SEO / Discoverability 配置

### 推荐 Repository About 描述

```text
Open-source browser extension to inspect live chats for AI chatbots, scripted replies, and human handoffs — privacy-first and explainable.
```

### 推荐 README 首屏

```markdown
# LiveChatLens — Open-Source Live Chat AI Detector

Inspect live customer-support chats for disclosed AI assistants, scripted automation,
AI-assisted replies, and observable human handoffs. Local-first, explainable, and
built for real multi-turn conversations — not just isolated text scoring.
```

### 推荐 GitHub Topics

先用准确、相关的 10–14 个，不要为了数量加入不相关热门标签：

```text
ai-chatbot-detector
chatbot-detection
live-chat
human-vs-bot
ai-agent-detection
browser-extension
chrome-extension
conversation-analysis
customer-support
ai-detection
privacy-first
typescript
explainable-ai
```

### GitHub 搜索入口

GitHub 官方文档说明，Repository 搜索可以按名称、描述、Topics 搜索；也可以使用 `in:readme` 将 README 内容纳入查询。Topics 用于分类和发现相关项目。因此，优先把准确关键词写进 Repository name、About 描述和 Topics，再用 README 完整解释。不要依赖 README 堆词来弥补 About 空白。

- [GitHub — Searching for repositories](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)
- [GitHub — Classifying your repository with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

### GitHub SEO 的实际工作顺序

1. 仓库名准确匹配产品意图。
2. About 描述前 100–140 个字符直接解释“是什么、谁用、解决什么”。
3. 添加相关 Topics。
4. README 首屏放真实演示 GIF、关键能力、安装方式与隐私声明。
5. 提供可运行 Demo、版本发布、问题模板、贡献指南和路线图。
6. 建立 GitHub Pages 文档与真实案例页面，覆盖长尾问题。
7. 每周记录 GitHub 搜索、Google Search Console、浏览量到 Star 的转化率。

不要宣称仓库名称能保证排名。GitHub 搜索与 Google SEO 均受多个因素影响；准确元数据只是可控的基础设施。

---

# 2. 市场定位与竞争分析

## 2.1 市场现状：不是空白市场

目前已经有多个开源项目覆盖相邻能力。LiveChatLens 不能宣传“世界上第一个 AI 检测器”或“没有竞品”。应准确说明：已有产品分别解决浏览器 Agent 识别、网页自动化 Bot 识别、AI 文本检测、聊天页面内容过滤或客服平台本身的 AI 功能；本项目要解决的是**把这些分散信号组织成一个针对实时客服会话对端身份线索的可解释检查器**。

## 2.2 竞品与参考项目矩阵

| 项目 | 主要解决的问题 | 已有能力 | LiveChatLens 应如何差异化 | 参考 |
|---|---|---|---|---|
| Double Agent / Agent Detector | 访问网站的浏览器会话是人、Bot 还是 AI Agent | 浏览器环境、行为事件、已知 Agent 指纹；客户端运行 | 不重做它的目标分类；借鉴可组合信号、概率分布、证据码。我们的对象是客服会话的对端 | https://github.com/doubleagent-so/agent-detector |
| bot-signal | 网站访问者是否为自动化浏览器或脚本 | 浏览器自动化痕迹、鼠标/滚动/打字行为、服务端信号 | 不将“来访者 Bot”与“客服 AI”混在一起；后续可独立整合为 inbound-lead 模块 | https://github.com/okasi/bot-signal |
| FingerprintJS BotD | 网站的基础 Bot 检测 | 浏览器端 Bot 检测库 | 不竞争反爬虫场景；参考轻量 SDK 与浏览器端接入方式 | https://github.com/fingerprintjs/BotD |
| AI Browser Guard | 检测 AI Agent 是否接管当前用户浏览器 | CDP、WebDriver、环境指纹、页面行为限制 | 方向不同；参考扩展架构、权限边界、可解释的局限声明 | https://github.com/opena2a-org/ai-browserguard |
| Local AI Detector | 当前页面、论坛、评论、回复中的 AI 生成内容 | 浏览器扩展；评论/回复级内容分析；本地模型和隐私设计 | 它已覆盖“逐条回复文本是否像 AI”；我们必须增加多轮会话、平台结构线索、脚本自动化和真人接管证据 | https://github.com/fredgaffey/local-ai-detector |
| Copyleaks AI Detector | 网页上文字/图像是否由 AI 生成 | 浏览器扩展，选中文字或页面内容进行 AI 检测 | 不与成熟 AI 文本检测品牌正面硬碰；聚焦实时客服会话的分类与证据时间线 | https://copyleaks.com/release-notes |
| SlopTotal | 集成多个引擎判断内容是否 AI 生成 | 多检测引擎、文档/URL、API、本地部署 | 不复制“23 个文本检测器聚合”；使用少量有明确定义的会话信号，并公开误差 | https://github.com/pablocaeg/sloptotal |
| Lynote AI Text Detector | 文档和句子级 Human / AI / Mixed | 文档级与句子级模型、多语言方向 | 借鉴 Mixed 类别；但以会话和发言轮次为单位，不把句子分类直接解释成客服身份 | https://github.com/lynote-ai/ai-text-detector |
| agent-traffic-classifier | 网站日志里的 Human、Bot、AI Agent、爬虫 | HTTP Headers、UA、IP/会话聚类等 | 它分析服务器请求日志；本项目第一版在用户浏览器本地分析聊天界面 | https://github.com/agent-ecosystem/agent-traffic-classifier |
| chatbot-ui-detector | 截图中是否出现 ChatGPT、Gemini、Claude UI | YOLO / OpenCV 的视觉界面检测 | 它判断截图里的产品界面，不判断聊天回复的实际来源 | https://github.com/Trollboy111/chatbot-ui-detector |

### 特别重要：必须正面承认 Local AI Detector 的重叠

Local AI Detector 已经能在讨论区、评论区和聊天页面按回复进行 AI 内容检查。因此，单纯做“浏览器扩展 + 检查聊天框文字 + 显示 AI 百分比”没有足够差异化。

LiveChatLens 的差异化必须落实在以下方面：

1. 以**完整会话**而不是孤立文本作为分析单位。
2. 区分 **AI assistant、固定脚本/FAQ、宏模板、AI 辅助的人类回复、真人接管、未知**。
3. 显示**证据时间线**，说明何时出现了什么可见信号。
4. 能够分析聊天组件/平台披露的结构线索，但明确说明“识别到某个客服平台”不代表证明当前回复由 AI 生成。
5. 为短文本、混合语言和 AI 编辑后的回复保留未知选项。
6. 发布公开、多语言、跨平台的检测基准与错误案例。

## 2.3 市场空位判断（按证据强弱）

| 候选差异化 | 初步判断 | 原因与验证要求 |
|---|---|---|
| 实时客服会话级 AI / Script / Human 混合分类 | **较有机会** | 已检索项目主要分别做文本检测、浏览器 Agent 检测或访问流量检测；仍需继续查商业产品和浏览器扩展目录 |
| 真人接管 / Human Handoff 证据时间线 | **值得做** | 有些客服产品会显示转接事件，但通用消费者侧跨平台观察器不常见；需验证 DOM 是否可观察 |
| 对 AI 辅助的人类回复单独分类 | **难但有价值** | 仅凭最终文本通常无法可靠识别；应作为低置信度线索而非强结论 |
| 中文 + 英文 + Bahasa Malaysia + 代码混合 | **可形成细分优势** | 多语言、口语化及中英马混合对话是可测的地区场景；需要真实评测集，不应只靠宣传 |
| 完全本地处理、零 API Key | **可做但不独特** | Local AI Detector 等已强调本地隐私；必须与多轮分析和透明证据配合 |
| 检测所有网站里的所有 AI | **不可承诺** | 闭源 iframe、跨域边界、加密、页面变化及平台限制都会影响可见性 |

## 2.4 真正的竞争优势应该是什么

不要把竞争优势写成“用了更大的 AI 模型”。模型很容易被替换，且检测器会随生成模型更新而失效。

建议建设四个可累积资产：

1. **Conversation Evidence Engine：** 可解释的标准化证据模型与融合规则。
2. **Platform Adapter Network：** 不同聊天组件的可插拔适配器、DOM 兼容性测试和版本监控。
3. **Open Conversation Benchmark：** 有来源、有标签、有语言分层、有误报统计的多轮聊天评测集。
4. **Trust-first UX：** 将证据、限制、置信等级和 Unknown 同时展示，不用夸张百分比误导用户。

这些资产比单次提示词或调用某个 LLM 更可能形成长期差异化。

---

# 3. 目标用户与市场切入方式

## 3.1 首要目标用户（MVP）

### 顾客 / 消费者 / 询价者

在商家官网、服务商网站、订房、物流、保险咨询、电子产品报价、房地产、教育课程等页面使用在线客服。用户希望知道是否在与 AI、固定脚本或真人沟通，以及是否已转接真人。

**核心痛点：** 用户不反对 AI，但不喜欢商家让 AI 伪装真人、无法转接真人，或者 AI 给出不可靠的报价和承诺。

## 3.2 次要用户（后续）

- 记者、研究人员：观察各网站客服的 AI 披露情况。
- 隐私与消费者权益社群：研究 AI 客服透明度。
- 客服产品开发者：测试自己的 AI / Human handoff 流程。
- 质量保障团队：分析客服对话中的模板、脚本与真人接管。

## 3.3 不建议一开始做的用户

- 企业反欺诈团队：需要服务器端 IP、设备、账号、风险数据；MVP 的浏览器端权限不足。
- 大型客服平台运营团队：通常需要 CRM、工单、服务台连接器和管理员控制台；会显著拉大范围。
- 学术诚信检测：与 AI 文本来源检测直接竞争，也不是本产品主要价值。

## 3.4 市场一句话定位

> **A browser-side inspector that helps people understand whether a live customer-support conversation appears AI-powered, scripted, or human-handled — with evidence, not unsupported accusations.**

中文定位：

> 一个在浏览器本地检查实时客服会话的开源工具，帮助用户分辨 AI 客服、固定脚本、AI 辅助回复与真人接管，并展示判断依据。

---

# 4. 产品范围与用户体验

## 4.1 第一版关键流程

1. 用户打开商家网站并展开 Live Chat。
2. 用户点击 LiveChatLens 扩展图标。
3. 扩展检测当前页面是否存在可读的聊天区域。
4. 用户确认开始分析；扩展只处理用户明确选定的会话区域。
5. `MutationObserver` 监听新增消息，并将可见消息规范化为统一格式。
6. 引擎分析直接披露、平台标记、回复重复度、时间模式、上下文连续性、可选语言线索。
7. 面板展示当前会话类型、证据列表、时间线、限制和建议。
8. 用户可以导出脱敏报告，或立即停止并清除本地会话数据。

## 4.2 结果分类（不能只做 AI / Human 二分）

| 输出类别 | 定义 | 可用证据 | 注意事项 |
|---|---|---|---|
| `AI_DISCLOSED` | 页面明确告诉用户正在与 AI 助手交互 | 清晰可见的披露标签、明确首轮通知 | 这是“已披露”，不是模型来源取证 |
| `AUTOMATION_LIKELY` | 固定规则、FAQ、自动回复或脚本行为迹象明显 | 自动回复标识、重复模板、明确自动化事件 | 不代表一定使用 LLM |
| `AI_ASSISTED_POSSIBLE` | 部分回复出现 AI 生成/辅助的弱语言信号 | 长文本分类、重复结构、上下文统计 | 不能据此认定发言人不是人类 |
| `HUMAN_HANDOFF_OBSERVED` | 有可观察到的真人转接或人工客服标记 | 明确转接提示、客服身份标签变化、平台可见事件 | 只证明观察到接管信号，不证明此前消息来自 AI |
| `HUMAN_AGENT_INDICATED` | 平台或界面明确显示真人客服身份 | 明确客服人员/坐席标识、人工服务标记 | 仍可能存在 AI 辅助写作 |
| `MIXED_OR_HYBRID` | 观察到 AI 与人工参与的混合迹象 | AI 披露 + 人工接管、多个角色标签 | 不强行将整段会话归为单一身份 |
| `INCONCLUSIVE` | 信号不足或冲突 | 短文本、无标识、无法读取结构 | 是正确且必要的结果，不是失败 |

**严格规则：** 不要输出 `VERIFIED_HUMAN`，除非有可信、独立且明确的人工身份验证机制。单靠语气、打字速度、错别字或自然表达，不能证明是真人。

## 4.3 面板信息架构

### Overview

- 当前状态：AI 已披露 / 自动化迹象 / 真人接管已观察到 / 混合 / 无法判断。
- 检测覆盖：已读取 8 条消息 / 未能读取跨域 iframe 等。
- 当前平台识别：已识别、推测或未知。
- 一句话说明为什么得出这个状态。

### Evidence

- 信号名称。
- 观察到的内容（默认脱敏）。
- 时间戳与消息轮次。
- 证据强度：Direct / Strong / Weak。
- 是否可能有其他合理解释。

### Timeline

例如：

```text
10:04:12  Chat widget opened
10:04:19  Visible AI disclosure found (direct signal)
10:05:03  Repeated FAQ template detected (supporting signal)
10:07:40  Human handoff notice observed (direct handoff signal)
```

### Limitations

- 当前网站/聊天框是否支持完整读取。
- 检测消息数量与最短文本长度。
- 是否启用了可选本地文本模型。
- 本结果不是身份验证或法律结论。

### Actions

- `Pause analysis`
- `Clear session`
- `Export sanitized report`
- `Show me how to request a human`（只提示用户，不未经同意自动发送消息）

## 4.4 核心演示场景

第一版 Demo 至少包含五种可重放场景：

1. 明确写着 “AI assistant” 的客服。
2. 只会回固定 FAQ 的菜单式 Bot。
3. 使用 LLM 但未披露的客服模拟样本。
4. 真人客服通过模板宏回复。
5. AI 先答复，随后显示转接真人并切换客服身份。

每一个 Demo 都必须有真实标签和预期解释。不能为了营销效果制造“检测出真人/AI”的虚假演示。

---

# 5. 技术架构

## 5.1 总体架构

```text
┌──────────────────────────────────────────────┐
│              Browser Extension               │
│  Toolbar · Side Panel · Consent · Settings    │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│              Conversation Adapters            │
│  Generic DOM · Platform-specific adapters     │
│  Visible messages · Roles · Events · Timestamps│
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             Normalized Conversation            │
│  Session · Turn · Speaker · Text · UI signals  │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼────────┐
│ Disclosure  │ │ Behaviour   │ │ Language /     │
│ & Platform  │ │ & Template  │ │ Text Analysis  │
└──────┬──────┘ └──────┬──────┘ └───────┬────────┘
       └───────────────┼────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│          Evidence Fusion + Abstention         │
│  Evidence ledger · Confidence · Unknown path   │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             Explainable Result UI             │
│  Status · Reasons · Timeline · Limitations     │
└──────────────────────────────────────────────┘

Default data path: local-only. No chat content upload.
```

## 5.2 建议技术栈

| 层 | 建议技术 | 原因 |
|---|---|---|
| Browser extension | TypeScript + WXT + Chrome Manifest V3 | 扩展开发流程成熟，可管理 content script、popup 与 side panel |
| UI | React + lightweight CSS / Tailwind | 扩展面板和 Demo UI 可复用组件 |
| DOM observation | `MutationObserver` | 监听动态加载的聊天消息，不需要持续轮询整个页面 |
| Core engine | 纯 TypeScript package | 与浏览器 UI 解耦，后续可供 Node / CLI / Skill 调用 |
| Validation | Vitest + Playwright | 单元测试信号逻辑；端到端测试动态聊天页面 |
| Optional local ML | ONNX Runtime Web / Transformers.js | 后续可在浏览器本地跑小模型，不把模型当成唯一判断依据 |
| Data | IndexedDB 或 chrome.storage.local | 本地保存用户明确选择保留的会话分析结果 |
| Documentation | VitePress / GitHub Pages | 快速建立文档站、兼容性矩阵和评测说明 |

技术文档：

- [Chrome Extensions — Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome Extensions — Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [MDN — MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [WXT](https://wxt.dev/)
- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- [Transformers.js](https://huggingface.co/docs/transformers.js/index)

## 5.3 Monorepo 目录建议

```text
live-chat-ai-detector/
├─ apps/
│  ├─ extension/                 # Chrome extension (MV3)
│  └─ demo/                      # Local transcript playground
├─ packages/
│  ├─ core/                      # Normalization, signals, fusion, types
│  ├─ adapters/                  # Generic DOM + provider adapters
│  ├─ evidence/                  # Evidence schema and explanation renderer
│  └─ benchmark/                 # Evaluation scripts and fixtures
├─ models/
│  ├─ README.md                  # Optional model cards / download policy
│  └─ manifests/                 # Model version, hash and license metadata
├─ fixtures/
│  ├─ conversations/             # Synthetic and consented test sessions
│  ├─ pages/                     # Static chat widget fixtures
│  └─ expected/                  # Expected outputs by fixture
├─ docs/
│  ├─ product-scope.md
│  ├─ detection-methodology.md
│  ├─ privacy-model.md
│  ├─ platform-support.md
│  ├─ benchmark-methodology.md
│  └─ false-positive-policy.md
├─ scripts/
│  ├─ benchmark.ts
│  ├─ generate-fixtures.ts
│  └─ release-check.ts
├─ .github/
│  ├─ ISSUE_TEMPLATE/
│  ├─ workflows/
│  └─ FUNDING.yml                # Optional, only when ready
├─ README.md
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md
├─ SECURITY.md
├─ LICENSE
└─ CHANGELOG.md
```

## 5.4 统一会话数据模型

不要在检测模块内直接操作网页 DOM。所有平台先转换为统一 schema：

```ts
export type SpeakerRole =
  | "visitor"
  | "support_agent"
  | "assistant"
  | "system"
  | "unknown";

export interface ConversationTurn {
  id: string;
  role: SpeakerRole;
  text: string;
  timestamp?: number;
  visibleLabel?: string;
  sourceElement?: string; // sanitized selector / adapter marker, no raw HTML
  metadata?: Record<string, string | number | boolean>;
}

export interface ConversationSession {
  sessionId: string;
  platformId: string;
  adapterId: string;
  startedAt: number;
  turns: ConversationTurn[];
  observedEvents: ConversationEvent[];
  coverage: ConversationCoverage;
}
```

禁止默认保存完整 HTML、用户表单字段、电话号码、邮箱、地址、付款信息或聊天附件。

## 5.5 Adapter 契约

```ts
export interface ChatAdapter {
  id: string;
  name: string;
  match(document: Document, location: Location): MatchResult;
  inspect(document: Document): AdapterCapabilities;
  extract(document: Document): ConversationSnapshot;
  observe(
    document: Document,
    onUpdate: (update: ConversationUpdate) => void
  ): () => void;
}
```

Adapter 只负责：

- 识别聊天区域。
- 读取可见消息与明确 UI 标签。
- 标识消息角色（确定不了就 `unknown`）。
- 监听新消息与明显的转接事件。
- 报告覆盖范围和读取失败原因。

Adapter 不得：

- 自动点击隐藏控件或发送测试消息。
- 绕过登录、付费墙、CAPTCHA 或访问控制。
- 读取与聊天分析无关的页面内容。
- 将识别到的平台品牌直接等同于 AI 身份。

## 5.6 证据对象（Evidence Ledger）

每一个推断都必须能追溯到一个证据对象：

```ts
export type EvidenceStrength = "direct" | "strong" | "weak";
export type EvidenceDirection =
  | "ai_disclosure"
  | "automation"
  | "human_handoff"
  | "human_identity"
  | "ai_language"
  | "contradiction";

export interface EvidenceItem {
  id: string;
  code: string;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  observedAt: number;
  turnIds: string[];
  explanation: string;
  alternativeExplanation?: string;
  source: "visible_ui" | "platform_adapter" | "conversation_pattern" | "local_model";
  modelVersion?: string;
}
```

每次判断都要保留：

- 使用了哪些证据。
- 哪些证据互相冲突。
- 哪些证据不足。
- 结果是否经过校准。
- 对短对话或未知平台是否自动降低结论强度。

## 5.7 检测信号分层

### Layer A — Direct Disclosure（高优先级）

识别明确可见的披露：

- “You are chatting with an AI assistant.”
- “Automated assistant / virtual assistant / AI agent”等明确文字。
- 平台提供的可见角色标签。
- 明确的自动回复说明。

需要区分：识别到某个工具或供应商，并不等于证明当前会话由 AI 响应。必须优先找当前会话实际显示的身份提示。

### Layer B — Platform / UI Structure

观察：

- 已知聊天供应商的可见组件标记。
- DOM 中明确暴露的 bot / agent / human role。
- widget 的可见状态标签、转接按钮、坐席名称。
- 会话中的角色切换事件。

这些信号只能说明平台或界面结构；除非它明确标注 AI，否则不得单独支持“AI 生成”结论。

### Layer C — Script / Template Behaviour

观察：

- 多轮回复与已出现回复高度重复。
- FAQ 菜单、固定选项、关键词触发响应。
- 不同问题返回完全相同模板。
- 多轮中缺少上下文更新，出现可复现的状态循环。
- 明确的“自动回复”或“非工作时间自动应答”标识。

固定模板可能是真人客服使用的宏，也可能是传统规则 Bot。输出应是 `AUTOMATION_LIKELY`，不能直接写成 `AI`。

### Layer D — Conversation Dynamics

只在会话有足够轮次后使用：

- 是否正确引用前文关键实体。
- 面对用户修正后是否更新理解。
- 多轮约束是否保持一致。
- 是否出现相同问题的重复澄清循环。
- 回答是否有针对当前上下文的具体信息。

这类信号只能是辅助证据。真人也可能忘记上下文；AI 也可能准确追踪上下文。

### Layer E — Optional Language Classifier

可以接入本地 AI 文本检测器或自训练模型，但要求：

- 只对足够长的文本或多条回复运行。
- 语言、文本长度、平台和模型版本必须记录。
- 输出为“AI-like language signal”，不能输出“对方一定是 AI”。
- 模型不得覆盖明确的平台证据或人工接管事件。
- 没有目标语言验证数据时，禁用该语言的强结论。

### Layer F — Human Handoff / Human Agent Evidence

观察：

- 明确的“转接真人 / connecting you to an agent”消息。
- 可观察到的客服人员标签或角色状态改变。
- 明确的人工客服进入会话提示。
- 平台可访问的 handoff 事件（若有官方 API / SDK 支持，并经用户授权）。

不要通过键入速度、语法错误、表情符号或回复时间来“证明真人”。

---

# 6. 评分与判断策略

## 6.1 不要把启发式权重伪装成概率

MVP 可以使用规则权重生成 `evidence score`，但 UI 必须显示“证据等级”或“信号强弱”，不要写成“AI 概率 97%”。只有经过有代表性的独立测试集校准后，才可以把输出称为 probability / confidence calibration。

## 6.2 建议决策顺序

1. **Direct evidence first：** 明确披露、明确角色、明确转接事件优先。
2. **Separate concepts：** AI、自动化脚本、宏模板、人工与混合不是同一个标签。
3. **Session-level aggregation：** 不根据一条短回复就对整段会话定性。
4. **Conflict detection：** AI 标签与真人接管证据并存时，显示 Hybrid / Handoff，不强制二选一。
5. **Abstention：** 信号少、语言不支持、页面读取失败或证据冲突时，显示 Inconclusive。

## 6.3 初期规则输出示例

下面是产品行为示例，不是正式训练好的阈值：

```json
{
  "label": "MIXED_OR_HYBRID",
  "evidence_level": "strong",
  "summary": "The widget disclosed an AI assistant, then displayed a human handoff event.",
  "evidence": [
    {
      "code": "AI_DISCLOSURE_VISIBLE",
      "strength": "direct",
      "turn": 1
    },
    {
      "code": "HUMAN_HANDOFF_VISIBLE",
      "strength": "direct",
      "turn": 8
    }
  ],
  "limitations": [
    "The extension can observe interface labels, not independently verify the staff member's identity."
  ]
}
```

---

# 7. 数据、模型与评测计划

## 7.1 这是项目能否真正比别人做得好的关键

不能只展示一个漂亮的检测 UI。要公开“在哪些样本上有效、在哪些样本上会判断错误”。

## 7.2 标签体系

建立多类、非二元 benchmark：

| Label | 说明 |
|---|---|
| `declared_ai` | 明确披露 AI 的会话 |
| `rule_based_bot` | 固定菜单、规则和 FAQ 自动回复 |
| `templated_human` | 人类客服使用固定宏或模板 |
| `llm_assisted_human` | 人类参与，但可能使用 AI 起草/润色 |
| `llm_agent` | LLM 作为主要对话执行者 |
| `human_agent` | 有可信标注的真人客服参与 |
| `hybrid_handoff` | AI 与人类在同一会话中交替 |
| `unknown` | 来源不明或证据不足 |

**关键：** 不要把 `templated_human` 错分为 Bot，也不要把 `llm_assisted_human` 强制归类为纯 AI。

## 7.3 数据来源策略

- 人工编写的标准客服会话：由参与者自愿提供或专门编写，记录标注方式。
- 公开且许可允许使用的数据集：逐项检查原始许可、再分发权和隐私风险。
- 合成会话：用于功能测试和边界测试，必须标记 synthetic，不能当成真实世界准确率。
- 自己部署的不同客服系统：建立测试站点，记录系统配置和实际消息来源。
- 真实用户反馈：必须显式 opt-in，先本地脱敏，不默认上传原始聊天内容。

绝不爬取私人聊天记录、绕过平台登录或把用户上传记录擅自加入训练数据。

## 7.4 数据维度

- 语言：英语、简体中文、繁体中文、Bahasa Malaysia；后续再扩展。
- 代码混合：English + 中文、English + Malay、Manglish / Singlish 等实际口语混合。
- 文字长度：极短答复、单句、长答复、多轮对话。
- 平台类型：自建 demo、常见网站聊天组件、跨域 iframe、shadow DOM 等。
- 场景：询价、售后、退款、物流、预约、服务资格咨询、产品参数。
- 对话参与形态：纯 Bot、纯人工、AI 转人工、人工用宏、人工 AI 辅助。

## 7.5 评测指标

至少公开：

- Precision、Recall、F1（每一个类别分别报告）。
- Macro-F1（避免多数类掩盖少数类问题）。
- False Positive Rate（特别关注把真人误判成 AI / Bot 的比例）。
- Confusion Matrix（展示类别混淆）。
- Calibration（只有概率输出时才报告 Brier Score / ECE 等）。
- Abstention Rate（有多少会话正确地选择 Unknown）。
- Coverage（不同浏览器、平台、语言中真正能读取的会话比例）。
- Latency、CPU / Memory 使用量。

### 必须做的测试拆分

- Train / Validation / Test 按会话来源分离。
- 按平台留出测试：不能让同一个平台模板同时泄漏到训练与测试。
- 按时间留出测试：检查新客服版本或新生成模型下是否衰退。
- 按语言报告：不能只公布英语总成绩。
- 不得把同一会话切成多条后分到训练和测试两边。

### 上线门槛（建议目标，不是当前已实现数据）

- 明确披露与明确 handoff 识别：在公开固定 benchmark 上达到高精确率，并列出失败样本。
- 真人误报：必须单独报告，不能只展示整体准确率。
- 未达到某语言 / 平台的最低数据量时，显示 Not Evaluated。
- 规则、模型、阈值更改后自动跑完整 benchmark。

---

# 8. 安全、隐私与权限设计

## 8.1 默认 Privacy-first

- 默认本地处理，不上传会话文本。
- 默认不保存聊天正文；只在当前会话内存中处理。
- 用户主动选择“保留报告”时，才保存脱敏摘要。
- 不收集密码、银行卡、OTP、地址、电话号码或与判断无关的表单字段。
- 用户可以一键暂停、清空和导出。
- 遥测默认关闭；未来如提供匿名遥测，必须单独 opt-in。
- 可选模型下载时明确列出模型来源、文件大小、License、SHA-256 和网络请求。

## 8.2 权限最小化

优先研究 Chrome `activeTab` 与用户触发后注入的脚本。只有实际需要时才请求特定网站权限；不要一开始要求所有网站的持续读取权限。

需要在 UI 里明确告诉用户：

- 哪个标签页正在分析。
- 读取了哪个聊天区域。
- 本地处理还是调用远端模型。
- 目前读取不到什么内容。
- 分析数据是否保存在本机。

## 8.3 技术边界

浏览器扩展会遇到：

- 跨域 iframe：顶层页面不能任意读取第三方 iframe 内容。
- Shadow DOM：封闭 Shadow Root 不能保证被通用适配器读取。
- 页面结构变化：平台更新会破坏 selector。
- 虚拟列表：旧消息可能从 DOM 卸载。
- 动态组件：需要 MutationObserver 与事件合并，避免高频回调。
- 内容加密或 Canvas 绘制：无法可靠抽取。
- 平台政策：不同网站对自动化、抓取和扩展权限有不同条款。

遇到无法读取的情况，必须显示 `Coverage limited`，不能静默给出像是完整分析的结果。

## 8.4 免责声明

检测结果仅代表对可见界面与会话特征的分析，不是对真实身份、雇佣关系、模型供应商或作者身份的确定证明。不得将本工具结果单独用于拒绝客户、处罚员工、审核学生或其他高影响决策。

---

# 9. MVP 功能优先级

## P0 — 发布前必须具备

- [ ] 粘贴聊天记录的独立 Playground（不依赖任何网站）。
- [ ] Chrome MV3 Extension 基础框架。
- [ ] 用户点击后才开始分析。
- [ ] 通用 DOM Chat Adapter（可读到常见可见聊天结构时）。
- [ ] 统一 Conversation schema。
- [ ] 明确 AI 披露识别。
- [ ] 固定模板 / 重复回复信号。
- [ ] 明确 Human Handoff 事件识别（可观察时）。
- [ ] Unknown / Inconclusive。
- [ ] Evidence Ledger + Timeline。
- [ ] Pause / Clear Session。
- [ ] 不上传聊天正文的隐私架构。
- [ ] 至少 5 个可重放 Demo 场景。
- [ ] 公开检测方法、限制、测试报告。

## P1 — MVP 后的第一个迭代

- [ ] 平台 Adapter 插件系统。
- [ ] 支持更多常见 Live Chat Widget。
- [ ] 对话上下文连续性检测。
- [ ] 可选本地文本模型。
- [ ] 多语言初步测试：English、中文、Bahasa Malaysia。
- [ ] 脱敏报告导出 JSON / Markdown。
- [ ] Firefox 兼容性评估。

## P2 — 形成差异化壁垒

- [ ] Open Conversation Benchmark。
- [ ] Adapter 兼容性监控与回归测试。
- [ ] 混合会话与 AI-assisted-human 的专门研究。
- [ ] 每个平台、每种语言的置信校准。
- [ ] 可由用户自定义平台适配器。
- [ ] CLI：分析导出的、用户有权处理的会话 JSON。
- [ ] Claude Code / Codex Agent Skill：读取用户主动导入的文件并生成证据报告。

## P3 — 相邻市场，不要提前做

- [ ] Inbound Lead Bot Inspector：识别发来询盘的访问者是否自动化。
- [ ] Node.js SDK：供网站运营者分析访问日志或会话事件。
- [ ] 服务端 Bot Signal Adapter：与 bot-signal 等项目合作或整合。
- [ ] 团队评测控制台：帮助客服团队测试自己部署的 AI / Human handoff。

P3 的 inbound lead 检测应与主产品分开命名或做独立模块。不能把“对方的客服是不是 AI”和“发起询盘的人是不是自动化访客”当成同一件事。

---

# 10. 版本里程碑与开发顺序

## Phase 0 — 产品验证 / 研究

目标：先证明是否能读取聊天界面，并能区分不同类型的证据。

- [ ] 检查竞品与浏览器扩展目录。
- [ ] 建立 5–10 个内部测试聊天页面。
- [ ] 人工设计并标注五类基准对话。
- [ ] 对常见平台做技术可行性探针（只观察用户可见 UI）。
- [ ] 写出权限和隐私模型。

**验收：** 至少有可复现的会话测试样本；每一种输出都有定义与失败示例；没有以 AI 文本分类冒充身份验证。

## Phase 1 — Core Engine

- [ ] 实现 Conversation schema。
- [ ] 实现 Evidence schema。
- [ ] 实现 Direct Disclosure signal。
- [ ] 实现 Script / Template signal。
- [ ] 实现 Handoff signal。
- [ ] 实现 evidence fusion 和 abstention。
- [ ] 建立 Vitest 单元测试。

**验收：** 相同输入必定得到可复现输出；每个判断均有证据对象和解释。

## Phase 2 — Web Playground

- [ ] 粘贴记录、导入 JSON。
- [ ] 显示会话时间线。
- [ ] 显示类别、证据等级、未评估范围。
- [ ] 一键清除。
- [ ] 5 个预设样例。

**验收：** 任何开发者不用安装扩展即可试用主要引擎。

## Phase 3 — Browser Extension Alpha

- [ ] WXT + Manifest V3 框架。
- [ ] 用户手动启动分析。
- [ ] 通用 DOM Adapter。
- [ ] MutationObserver 增量提取。
- [ ] Side Panel / Popup UI。
- [ ] Pause、Clear、Export。
- [ ] 权限与跨域限制提示。

**验收：** 在自建测试页运行稳定；页面其他内容不会被不必要采集。

## Phase 4 — Platform Adapters

- [ ] 选择最容易验证、用户需求明确的 1–2 个目标平台。
- [ ] 每个 Adapter 都写版本化 DOM fixture。
- [ ] 平台变化时触发兼容性测试。
- [ ] 无法读取时明确降级。

**验收：** 每个平台的支持程度、读取范围和限制都有文档，不作“支持所有网站”宣传。

## Phase 5 — Language / Model Layer

- [ ] 加入可选的本地 AI 文本检测器。
- [ ] 在 English、中文、Bahasa Malaysia 数据上分开测试。
- [ ] 加入短消息阈值与 abstention。
- [ ] 对生成模型版本、模型文件 hash 和推理设置做记录。

**验收：** 若模型在某语言测试表现不足，产品会关闭或降低该项结论强度，而不是隐藏评测问题。

## Phase 6 — Public Launch

- [ ] 发布 GitHub 仓库。
- [ ] 完成 README、LICENSE、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT。
- [ ] 发布 GIF / 60 秒 Demo。
- [ ] 发布基准测试数据与方法。
- [ ] 建立 Roadmap 与 Discussions。
- [ ] 在相关社区以真实使用价值发布，不买 Star、不刷互动。

---

# 11. 与其他工具比较时，怎样真正做到更好

## 11.1 不要追求“一个分数”，追求“正确分类问题”

普通文本检测器常见输出是 AI / Human 风险分数。LiveChatLens 应当回答更具体的问题：

- 是否明确披露 AI？
- 是否呈现固定自动化？
- 是否出现 AI 语言线索？
- 是否有真人接管事件？
- 是否混合？
- 哪些部分未知？

## 11.2 采用 Evidence-first，而不是 Black-box-first

每个状态都要有“为什么”。例如：

**不好的结果：**

> 这个客服 92% 是 AI。

**更好的结果：**

> 页面首轮明确标注 AI assistant（直接证据）；随后出现固定 FAQ 回复（辅助证据）；第 7 轮出现人工接管提示（直接接管证据）。当前会话呈现 AI + Human 混合流程。

## 11.3 建立 Human False-Positive First 的评测文化

把“真人被误判成 AI”列为单独 KPI。尤其要测试：

- 真人客服复制 FAQ 模板。
- 真人客服通过翻译工具回复。
- 非母语英文用户。
- 中英马混合表达。
- 客服团队统一使用企业话术。
- 人类使用 Copilot / AI 润色但自己决定内容。

## 11.4 不与大厂争夺基础 AI Text Detection

可以复用开源模型或支持模型插件，但核心竞争力应放在：

- 多轮会话；
- 来源披露；
- 自动化脚本行为；
- 人工接管；
- 平台 Adapter；
- 证据与 Benchmark。

## 11.5 把平台兼容性做成社区协作

每一个网站/聊天工具不是只加一个 selector 就算支持。要求贡献者提供：

- Adapter 代码；
- 脱敏 DOM fixture；
- 测试截图或录制；
- 平台版本与检测日期；
- 不能检测的情况；
- 是否跨域 iframe / Shadow DOM。

在 README 中维护 Support Matrix：`Verified` / `Partial` / `Not supported` / `Needs testing`。

---

# 12. GitHub Star 与发布增长策略

## 12.1 Star 的前提：3 秒看懂、30 秒看到效果、3 分钟跑起来

README 首屏必须包含：

1. 项目名与清楚定义。
2. 实际 GIF：打开聊天框 → 点击扩展 → 证据时间线。
3. 能力清单（明确不做什么）。
4. 安装步骤。
5. 本地隐私保证。
6. 评测结果与限制。
7. Contribution / Roadmap 链接。

## 12.2 启动资产

- 一张 16:9 README Hero 图。
- 一个 30–60 秒真实录屏 GIF / MP4。
- 一页 Live Demo。
- 一份 `docs/detection-methodology.md`。
- 一份 `docs/benchmark-methodology.md`。
- 一份平台支持清单。
- 一组可复现测试样本。

## 12.3 发布渠道

优先级建议：

1. GitHub 本身：清楚的 About、Topics、README、Release、Discussions。
2. Hacker News：Show HN，标题强调“open-source live chat AI detector”，演示必须能直接体验。
3. Reddit：根据版规选择 r/opensource、r/chrome_extensions、相关开发者社区；发布方法与限制，不刷链接。
4. Product Hunt：等扩展稳定、有 Demo、有真实用户反馈再发布。
5. Dev.to / Hashnode：写技术文章，例如“Why AI text detectors cannot prove a live-chat agent is human or AI”。
6. Awesome Lists：只提交到真实相关的列表，提供对竞品也公平的分类，不要只列自己。

## 12.4 应写的 SEO 内容

建议文档站 / 网站至少有：

- `/live-chat-ai-detector/` — 主产品页。
- `/ai-chatbot-vs-human/` — 解释 AI 客服与真人客服的区别及检测限制。
- `/how-to-tell-if-customer-service-is-ai/` — 用户问题导向长尾页。
- `/ai-chat-detection-methodology/` — 技术方法与证据体系。
- `/supported-live-chat-platforms/` — 兼容性清单。
- `/privacy/` — 本地处理、权限、存储说明。
- `/benchmark/` — 可复现数据、版本、错误分析。

每个页面都要有独立内容与截图，不要用 AI 批量生成相似 SEO 页面。

## 12.5 Star 以外的健康指标

- README Views → Clone / Download 转化。
- GitHub Views → Stars 转化。
- 首次安装成功率。
- Demo 完成率。
- 有效 Issues、PR、外部贡献者数量。
- 用户报告的真实误报 / 漏报数量。
- Releases 下载量与版本留存。

不要买 Star、自动互 Star、伪造用户评论或夸大准确率。它们会破坏项目长期可信度。

---

# 13. 项目治理与开发约束

## 13.1 License

建议先采用 **Apache-2.0**：对企业和开发者采用友好，并包含明确专利授权条款。若希望保持最简单的许可文本，也可采用 MIT；选定后要统一整个仓库与依赖/模型许可，不要把模型权重、数据集和源码 License 混为一谈。

## 13.2 代码质量要求

- TypeScript strict mode。
- ESLint + Prettier。
- Core package 与 UI 分离。
- 每个 signal 有单元测试、fixture 和解释文本。
- 不接受没有测试样本的“平台已支持”声明。
- 不得在内容脚本里直接保存用户完整会话。
- 模型更新必须跑 Benchmark。
- Release 必须附兼容性变更与已知限制。

## 13.3 AI Coding Agent 工作规则

把以下规则加入 `AGENTS.md` 或 `CLAUDE.md`：

1. 开始编码前先阅读 `docs/product-scope.md`、`docs/detection-methodology.md` 与相关类型契约。
2. 不得把 AI 文本风格直接当作身份真相。
3. 不得删除 Unknown / Inconclusive 路径。
4. 不得增加无必要的全站权限或上传聊天正文。
5. 每个 Adapter 必须有 fixture 与自动测试。
6. 所有输出必须可以回溯到 EvidenceItem。
7. 不得在没有独立测试集的情况下宣称准确率。
8. 不得虚构平台支持、兼容性或检测效果。
9. 修改分类规则时，必须展示混淆矩阵变化和误报变化。
10. 开发优先级以用户可见价值、准确性、隐私和维护成本排序，而不是以代码量或模型复杂度排序。

---

# 14. 主要风险与应对

| 风险 | 严重性 | 应对 |
|---|---|---|
| AI 文本检测误判真人 | 高 | 不作身份结论；低权重辅助信号；公开 FPR；保留 Unknown |
| 人工客服使用模板，被误判 Bot | 高 | 独立 `templated_human` benchmark；把模板迹象归入 automation signal 而非 AI |
| 平台 DOM 更新 | 高 | Adapter fixtures、回归测试、兼容性状态 |
| iframe / Shadow DOM 读取限制 | 高 | 能力探测与 coverage 声明；不绕过安全边界 |
| 用户聊天数据敏感 | 高 | 本地默认、最小权限、不保存正文、导出前脱敏 |
| 模型体积和速度影响扩展 | 中 | ML 层可选；按需下载；先规则与直接证据 |
| 产品价值容易被误解为反机器人 | 中 | 品牌与 About 强调 live customer-support conversation，而不是 visitor traffic |
| 被竞争者复制 UI | 中 | 建立 benchmark、证据 schema、平台适配器和社区数据 |
| 夸大“AI 检测准确率”引起信任问题 | 高 | 发布方法、样本、版本、错误案例与独立测试拆分 |

---

# 15. 第一个公开版本的验收清单

满足以下条件才发布 `v0.1.0`：

- [ ] 用户能通过 Playground 粘贴或导入一段会话。
- [ ] 用户能打开浏览器扩展，在测试聊天页面启动分析。
- [ ] 至少支持一个通用聊天 DOM 结构与一个自建演示聊天页面。
- [ ] 能识别明确 AI 披露文本。
- [ ] 能识别部分固定模板/重复回复信号。
- [ ] 能识别测试页面中明确的人工接管事件。
- [ ] 结果能够展示 Evidence 和 Timeline。
- [ ] 信号不足时会返回 Inconclusive。
- [ ] 本地清除功能工作。
- [ ] 未经用户同意不会上传或保存聊天正文。
- [ ] 至少有一份基准数据说明、混淆矩阵和限制声明。
- [ ] README 有实际可运行 Demo、GIF、安装指引和项目范围。
- [ ] GitHub Actions 运行测试与构建。

---

# 16. 最终产品战略结论

## 应该做什么

做一个**以实时客服会话为单位的 AI / 自动化 / 真人接管证据检查器**。它不是要从一句话猜测“这个人是不是 ChatGPT”，而是把当前用户能看到的所有合理证据整合起来，帮助用户理解当前客服系统的工作方式。

## 不应该做什么

不要做成：

- 只粘贴文字就返回 AI 0–100% 的网站。
- 声称可以从语气或回复速度判断真人。
- 声称能检测所有网站、所有 AI 模型、所有 Agent。
- 一开始就做企业 SaaS、分析平台、反爬虫 SDK 与 Agent Skill 的大杂烩。

## 最有潜力的差异化

1. **会话级而非句子级：** 看整个客服过程，而不是一条文本。
2. **多类别而非二元：** AI、脚本、宏、AI 辅助、真人接管、未知分开处理。
3. **证据优先：** 每个结论可解释、可追溯。
4. **本地优先：** 私人询价与客服信息不默认离开用户设备。
5. **Benchmark 驱动：** 公开误报、跨语言和平台测试。
6. **可扩展 Adapter：** 社区能贡献新平台适配器。

## 最终建议

以 `LiveChatLens` 为产品品牌，以 `live-chat-ai-detector` 为 GitHub 仓库名。首发做 Chrome 扩展 + Web Playground + TypeScript Core，不做后端账号系统，不依赖付费 API。先把“AI 披露 / 固定脚本 / 真人接管 / Unknown”四类结果做扎实；可选 AI 文本模型放在第二阶段。

**项目的核心卖点不是“我们能百分之百看穿 AI”，而是“我们不乱猜，并把看得见的证据交给用户”。**

---

# 17. 参考资料与网站

> 所有在线资料按 2026-11-27 检索时可访问内容整理。开源项目功能和活跃度会变化；正式开发前再次检查仓库、License、最新提交和浏览器平台规则。

## A. 最相关的开源竞品 / 参考代码

1. Double Agent Agent Detector — https://github.com/doubleagent-so/agent-detector  
   浏览器会话 Human / Bot / Agent 识别；参考信号引擎、可解释 verdict、客户端设计。
2. bot-signal — https://github.com/okasi/bot-signal  
   浏览器自动化与行为检测；参考瞬时、行为、服务端信号分层。
3. FingerprintJS BotD — https://github.com/fingerprintjs/BotD  
   基础浏览器 Bot 检测。
4. AI Browser Guard — https://github.com/opena2a-org/ai-browserguard  
   浏览器内 Agent 识别和控制；重点阅读它对 CDP 检测边界的说明。
5. Local AI Detector — https://github.com/fredgaffey/local-ai-detector  
   本地 AI 内容检测，逐条评论/回复分析；必须研究其功能边界，避免重复造轮子。
6. SlopTotal — https://github.com/pablocaeg/sloptotal  
   多引擎文本检测、公开基准和本地运行思路。
7. Lynote AI Text Detector — https://github.com/lynote-ai/ai-text-detector  
   文档 / 句子级 Human、AI、Mixed 分类与多语言方向。
8. agent-traffic-classifier — https://github.com/agent-ecosystem/agent-traffic-classifier  
   基于访问日志和 HTTP 信号识别 Bot / AI Agent。
9. chatbot-ui-detector — https://github.com/Trollboy111/chatbot-ui-detector  
   YOLO / OpenCV 检测 AI 聊天产品界面；与会话身份识别不是同一个问题。
10. MITRE LILAC — https://github.com/mitre/lilac  
    公共聊天机器人风险识别/缓解工具包；可研究其风险分类和测试方法。
11. Vasari — https://github.com/AntoineF23/vasari  
    本地评估 AI Agent / chatbot / RAG traces，提供人工标注与 LLM-as-judge 验证思路。

## B. AI 文本检测局限与研究

1. Wieczorek & Kaczmarski (2026), *Detecting AI-Generated Text and Assessing Citation Integrity in Scholarly Communication: A Scoping Review of Methods, Limitations, and Manipulation*  
   https://www.mdpi.com/2076-3417/16/21/10958  
   2026 年 11 月综述；总结检测结果随模型、领域、语言、文本长度、改写和混合创作而变化，单一 detector score 不能作为可靠来源证明。
2. *AI-generated text detection: A comprehensive review of methods, datasets, and applications* (Computer Science Review, 2025)  
   https://www.sciencedirect.com/science/article/pii/S1574013725000693  
   检测方法、评估数据、跨领域泛化与对抗鲁棒性的综述。
3. *The pitfalls of AI detection in academic writing: bias, false positives, and the need for inclusive assessment* (2026)  
   https://link.springer.com/article/10.1007/s43681-026-01376-w  
   讨论统计分类、误报与文本来源推断的局限。
4. University of Kentucky — AI Detectors: Evidence and Recommendations for Use in Education  
   https://celt.uky.edu/ai-detectors-evidence-and-recommendations-use-education  
   对 AI 检测器的限制、偏差、模型更新和人工修改影响提供实务说明。

## C. 浏览器扩展与技术文档

1. Chrome Extensions — Content scripts  
   https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
2. Chrome Extensions — Manifest V3  
   https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
3. MDN — MutationObserver  
   https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
4. WXT Framework  
   https://wxt.dev/
5. Vitest  
   https://vitest.dev/
6. Playwright  
   https://playwright.dev/
7. ONNX Runtime Web  
   https://onnxruntime.ai/docs/get-started/with-javascript/web.html
8. Hugging Face Transformers.js  
   https://huggingface.co/docs/transformers.js/index

## D. GitHub 搜索与发布资料

1. GitHub — Searching for repositories  
   https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories
2. GitHub — Repository topics  
   https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
3. GitHub — About searching on GitHub  
   https://docs.github.com/en/search-github/getting-started-with-searching-on-github/about-searching-on-github
4. GitHub — About repository READMEs  
   https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes

## E. AI 透明度与监管背景（产品设计参考，不构成法律意见）

1. European Commission, 31 July 2026 — Commission starts enforcing AI Act rules and new transparency requirements on 2 August  
   https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1714  
   欧盟委员会说明自 2026-08-02 起，部分 AI 系统需履行透明度义务，包括让用户知道自己正在与 AI 系统交互。
2. Bundesnetzagentur — Guidelines on AI transparency obligations  
   https://bundesnetzagentur.de/EN/Areas/Digitalisation/AI/04_Transparency/guidelines/start.html  
   对交互式 AI 系统的告知时点、可见披露方式等提供解释。
3. EU AI Act transparency summary  
   https://www.regulation-ai.eu/en/transparency-obligations/  
   第三方解释资料；应优先以法规原文与欧盟委员会官方解释为准。

## F. 市场观察与产品发布

- Copyleaks Release Notes（可观察 AI 检测浏览器扩展产品更新）：https://copyleaks.com/release-notes
- Chrome Web Store（扩展发布和竞品检查）：https://chromewebstore.google.com/
- Hacker News（Show HN）：https://news.ycombinator.com/submit
- Product Hunt：https://www.producthunt.com/
- Google Trends：https://trends.google.com/
- Google Keyword Planner：https://ads.google.com/home/tools/keyword-planner/

---

## 给 Claude Code / Codex 的开工指令

将本文件放入仓库根目录的 `PRODUCT_PLAN.md`，并要求 Agent 按以下顺序执行：

```text
Read PRODUCT_PLAN.md completely before making changes.

Do not start by implementing every planned feature. First produce:
1. A concise architecture proposal that follows the plan.
2. A repo scaffold and dependency decision with reasons.
3. A typed Conversation and Evidence schema.
4. A test matrix for the five demo conversation classes.
5. A privacy and permissions checklist for Manifest V3.

Then implement Phase 1 only: the framework-independent TypeScript Core Engine,
its Evidence Ledger, abstention behavior, and Vitest tests.

Do not implement a machine-learning classifier yet. Do not request broad host permissions.
Do not claim that text style proves human or AI identity. Every verdict must reference
observable evidence and may return INCONCLUSIVE.

After Phase 1 passes tests, stop and report the files changed, test results,
known limitations, and the exact next implementation step.
```
