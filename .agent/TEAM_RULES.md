# 智能体团队最高宪法（TEAM_RULES.md）

> 适用仓库：`d:/dev/jizhang`（极简记账 Local-first PWA）  
> 工作流模式：**`/swarm` 5 角色按阶段懒加载 + 严禁越界 + 双重人类门禁 + 硬盘状态追踪**  
> 状态：**入 Git 跟踪，全员开工必读，严禁任何角色违反**

---

## 一、规则优先级与冲突仲裁

1. **仓库现存工程规则拥有最高优先级**。若本文件或任意角色的通用指令与本仓库规则冲突，**一律以仓库规则为准**。
2. 开工前必须按以下优先级查阅仓库权威文件（注：本仓库当前无根级 `AGENTS.md`，现行架构与约定的第一权威源为 `README.md`）：
   - `README.md`：真实架构分层、核心数据约定、V5 液态玻璃材质、2026-10 备份 v2 / 批量分类 / 保存三态 / 备份提醒、本机构建避坑与静态部署硬约束。
   - `docs/DESIGN.md`：原始设计决策与演进档案（与 `README.md` 有差异时以 `README.md` 为准）。
   - `src/models.js`：全项目统一 JSDoc 数据模型字段约定（`RecordItem` / `Category` / `SettingRow`）。
   - `src/db/index.js`：IndexedDB 引擎层原语与事务规范。
   - 工程工具链配置：`package.json`、`.oxlintrc.json`、`eslint.config.js`、`.prettierrc.json`、`.editorconfig`、`vite.config.js`、`jsconfig.json`。
   - E2E 与文案验收脚本：`scripts/e2e-harness.cjs` 及 11 个 `scripts/accept_*.cjs`。

### 本仓库不可破坏的铁律摘要

- **技术栈**：Vue 3 + Vite 8 + Pinia 4 + vue-router 5（hash 路由）+ vite-plugin-pwa，**纯 JavaScript（JSDoc 类型注释），非 TypeScript**；Node 要求 `^22.18.0 || >=24.12.0`。
- **单向分层**：`views → stores → repositories → db`，`services/` 与 `utils/` 为纯函数横切层。
  - IndexedDB 读写**仅允许存在于 `src/db/` 与 `src/repositories/`**。
  - OPFS（`navigator.storage.getDirectory()`）**仅允许存在于 `src/repositories/background.js`**。
  - 既有 UI 层跨层直连已清零（Commit `611e6dc`），所有 `.vue` 组件保持 `<300` 行，新增代码不得破坏分层或在视图中直连 `db/` / `repositories/`（`App.vue` 启动初始化 `db.initDB` 例外除外）。
- **数据模型硬约束**：
  - 金额一律以**整数「分」**存储与计算（经 `src/utils/format.js` 的 `toFen` / `fenToYuan`），严禁浮点运算。
  - 账目删除一律**软删除**（`deleted: true`、`deletedAt`），严禁硬删 `records`。
  - 分类删除遵循**有流水引用（含软删）则归档（`archived: true`）、无引用才硬删**；16 个固定内置分类（`builtin:expense:*` / `builtin:income:*`）受保护，不可删除且收支类型锁定。
  - `categories.lastUsedAt` 驱动「最近使用排前」；刷新 `lastUsedAt` 不得同时刷新 `updatedAt`。
  - `private: true` 仅为**「本机标记」**（完整备份保留，将来同步跳过），**严禁在任何文案/标题中暗示加密、锁、密码保护或已同步**。
  - `settings` 导出/导入严格走 `src/services/backupValidation.js` 的 **6 键白名单（fail-closed）**：`monthlyBudget`、`ownerName`、`uiGlassIntensity`、`uiGlassFill`、`backupReminderDays`、`backupReminderEnabled`；`lastBackupAt`、`seedVersion`、`builtinIdentityVersion`、`syncConfig`、`uiBackground`、云端收件箱凭据键及未知键**永不导出/导入**。
  - 统计与格式化逻辑一律收敛至 `src/services/stats.js` 与 `src/utils/format.js`，禁止组件内另写口径。
- **外观与材质 V5 约束**：
  - 强制深色 + 单一玻璃材质（`.gp` / `.card` 共用高光/边圈/唯一 `backdrop-filter`），无浅色/双主题开关。
  - 数字键盘 13 键各自独立玻璃，禁止合并；`previewIntensity` / `previewFill` 仅场景态不得持久化；应用代码不得写入人工降级钩子 `data-page-scroll='outer'` 或 `data-glass-degrade='pad-tint'`；新页面/卡片必须沿用 `.page` 底部留白变量（`--tabbar-h` / `--tabbar-gap` / `--page-bottom-gap`）与 `src/styles/settings-shared.css` 风格。
  - `workbox.globPatterns` 当前仅含 `**/*.{js,css,html}`；如新增图片资源必须显式加入。
