# 极简记账 PWA · 设计决策档案

> **演进说明（2026-10-15）**：本文件是 2026-10-06 立项时的原始计划，作为设计决策的**源头记录**保留。
> 实施过程中部分决策已演进，**以 README.md 为准**，主要差异：
>
> | 项 | 原计划 | 实际落地 |
> | --- | --- | --- |
> | 技术栈 | 原生 HTML+CSS+JS，无构建 | **Vue 3 + Vite + Pinia + vue-router(hash) + vite-plugin-pwa**（JS 非 TS） |
> | 托管 | GitHub Pages | **静态托管**（当前树不含真实站点地址/凭据，由使用者自行保管并填入 `SHORTCUTS.md` 的 `<你的站点地址>`；历史提交仍含旧地址，未重写历史；GitHub Pages 子路径需根目录 `.nojekyll`） |
> | 图表 | Chart.js CDN 或自绘 SVG | **手写 SVG**（DonutChart / BarChart，零依赖） |
> | 入口通道 A | `webapp://` 带参拉起 PWA | **仍未真机验证**，主推 URL 参数（`#/add?...`）+ 剪贴板 JSON 兜底 |
> | 快捷指令 | 四条捷径 | 已跑通**截图 OCR 链路**（截屏 → 提取文本 → 正则金额 → 弹窗选金额 → autosave 入账），详见 `SHORTCUTS.md`；原计划的「词典映射分类」**未实现**，应用只按分类名精确匹配 |
> | 新增（计划未含） | — | autosave 自动入账+4秒撤销、OCR 脏金额清洗（`services/entry.js` 的 `cleanAmount`） |
> | 外观与材质（计划未含） | — | **液态玻璃 V5 定稿**：强制深色、单一材质（`.gp`/`.card` 共用高光、边圈与唯一 backdrop-filter；无材质档位）、模糊强度与玻璃填充两条滑块（持久化）、自适应极性（cover 裁剪 → 32×32 → p88 亮度 + `.45/.32` 迟滞）、程序化星空（canvas，种子 42，无图片素材）、自定义背景上传（图片/GIF ≤8 MB、视频 ≤30 MB；图片/GIF 有分辨率门，旧低分素材非破坏迁移；视频只限体积；OPFS 存字节、**不进备份**、换机回落星空）、沉浸取景仅记一笔页。维护口径见 README「外观与材质」 |
> | 数据安全（2026-10 升级） | — | **备份 v2 + 固定内置分类 ID**；导入先校验/预览/规划再单事务原子写；settings 白名单 6 键；批量分类（筛选/多选/迁移/逐项结果）；保存三态；备份提醒 3/7/14/30 天。操作口径见 README「数据安全与备份」 |
>
> 阅读建议：先读 README.md（当前真实架构与约定），再回看本文件理解「为什么这么设计」。

---

# 极简记账 PWA · 实施计划

## 定位

- 理念：极简功能不减，唯一宗旨 = 方便快速记账
- 形态：Local-first PWA（纯前端、无后端），GitHub Pages 托管，iPhone 添加到主屏幕作为唯一日常入口
- 远景：双人记账（先单人跑通；数据模型从第一天就预留同步字段，后期零迁移升级）

## 已确认决策

| 项 | 决策 |
| --- | --- |
| 起步方式 | 从零自写（参考 cute-ledger / ctt062-finance-app 的模式，不 fork） |
| 技术栈 | 原生 HTML+CSS+JS，无框架无构建，源码即产物 |
| 存储 | IndexedDB + 一键导出/导入 JSON（底线功能，防清缓存丢数据） |
| 核心功能 | 增删改查、自定义分类、月度统计/图表、总预算+分类预算（80% 变黄、超支变红） |
| 账本范围 | 单账本（生活费收支），不做多账户/多账本 |
| 双人同步 | 后期再加；现在预留 id / updatedAt / deleted / private / owner 字段 |
| 私密账单 | 原计划：记录含 private 标记，标记后只存本地、永不同步。**实际（2026-10）**：private 是**本机标记**，完整本机备份仍包含，将来同步时跳过；不代表加密、锁或密码保护 |
| 采集方式 | 截图 OCR+确认 / Siri 语音 / 扣款短信 / 手动输入（分期实现） |
| 解析引擎 | 先正则，AI 留接口（iOS 26 Apple Intelligence「使用模型」或自带 API key） |
| 联动机制 | PWA 统一入口：`webapp://` 带参（待真机实测）+ 剪贴板 JSON 桥（兜底） |
| 使用场景 | 手机为主，触控优先（大按钮、底部操作区、单手可达） |

## 架构

