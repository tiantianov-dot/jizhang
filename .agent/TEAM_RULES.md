# 智能体团队最高宪法（TEAM_RULES.md）

> 适用仓库：`d:/dev/jizhang`（极简记账 Local-first PWA）  
> 状态：**入 Git 跟踪，全员开工必读，严禁任何角色违反**

---

## 一、规则优先级与冲突仲裁

1. **仓库现存工程规则拥有最高优先级**。若本文件或任意角色的通用指令与本仓库规则冲突，**一律以仓库规则为准**。
2. 开工前必须按以下优先级查阅仓库权威文件（注：本仓库当前无根级 `AGENTS.md`，现行架构与约定的第一权威源为 `README.md`）：
   - `README.md`：真实架构分层、核心数据约定、V5 液态玻璃材质、2026-10 备份 v2 / 批量分类 / 保存三态 / 备份提醒、本机构建避坑与静态部署硬约束。
   - `docs/DESIGN.md`：原始设计决策与演进档案（与 `README.md` 有差异时以 `README.md` 为准）。
   - `src/models.js`：全项目统一 JSDoc 数据模型字段约定（`RecordItem` / `Category` / `SettingRow`）。
   - `src/db/index.js`：IndexedDB 引擎层原语与事务规范。
   - 工程工具链配置：`package.json`、`.oxlintrc.json`、`eslint.config.js`、`.prettierrc.json`、`.editorconfig`、`vite.config.js`、`jsconfig.json`、`.vscode/settings.json`。
   - E2E 与文案验收脚本：`scripts/e2e-harness.cjs` 及 11 个 `scripts/accept_*.cjs`。

### 本仓库不可破坏的铁律摘要

- **技术栈**：Vue 3 + Vite 8 + Pinia 4 + vue-router 5（hash 路由）+ vite-plugin-pwa，**纯 JavaScript（JSDoc 类型注释），非 TypeScript**；Node 要求 `^22.18.0 || >=24.12.0`。
- **单向分层**：`views → stores → repositories → db`，`services/` 与 `utils/` 为纯函数横切层。
  - IndexedDB 读写**仅允许存在于 `src/db/` 与 `src/repositories/`**。
  - OPFS（`navigator.storage.getDirectory()`）**仅允许存在于 `src/repositories/background.js`**。
  - 不得扩散既有跨层直连例外（`App.vue`、`CategoriesView.vue`、`SettingsView.vue` 之外一律走 store）。
- **数据模型硬约束**：
  - 金额一律以**整数「分」**存储与计算（经 `src/utils/format.js` 的 `toFen` / `fenToYuan`），严禁浮点运算。
  - 账目删除一律**软删除**（`deleted: true`、`deletedAt`），严禁硬删 `records`。
  - 分类删除遵循**有流水引用（含软删）则归档（`archived: true`）、无引用才硬删**；16 个固定内置分类（`builtin:expense:*` / `builtin:income:*`）受保护，不可删除且收支类型锁定。
  - `categories.lastUsedAt` 驱动「最近使用排前」；刷新 `lastUsedAt` 不得同时刷新 `updatedAt`。
  - `private: true` 仅为**「本机标记」**（完整备份保留，将来同步跳过），**严禁在任何文案/标题中暗示加密、锁、密码保护或已同步**。
  - `settings` 导出/导入严格走 `services/backupValidation.js` 的 **6 键白名单（fail-closed）**：`monthlyBudget`、`ownerName`、`uiGlassIntensity`、`uiGlassFill`、`backupReminderDays`、`backupReminderEnabled`；`lastBackupAt`、`seedVersion`、`builtinIdentityVersion`、`syncConfig`、`uiBackground` 及未知键**永不导出/导入**。
  - 统计与格式化逻辑一律收敛至 `src/services/stats.js` 与 `src/utils/format.js`，禁止组件内另写口径。
- **外观与材质 V5 约束**：
  - 强制深色 + 单一玻璃材质（`.gp` / `.card` 共用高光/边圈/唯一 `backdrop-filter`），无浅色/双主题开关。
  - 数字键盘 13 键各自独立玻璃，禁止合并；`previewIntensity` / `previewFill` 仅场景态不得持久化；应用代码不得写入人工降级钩子 `data-page-scroll='outer'` 或 `data-glass-degrade='pad-tint'`；新页面必须沿用 `.page` 底部留白变量（`--tabbar-h` / `--tabbar-gap` / `--page-bottom-gap`），禁止写死 padding。
  - `workbox.globPatterns` 当前仅含 `**/*.{js,css,html}`；如新增图片资源必须显式加入。
- **仓库隐私与部署硬约束**：
  - **工作树严禁出现真实站点地址、Token、密钥、`.env` 凭据或本机绝对路径**（`SHORTCUTS.md` 只保留 `<你的站点地址>` 占位符）。
  - GitHub Pages 静态发布根目录**必须显式注入空文件 `.nojekyll`**，否则 `_plugin-vue_export-helper-*.js` 会被 Jekyll 忽略导致白屏。
  - GitHub Pages 下发 `cache-control: max-age=600`（含 `sw.js`），发布后巡检需无痕/硬刷新核验并在报告中说明缓存窗口。

