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
npm run lint       # oxlint + eslint，自动修复
```

> 本机构建注意：`npm run build` 收尾清理旧 `dist` 时会被系统 safe-delete 钩子打断
> （报 `[safe-delete] trash 操作 ENOENT`）。规避方式是把旧 `dist` 整体移出项目后再构建
> （`mv dist <临时目录>`，不是删除），dist 不存在即无删除动作，构建干净通过。

## 架构与目录结构

分层是**单向依赖**：`views → stores → repositories → db`，`services` 与 `utils` 为纯函数横切层。
铁律：**IndexedDB 操作只存在于 `db/` 与 `repositories/`**，视图和 store 不得直接写 SQL 式存取；
**OPFS 同理**——背景素材字节只有 `repositories/background.js` 能碰 `navigator.storage.getDirectory()`（见「外观与材质」）。

```
src/
├── models.js            # ★ 数据模型 JSDoc typedef（RecordItem / Category / SettingRow，先看这个）
├── db/
│   ├── index.js         # IndexedDB 引擎：打开/升级建表/事务/通用 CRUD 原语/initDB（无业务逻辑）
│   └── seed.js          # 首次启动种子：默认分类 + 默认设置（仅 categories 为空时写入）
├── repositories/        # 领域仓库层：唯一允许碰数据库的业务代码
│   ├── records.js       #   账目 CRUD、软删除、维护分类 lastUsedAt、countByCategory
│   ├── categories.js    #   分类 CRUD、最近使用排序、有引用只归档不硬删、listAll(含归档)
│   ├── settings.js      #   key-value 设置
│   ├── background.js    #   背景素材字节（OPFS，全仓唯一 getDirectory()）+ uiBackground 描述符
│   └── backup.js        #   导出/导入 JSON（id 对齐、updatedAt 新者胜、settings 白名单）
├── services/
│   ├── stats.js         # 统计纯函数（按月过滤/求和/预算用量/按天分组/翻月/按分类汇总/每日汇总），可单测
│   ├── entry.js         # 统一入口协议的解析层：URL query / 剪贴板 JSON → 表单草稿（纯函数）
│   ├── polarity.js      # 背景极性统计（cover 裁剪、32×32 降采样、p88 亮度、.45/.32 迟滞），纯函数可测
│   ├── background.js    # 背景素材校验（MIME→kind、8/30 MB 上限、图片/GIF 分辨率门、描述符 normalize）
│   ├── immersive.js     # 沉浸取景状态机（纯转移表，含 5 分钟 idle 超时）
│   ├── starfield.js     # 程序化星空绘制（种子 42、按面积星数、7 颗十字星、暗角），纯函数可测
│   └── merge.js         # 导入合并（records/categories id 对齐、updatedAt 新者胜）
├── utils/
│   └── format.js        # 金额(分)↔显示、日期 YYYY-MM-DD、输入框预填串，全局唯一格式化入口
├── stores/              # Pinia：records / categories / settings / appearance / background（薄层，直通 repository）
├── composables/         # usePolarity(极性副作用) / useImmersive(相机流生命周期) / useGlassRipple(全局涟漪)
│                        #   immersiveMock 是开发用假相机，生产包不含
├── router/index.js      # hash 路由（静态托管子路径刷新不 404）；/add 是外部入口路径，带参跳到 /
├── views/               # Add(记一笔) / List(流水) / Edit(编辑单笔) / Stats(统计)
│                        #   / Settings(设置) / Categories(分类管理)
├── components/          # TabBar(悬浮胶囊) / GlassPanel(单一材质壳) / StarfieldLayer(程序化星空) /
│                        #   BackgroundLayer(视频背景) / ImmersiveLayer(相机层) / CategoryFilterSheet(筛选 sheet)；
│                        #   AmountPad(金额键盘) 与 CategoryGrid(分类平铺) 被 Add、Edit 复用；
│                        #   CategoryForm / IconColorPicker 供 Categories；DonutChart / BarChart / CategoryBudgetList 供 Stats
└── styles/
    ├── base.css         # 基础 Token、safe-area、底栏与页面留白
    └── glass.css        # 单一玻璃材质 Token（强度/填充/高光/边圈/阴影 + 极性 + 涟漪 + 人工降级钩子）
