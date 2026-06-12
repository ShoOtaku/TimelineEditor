# Timeline Editor

FFXIV AEAssist 时间轴（Triggerline）外部编辑器。读取/编辑 `Triggerlines` 目录下的 `.json` / `.txt` 时间轴文件，提供树形展开视图、节点属性编辑、条件和动作类型化编辑器、C# 脚本 Monaco 编辑。自动发现 ACR（Advanced Combat Routine）插件 DLL 中的条件/动作类型。

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
│   │   └── types.ts            # 完整 TS 类型系统（10 节点类型 + ACR TypeDef）
│   ├── plugins/
│   │   └── index.ts            # PluginRegistry 单例（预留扩展框架）
│   └── renderer/
│       ├── main.tsx            # React 入口
│       ├── App.tsx             # 主布局 — Sidebar | TreeView | PropertyPanel + ScriptPanel
│       ├── env.d.ts            # window.electronAPI 类型声明
│       ├── index.css           # TailwindCSS + 暗色主题 + 自定义 .field-input .field-input
│       ├── store/
│       │   └── index.ts        # Zustand + Immer — 文档/undo/ACR 类型注册表
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

### IPC 通道（16 个）

`file:read` `file:write` `file:exists` `file:stat` `file:listDir` |
`dialog:openFile` `dialog:saveFile` `dialog:selectAeDirectory` |
`app:getDefaultDir` `app:getBackupDir` `app:loadSpellData` |
`app:getAeDirectory` `app:getAcrDir` | `acr:listDlls` `acr:discoverTypes`

### Preload 事件监听

`onAeDirectoryChanged(cb)` 和 `onAcrTypesChanged(cb)` 通过 `ipcRenderer.on` + 返回 unsubscribe 函数实现。

## MCP 工具

### EXDViewer — FFXIV Excel 数据查询

EXDViewerCN.exe 位于上级目录 `..\EXDViewerCN.exe`。内置 MCP 服务器启动后监听 `http://127.0.0.1:3001/mcp`。使用前需先手动打开 EXDViewerCN.exe。

```bash
start ..\EXDViewerCN.exe
```

查询流程：`search_sheets` → `get_schema_raw` → `query_rows` → `get_row`

### 技能ID自动查找

启动时自动加载 `data/actions.json`（`scripts/export_actions.py` 生成），在 SpellConfigEditor 中输入技能 ID 时自动显示中文名称。

```bash
cd timeline-editor
python scripts/export_actions.py
```