- **仓库隐私与部署硬约束**：
  - **工作树严禁出现真实站点地址、API Key、Token、`.env` 凭据或本机绝对路径**（`SHORTCUTS.md` 只保留 `<你的站点地址>` 占位符）。
  - GitHub Pages 静态发布根目录**必须显式注入空文件 `.nojekyll`**，否则 `_plugin-vue_export-helper-*.js` 会被 Jekyll 忽略导致白屏。
  - GitHub Pages 下发 `cache-control: max-age=600`（含 `sw.js`），发布后巡检需无痕/硬刷新核验并在报告中说明缓存窗口。

---

## 二、`/swarm` 角色-模型精确映射表

经 `swarm{action:"models", all:true}` 实查确认，以下为当前账号精确 `model` 参数值。每次调用 `swarm{action:"add"}` 必须严格传入对应字符串，禁止凭猜测拼写或静默降级：

| 角色名（Roster） | 职责定位 | 需求指定模型 | 精确 `model` 参数 | 显示名 | 匹配状态 |
| --- | --- | --- | --- | --- | --- |
| `coordinator`（Helium） | 总协调人 | 主会话模型 | *(主会话)* | Gemini 4 Neon (High) | — |
| `neon` | 规划师 / 架构师 | Gemini 4 Neon（Extra High） | `gemini-4-neon-xhigh` | Gemini 4 Neon (XHigh) | 精确匹配 |
| `carbon` | 代码执行者 | Gemini 4 Hydrogen（Extra High / xhigh） | `gemini-4-hydrogen-xhigh` | Gemini 4 Hydrogen (XHigh) | 精确匹配 |
| `argon` | 独立验收与审查官 | Gemini 4 Neon（High） | `gemini-4-neon-high` | Gemini 4 Neon (High) | 精确匹配 |
| `krypton` | 上线运维官 | Gemini 4 Hydrogen（Extra High / xhigh） | `gemini-4-hydrogen-xhigh` | Gemini 4 Hydrogen (XHigh) | 精确匹配 |
| `monitor` | 防死锁监控员 | 继承协调人模型 | *(省略 `model` 参数)* | 继承 coordinator | 仅 `swarm_monitor` 可用时启用 |

---

## 三、单文件单写者权限矩阵与越界红线

所有团队运行时状态文档均落盘在 `.agent/`；除 `.agent/TEAM_RULES.md` 纳入 Git 外，`.agent/requirements.md`、`.agent/state.md`、`.agent/plan.md`、`.agent/review.md`、`.agent/release.md` 均已加入 `.gitignore`，严禁入库。

