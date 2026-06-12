# Timeline Editor — FFXIV AEAssist 时间轴编辑器

> ⚠️ **纯 Vibe Coding 产物**  
> 本项目由 AI（Claude/Reasonix）通过自然语言对话驱动生成，未经专业软件工程流程（需求评审、架构设计、代码审查、测试覆盖）。代码由 AI 一次性或迭代式输出，人工仅做功能验证。可能存在边界情况未处理、性能未优化、错误处理不完善等问题。使用前请自行评估风险。

---

## 这是什么？

一个 **Electron 桌面应用**，用于可视化编辑 FFXIV AEAssist 插件的**时间轴（Triggerline）文件**。

时间轴文件是 AEAssist 的行为树配置，定义「在什么条件下执行什么动作」——例如「Boss 读条 X 技能时 → 使用减伤技能」。这些文件以 JSON 格式存放在 `Triggerlines/` 目录下，嵌套层级深、字段繁多。本编辑器提供图形化界面替代手写 JSON。

### 核心能力

- **树形可视化**：展开/折叠行为树节点（序列、并行、选择、循环、条件、动作等 10 种）
- **属性编辑**：选中节点后在右侧面板编辑所有属性（DisplayName、Delay、LoopCount 等）
- **条件/动作类型化编辑器**：18 种内置条件 + 11 种内置动作的专用编辑器，字段带语义识别（如比较符下拉、职能下拉）
- **C# 脚本编辑**：内嵌 Monaco Editor 编辑 TreeScriptNode 的 C# 脚本
- **ACR 类型自动发现**：自动从 ACR 插件 DLL 中读取自定义条件/动作类型（包括枚举字段解析）
- **ACR 类型查看器**：调试面板，查看所有已发现 ACR 类型的完整结构（字段、接口、枚举值）
- **撤销/重做**：50 步快照回退
- **拖拽排序**：右键菜单添加/删除/复制节点，拖拽调整顺序

---

## 快速开始

### 环境要求

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+
- 已安装 FFXIV + AEAssist 插件（需要 `Triggerlines/` 和 `ACR/` 目录）

### 启动开发模式

```bash
cd timeline-editor
npm install
npm run dev        # 启动 Vite + Electron
```

### 打包为 exe

```bash
npm run dist       # → release/Timeline Editor 1.0.0.exe（约 68 MB）
```

---

## 使用指南

### 1. 配置 AE 目录

首次启动后，点击工具栏 **⚙ 设置** 按钮，选择你的 AEAssist 目录：

```
%APPDATA%/XIVLauncherCN/offlineplugins/AE
```

编辑器会自动：
- 从 `{AE目录}/Triggerlines/` 加载 `.json` / `.txt` 时间轴文件
- 从 `{AE目录}/ACR/` 读取各 ACR 插件的 DLL，提取自定义条件/动作类型

### 2. 打开并编辑时间轴

- 左侧 **文件浏览器** 列出 `Triggerlines/` 下所有文件
- 点击文件加载，中间区域显示**行为树**
- 选中节点 → 右侧**属性面板**编辑
- 右键节点 → 添加/删除/复制子节点
- 工具栏 **`</> Script`** 切换 Monaco C# 脚本编辑器

### 3. 使用 ACR 自定义类型

当你的 AEAssist 安装了第三方 ACR 插件（如 UMP、Aki、azz 等），编辑器的条件/动作下拉菜单会自动出现这些插件的自定义类型。

选择后会根据 DLL 元数据渲染专用字段编辑器：
- `bool` → 复选框
- `int/float/uint` → 数字输入框
- `string` → 文本输入框
- `enum` → 下拉选择框（显示枚举名和数值）
- `Dictionary<string, bool>` → QT 键值对编辑器

### 4. 查看 ACR 类型（调试）

点击工具栏 **🔍 ACR** 按钮，右侧面板切换为 **ACR 类型查看器**：

- **条件 / 动作** 两个 tab 分别展示
- 按 DLL（如 `azz`、`Aki`、`UMP`）分组
- 点击类型展开查看：
  - 完整 `$type` 名
  - 实现的接口
  - 基类
  - 所有字段的类型、引用类型名
  - **枚举字段的完整成员列表**（名称 + 数值）
