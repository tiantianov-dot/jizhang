# 极简记账 (jizhang)

> 理念：**极简功能不减，唯一宗旨 = 方便快速记账**（记一笔 ≤3 次点击、≤3 秒）

Local-first 记账 PWA：无后端，数据全部存在浏览器 IndexedDB；可添加到 iOS 主屏幕当 App 用；远景是双人同步（字段已预留，同步层未实现）。

**给 Agent 的提示**：接手本项目请先读完本文件，再读 `src/models.js`（字段约定源头）与 `src/db/index.js`（引擎层）。完整设计决策与演进史见 `docs/DESIGN.md`。

## 环境要求

- Node `^22.18.0 || >=24.12.0`（低于 22.18 的 Node 跑不起来）
- 项目内 `.npmrc` 已指向 npmmirror 源（国内加速）
- 图标重新生成：`python scripts/gen_icons.py`（需 Pillow）

## 常用命令

```sh
npm install        # 安装依赖
npm run dev        # 开发服务器（默认 5173）
npm run build      # 生产构建 → dist/（含 PWA service worker，产物离线可用）
npm run preview    # 本地预览生产构建
npm test           # 单元/集成测试（node:test + fake-indexeddb，112 例）
npm run lint       # oxlint + eslint，自动修复
npm run format     # Prettier 格式化 src/
```

> 本机构建注意：`npm run build` 收尾清理旧 `dist` 时会被系统 safe-delete 钩子打断
> （报 `[safe-delete] trash 操作 ENOENT`）。规避方式是把旧 `dist` 整体移出项目后再构建
> （`mv dist <临时目录>`，不是删除），dist 不存在即无删除动作，构建干净通过。

## 架构与目录结构

分层是**单向依赖**：`views → stores → repositories → db`，`services` 与 `utils` 为纯函数横切层。
铁律：**IndexedDB 操作只存在于 `db/` 与 `repositories/`**，视图和 store 不得直接写 SQL 式存取；
**OPFS 同理**——背景素材字节只有 `repositories/background.js` 能碰 `navigator.storage.getDirectory()`（见「外观与材质」）。

**已知跨层直连例外**（只调用引擎/仓库 API，不直接操作 IndexedDB/OPFS）：`App.vue` → `db.initDB`；
`CategoriesView.vue` → `repositories/records.categoryUsage`；`SettingsView.vue` → `repositories/backup`
（导出/预览/导入）。新增代码不要扩散这种直连，能走 store 就走 store。

