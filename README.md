# Timeline Editor — FFXIV 时间轴编辑器

> ⚠️ **纯 Vibe Coding 产物**  
> 本项目由 AI 通过自然语言对话驱动生成，未经专业软件工程流程。代码由 AI 迭代式输出，人工仅做功能验证，可能存在边界情况未处理、性能未优化等问题。使用前请自行评估风险。

---

## 这是什么？

一个 **Electron 桌面应用**，可视化编辑 FFXIV 两种时间轴格式：

| 模式 | 插件 | 目录 |
|------|------|------|
| 🌲 AE 时间轴 | AEAssist Triggerline | `Triggerlines/` |
| ⏱ PR 时间轴 | PromeRotation PureTimeline | `pluginConfigs/PromeRotation/PureTimelines` |

工具栏左上角按钮一键切换，两种格式共享文件读写与技能名数据，但编辑界面和数据结构完全独立。

### 核心能力

**AE 模式（AEAssist）**
- 行为树可视化：展开/折叠 10 种节点（序列/并行/选择/循环/条件/动作等）
- 属性编辑：26 种条件 + 17 种动作的字段编辑器，反编译自 AEAssist.dll 保证准确性
- C# 脚本编辑：内嵌 Monaco Editor
- ACR 类型自动发现：从 ACR 插件 DLL 中提取自定义条件/动作类型（含枚举字段解析）
- ACR 类型查看器 / 撤销重做（50 步） / 节点拖拽排序

**PR 模式（PromeRotation PureTimeline）**
- 锚点-行为组双层级结构，按时间线排列
- 锚点同步规则编辑（CastStart/ActionEffect 等 12 种同步类型，技能名自动查找）
- 行为组内嵌节点树编辑（7 种节点类型：串行/并行/条件/动作/分支/延迟/C#持续行为）
- 15 种条件 + 18 种内置动作 + 3 种 XSZBox IPC 动作的规格驱动编辑器
- 节点拖拽排序 + 右键菜单 + 嵌套折叠 + 常驻节点工具条
- PtlDefinition 校验规则实时检查（首锚点 InCombat、时间递增、偏移越界等）

**通用**
- 全量技能名查找：43181 条（含 Boss/NPC），从游戏本体直接读取 Action 表
- 应用内对话框（Electron 不支持 `window.prompt`，已替换）

---

## 快速开始

### 环境要求

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+
- 已安装 FFXIV + AEAssist / PromeRotation 插件

### 启动开发模式

```bash
cd timeline-editor
npm install
npm run dev
```

### 打包为 exe

```bash
npm run dist       # → release/Timeline Editor 1.0.0.exe
```

---

## 使用指南

### 配置目录

**AE 模式**：点击 ⚙ 设置，选择 AEAssist 目录（默认 `%APPDATA%/XIVLauncherCN/offlineplugins/AE`）。

**PR 模式**：点击 ⚙ PR目录，选择 PureTimelines 目录（默认 `%APPDATA%/XIVLauncherCN/pluginConfigs/PromeRotation/PureTimelines`）。

### AE 模式

- 左侧 Files 列表选择 Triggerline 文件（.json / .txt）
- 中间区域显示行为树：展开/折叠、双击切换、拖拽排序
- 选中节点 → 右侧属性面板编辑（字段由反编译规格驱动渲染）
- 右键节点 → 添加子节点/同级节点、删除、复制、粘贴
- 工具栏 `</> Script` 切换 Monaco C# 编辑器
- 工具栏 🔍 ACR 切换类型查看器（调试用）

### PR 模式

- 左侧 PR 时间轴列表选择文件
- 中间锚点列表 + 行为组行，**选中行为组自动展开**其内部节点树
- 右侧属性面板随选中对象切换：Meta → 锚点 → 行为组 → 节点
- 工具栏 ✚ 新建创建空白时间轴
- 节点树支持拖放排序（拖到顶部=插入前/底部=插入后/中间=放入组合节点内）
- 右键节点打开操作菜单（添加子/同级节点、切换启用、移序、删除）