index.html               # 首帧 data-glass/data-polarity/data-bg + 内联 #05070d
public/icons/            # PWA 图标（scripts/gen_icons.py 生成）
vite.config.js           # base './' + VitePWA(manifest + SW 离线缓存，globPatterns 仅 js/css/html)
```

## 核心约定（改动时必须遵守）

1. **金额一律以「分」存整数**（`utils/format` 的 `toFen` / `fenToYuan` 转换），禁止浮点
2. **删除 = 软删除**（`deleted: true`），为后期同步服务，禁止硬删 records
3. **`private: true` 的账目是私密账单**（不参与将来的双人同步），永不同步、永不进入共享视图
4. records/categories 都有 `id` / `updatedAt` —— 是双人同步的合并依据，改字段前必读计划文件
5. 分类排序由 `lastUsedAt` 驱动（最近使用排前），这是"3 秒记账"的核心体验，不要改成固定排序
6. 收支颜色遵循中式习惯：收入红、支出默认色；预算 80% 变黄、超支变红（口径在 `services/stats.budgetUsage`）
7. 统计/格式化一律走 `services/stats` 与 `utils/format` 的纯函数，不得在组件里另写口径
8. **分类删除 = 有流水引用则归档**（`archived: true`，历史账目保留原分类名与 emoji）。categories store 的
   `list` 载入**含归档的全量**（`listAll()`），所以记账/编辑页必须用 `expense` / `income` getter（已过滤归档），
   而 `byId` 必须查得到归档分类 —— 否则历史流水会退化成「未分类」
9. **设置导出走键白名单**（`repositories/backup.js` 的 `EXPORTABLE_SETTING_KEYS`：`monthlyBudget` /
   `ownerName` / `uiGlassIntensity` / `uiGlassFill`，fail-closed）。`lastBackupAt`、`syncConfig` 与未知键
   **永不导出/导入**；背景素材（`uiBackground` 描述符 + OPFS 字节）**不进备份** —— 换设备导入后回落默认星空

## 外观与材质（V5 定稿，2026-10-22）

- **强制深色 + 单一材质**：无浅色 / 双主题开关（用户已拍板）。全站只有一套玻璃材质：`.gp`（GlassPanel）
  与 `.card` 共用同一套 `::before` 高光、`::after` 冷边圈与 `backdrop-filter`；`GlassPanel` 只负责形状
  （panel / key / chip / pill）和 `data-blur` 开关，没有材质档位。`data-glass='on'` 是玻璃层总开关，
  删掉即回退到 `base.css` 的双主题，保留回退路径。
- **两条外观滑块**（设置 → 外观卡）：**模糊强度** `0–1`（默认 1，驱动 `--glass-filter` 的 blur /
  saturate / contrast）、**玻璃填充** `0–30%`（内部 `--glass-alpha` 0–0.3，默认 0.03，越低越透）。
  拖动只 preview、`change` 才落库；`stores/appearance.js` 的 `previewIntensity/previewFill` 是场景态专用，
  **不得持久化**。系统「增强对比度」时强度钳 `≥0.85`、「降低透明度」时钳 `≥0.7`。Token 全表见
  `docs/DESIGN.md` 的「外观与材质实现（V5 定稿）」。
- **自适应极性**：`usePolarity` 按 cover 裁出背景可见区域，降采样到 32×32，取 WCAG 相对亮度 **p88**，
  用 `.45/.32` 迟滞写 `html[data-polarity]`；首帧固定 `dark`。星空 / 无自定义背景 / 挂起 / 沉浸中 /
  视频未就绪（`readyState < 2`）一律保持 `dark`；GIF 只采样首帧，视频在 `data-video-ready` 后采样；
  窗口尺寸 / 横竖屏变化 120 ms 防抖重采样。亮极性只翻文字、边线、阴影、输入井与 active 填充，
  **不翻填充与 filter**。
- **程序化星空**：默认背景由 `services/starfield.js` + `StarfieldLayer.vue` 用 canvas 现画，**没有图片素材**：
  种子 42、按面积 `160–420` 颗星（`w*h/1400`）、7 颗十字星、暗角；只在挂载与视口变化（120 ms 防抖）
  重绘，无 rAF、无漂移；DPR 上限 3。另叠 16 个 CSS 星点闪烁，`prefers-reduced-motion: reduce` 时静止。
- **自定义背景**：图片 / GIF ≤8 MB、视频 ≤30 MB；字节存 **OPFS**（`repositories/background.js`），
  `settings.uiBackground` 只存描述符（`kind/mime/size/updatedAt`，图片类另记宽高用于展示）；
  **只存本机、不进备份**，换设备回落星空。图片 / GIF 有**分辨率门**：宽高都要 ≥ 触屏长边 × DPR
  （桌面为视口宽高 × DPR）的物理像素，避免铺满放大；旧素材不合格时做**非破坏迁移**——保留 OPFS 字节与
  描述符，本次回落星空并提示，下次启动再复核。**视频不做分辨率门**（仅限 30 MB），这是有意取舍，
  描述符中的宽高只用于展示。
- **悬浮胶囊底栏**：`TabBar` 是 fixed 玻璃胶囊（左右 12px、底 10px + safe-area、高 58px、最大宽 496px、
  内边距 4px、全圆角）；`base.css` 用 `--tabbar-h` / `--tabbar-gap` / `--page-bottom-gap` 给 `.page`
  留出底部距离，新页面必须沿用 `.page` 留白，不要写死 padding。
- **沉浸取景只在记一笔页**：取景走 `getUserMedia`（后置相机 + 轻微视差，5 分钟无操作自动停流）；
  退出 / 切后台 / 锁屏 / 路由离开都会 `stop()` 轨道；沉浸期间背景层关闭、极性固定 `dark`。
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
  或等十分钟再开即可。

## 当前进度

- ✅ 骨架：四层分离（db 引擎 / repository / store / view）、统计与格式化纯函数化、
  记一笔可真实入账+撤销、流水按天分组、统计月度概览+预算进度条、
  设置（预算/导入导出）、PWA manifest+离线 SW+图标、首启种子分类
- ✅ 流水编辑与删除：整行点进 `/record/:id` 编辑页（改金额/收支/分类/备注/日期/私密），
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
- ✅ 液态玻璃 V5（V5-1 `f6a9e68` / V5-2 `c8a3504` / V5-3 `a48e598`，均已验收）：单一材质 +
  模糊强度 / 玻璃填充两条滑块（持久化）、自适应极性（cover 裁剪 + p88 + `.45/.32` 迟滞 + 首帧 dark）、
  程序化星空（canvas，无图片素材）、自定义背景（OPFS 字节 + 描述符；图片 / GIF 分辨率门与非破坏迁移、
  视频 30 MB 上限）、悬浮胶囊底栏、涟漪与 reduced-motion 降级
- ✅ 文档：V5 外观口径（V5-4）已同步到本文件与 `docs/DESIGN.md`
- ✅ 部署：静态托管就绪（GitHub Pages 需根目录 `.nojekyll`）；真实地址不入库，由使用者保管并填入 `SHORTCUTS.md`
- ⬜ 下一步：`webapp://` 拉起 PWA 的真机验证（未验证前推荐 URL 参数路径）
- ⬜ 后期（Phase 3）：GitHub 私有仓库双人同步、三视角（各自/合并）、私密不上传