```
src/
├── App.vue              # 应用外壳：initDB + 五个 store 载入 + 星空/背景/路由/底栏；initDB 失败给兜底页
├── main.js              # 入口：createApp + Pinia + router；写入首帧 data-glass/data-polarity
├── models.js            # ★ 数据模型 JSDoc typedef（RecordItem / Category / SettingRow，先看这个）
├── db/
│   ├── index.js         # IndexedDB 引擎：打开/升级建表/事务/通用 CRUD 原语/initDB（无业务逻辑）
│   ├── migrations.js    # 一次性本地迁移：旧随机默认分类 ID → 固定内置 ID（单事务，失败回滚重试）
│   └── seed.js          # 首次启动种子：16 个固定内置分类 + 默认设置（seedVersion 标记，不重复复种）
├── repositories/        # 领域仓库层：唯一允许碰数据库的业务代码
│   ├── records.js       #   账目 CRUD、软删除、维护分类 lastUsedAt、引用计数/迁移写计划
│   ├── categories.js    #   分类 CRUD、最近使用排序、内置保护、有引用归档、批量归档/迁移
│   ├── settings.js      #   key-value 设置（含备份提醒周期/开关）
│   ├── background.js    #   背景素材字节（OPFS，全仓唯一 getDirectory()）+ uiBackground 描述符
│   └── backup.js        #   导出 v2（backup 含 private/软删）、预览/导入（校验→规划→单事务原子写）
├── services/
│   ├── stats.js         # 统计纯函数（按月过滤/求和/预算用量/按天分组/翻月/按分类汇总/每日汇总），可单测
│   ├── entry.js         # 统一入口协议的解析层：URL query / 剪贴板 JSON → 表单草稿（纯函数）
│   ├── builtinCategories.js # 内置分类固定 ID、完整指纹与保护判定（纯函数）
│   ├── backupValidation.js  # 备份版本/结构/字段校验 + 确定性 normalize（v1/v2）
│   ├── importPlanner.js     # 导入纯规划：分类映射、引用改写、settings LWW、summary/errors
│   ├── backupStatus.js      # 备份三态 never/stale/ok/unknown + 提醒周期
│   ├── backupExport.js      # share/download 成功后是否写 lastBackupAt 的纯决策
│   ├── backupSummary.js     # 备份计数：有效/回收站/本机标记/总计
│   ├── writeOutcome.js      # 写库失败 failed/unknown 归类与用户文案
│   ├── polarity.js          # 背景极性统计（cover 裁剪、p88 亮度、.45/.32 迟滞），纯函数可测
│   ├── background.js        # 背景素材校验（MIME→kind、8/30 MB 上限、图片/GIF 分辨率门、描述符 normalize）
│   ├── immersive.js         # 沉浸取景状态机（纯转移表，含 5 分钟 idle 超时）
│   ├── starfield.js         # 程序化星空绘制（种子 42、按面积星数、7 颗十字星、暗角），纯函数可测
│   └── merge.js             # 历史合并内核（当前导入流程走 importPlanner，未再引用）
├── utils/
│   └── format.js        # 金额(分)↔显示、日期 YYYY-MM-DD、输入框预填串，全局唯一格式化入口
├── stores/              # Pinia 副作用编排层：records/categories/settings 薄；background（解码/容量/预览）
│                        #   与 appearance（钳制/镜像）非薄层；数据读写仍只经 repository
├── composables/         # usePolarity(canvas 32×32 降采样 + 极性副作用) / useImmersive / useGlassRipple
│                        #   immersiveMock 是开发用假相机，生产包不含
├── router/index.js      # hash 路由（静态托管子路径刷新不 404）；/add 是外部入口路径，带参跳到 /
├── views/               # Add(记一笔) / List(流水) / Edit(编辑单笔) / Stats(统计)
│                        #   / Settings(设置) / Categories(分类管理：筛选+多选+批量)
├── components/          # TabBar(悬浮胶囊) / GlassPanel(单一材质壳) / StarfieldLayer(程序化星空) /
│                        #   BackgroundLayer(视频背景) / ImmersiveLayer(相机层) / CategoryFilterSheet(筛选 sheet) /
│                        #   BackupReminder(记一笔页轻提示)；
│                        #   AmountPad(金额键盘) 与 CategoryGrid(分类平铺) 被 Add、Edit 复用；
│                        #   CategoryForm / IconColorPicker 供 Categories；DonutChart / BarChart / CategoryBudgetList 供 Stats
└── styles/
    ├── base.css         # 基础 Token、safe-area、底栏与页面留白
    └── glass.css        # 单一玻璃材质 Token（强度/填充/高光/边圈/阴影 + 极性 + 涟漪 + 人工降级钩子）
index.html               # 首帧 data-glass/data-polarity/data-bg + 内联 #05070d
public/icons/            # PWA 图标（scripts/gen_icons.py 生成）
scripts/                 # test-alias-loader.mjs（单测 @ 别名）+ accept_*.cjs（本机 E2E 验收脚本）
vite.config.js           # base './' + VitePWA(manifest + SW 离线缓存，globPatterns 仅 js/css/html)
```

## 核心约定（改动时必须遵守）

1. **金额一律以「分」存整数**（`utils/format` 的 `toFen` / `fenToYuan` 转换），禁止浮点
2. **删除 = 软删除**（`deleted: true`），为后期同步服务，禁止硬删 records
3. **`private: true` 是「本机标记」**：完整本机备份仍包含；将来同步时跳过、不进入共享视图。
   它**不代表加密、锁或密码保护**，流水页只用小字「本」提示
4. records/categories 都有 `id` / `updatedAt` —— 是双人同步的合并依据，改字段前必读
   `src/models.js` 与 `docs/DESIGN.md`