---

## 技能名数据

启动时自动加载 `data/actions.json`（43181 条，含 Boss/NPC 技能），锚点同步标签和技能 ID 输入框旁会显示中文名称。

```bash
# 从游戏本体导出（最权威）
python -X utf8 scripts/export_all_actions.py

# 从 EXDViewer MCP 导出（需先完成 EXDViewer 设置向导）
python -X utf8 scripts/export_all_actions.py --source mcp

# 从公开 datamining CSV 兜底（落后数个版本）
python -X utf8 scripts/export_all_actions.py --source csv
```

---

## AE 类型规格更新

AEAssist 更新后条件/动作类可能增减字段，运行以下命令重新提取规格：

```bash
python -X utf8 scripts/extract_aeassist_specs.py
```

脚本用 ilspycmd 反编译 AEAssist.dll，正则提取全部序列化字段、枚举值和中文显示名，写入 `scripts/aeassist_specs.json`。前端 `@shared/aeAssistSpecs.ts` 在编译时引入该 JSON，无需额外步骤。

---

## 数据模型

### AE 模式（10 种行为树节点）

| 节点类型 | 类别 | 关键字段 |
|---------|------|---------|
| `TreeSequence` | 组合（顺序执行） | `IgnoreNodeResult`, `StopWhenDead`, `Childs` |
| `TreeParallel` | 组合（并行执行） | `AnyReturn`, `StopWhenDead`, `Childs` |
| `TreeSelect` | 组合（选择执行） | `Childs` |
| `TreeLoop` | 组合（循环执行） | `LoopCount`, `Childs` |
| `TreeCondNode` | 叶子（条件判断） | `CondLogicType`, `TriggerConds[]` |
| `TreeActionNode` | 叶子（执行动作） | `TriggerActions[]` |
| `TreeScriptNode` | 叶子（C# 脚本） | `Script`, `OnlyCheck` |
| `TreeDelayNode` | 叶子（延迟） | `Delay`(秒) |
| `TreeDebugNode` | 叶子（调试占位） | — |
| `TreeClearWaitNode` | 叶子（清除等待） | — |

- 内置 26 种条件 + 17 种动作（精确字段列表见 `scripts/aeassist_specs.json`）
- ACR 类型：纯 TS ECMA-335 解析器读取 DLL，两阶段发现（时间轴扫描 + DLL 元数据）

### PR 模式

```
PtlDocument → Meta (名称/职业/地图/作者)
            → Anchors[] (锚点：时间/标注/同步规则)
            → Entries[]  (行为组：绑定锚点 + 偏移 + EntryGroup 节点树)
```

- **锚点同步类型** 12 种：None/InCombat/CastStart/ActionEffect/Weather/ChatLog/Countdown/ActorControl/AddedCombatant/NpcYell/Lua/Manual
- **节点类型** 7 种：serial/parallel/condition/action/branch/delay/csharprunningaction
- 类型规格来自 PromeRotation 源码仓库（非 DLL 反编译），大小写不敏感匹配

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 34, React 19, TypeScript 5.7 |
| 构建 | Vite 6 |
| 状态 | Zustand 5 + Immer 10（50 步 undo/redo） |
| 代码编辑 | Monaco Editor 0.55（C#） |
| 样式 | TailwindCSS 4（暗色主题） |
| IPC | contextBridge + ipcMain.handle（20 通道） |
| DLL 解析 | 纯 TS ECMA-335 解析器 → AEAssist 类型发现；ilspycmd → AEAssist 规格提取 |
| 游戏数据 | 纯 Python SqPack/EXD 读取器 → 全量 Action 表导出 |

---

## 项目结构

