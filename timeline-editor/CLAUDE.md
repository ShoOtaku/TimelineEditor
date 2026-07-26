# Timeline Editor

FFXIV 时间轴外部编辑器，支持两种格式（工具栏左上按钮切换）：

1. **AE 时间轴**（AEAssist Triggerline）：读取/编辑 `Triggerlines` 目录下的 `.json` / `.txt`，树形展开视图、节点属性编辑、条件和动作类型化编辑器、C# 脚本 Monaco 编辑。自动发现 ACR 插件 DLL 中的条件/动作类型。
2. **PR 时间轴**（PromeRotation PureTimeline）：读取/编辑 `pluginConfigs/PromeRotation/PureTimelines` 目录下的 `.json`。按时间排序的锚点列表 + 锚点挂载行为组 + 可展开节点树，右侧属性面板编辑锚点同步规则/行为组/节点/条件/动作。

## 项目结构

```
timeline-editor/
├── index.html                  # Vite 入口 HTML
├── package.json                # Electron + React + Vite
├── vite.config.ts              # Vite + vite-plugin-electron
├── tsconfig.json               # 渲染进程 TS 配置
├── tsconfig.node.json          # 主进程 TS 配置
├── electron-builder.yml        # Windows 打包配置
├── src/
│   ├── main/
│   │   ├── index.ts            # Electron 主进程 — 窗口创建、IPC 处理器、AE 目录配置
│   │   └── dotnetMeta.ts       # 纯 TS .NET PE/CLI 元数据解析器 — 读 DLL 类型/字段/QT key
│   ├── preload/
│   │   └── preload.ts          # Context bridge — 暴露 window.electronAPI（16 通道）
│   ├── shared/
│   │   ├── types.ts            # AE 完整 TS 类型系统（10 节点类型 + ACR TypeDef）
│   │   ├── prTypes.ts          # PR (PureTimeline) 类型系统 + 全部枚举常量
│   │   ├── prSpecTypes.ts      # PR 字段规格类型 + 共用字段（Immediate/Negate/比较符/目标）
│   │   ├── prConditionSpecs.ts # 15 种条件的 TypeKey/名称/字段规格
│   │   ├── prActionSpecs.ts    # 18 内置 + 3 XSZBox 动作的 TypeKey/名称/字段规格
│   │   └── prSpecs.ts          # 规格注册表入口（大小写不敏感查找 + DTO 字段清单）
│   ├── plugins/
│   │   └── index.ts            # PluginRegistry 单例（预留扩展框架）
│   └── renderer/
│       ├── main.tsx            # React 入口
│       ├── App.tsx             # 主布局 — Sidebar | TreeView | PropertyPanel + ScriptPanel
│       ├── env.d.ts            # window.electronAPI 类型声明
│       ├── index.css           # TailwindCSS + 暗色主题 + 自定义 .field-input .field-input
│       ├── store/
│       │   ├── index.ts        # Zustand + Immer — AE 文档/undo/ACR 类型注册表
│       │   ├── prStore.ts      # PR 文档/文件/锚点/行为组 + editorMode（AE/PR 全局切换）
│       │   ├── prStoreTypes.ts # PR store 接口 + 选中模型 + undo 助手
│       │   ├── prNodeSlice.ts  # PR 节点树操作切片（增/删/移/复制/同级插入）
│       │   └── dialogStore.ts  # 应用内对话框请求队列（askConfirm / askPrompt）
│       ├── pr/                 # PromeRotation 编辑器
│       │   ├── prModel.ts      # 工厂/校验（移植 PtlDefinition 规则）/时间格式化/树辅助
│       │   ├── prMutations.ts  # 纯文档变更函数（锚点/行为组/节点 CRUD）
│       │   ├── prSpecEditor.tsx # 规格驱动字段渲染（含 Params.* 路径读写）
│       │   ├── PrSidebar.tsx   # PureTimelines 目录浏览器
│       │   ├── PrTimelineView.tsx # 中心视图：锚点行 + 行为组行 + 校验条 + 搜索
│       │   ├── PrNodeTree.tsx  # 节点树（常驻操作按钮 + 右键菜单 + 嵌套折叠）
│       │   ├── PrPropertyPanel.tsx # 右侧面板分发 + Meta 编辑
│       │   ├── PrAnchorEditor.tsx  # 锚点 + 同步规则编辑
│       │   ├── PrEntryEditor.tsx   # 行为组编辑（锚点绑定 + 偏移校验 + 节点树入口）
│       │   ├── PrNodeEditor.tsx    # 节点编辑 + 常驻节点工具条（7 种节点类型）
│       │   ├── PrConditionEditor.tsx # 条件编辑（规格驱动 + 原始字段回退）
│       │   ├── PrActionEditor.tsx    # 动作编辑（规格驱动 + 原始字段回退）
│       │   └── prFields.tsx    # 共享字段组件（PrField/PrNumberInput/技能名提示）
│       ├── components/
│       │   ├── TreeView.tsx    # 可展开树列表
│       │   ├── Toolbar.tsx     # 工具栏 — Open/Save/Undo/Redo/Script/⚙设置
│       │   ├── Sidebar.tsx     # 文件浏览器 — 遍历 Triggerlines，响应 AE 目录变更
│       │   ├── StatusBar.tsx   # 状态栏
│       │   ├── ContextMenu.tsx # 右键菜单 — 添加 10 种子节点
│       │   ├── KeyboardShortcuts.tsx
│       │   ├── Canvas.tsx      # （旧版 ReactFlow 画布，已弃用）
│       │   └── layout.ts       # Dagre 布局（旧画布用）
│       └── panels/
│           ├── PropertyPanel.tsx      # 属性编辑 + 动态条件/动作类型选择器（内置 + ACR）
│           ├── ConditionEditor.tsx    # 条件子编辑器 — 18 种内置 + ACR 字段渲染 + 语义识别
│           ├── ActionEditor.tsx       # 动作子编辑器 — 11 种内置 + QT 自动识别 + ACR 字段渲染
│           ├── semanticFields.ts      # 语义字段映射 — OperatorIndex→比较符下拉, PartyRole→职能下拉
│           ├── SpellConfigEditor.tsx  # 技能配置
│           ├── TargetSelectorEditor.tsx # 目标选择器
│           └── ScriptPanel.tsx       # Monaco C# 编辑器
```

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 34, React 19, TypeScript 5.7 |
| 构建 | Vite 6, vite-plugin-electron 1.0 |
| 状态 | Zustand 5 + Immer 10（undo/redo 50 步快照） |
| 编辑器 | Monaco Editor 0.55（C# 语法） |
| 样式 | TailwindCSS 4 |
| IPC | Electron contextBridge + ipcMain.handle（16 通道） |
| .NET 元数据 | 纯 TS ECMA-335 解析器（PE header → CLI metadata → TypeDef/Field/#US heap） |