---

## 二、硬盘即记忆与防漂移体系

所有工作流真相全部落盘在 `.agent/`，**除 `.agent/TEAM_RULES.md` 外均已加入 `.gitignore`，严禁被提交到 Git**：

| 文件路径 | Git 状态 | 写入责任人 | 作用与纪律 |
| --- | --- | --- | --- |
| `.agent/TEAM_RULES.md` | **入 Git** | Helium（仅随流程升级更新） | 团队最高宪法、仓库规则、工具硬/软限权与命令手册 |
| `.agent/requirements.md` | **忽略** | **仅 Helium** | 原话冻结用户需求，拆解 `REQ-XX` / `AC-XX` 与“本次不做范围”；**非用户本人明确要求严禁修改** |
| `.agent/state.md` | **忽略** | **仅 Helium** | 团队唯一进度真相源（阶段、门禁、里程碑勾选、已拍板决策、改动文件、阻塞项、下一步动作） |
| `.agent/plan.md` | **忽略** | Neon 产出 → **Helium 审阅落盘** | 实施方案（REQ 映射、精确文件清单、M1/M2 里程碑切片、验收命令） |
| `.agent/review.md` | **忽略** | Argon 产出 → **Helium 审阅落盘** | 独立审查与实测报告（`git diff` 核查、静态/单测/E2E 结果、REQ/AC 证据表、【通过/驳回】裁决） |
| `.agent/release.md` | **忽略** | Krypton 产出 → **Helium 审阅落盘** | 上线发布与健康巡检记录（Commit Hash、线上地址、验证证据、回滚命令） |

### 防失忆与「恢复进度」协议

当用户发送**「恢复进度」**（或新会话接续任务）时，总协调人 Helium **必须立即按以下顺序执行**：
1. 读取 `.agent/state.md`；
2. 读取 `.agent/requirements.md`（若存在现行计划/审查报告，按需补读 `.agent/plan.md` / `.agent/review.md`）；
3. 运行 `git status --short` 与 `git branch --show-current` 核对工作树真实现状；
4. 在 **10 行以内**汇报当前断点（阶段、已完成与待做里程碑、门禁状态、下一步动作）并无缝续跑，严禁失忆重来或偏离已冻结需求。

---

## 三、两条人类硬门禁（不可绕过）

1. **门禁 1（方案审批门禁）**：
   - 流程：用户提出需求 → Helium 冻结 `.agent/requirements.md` → 拉起 `neon` 只读规划 → Helium 审阅并落盘 `.agent/plan.md`，同步更新 `.agent/state.md`（门禁 1 = `待用户确认`）。
   - **强制暂停**：必须等待用户明确回复 **「确认」** 后，Helium 将门禁 1 记为 `已通过` 并按里程碑逐个（每次 1 个里程碑）拉起 `carbon` 编码。
2. **门禁 2（上线发布门禁）**：
   - 流程：`carbon` 完成所有计划里程碑并自测绿灯 → Helium 记录 `git diff` 基准指纹 → 拉起全新独立上下文的 `argon` 全量验收 → Helium 复核 `git diff` 确认 Argon 零改动后落盘 `.agent/review.md` → 仅当裁决为 **【通过】** 时更新 `.agent/state.md`（门禁 2 = `待用户准许上线`）。
   - **强制暂停**：必须等待用户明确回复 **「准许上线」** 后，Helium 将门禁 2 记为 `已通过` 并拉起 `krypton` 执行提交、推送或部署。
   - 若 Argon 裁决为 **【驳回】**，严禁触发门禁 2，必须由 Helium 派发 `carbon` 读取 `.agent/review.md` 返工修复，并重新提交 `argon` 复验。

---

## 四、五角色隔离与工具权限矩阵

原生自定义 Subagent 定义落盘在 `.agents/agents/<name>.md`（入 Git），使用 Antigravity 原生 YAML Frontmatter `tools` 精细白名单实施系统级工具硬锁：

| 角色 | 运行位置 | 原生 `tools` 白名单（系统级硬锁） | 系统级硬锁边界 | 规则级软锁与 Helium 审计 |
| --- | --- | --- | --- | --- |
| **Helium**（总协调人） | 主会话 | 主会话编排工具 | — | **绝不写业务源码**；独占 `.agent/` 文档维护与调度权；负责门禁暂停与 `git diff` 越界审计 |
| **`neon`**（规划师） | `.agents/agents/neon.md` | `[read_file, search_web]` | **完全只读**：无 `edit_file`、`write_file`、`run_command`、`manage_task` | 不输出业务代码；Helium 调度时先提供最新文件树，确保只读调研无阻 |
| **`carbon`**（执行者） | `.agents/agents/carbon.md` | `[read_file, edit_file, write_file, run_command, manage_task]` | 无 `search_web`、无子智能体拉起权限 | 每次仅做 1 个里程碑；仅改 `.agent/plan.md` 列明文件；禁改 `.agent/`；禁 commit/push/部署；烂代码零容忍 |
| **`argon`**（验收官） | `.agents/agents/argon.md` | `[read_file, run_command, manage_task]` | **禁直接改/写文件**：无 `edit_file`、`write_file`、`search_web`、无子智能体拉起权限 | 严禁通过 Shell 重定向或 `--fix` 修改任何文件；仅跑只读检查命令与 Playwright E2E；**Helium 验收前后比对 `git status` + `git diff` 哈希确保零改动**；需交互式浏览器画面检查时由 Helium 协调内置 `browser` subagent |
| **`krypton`**（上线官） | `.agents/agents/krypton.md` | `[read_file, edit_file, write_file, run_command, manage_task]` | 无 `search_web`、无子智能体拉起权限 | 仅门禁 2 通过后拉起；开工前双重核验 `review.md` 与 `state.md`；**规则软锁严禁修改 `src/`、`index.html` 等业务源码**（仅允许维护部署配置与发布流程，Helium 提交前核对 `git diff`）；严禁 `--force` 推送 |