5. 分类排序由 `lastUsedAt` 驱动（最近使用排前），这是"3 秒记账"的核心体验，不要改成固定排序
6. 收支颜色遵循中式习惯：收入红、支出默认色；预算 80% 变黄、超支变红（口径在 `services/stats.budgetUsage`）
7. 统计/格式化一律走 `services/stats` 与 `utils/format` 的纯函数，不得在组件里另写口径
8. **分类删除 = 有流水引用则归档**（`archived: true`，历史账目保留原分类名与 emoji）。categories store 的
   `list` 载入**含归档的全量**（`listAll()`），所以记账/编辑页必须用 `expense` / `income` getter（已过滤归档），
   而 `byId` 必须查得到归档分类 —— 否则历史流水会退化成「未分类」
9. **设置导出走键白名单**（`services/backupValidation.js` 的 `EXPORTABLE_SETTING_KEYS`，fail-closed）：
   `monthlyBudget` / `ownerName` / `uiGlassIntensity` / `uiGlassFill` / `backupReminderDays` /
   `backupReminderEnabled`。`lastBackupAt`、`seedVersion`、`builtinIdentityVersion`、`syncConfig`
   与未知键**永不导出/导入**；背景素材（`uiBackground` 描述符 + OPFS 字节）**不进备份** ——
   换设备导入后回落默认星空
10. **内置分类身份固定**：`builtin:expense:*` / `builtin:income:*`（16 个）。内置分类不可删除、
    收支类型锁定，只允许改名/图标/月预算；旧库的随机默认 ID 在启动时按完整指纹
    `type+name+emoji+color+order` 全等且候选唯一才 rekey，改名/歧义/目标已存在一律保留为自定义

## 数据安全与备份（2026-10 升级）

### 备份 v2 与导入

- **格式**：`{ app: 'jizhang', version: 2, exportedAt, records, categories, settings }`。导入接受 **v1 / v2**，
  未知版本、结构错误、字段非法、重复 id/key 一律整份拒绝。
- **固定内置分类 ID**：内置分类的 `id` 为 `builtin:expense:*` / `builtin:income:*`（16 个，见
  `services/builtinCategories.js`）。v2 直接按固定 ID 对齐；**v1 只按完整指纹**
  `type+name+emoji+color+order` 全等且候选唯一来保守匹配，改名/歧义时保留为自定义，不强并；
  无法唯一匹配的计入导入冲突。旧库的随机默认 ID 由 `db/migrations.js` 在启动时单事务 rekey。
- **导入顺序固定**：`backupValidation` 校验并做确定性 normalize → `importPlanner` 计算分类映射、
  账目 `categoryId` 改写、settings 逐 key LWW → **只读预览**展示 summary → 用户确认后重新读本地、
  重新规划 → `db.atomicWrite` 在**一个事务**里写 records / categories / settings，任一失败三 store
  全部回滚。预览与正式导入共用同一 planner；有 errors 时零写入。
- **summary 口径**：账目「新增 / 更新 / 跳过」（其中软删新增/更新单独计数）；分类「新增 / 匹配 /
  更新 / 跳过 / 冲突」；settings「更新 / 跳过」。旧分类无法唯一匹配会明确列为冲突；settings 只按
  `updatedAt` 决定更新或跳过。
- **settings 白名单 6 键**：`monthlyBudget`、`ownerName`、`uiGlassIntensity`、`uiGlassFill`、
  `backupReminderDays`、`backupReminderEnabled`。`lastBackupAt`、`seedVersion`、
  `builtinIdentityVersion`、`syncConfig` 与未知键**永不导出/导入**。
- **导出 purpose**：UI 当前只用默认的 `backup`（完整换机快照，**保留软删除与 private**，否则恢复时
  静默丢账）；`exportAll({ purpose: 'sync' })` 会剔除 private，为后续同步预留，尚未接入 UI。

### 批量分类管理

- 分类管理页支持**类型 / 来源（内置｜自定义）/ 归档状态**三组筛选与多选；内置分类不可选、不可删，
  repository 层会再次硬拒绝，不只靠 UI `disabled`。
- 删除仍遵循「有流水引用则归档、无引用才硬删」；批量模式二选一：`归档/删除` 或 `迁移后删除`。
- `迁移后删除` 的目标必须**同收支类型、未归档、且不在已选集合**；会把源分类的 **active + 软删**
  账目全部改挂目标并刷新 `updatedAt`，再硬删源分类（同一事务）。