## 开发命令

```bash
cd timeline-editor
npm run dev       # 启动 Vite + Electron
npm run build     # 生产构建（渲染 + 主进程 + preload）
npm run lint      # TypeScript 类型检查
npm run dist      # 打包为 .exe（→ release/Timeline Editor 1.0.0.exe）
```

输出 `release/Timeline Editor 1.0.0.exe`（约 68 MB 便携版）或 `release/win-unpacked/Timeline Editor.exe`（约 182 MB，含 Chromium + Node.js）。

## 约束

- **Immer 冻结状态**：`pushUndo()` 必须在 `set((s) => { ... })` 回调内部调用。`get()` 返回的状态是 Immer 冻结快照。
- **React Hooks 顺序**：所有 `useState`/`useCallback` 必须在任何 `if (condition) return` 之前声明。
- **Electron 只启动一次**：`dev` 脚本只需 `vite`，由 `vite-plugin-electron` 自动启动 Electron。
- **Color 通道语义**：节点 `Color` 字段 {X,Y,Z,W} 分别表示 RGBA，值域 0.0–1.0。
- **Delay 的 DisplayName**：延迟节点格式为 `延迟[{Delay}]秒`，修改 Delay 时需同步更新 DisplayName。
- **技能 Category**：`SpellConfig.Category` 是 AEAssist 自定义枚举：0=默认、1=LB、2=爆发药、3=疾跑、4=跳舞、5=道具。
- **Round-trip 安全**：所有节点和条件/动作都有 `[key: string]: unknown` catch-all，未知字段完整保留。
- **Electron 无 window.prompt**：调用不会弹窗（静默失败），`window.confirm` 则是阻塞渲染进程的原生模态。统一用 `store/dialogStore.ts` 的 `askConfirm()` / `askPrompt()` + `<DialogHost />`。
- **数字输入**：受控 `<input type="number">` 会吞掉中间态（"0." 解析成 0 后回写，导致小数打不出来）。数值字段一律用 `PrNumberInput`，它保留输入过程中的原始文本。