---

## 五、代码质量与越界红线（零容忍）

任何以下行为出现即判定为严重违规，Argon 必须直接【驳回】：
1. **静默压制检查**：使用 `eslint-disable`、`oxlint-disable`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck` 或隐式 `any`。
2. **吞错与敷衍补丁**：空 `catch {}`（无明确合理恢复或上报，且必须对齐仓库事务错误模型）、用任意 `setTimeout` / 轮询延时掩盖竞态、写狡辩/甩锅注释。
3. **越界修改**：修改 `.agent/plan.md` 范围之外的文件、顺手重构无关代码、改动 `.agent/` 治理与状态文档。
4. **破坏仓库铁律**：在 view/store 中直连 IndexedDB/OPFS、用浮点数计算金额、硬删账目记录、绕过内置分类保护、污染 settings 6 键白名单、在文案中将 `private` 暗示为加密/锁/同步。
5. **敏感信息泄露**：引入 `.env`、API Key、Token、真实个人部署 URL 或本机绝对路径到仓库跟踪文件。

---

## 六、本仓库真实命令手册（Windows PowerShell 环境）

> **Windows PowerShell 关键注意**：本机 PowerShell 执行策略禁止运行 `.ps1` 包装脚本（直接敲 `npm` / `npx` 会报 `UnauthorizedAccess`）。**所有终端命令一律使用 `npm.cmd`、`npx.cmd` 或 `node`**。

### 1. 静态检查与格式化

- **Carbon（开发期可修复）**：
  - 完整 lint（含 `--fix`）：`npm.cmd run lint`（等价于 `oxlint . --fix` + `eslint . --fix --cache`）
  - 仅格式化改动文件（避免误动存量未格式化文件）：`npx.cmd prettier --write <已改动文件路径...>`
- **Argon（验收期强制只读，严禁写回）**：
  - Oxlint 只读检查：`npx.cmd oxlint .`
  - ESLint 只读检查（不写 `.eslintcache`）：`npx.cmd eslint . --no-cache`
  - Prettier 只读检查（仅针对本次改动文件）：`npx.cmd prettier --check <本次改动文件路径...>`
  - *(基线备注：截至 2026-11-24 初始化扫描，存量 `src/` 中有 14 个未改动文件存在 Prettier 历史差异，验收只检查本次改动文件，不因无关存量格式差异误杀。)*

### 2. 单元 / 集成测试

- 全量单测（`node:test` + `fake-indexeddb`，初始化基线 **112/112 通过**）：
  ```powershell
  npm.cmd test
  ```
- 定向单测（快速回归单个测试文件）：
  ```powershell
  node --import ./scripts/test-alias-loader.mjs --test src/path/to/foo.test.js
  ```

### 3. 生产构建（本机 safe-delete 避坑）

- 本机运行 `npm.cmd run build` 若直接清理旧 `dist/` 可能触发 safe-delete 钩子（`[safe-delete] trash 操作 ENOENT`）。
- **Argon（只读验证构建，不碰工作树 `dist/`）**：
  ```powershell
  npx.cmd vite build --outDir "$env:TEMP\jizhang-argon-build"
  ```
- **Krypton（正式发布构建）**：先将已有 `dist` 移至临时目录（`Move-Item` 而非删除），再执行 `npm.cmd run build`；发布至 GitHub Pages 时必须在产物根目录创建空文件 `.nojekyll`。

### 4. E2E 与文案自动化验收脚本（`scripts/accept_*.cjs`）

前置条件（已在本机验证存在）：
- 本地服务监听 `5199` 端口：`npx.cmd vite --port 5199 --strictPort`（或生产预览 `npx.cmd vite preview --port 5199 --strictPort`）。
- Playwright 模块路径：`$env:NODE_PATH="$env:USERPROFILE\.workbuddy\binaries\node\workspace\node_modules"`。
- Chromium 路径：`C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe`（`e2e-harness.cjs` 默认即此路径，可通过 `QA_CHROME` / `QA_BASE` 覆盖）。

全部 11 个验收脚本清单（验收按改动波及面全跑或必跑冒烟 + 相关套件）：
1. `node scripts/accept_smoke_console.cjs` — 六主路由控制台零错误 / 零页面异常 / 零外链请求冒烟
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