**Local-first**：所有数据先写 IndexedDB，离线完整可用；一切外部输入都收敛到「统一入口协议」。

**统一入口协议**（所有快捷指令只负责投递一条结构化账目，PWA 负责入账）：

- 通道 A（首选）：`webapp://?amount=35&cat=餐饮&note=午饭` 直接拉起主屏幕 PWA 并传参 —— 参数能否传递需真机实测
- 通道 B（兜底，100% 可靠）：快捷指令把 JSON 放入剪贴板 → 拉起 PWA → 用户点击粘贴授权 → 写入
- 投递格式：`{ "amount": 35.00, "category": "餐饮", "note": "午饭", "date": "2026-10-06", "source": "shortcut-ocr" }`

**后期同步层**（现在只预留，不写代码）：GitHub 私有仓库存账目 JSON；pull → 按 id 合并（updatedAt last-write-wins）→ push；deleted 软删除同步、private 不上传；配置打包发给对方一键导入。双人视图三视角：我的 / TA 的 / 我们（合并统计）。

## 数据模型（IndexedDB）

- `records`：`{ id(uuid), amount(分,整数), type(expense|income), categoryId, note, date(YYYY-MM-DD), createdAt, updatedAt, deleted(false), deletedAt(null|ms), private(false), owner('me'|'partner') }`
- `categories`：`{ id(uuid 或 builtin:<type>:<key>), name, emoji, color, type(expense|income), monthlyBudget(分, 0=不设), order, archived, lastUsedAt, createdAt, updatedAt }`
- `settings`：**key-value 行** `{ key, value, updatedAt }`（旧行可能缺 `updatedAt`，按 0 处理）：
  - 可导出（6 键，fail-closed）：`monthlyBudget`、`ownerName`、`uiGlassIntensity`、`uiGlassFill`、
    `backupReminderDays`、`backupReminderEnabled`
  - 仅本机、永不导出/导入：`lastBackupAt`、`seedVersion`、`builtinIdentityVersion`、`syncConfig`（含凭据）；
    未知键同样忽略
  - 预留：`partnerName`（Phase 3 双人同步）
  - `uiBackground`（背景描述符 `{kind,mime,size,updatedAt,width?,height?}`，素材字节在 OPFS）
    **不进备份**，换机回落星空

要点：

- 金额一律以「分」存整数，避免浮点误差
- `deleted` / `private` / `updatedAt` 现在建好，后期同步零迁移
- `categories.lastUsedAt` 驱动「最近使用排序」，把分类选择压到一次点击（体验硬指标：记一笔 ≤3 次点击、≤3 秒）

## 2026-10 数据安全升级（实现口径）

- **备份 v2**：内置分类使用固定 ID `builtin:expense:*` / `builtin:income:*`（16 个）；旧 v1 备份仅在
  完整指纹 `type+name+emoji+color+order` 全等且候选唯一时保守匹配，改名/歧义不强并，无法唯一匹配时
  计入冲突；旧库随机默认 ID 在启动时由 `db/migrations.js` 单事务 rekey（含软删账目的引用）。
- **导入流程**：`backupValidation` 先校验版本/结构/字段并确定性 normalize → `importPlanner` 计算分类
  映射、账目 `categoryId` 改写、settings 逐 key LWW → 只读预览 → 用户确认后重新读取本地并重新规划 →
  `db.atomicWrite` 单事务写 records / categories / settings，任一失败全部回滚；预览与正式导入共用同一
  planner，有 errors 时零写入。
- **导入 summary**：账目「新增/更新/跳过」（其中软删新增/更新单独计数）；分类「新增/匹配/更新/跳过/
  冲突」；settings「更新/跳过」。**settings 白名单 6 键**：`monthlyBudget`、`ownerName`、
  `uiGlassIntensity`、`uiGlassFill`、`backupReminderDays`、`backupReminderEnabled`；
  `lastBackupAt`、`seedVersion`、`builtinIdentityVersion`、`syncConfig` 永不导出/导入。
- **批量分类**：类型/来源/归档状态筛选 + 多选；内置分类受保护；删除沿用「有引用归档、无引用硬删」；
  「迁移后删除」要求目标同类型、未归档且不在已选集合，迁移源分类的 active + 软删账目后硬删源分类；
  每个源分类独立事务，逐项返回结果，部分失败不掩盖成功项；引用计数展示「有效/回收站」（含软删）。
- **保存三态**：写库结果分 `failed` / `unknown` / 成功；`failed` 保留未保存输入，`unknown` 不自动重试
  并提示先核实流水；写库成功但列表刷新失败显示「已保存，列表暂未刷新」。