- 搜索框可按类型名/字段名/接口名过滤

再次点击 **🔍 ACR** 切回属性编辑面板。

---

## 数据模型

### 10 种行为树节点

| 节点类型 | 类别 | 关键字段 |
|---------|------|---------|
| `TreeSequence` | 组合（顺序执行） | `IgnoreNodeResult`, `StopWhenDead`, `Childs` |
| `TreeParallel` | 组合（并行执行） | `AnyReturn`, `StopWhenDead`, `Childs` |
| `TreeSelect` | 组合（选择执行） | `Childs` |
| `TreeLoop` | 组合（循环执行） | `LoopCount`, `Childs` |
| `TreeCondNode` | 叶子（条件判断） | `CondLogicType`(0=AND/1=OR), `TriggerConds[]` |
| `TreeActionNode` | 叶子（执行动作） | `TriggerActions[]` |
| `TreeScriptNode` | 叶子（C# 脚本） | `Script`, `OnlyCheck` |
| `TreeDelayNode` | 叶子（延迟） | `Delay`(秒) |
| `TreeDebugNode` | 叶子（调试占位） | — |
| `TreeClearWaitNode` | 叶子（清除等待） | — |

### 内置条件/动作

- **条件 18 种**：敌人读条、技能 CD、变量比较、战斗计时、天气变化、Buff 检测、职能判断等
- **动作 11 种**：强制施法、技能队列、切换目标、吃药、发送指令、TP 控制、变量设置等

### ACR 类型两阶段发现

1. **时间轴扫描**：遍历 `Triggerlines/` 下所有 JSON，提取非 `AEAssist.` 前缀的 `$type`，收集字段和 QT key 样本
2. **DLL 元数据解析**：纯 TypeScript 解析 .NET PE/CLI 二进制格式（无需外部工具），读取 TypeDef/Field/Property/InterfaceImpl/Constant 表，提取字段签名、接口实现、枚举成员

两个阶段结果合并，DLL 补充类型完整性，时间轴提供真实使用样本。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 34, React 19, TypeScript 5.7 |
| 构建 | Vite 6 |
| 状态管理 | Zustand 5 + Immer 10（50 步 undo/redo） |
| 代码编辑 | Monaco Editor 0.55（C#） |
| 样式 | TailwindCSS 4（暗色主题） |
| IPC | contextBridge + ipcMain.handle（16 通道） |
| DLL 解析 | **纯 TS ECMA-335 解析器** — PE header → CLI metadata → 类型/字段/属性/接口/枚举 |

---

## 项目结构

```
timeline-editor/
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron 主进程（窗口/IPC/AE目录）
│   │   └── dotnetMeta.ts         # .NET PE/CLI 二进制元数据解析器
│   ├── preload/
│   │   └── preload.ts            # contextBridge API
│   ├── shared/
│   │   └── types.ts              # 数据类型 & ACR TypeDef
│   └── renderer/
│       ├── App.tsx               # 主布局
│       ├── store/index.ts        # Zustand store
│       ├── components/
│       │   ├── Toolbar.tsx       # 工具栏
│       │   ├── Sidebar.tsx       # 文件浏览器
│       │   ├── TreeView.tsx      # 行为树视图
│       │   ├── StatusBar.tsx     # 状态栏
│       │   └── ContextMenu.tsx   # 右键菜单
│       └── panels/
│           ├── PropertyPanel.tsx       # 属性编辑
│           ├── ConditionEditor.tsx     # 条件子编辑器
│           ├── ActionEditor.tsx        # 动作子编辑器
│           ├── ScriptPanel.tsx         # Monaco C# 编辑器
│           ├── AcrViewerPanel.tsx      # ACR 类型调试查看器
│           ├── semanticFields.ts       # 语义字段映射
│           ├── SpellConfigEditor.tsx   # 技能配置
│           └── TargetSelectorEditor.tsx # 目标选择器
├── index.html
├── package.json
└── vite.config.ts
```

---

## 开发命令

```bash
npm run dev       # 启动开发模式
npm run build     # 生产构建
npm run lint      # TypeScript 类型检查
npm run dist      # 打包为 Windows exe
```