- 每个源分类独立事务，逐项返回 `archived / deleted / migrated-deleted / protected / failed`；
  部分失败不掩盖成功项，结果逐条展示。引用计数展示「有效 / 回收站」，聚合包含软删。

### 保存三态

- 写库结果分 **failed / unknown / 成功**：`failed` 表示能确认事务未提交或已 abort；未知错误一律归
  `unknown`，**不自动重试**，提示先到流水页核实，避免重复入账。
- 失败时**保留未保存的输入**（金额/备注/日期/分类），可直接重试；写库成功但列表 reload 失败时显示
  「已保存，列表暂未刷新」（`refreshFailed`），不把已保存误报为失败。
- 记一笔把 record 与分类 `lastUsedAt` 放进同一事务；分类读取失败发生在写库前，可确定归 `failed`。

### 备份提醒

- 周期 **3 / 7 / 14 / 30 天，默认 7**；状态 `never / stale / ok / unknown` 是事实状态，关闭提醒不改变
  状态，只隐藏提醒。
- 设置页的「上次导出」始终显示（**0 条账目也显示「尚未备份」**）；启用提醒时另显示三态状态行。
  记一笔页只在「有账目 + 提醒开启 + 非 ok」时显示轻提示，不弹模态、不阻塞记账。
- `share` 只有成功 resolve 才写 `lastBackupAt`；用户取消或分享失败都不写。`download` 无法确认文件
  是否落盘，必须用户点「我已保存，更新备份时间」才写。
- 不变量：`lastBackupAt` 不进导出/导入白名单；导入备份不会把本机备份时间“恢复”成别人的时间。

### 完整备份与「本机标记」

- 完整本机备份（purpose=backup）**保留软删除与 private**；设置页披露
  「有效 / 回收站 / 本机标记 / 备份总计」，并说明列表只显示有效账目、回收站与本机标记记录仍在备份里。
- `private` 只是**本地标记**：完整备份仍包含；将来同步时跳过；**不等于加密、锁、密码保护，也不等于
  已同步**。流水页用小字「本」+「本机标记：完整备份仍包含；不代表加密或密码保护」提示。

## 外观与材质（V5 定稿，2026-10-22）

- **强制深色 + 单一材质**：无浅色 / 双主题开关（用户已拍板）。全站只有一套玻璃材质：`.gp`（GlassPanel）
  与 `.card` 共用同一套 `::before` 高光、`::after` 冷边圈与 `backdrop-filter`；`GlassPanel` 只负责形状
  （panel / key / chip / pill）和 `data-blur` 开关，没有材质档位。`data-glass='on'` 是玻璃层总开关；
  但 `base.css` 目前**不含** `.gp` 材质规则，移除该属性会让玻璃壳失去材质，不等同于可用的浅色主题——
  它只是工程开关，不是用户可切换的主题。
- **两条外观滑块**（设置 → 外观卡）：**模糊强度** `0–1`（默认 1，驱动 `--glass-filter` 的 blur /
  saturate / contrast）、**玻璃填充** `0–30%`（内部 `--glass-alpha` 0–0.3，默认 0.03，越低越透）。
  拖动只 preview、`change` 才落库；`stores/appearance.js` 的 `previewIntensity/previewFill` 是场景态专用，
  **不得持久化**。系统「增强对比度」时强度钳 `≥0.85`、「降低透明度」时钳 `≥0.7`。Token 全表见
  `docs/DESIGN.md` 的「外观与材质实现（V5 定稿）」。
- **自适应极性**：`usePolarity` 按 cover 裁出背景可见区域，降采样到 32×32，取 WCAG 相对亮度 **p88**，
  用 `.45/.32` 迟滞写 `html[data-polarity]`；首帧固定 `dark`。星空 / 无自定义背景 / 挂起 / 沉浸中 /
  视频未就绪（`readyState < 2`）一律保持 `dark`；GIF 采样首次解码到的帧（窗口 / 横竖屏重采样时以
  浏览器当前帧为准，不保证始终是首帧）；视频在 `data-video-ready` 后采样；窗口尺寸 / 横竖屏变化
  120 ms 防抖重采样。亮极性只翻文字、边线、阴影、输入井与 active 填充，**不翻填充与 filter**。