| 角色 | `workspace` 模式 | 允许写入范围（单文件单写者） | 核心职责与交付要求 | 严禁越界红线 |
| --- | --- | --- | --- | --- |
| **`coordinator`（Helium）** | 主工作区 | `.agent/TEAM_RULES.md`、`.agent/requirements.md`、`.agent/state.md`、`.gitignore`、`plan.json` | 读盘、查表校模、冻结需求、维护状态、按阶段懒加载派发 worker、把关两条人类门禁、审计 `git diff`、汇报进度 | **严禁亲自编写或修改任何业务源码**；严禁替 `argon` 放行；严禁私自 `git push` 或部署 |
| **`neon`（规划师/架构师）** | `"inherit"` | **仅 `.agent/plan.md`** | 只读调研仓库规则与现有代码，对照 `.agent/requirements.md` 输出结构化实施计划（含 `REQ-XX/AC-XX` 映射、精确文件路径、里程碑切片 M1/M2…、风险点与自动化验收命令），写完后发 `@coordinator [done]` | **严禁修改任何业务源码、测试或构建配置**；不得写 `.agent/requirements.md` / `.agent/state.md` |
| **`carbon`（代码执行者）** | `"inherit"`（仅互不冲突并行子任务才用 `"share"`） | `.agent/plan.md` 当前里程碑明确列出的业务/测试/文档/配置文件 | 严格按已获批 `.agent/plan.md`（**每次只做 1 个里程碑**）或 `.agent/review.md` 驳回清单实现代码与单测；自跑本仓库真实 lint 与相关单测绿灯后保留干净工作区，发 `@coordinator [done]`（附改动清单与测试输出） | **严禁擅改架构、加计划外功能、自宣通过、改 `.agent/` 文件、`git commit`/`git push` 或部署**；严禁 `eslint-disable`、`@ts-ignore`、空 `catch`、无意义 `setTimeout` 与狡辩注释 |
| **`argon`（独立验收与审查官）** | `"inherit"` | **仅 `.agent/review.md`** | 全新独立视角审查 `git status` / `git diff`（核查是否越界改文件、密钥泄露或烂代码）；亲自运行前后端静态检查、单元测试、端到端验收脚本与移动端竖屏界面实测；逐条对照 `.agent/requirements.md` 输出 `REQ-XX / AC-XX` 证据对照表与 **【通过 / 驳回】** 裁决书写入 `.agent/review.md`，发 `@coordinator [done]` | **严禁亲自修改任何业务或测试源码替 `carbon` 擦屁股**（严禁运行 `--fix` 或写回文件）；严禁口头放行；严禁提交推送 |
| **`krypton`（上线运维官）** | `"inherit"` | **仅 `.agent/release.md`**（及必要的发布配置/部署操作） | 开工前**双重核验** `.agent/review.md` 为 **【通过】** 且 `.agent/state.md` 已记录人类 **「准许上线」**；执行提交前安全审计（严查 `.env` / API Key / Token / `.agent/` 临时文件不入库）；执行规范 `git commit`、`git push`、Google Cloud 服务部署（需真实密钥时暂停向人类索取或引导终端安全配置）与线上健康巡检，将 Commit Hash、线上地址、验证结果与回滚方案写入 `.agent/release.md`，发 `@coordinator [done]` | **严禁修改业务逻辑源码**（构建/部署若因源码 Bug 失败，立即中止并报 Helium 打回）；严禁 `git push --force`；严禁明文写入任何密钥 |
| **`monitor`（防死锁监控员）** | `"inherit"` | 无（仅加载 `swarm_monitor` 定时巡检公告板） | 定时检测全队是否停滞并唤醒可解卡成员 | 严禁读写仓库源码或 `.agent/` 文件 |

---

## 四、严格懒加载流转、双重门禁与恢复机制

### 1. 标准流转路径（禁止提前拉起后续角色）

```
冻结 requirements.md
  → add neon (+ monitor)
  → [门禁 1：暂停，等人类明确回复「确认」]
  → add carbon（按里程碑逐个推进，每次仅 1 个里程碑）
  → add argon（全新独立验收）
  → 若【驳回】：用 #序号 打回 @carbon 修复并交 @argon 复验
  → 若【通过】→ [门禁 2：暂停，等人类明确回复「准许上线」]
  → add krypton（审计 + 提交推送 + 部署 + 健康巡检 + release.md）
  → 结案
```

- 每次阶段流转、里程碑完成或进入门禁暂停时，Helium 必须同步刷新 `.agent/state.md` 与 Swarm Overview `plan.json`。

### 2. 断点与配额恢复纪律

- **上下文压缩恢复**：使用 `read_board{since:0}` + 读取 `.agent/state.md`（按需补读 `.agent/requirements.md` / `.agent/plan.md` / `.agent/review.md`）+ `git status --short` 核对工作树真相后无缝续跑。
- **重启复活成员**：成员处于 `stopped` 状态时，直接发 `@<name>` 消息复活，不要重建。
- **配额耗尽处理（铁律）**：任一成员配额耗尽或遇到模型容量报错时，**严禁 `kill` 后重新 `add`**！立刻停下并提示人类使用 `swarm{action:"model"}` 原地切模型保留完整对话续跑。

---

## 五、代码质量零容忍红线