- **备份提醒**：周期 3/7/14/30 天（默认 7）；状态 `never/stale/ok/unknown` 与提醒开关分离，设置页
  空账本也显示「尚未备份」；`share` 成功 resolve 才写 `lastBackupAt`，取消/失败不写；`download` 必须
  用户显式点「我已保存」才写；记一笔页只做轻提示，不阻塞记账。
- **完整备份与 private**：完整本机备份保留软删除与 `private`；设置页披露「有效/回收站/本机标记/备份
  总计」；`private` 只是本机标记，**不等于加密、锁、密码保护或同步**。

## 页面结构（底部 Tab，手机触控优先）

全局外壳：底部是**悬浮胶囊底栏**（`fixed`，左右 12px、底 `10px + safe-area`、高 58px、最大宽 496px、
内边距 4px、全圆角）。页面统一用 `.page`，底部留白 = `--tabbar-h 58px` + `--tabbar-gap 10px` +
safe-area + `--page-bottom-gap 34px`；新增页面不得写死底部 padding。

1. **记一笔**（主 Tab，打开即达）：金额数字键盘 + 分类大按钮平铺（≤一屏、最近使用排序、默认选中上次的分类）+ 备注可选 + 保存 toast（可撤销）
2. **流水**：按天分组、关键词搜索、分类/月份筛选、进入编辑/删除（软删除）
3. **统计**：月度收支总览、分类占比环图、每日支出柱图、预算进度（80% 黄 / 超支红）
4. **设置**：分类管理（增删改/批量筛选与迁移/emoji）、预算设置、外观与背景、数据备份（状态/提醒/
   导出导入）、完整备份计数披露。**未实现**独立的「快捷指令配置指引入口」——配置手册见
   `SHORTCUTS.md`；分类排序由 `lastUsedAt` 自动驱动，无手动排序 UI

## 外观与材质实现（V5 定稿，2026-10-22）

### 单一材质与 Token

全站只有一套材质：`.gp`（`GlassPanel`）与 `.card` 共用 `::before` 高光、`::after` 冷边圈和唯一的
`backdrop-filter`；`GlassPanel` 只决定形状（panel / key / chip / pill）与 `data-blur` 开关。
填充与模糊是两个独立维度：强度管 filter，填充管底色 alpha。

| Token | 默认值 | 作用 |
| --- | --- | --- |
| `--glass-intensity` | `1`（滑块 0–1） | `blur` / `saturate` / `contrast` 的系数 |
| `--glass-alpha` | `0.03`（滑块 0–0.3） | 玻璃填充透明度，越低越透 |
| `--glass-fill` | `rgba(255,255,255,var(--glass-alpha))` | 面板底色 |
| `--glass-filter` | `blur(calc(7px * I)) saturate(calc(1.08 + .3 * I)) contrast(calc(1.02 + .05 * I))`，`I = --glass-intensity` | 全站唯一 backdrop-filter |
| `--glass-radius-panel` / `--glass-radius-key` / `--glass-radius-pill` | `24px` / `18px` / `999px` | 头卡与列表卡 / 数字键 / 底栏；chip 在 `GlassPanel` 内为 `14px` |
| `--on-glass` / `--on-glass-2` | `rgba(255,255,255,.97)` / `.74` | 主 / 次文字与图标 |
| `--glass-edge` / `-2` / `-3` | `.55` / `.16` / `.38` | 高光边 / 分隔边 / 反光边 |
| `--glass-highlight` | 顶部 1.5px 冷光 + 底部 1.5px 反光 + 底部暗角（三段 `linear-gradient`） | `::before` 高光 |
| `--glass-shadow` / `lift` / `press` | 三层外投影 + 内高光 + 内压暗 + 0.5px 白边 | 面板 / 按键 / 按下 |
| `--glass-well` | `rgba(0,0,0,.18)` | 输入井 |
| `--glass-active-fill` | `rgba(196,232,250,.15)` | 选中态填充 |

亮极性（`html[data-polarity='light']`）重写文字 `.96/.68`、输入井 `.08`、active 填充 `.22`，并调整
边圈 / 阴影 / 高光与语义色；填充 alpha 与 filter **不变**。

### 结构与维护约束

- **不写死层数**：数字键盘 13 个键各自一块独立玻璃（12 键 + ✓），禁止合并成整块。
- 长列表、表单与设置页外观卡使用 `data-blur="off"`（`ListView` / `CategoriesView` / `CategoryForm` /
  `CategoryBudgetList` / 设置外观卡），控制同时合成层数量。
- 不得恢复全屏遮罩式假玻璃（旧方案已删除）；材质只来自 `.gp` / `.card`。
- 拖动滑块只 preview、`change` 才写入 IDB；`previewIntensity` / `previewFill` 不得持久化。