- **程序化星空**：默认背景由 `services/starfield.js` + `StarfieldLayer.vue` 用 canvas 现画，**没有图片素材**：
  种子 42、按面积 `160–420` 颗星（`w*h/1400`）、7 颗十字星、暗角；只在挂载与视口变化（120 ms 防抖）
  重绘，无 rAF、无漂移；DPR 上限 3。另叠 16 个 CSS 星点闪烁，`prefers-reduced-motion: reduce` 时静止。
- **自定义背景**：图片 / GIF ≤8 MB、视频 ≤30 MB；字节存 **OPFS**（`repositories/background.js`），
  `settings.uiBackground` 只存描述符（`kind/mime/size/updatedAt` + 媒体宽高；**视频也记录宽高**）；
  **只存本机、不进备份**，换设备回落星空。图片 / GIF 有**分辨率门**：宽高都要 ≥ 触屏长边 × DPR
  （桌面为视口宽高 × DPR）的物理像素，避免铺满放大；旧素材不合格时做**非破坏迁移**——保留 OPFS 字节与
  描述符，本次回落星空并提示，下次启动再复核。**视频不做分辨率门**（仅限 30 MB），这是有意取舍，
  描述符中的宽高**只用于展示，不参与门槛**。
- **悬浮胶囊底栏**：`TabBar` 是 fixed 玻璃胶囊（左右 12px、底 10px + safe-area、高 58px、最大宽 496px、
  内边距 4px、全圆角）；`base.css` 用 `--tabbar-h` / `--tabbar-gap` / `--page-bottom-gap` 给 `.page`
  留出底部距离，新页面必须沿用 `.page` 留白，不要写死 padding。
- **沉浸取景只在记一笔页**：取景走 `getUserMedia`（后置相机 + 轻微视差，5 分钟无操作自动停流）；
  退出 / 切后台 / 锁屏 / 路由离开都会 `stop()` 轨道；沉浸期间背景层关闭、极性固定 `dark`。
  进入沉浸时玻璃强度临时 `-0.25`（只走 `previewIntensity`，不写库），退出恢复持久值。
- **涟漪与降级**：`useGlassRipple` 全局接管 `[data-ripple]` 宿主；`prefers-reduced-motion: reduce` 时
  JS 不创建水波、CSS 隐藏 `.ripple-drop` —— 这是**有意的无障碍偏差**，保留。
  `glass.css` 末尾只保留人工降级钩子（`data-page-scroll='outer'`、`data-glass-degrade='pad-tint'`），
  应用代码不得写入这两个属性。
- **首帧与离线**：`index.html` 首帧即 `data-glass='on' data-polarity='dark' data-bg='starfield'` 并内联
  `#05070d`，manifest 的 `theme_color/background_color` 同为 `#05070d`；`workbox.globPatterns` 目前只收
  `js/css/html`（与「背景无图片素材」一致），若重新引入图片类资源必须显式加进 globPatterns。

## 静态托管部署

`vite.config.js` 已设 `base: './'`（相对路径），`npm run build` 后把 `dist/` 发布到任意静态托管即可；
hash 路由 + 相对 base，部署到 `https://<user>.github.io/<repo>/` 子路径刷新不 404。PWA 需 HTTPS。

两条部署硬约束：

- **根目录必须有 `.nojekyll`**（空文件）。否则 Jekyll 会忽略 `_plugin-vue_export-helper-*.js` 这类下划线开头的
  chunk，表现为首屏白屏；该文件不在 `dist/` 里，发布脚本要显式注入。
- **GitHub Pages 对所有文件发 `cache-control: max-age=600`**（含 `sw.js`）。重发后旧访客的浏览器在约 10 分钟内
  仍可能把旧 `sw.js` 视为新鲜、`autoUpdate` 不触发，**短时间看到旧皮肤不是发布失败**；把标签页彻底关掉重开、
  或等十分钟再开即可（这是 GitHub Pages 的平台行为，换托管需重验）。

## 当前进度

- ✅ 骨架：四层分离（db 引擎 / repository / store / view）、统计与格式化纯函数化、
  记一笔可真实入账+撤销、流水按天分组、统计月度概览+预算进度条、
  设置（预算/导入导出）、PWA manifest+离线 SW+图标、首启种子分类