## 数据模型

### 节点类型（10 种）

| $type 尾缀 | 组合/叶子 | 关键字段 |
|-----------|-----------|---------|
| TreeSequence | 组合 | IgnoreNodeResult, StopWhenDead, Childs |
| TreeParallel | 组合 | AnyReturn, StopWhenDead, Childs |
| TreeSelect | 组合 | Childs |
| TreeLoop | 组合 | LoopCount, Childs |
| TreeCondNode | 叶子 | CondLogicType(0=AND/1=OR), CheckOnce, ReverseResult, TriggerConds |
| TreeActionNode | 叶子 | TriggerActions |
| TreeScriptNode | 叶子 | Script(C#), OnlyCheck |
| TreeDelayNode | 叶子 | Delay(秒) |
| TreeDebugNode | 叶子 | — |
| TreeClearWaitNode | 叶子 | — |

### 内置条件（18 种）/ 动作（11 种）

见 `PropertyPanel.tsx` 中 `BUILTIN_COND_TYPES` 和 `BUILTIN_ACTION_TYPES`。

## PR (PromeRotation PureTimeline) 数据模型

**Schema 权威来源：源码仓库** `C:\Users\xiaos\Documents\GitHub\PromeRotation-1.0-XSZFork`
- `PromeRotation/PureTimeline/` — Serialization/PtlDto.cs、Model/{Anchor,Entry,SyncRule,PtlDefinition}.cs、UI/PtlEditorWindow.EntryGroupEditor.*.cs（插件自身编辑器，本编辑器的 UI 对照基准）
- `PromeRotation/Timeline/` — Core/{TimelineDtos,Nodes,BuiltinNodeTypes,NodeTypeRegistry,TimelineLoader}.cs、Conditions/*.cs、Actions/*.cs

每个条件/动作类的 `Descriptor` 定义了权威 TypeKey 与中文 DisplayName，`ToDto()` 决定实际写出的字段。改类型定义前先读源码，不要依赖 DLL 反编译（字符串被混淆）。

```
PtlDocument { Version=1, Meta{Name,TerritoryId,JobId,Author,AcrAuthor,CreatedAt,Opener,Remark},
  Variables[], Anchors[], Entries[] }
Anchor { Guid, Name, Time(秒), IsPhaseAnchor, IsEndAnchor, IsCommentAnchor, IsTechnicalAnchor,
  Enabled, Remark, Sync?{ Type, Params{ActionId?,Regex?}, MatchTime?, JumpTargetTime?,
  IsForceJump, WindowBefore, WindowAfter } }
Entry { Guid, Name, StartAnchorGuid, Offset(秒), Enabled, Remark, EntryGroup: Node }
Node { Id, Name, Type: serial|parallel|condition|action|branch|delay, Enabled, Remark,
  DelayMs?, Mode?('wait'), UseAndLogic?, Condition?/Conditions?, Action?/Actions?, Children?, Script? }
```

- **节点类型（7 种）**：serial/parallel/condition/action/branch/delay/csharprunningaction（`TimelineLoader` 用 `ToLowerInvariant()` 匹配）
  - `condition` 的 `Mode`：auto/immediate/wait（默认 wait）；`UseAndLogic` 默认 true
  - `branch` 首帧立即求值条件快照，真走 `Children[0]`、假走 `Children[1]`，故新建时自动带「真分支/假分支」两个子节点
- **SyncType 枚举**：None/InCombat/CastStart/ActionEffect/Weather/ChatLog/Countdown/ActorControl/AddedCombatant/NpcYell/Lua/Manual（JSON 序列化为字符串）
- **SkillType**（ActionDto.SkillType）= `PromeRotation.Data.ActionType`: Gcd/OffGcd/Always/Item/LimitBreak
- **Target** = `PromeRotation.Data.ActionTargetType`: Self/Target/TargetOfTarget/FocusTarget/MouseOver/LowestHealthPartyMember/PartyMember2-8
- **类型键大小写不敏感**：插件的 ConditionFactory/ActionFactory 用 `StringComparer.OrdinalIgnoreCase`，现存时间轴里 `ForceUseSkill` 与 `forceuseskill` 混用，本编辑器查表同样忽略大小写并保留文件原有写法
- **Params 字典**：`Dictionary<string,string>`，布尔按 C# `bool.ToString()` 写作 `"True"/"False"`
- **校验规则**（PtlDefinition.BuildSegments，已移植到 `prModel.ts::validatePtlDocument`）：功能锚点（非注释/技术）≥2；首个功能锚点 Time=0 且 Sync=InCombat；时间严格递增（ε=0.0001）；最后一个功能锚点必须是唯一 End 锚点；End 与 Phase 互斥；Entry 必须绑定非 End 功能锚点且 Offset ∈ [0, 下一锚点时间差)
- **运行时默认**：WindowBefore/After 均 ≤0 时取 ±2.5s（普通）/±10s（阶段锚点）；MatchTime/JumpTargetTime 为 null 时取锚点时间
- **PR 目录**：默认 `%APPDATA%/XIVLauncherCN/pluginConfigs/PromeRotation/PureTimelines`，持久化在 ae-config.json 的 `prDirectory` 键

## 技能名数据（data/actions.json）

全量 Action 表（43181 条，含 Boss/NPC 技能），锚点同步与技能字段都靠它显示中文名。

```bash
python -X utf8 scripts/export_all_actions.py            # 默认读游戏本体，最权威
python -X utf8 scripts/export_all_actions.py --source mcp   # EXDViewer MCP
python -X utf8 scripts/export_all_actions.py --source csv   # 公开 datamining 转储（落后数个版本，仅兜底）
```

- `scripts/exd_reader.py`：纯 Python SqPack + EXD 读取器，直接从 `{游戏目录}/game/sqpack/ffxiv/0a0000.*` 提取 Action 表。SqPack 路径哈希 = CRC32 寄存器值**不做最终取反**（即 `~zlib.crc32`）
- **Action.exh 列索引**：0=Name、3=ActionCategory、10=ClassJob、28=CastType、68=IsPlayerAction。EXH 列序会随版本漂移，与 xivapi CSV 的列号不是一回事；换版本后若映射失效，用旧导出结果做交叉验证重新定位
- EXDViewer 的 MCP 只在其设置向导完成后才监听 3001（见 EXDViewer `viewer/src/app.rs` 的 `mcp::start`）

### ACR 类型发现

**两阶段自动发现**（`acr:discoverTypes` IPC）：

1. **时间轴扫描**：递归扫描 `Triggerlines/` 下所有 `.json`（跳过 `bak/`），提取非 `AEAssist.` 的 `$type`，收集字段名/类型 + qtValues/QTList/QtStates 样本 key
2. **DLL 元数据读取**（`dotnetMeta.ts`）：纯 TS 解析 .NET PE/CLI 二进制，读 TypeDef/Field/Property 表 + 字段签名（boolean/number/string/object）+ `#US` 字符串堆

两阶段结果合并：DLL 补充未在时间轴中出现的类型，时间轴提供更精确的字段类型和 QT key 样本。

**qtValues key 获取（三层回退）**：
```
sampleQtKeys（时间轴扫描） → allStrings（DLL #US 堆 CJK/英文过滤） → 手动输入框
```

**语义字段识别**（`semanticFields.ts`）：
- `OperatorIndex` / `CompareType` → 比较符下拉（==, !=, >, <, ≥, ≤）
- `PartyRole` → 职能下拉（MT/ST/H1/H2/D1/D2/D3/D4）
- 名称为 `Larger`/`NeedTargetable`/`Enable` 等但 DLL 报类型为 number → 自动纠正为 boolean

### ACR 类型定义

```ts
interface AcrTypeDef {
  $type: string              // 完整类型名 "UMP.Ninja.Triggers.TriggerAction_QTv2, UMP"
  displayName: string        // 短名
  assemblyName: string       // DLL 名
  fields: AcrFieldDef[]      // { key, type: 'boolean'|'number'|'string'|'object' }
  sampleQtKeys?: string[]    // 时间轴发现的 qtValues key
  sampleQtList?: {Key,Value}[]
  sampleQtStatesKeys?: string[]
  allStrings?: string[]      // DLL #US 字符串堆（QT key 回退）
}
```

## 关键架构

### AE 目录配置

- 路径持久化到 `%APPDATA%/Timeline Editor/ae-config.json`
- 默认值：`%APPDATA%/XIVLauncherCN/offlineplugins/AE`
- 用户通过 Toolbar `⚙ 设置` 按钮选择 → 广播 `ae:directoryChanged` → Sidebar 刷新文件列表 + ACR 类型重新发现
- 派生路径：`getTriggerlinesDir()` = `{aeDir}/Triggerlines`，`getAcrDir()` = `{aeDir}/ACR`

### 条件/动作下拉菜单（动态合并）

`PropertyPanel` 使用 `useMemo` 动态合并内置类型 + store 中 `acrConditionTypes`/`acrActionTypes`，按 `<optgroup>` 分组（内置条件 / ACR — UMP / ACR — Aki ...）

### 文档加载

`loadFile(path)` → IPC `file:read` → `JSON.parse` → 写入 Zustand store。加载时清空 undo/redo。

### IPC 通道（20 个）

`file:read` `file:write` `file:exists` `file:stat` `file:listDir` |
`dialog:openFile` `dialog:saveFile` `dialog:selectAeDirectory` |
`app:getDefaultDir` `app:getBackupDir` `app:loadSpellData` |
`app:getAeDirectory` `app:getAcrDir` | `acr:listDlls` `acr:discoverTypes` |
`app:getPrDir` `dialog:selectPrDirectory` `dialog:openPrFile` `dialog:savePrFile`

### Preload 事件监听

`onAeDirectoryChanged(cb)`、`onPrDirectoryChanged(cb)` 和 `onAcrTypesChanged(cb)` 通过 `ipcRenderer.on` + 返回 unsubscribe 函数实现。

### 开发调试

dev 模式下主进程开启 `remote-debugging-port=9222`（`app.isPackaged` 判断，打包版不开），可用 CDP 直接驱动运行中的应用做自动化验证。

## MCP 工具

### EXDViewer — FFXIV Excel 数据查询

EXDViewerCN.exe 位于上级目录 `..\EXDViewerCN.exe`。内置 MCP 服务器启动后监听 `http://127.0.0.1:3001/mcp`。使用前需先手动打开 EXDViewerCN.exe。

```bash
start ..\EXDViewerCN.exe
```

查询流程：`search_sheets` → `get_schema_raw` → `query_rows` → `get_row`

### 技能ID自动查找

启动时自动加载 `data/actions.json`，在 SpellConfigEditor / PR 技能字段 / PR 锚点同步标签中显示中文名称。生成方式见上文「技能名数据」。`scripts/export_actions.py` 是旧的仅玩家技能版本，已被 `export_all_actions.py` 取代。