```
timeline-editor/
├── scripts/
│   ├── extract_aeassist_specs.py  # AEAssist.dll 反编译规格提取
│   ├── export_all_actions.py      # 全量技能名导出（游戏本体/EXDViewer MCP/CSV）
│   └── exd_reader.py              # SqPack + EXD 纯 Python 读取器
├── data/
│   └── actions.json               # 技能名查找表（43181 条）
├── src/
│   ├── main/index.ts              # Electron 主进程（窗口/IPC/目录配置）
│   ├── preload/preload.ts         # contextBridge API（20 通道）
│   ├── shared/
│   │   ├── types.ts               # AE 类型系统
│   │   ├── prTypes.ts             # PR 类型系统 + 枚举常量
│   │   ├── prSpecTypes.ts         # PR 字段规格类型
│   │   ├── prConditionSpecs.ts    # 15 种 PR 条件规格
│   │   ├── prActionSpecs.ts       # 18+3 种 PR 动作规格
│   │   ├── prSpecs.ts             # PR 规格注册表入口
│   │   └── aeAssistSpecs.ts       # AEAssist 反编译规格运行时
│   └── renderer/
│       ├── App.tsx                # 主布局（AE/PR 模式切换）
│       ├── components/
│       │   ├── Toolbar.tsx        # 工具栏（模式切换/新建/打开/保存/设置）
│       │   ├── Sidebar.tsx        # AE 文件浏览器
│       │   ├── TreeView.tsx       # AE 行为树（拖拽排序）
│       │   ├── ContextMenu.tsx    # AE 右键菜单（同级/子节点）
│       │   ├── KeyboardShortcuts.tsx  # 快捷键（按模式路由）
│       │   ├── StatusBar.tsx      # 状态栏（按模式显示）
│       │   ├── Dialog.tsx         # 应用内对话框
│       │   └── DialogHost.tsx     # 对话框渲染宿主
│       ├── panels/
│       │   ├── PropertyPanel.tsx       # AE 属性面板
│       │   ├── ConditionEditor.tsx     # AE 条件编辑器（规格驱动）
│       │   ├── ActionEditor.tsx        # AE 动作编辑器（规格驱动）
│       │   ├── AeAssistFieldEditor.tsx # AE 字段渲染器（通用）
│       │   ├── PluginActionEditor.tsx  # ACR/插件动作 QT 编辑器
│       │   ├── SimplePointSelectorEditor.tsx  # 简单点位选择器
│       │   ├── SpellConfigEditor.tsx   # 技能配置
│       │   ├── TargetSelectorEditor.tsx # 目标选择器
│       │   ├── semanticFields.ts       # 语义字段映射
│       │   ├── ScriptPanel.tsx         # Monaco C# 编辑器
│       │   └── AcrViewerPanel.tsx      # ACR 类型查看器
│       ├── pr/                    # PR 编辑器（12 个文件）
│       │   ├── PrTimelineView.tsx      # 锚点-行为组中心视图
│       │   ├── PrNodeTree.tsx          # 节点树（拖拽排序 + 右键菜单）
│       │   ├── PrPropertyPanel.tsx     # PR 属性面板分发
│       │   ├── PrAnchorEditor.tsx      # 锚点 + 同步规则编辑
│       │   ├── PrEntryEditor.tsx       # 行为组编辑
│       │   ├── PrNodeEditor.tsx        # 节点编辑（常驻工具条）
│       │   ├── PrConditionEditor.tsx   # PR 条件编辑
│       │   ├── PrActionEditor.tsx      # PR 动作编辑
│       │   ├── PrSidebar.tsx           # PR 文件浏览器
│       │   ├── prModel.ts             # 工厂/校验/树辅助
│       │   ├── prMutations.ts         # 文档变更 + 拖放校验
│       │   └── prFields.tsx           # 共享字段组件
│       └── store/
│           ├── index.ts           # AE Zustand store
│           ├── prStore.ts         # PR 文档/锚点/行为组
│           ├── prStoreTypes.ts    # PR store 接口
│           ├── prNodeSlice.ts     # PR 节点树操作切片
│           └── dialogStore.ts     # 对话框请求队列
└── CLAUDE.md                      # 开发文档
```

## 开发命令

```bash
npm run dev       # 启动开发模式
npm run build     # 生产构建
npm run lint      # TypeScript 类型检查
npm run dist      # 打包为 Windows exe
```