- ✅ 流水编辑与删除：整行点进 `/record/:id` 编辑页（改金额/收支/分类/备注/日期/本机标记），
  两段式确认删除（软删除）+ 流水页 4 秒撤销入口；金额键盘与分类平铺已抽成
  `components/AmountPad.vue`、`components/CategoryGrid.vue` 供 Add/Edit 复用
- ✅ 分类管理：`/categories` 新增 / 重命名 / 删除分类（emoji 文本输入 + 预设一键填入、8 色预设）；
  有流水引用的分类删除时自动归档、可在「已归档」段恢复；顺带修掉「分类归档后历史流水
  退化成未分类」的存量缺陷。**入口两处**（底部四个 Tab 入口未动）：设置页「分类管理 ›」卡、
  统计页标题行右侧「分类管理 ›」快捷入口
- ✅ 统计图表 + 分类预算：统计页可前后翻月（跨年正确），概览 / 环图（支出构成 + 前 5 图例）/
  柱图（每日支出，今天高亮）/ 分类预算进度（80% 黄、超支红）全部跟随所选月份；
  环图与柱图均为手写 SVG（无图表库）；分类表单新增「月预算」（元输入，空 = 不设）
- ✅ 统一入口协议：`/#/add?amount=12.5&type=expense&note=午饭&category=餐饮` 打开即预填记账页
  （参数一次性，读完即从地址栏清除）；记账页新增「⌘ 粘贴」按钮解析剪贴板 JSON
  （`{"app":"jizhang",...}`，需用户手势触发）；解析规则集中在 `services/entry.js` 纯函数层。
  **给用户看的配置手册见 `SHORTCUTS.md`**
- ✅ 液态玻璃 V5（V5-1 `8701d1f..f6a9e68` / V5-2 `c8a3504` / V5-3 `a48e598`，均已验收）：单一材质 +
  模糊强度 / 玻璃填充两条滑块（持久化）、自适应极性（cover 裁剪 + p88 + `.45/.32` 迟滞 + 首帧 dark）、
  程序化星空（canvas，无图片素材）、自定义背景（OPFS 字节 + 描述符；图片 / GIF 分辨率门与非破坏迁移、
  视频 30 MB 上限）、悬浮胶囊底栏、涟漪与 reduced-motion 降级
- ✅ 2026-10 数据安全升级（B0-B5 + P12-A3）：备份 v2（固定内置分类 ID、v1 保守指纹匹配、导入预览 /
  校验 / 规划 / 单事务原子写）、批量分类（筛选 / 多选 / 迁移 / 逐项结果）、保存三态、备份提醒
  （3/7/14/30 天）、完整备份计数与本机标记文案。验收：112 单测、lint/build 通过、9 套 E2E 双环境
  267/267、文案审计 7/7；签核 `ab5f7a9`，入口 `assets/index-ljOk12_j.js`，GitHub `gh-pages` 产物
  `9e8ad98`。iOS Safari / 主屏幕 PWA 的备份分享与提醒**待真机验证**（P11-A12）；WorkBuddy 本轮未部署
  - 批次：B0 `01bac6e`、B1 `deb1b7d`、B2 `1208bdd`、B3 `77f73b4`、B4 `18f4bae`、B5 `7d28236`；
    lint `fd3ae5d`；文案 `286633f`；qa 脚本 `f781af5` / `ab5f7a9`
- ✅ 文档：V5 外观口径（V5-4）与 2026-10 数据安全升级已同步到本文件、`docs/DESIGN.md` 与 `SHORTCUTS.md`
- ✅ 部署：静态托管就绪（GitHub Pages 需根目录 `.nojekyll`）；**当前树不含真实站点地址/凭据**，由使用者
  保管并填入 `SHORTCUTS.md`。注意：历史提交 `9f65974` / `ac1cc3b` 仍含旧地址与本机路径（未重写历史），
  不要把地址写回仓库
- ⬜ 下一步：`webapp://` 拉起 PWA 的真机验证（未验证前推荐 URL 参数路径）
- ⬜ 后期（Phase 3）：GitHub 私有仓库双人同步、三视角（各自/合并）、本机标记不上传