### 自适应极性、背景与底栏

- **极性**：cover 裁剪 → 32×32 降采样 → WCAG 相对亮度 p88 → `.45/.32` 迟滞；首帧 `dark`；
  星空 / 无背景 / 挂起 / 沉浸 / 视频未就绪保持 `dark`；GIF 采样首次解码到的帧（重采样可能取当前帧，
  不保证始终是首帧），视频在 `data-video-ready` 且 `readyState >= 2` 后采样；resize / orientationchange
  120 ms 防抖。
- **程序化星空**：canvas 由 `services/starfield.js` 绘制（种子 42、按面积 160–420 颗、7 颗十字星、暗角），
  只挂载与视口变化时重绘，无 rAF、无漂移，DPR 上限 3；16 个 CSS 星点负责闪烁，reduced-motion 时静止。
- **自定义背景**：图片 / GIF ≤8 MB、视频 ≤30 MB；字节在 OPFS，`settings.uiBackground` 只存描述符；
  不进备份。图片 / GIF 分辨率门要求宽高均 ≥ 触屏长边 × DPR（桌面为视口宽高 × DPR）；旧低分素材
  保留字节与描述符、本次回落星空、下次启动复核（非破坏迁移）。视频**不做**分辨率门，仅限体积，
  宽高只用于展示。
- **底栏**：悬浮胶囊（fixed，左右 12px、底 `10px + safe-area`、高 58px、最大宽 496px、内边距 4px），
  `.page` 底部留白消费 `--tabbar-h` / `--tabbar-gap` / `--page-bottom-gap`。

### 无障碍与离线

- **涟漪降级是有意偏差**：`prefers-reduced-motion: reduce` 时 `useGlassRipple` 不创建水波，
  CSS 同时隐藏 `.ripple-drop`。这一条不要求与参考稿逐帧一致。
- 首帧：`index.html` 直接写 `data-glass='on' data-polarity='dark' data-bg='starfield'` 并内联
  `#05070d`；manifest 的 `theme_color/background_color` 为 `#05070d`。
- 离线：`workbox.globPatterns` 只收 `**/*.{js,css,html}`；新增图片类资源必须显式加入，否则不进 precache。

## 快捷指令（iOS 端交付物：逐条配置文档 + 协议说明）

四条捷径，全部投递到统一入口：

1. **截图 OCR（主用）**：轻点背面触发 → 截屏 → 从图像提取文本 → 正则取金额 → 按分类名精确匹配
   （原计划的「词典映射」未实现）→ 弹窗确认（可改）→ 投递
2. **Siri 语音**：听写文本 → 正则解析「午饭35」→ 确认 → 投递
3. **扣款短信**：自动化（收到含关键词短信）→ 正则提取 → 投递（确认可选）
4. **手动输入**：快捷指令表单直接录入 → 投递（应急兜底）

AI 接口预留：快捷指令里「解析」独立成块，后期可整块替换为「使用模型」（iOS 端侧，免 key）或 HTTPS 调云端大模型。

## 分期路线

- **Phase 1 单人核心**：数据层 → 记一笔 → 流水 → 统计+预算 → 导入导出 → PWA 离线（manifest+sw）→ 托管部署
- **Phase 2 快捷指令**：统一入口双通道 → 四条捷径配置文档 → 真机联调
- **Phase 3 双人**：GitHub 仓库同步层 → 三视角视图 → 本机标记不上传 → 配置包分享

## 验证清单（开发首日真机实测）

1. `webapp://` 能否带查询参数拉起 PWA（决定通道 A 是否成立；不成立则统一走通道 B）—— **仍未验证**
2. PWA 独立存储下 IndexedDB 的持久化表现（iOS 对长期未用的 Web App 有清理策略 → 导出备份必须显眼）
3. PWA 内 `navigator.clipboard.readText` 的授权弹窗体验 —— **已验证可用**
4. iOS「从图像提取文本」对微信/支付宝支付完成页的中文金额识别准确率 —— **已验证可用**
5. PWA（manifest + service worker）在 iOS 主屏幕的 standalone 全屏表现 —— **静态托管环境下已验证**；
   不同托管域名 / 子路径仍建议按目标环境复核
6. iOS Safari / 主屏幕 PWA 的备份分享与提醒状态 —— **待真机验证**（P11-A12）

## 参考项目

cute-ledger（功能清单/GitHub 同步思路）、ctt062/finance-app（vanilla PWA 结构）、iCost-AI（AI 解析提示词）、蜜蜂记账（轻点背面交互）