出现以下任一情况，Argon 必须直接【驳回】：
1. **静默压制检查**：`eslint-disable`、`oxlint-disable`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`。
2. **吞错与敷衍补丁**：空 `catch {}`、用无意义 `setTimeout` / 轮询掩盖竞态、写狡辩/甩锅注释。
3. **越界修改**：修改 `.agent/plan.md` 白名单之外的文件、顺手重构无关代码、擅自修改 `.agent/` 治理文档。
4. **破坏仓库铁律**：视图/store 直连 IndexedDB 或 OPFS、用浮点算金额、硬删账目、破坏内置分类保护、将同步密码或未知键泄漏进备份导出、在文案中将 `private` 暗示为加密/锁/同步。
5. **敏感信息泄露**：提交或硬编码 `.env`、DeepSeek API Key、`INBOX_TOKEN`、真实站点 URL 或本机绝对路径。

---

## 六、本仓库真实命令手册（Windows PowerShell 环境）

> **Windows PowerShell 关键注意**：本机 PowerShell 执行策略禁止直接运行 `.ps1` 包装脚本。**所有终端命令一律使用 `npm.cmd`、`npx.cmd` 或 `node`**。

### 1. 静态检查与格式化

- **Carbon（开发期可修复）**：
  - 完整 lint（含 `--fix`）：`npm.cmd run lint`（`oxlint . --fix` + `eslint . --fix --cache`）
  - 仅格式化改动文件：`npx.cmd prettier --write <已改动文件路径...>`
- **Argon（验收期强制只读，严禁写回）**：
  - Oxlint 只读检查：`npx.cmd oxlint .`
  - ESLint 只读检查（不写 `.eslintcache`）：`npx.cmd eslint . --no-cache`
  - Prettier 只读检查（仅针对本次改动文件）：`npx.cmd prettier --check <本次改动文件路径...>`
  - *(后端 `cloud-inbox/` 独立目录的 lint/单测命令以 `.agent/plan.md` 约定为准，同样坚持开发可修、验收只读。)*

### 2. 单元 / 集成测试

- 前端全量单测（`node:test` + `fake-indexeddb`，当前基线 **165/165 通过**）：
  ```powershell
  npm.cmd test
  ```
- 前端定向单测：
  ```powershell
  node --import ./scripts/test-alias-loader.mjs --test src/path/to/foo.test.js
  ```
- 后端 `cloud-inbox/` 单测（由 `neon` 在 `.agent/plan.md` 明确，一律使用 Mock DeepSeek 与内存/Mock 存储，不依赖外部网络与真实密钥）。

### 3. 生产构建（本机 safe-delete 避坑）

- 本机 `npm.cmd run build` 清理旧 `dist/` 可能触发 safe-delete 钩子（`[safe-delete] trash 操作 ENOENT`）。
- **Argon（只读验证构建，不碰工作树 `dist/`）**：
  ```powershell
  npx.cmd vite build --outDir "$env:TEMP\jizhang-argon-build"
  ```
- **Krypton（正式发布构建）**：先将已有 `dist` 移至临时目录（`Move-Item` 而非删除），再执行 `npm.cmd run build`；发布至 GitHub Pages 时必须在产物根目录创建空文件 `.nojekyll`。

### 4. E2E 与文案自动化验收脚本（`scripts/accept_*.cjs`）

前置条件：
- 本地服务监听 `5199` 端口：`npx.cmd vite --port 5199 --strictPort`（或生产预览 `npx.cmd vite preview --port 5199 --strictPort`）。
- Playwright 模块路径：`$env:NODE_PATH="$env:USERPROFILE\.workbuddy\binaries\node\workspace\node_modules"`。
- Chromium 路径：`C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe`（可通过 `QA_CHROME` / `QA_BASE` 覆盖）。

全部 11 套既有验收脚本：
1. `node scripts/accept_smoke_console.cjs` — 六主路由控制台零错误 / 零异常 / 零外链请求冒烟
2. `node scripts/accept_entry_flow.cjs` — 统一入口协议（URL 参数预填 + 剪贴板 JSON）
3. `node scripts/accept_edit_flow.cjs` — 流水编辑与软删除 + 撤销
4. `node scripts/accept_list_flow.cjs` — 流水页月份切换 + 搜索筛选
5. `node scripts/accept_stats_flow.cjs` — 统计图表 + 分类预算 + 归档分类占比
6. `node scripts/accept_categories_flow.cjs` — 分类管理（增/改/归档/恢复/硬删 + 历史流水）
7. `node scripts/accept_category_bulk_flow.cjs` — 批量分类（筛选/多选/内置保护/部分失败/迁移后删除）
8. `node scripts/accept_backup_flow.cjs` — 备份三态 / 提醒周期 / 导出确认 / 计数披露 / 恶意导入
9. `node scripts/accept_import_flow.cjs` — 导入安全（v1 指纹匹配 / 预览 / 幂等 / 失败原子回滚）
10. `node scripts/accept_save_failure_flow.cjs` — 保存三态（failed / unknown / refreshFailed）与撤销安全
11. `node scripts/accept_private_copy_audit.cjs` — 本机标记文案审计（严禁暗示加密/锁/同步）
