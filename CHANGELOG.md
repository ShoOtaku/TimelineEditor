# 更新日志

## v1.1.4

**新功能**

- PR：新增「检测自身职业」条件（selfjob）——按职业类别（T/奶/近战DPS/远敏DPS/法系DPS）或按具体职业（23 个职业含 7.56 驯兽师）下拉选择，仅显示当前方式所需的选项
- PR：新增「加入技能组」动作（enqueueskillgroup）——技能列表行编辑器：技能 ID + 自动显示技能名 + 类型/目标下拉 + 上移/下移/删除；输入技能 ID 时按技能表自动识别 GCD/能力技（与游戏内编辑器 Auto 行为一致，仍可手动修改）
- PR：新增「横幅消息提示」动作（showhint）——消息内容、显示时间（0.5~30 秒）、蓝色（提示）/红色（警告）样式

以上类型与默认值均对齐 PromeRotation 本体 2026-09-17 更新（字段严格按源码 `ToDto()` 序列化）。

## v1.1.3

**新功能**

- AE：新增「时间轴信息」编辑面板（未选中节点时在右侧编辑 Name / Author / TargetJob / TerritoryTypeId / TerritoryWeatherId / TargetAcrAuthor / Note / ExposedVars / LogsAddress / GUID，支持重新生成 GUID）
- AE：起手脚本（OpenerScript）可在底部 Monaco 脚本面板中编辑
- PR：元数据面板补全——Variables 变量列表编辑、起手模板（Opener）、备注
- PR：自定义起手脚本（Meta.CustomOpener.Script）Monaco 编辑，留空自动省略字段
- PR：「C# 持续行为」节点的脚本改为在底部 Monaco 面板中编辑
- PR：跨锚点 / 跨行为组复制粘贴——Ctrl+C / Ctrl+V，或行为组行 📋、锚点行「📋粘贴」、节点右键菜单；行为组粘贴到目标锚点时 Offset 自动收敛进段窗口，节点子树粘贴时自动重排 Id

**修复与优化**

- 修复脚本面板仅打开就幻影标脏并压入空撤销记录的问题
- 职能检测（timelinerole）下拉移除会导致条件恒假的 None 选项，并提示游戏内需设置「当前职能」（插件面板下拉或 /e MT）
- 多项 UI/UX 细节优化（对话框、右键菜单、状态栏、侧栏、工具栏等）

**内部**

- 撤销栈支持同 tag 连续编辑合并为一步
- DEV 模式暴露 `window.__prStore` 便于自动化验证
