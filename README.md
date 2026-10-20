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
│   ├── polarity.js      # 背景极性统计（32×32 降采样、p88 亮度、.45/.32 迟滞），纯函数可测
│   ├── background.js    # 背景素材校验（MIME→kind、8/30 MB 上限、描述符 normalize）
│   ├── immersive.js     # 沉浸取景状态机（纯转移表，含 5 分钟 idle 超时）
│   └── merge.js         # 导入合并（records/categories id 对齐、updatedAt 新者胜）
├── utils/
│   └── format.js        # 金额(分)↔显示、日期 YYYY-MM-DD、输入框预填串，全局唯一格式化入口
├── stores/              # Pinia：records / categories / settings / appearance / background（薄层，直通 repository）
├── composables/         # usePolarity(极性副作用) / useImmersive(相机流生命周期) / useBackgroundMirror(L2 rect 观测)
│                        #   immersiveMock 是开发用假相机，生产包不含
├── router/index.js      # hash 路由（GitHub Pages 刷新不 404）；/add 是外部入口路径，带参跳到 /
├── views/               # Add(记一笔) / List(流水) / Edit(编辑单笔) / Stats(统计)
│                        #   / Settings(设置) / Categories(分类管理)
├── components/          # TabBar；GlassPanel(三档材质) / GlassMirror(L2 镜像) / ImmersiveLayer(相机层) /
│                        #   BackgroundLayer(视频背景)；AmountPad(金额键盘) 与 CategoryGrid(分类平铺) 被 Add、Edit 复用；
│                        #   CategoryForm / IconColorPicker 供 Categories；DonutChart / BarChart / CategoryBudgetList 供 Stats
├── assets/bg-starfield.webp  # 默认深空星野（静态图；precache 必须显式收 webp）
└── styles/
    ├── base.css         # 基础 Token、safe-area
    └── glass.css        # 液态玻璃 Token（三档 + 极性四件套 + scrim + 星野/星点）
public/icons/            # PWA 图标（scripts/gen_icons.py 生成）
vite.config.js           # base './' + VitePWA(manifest + SW 离线缓存，globPatterns 显式含 webp)
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
   `ownerName` / `uiGlassIntensity` / `uiGlassDim`，fail-closed）。`lastBackupAt`、`syncConfig` 与未知键
   **永不导出/导入**；背景素材（`uiBackground` 描述符 + OPFS 字节）**不进备份** —— 换设备导入后回落默认星空

## 外观与材质（V4 收口，2026-10-20）

- **强制深色**：无浅色 / 双主题开关（用户已拍板）。`data-glass='on'` 只是玻璃层的开关，删掉即回退到
  `base.css` 的双主题，保留回退路径。
- **三档材质**：`GlassPanel` 的 `regular` / `clear` / `identity`（blur / saturate / radius 与填充公式见
  `src/styles/glass.css` 顶部 Token）。全站唯一的 `backdrop-filter` 声明只存在于 `GlassPanel.vue`
  （`-webkit-` + 标准各 1 处），其余面板零 blur。
- **两条外观滑块**（设置 → 外观卡）：**质感** `0.3–1`（驱动 blur/saturate 与面板 alpha，默认 `1`）、
  **背景压暗** `0–0.6`（只被全屏 scrim 与沉浸遮罩消费，默认 `0.3`）。拖动只 preview、`change` 才落库；
  `stores/appearance.js` 的 `previewIntensity/previewDim` 是场景态专用，**不得持久化**。
  系统「增强对比度」时质感钳 `≥0.85`、「降低透明度」时钳 `≥0.7`。
- **自适应极性**（取代「文字只用纯白」旧口径）：`usePolarity` 把背景降采样到 32×32，取 WCAG 相对亮度
  **p88**，用 `.45/.32` 迟滞写 `html[data-polarity]`；`services/polarity.js` 是纯函数可单测。暗极性 = 白字 +
  深 scrim；亮极性 = 翻成深字，且 scrim 至少保留 `.2`。上传亮色背景后玻璃与文字会整体翻面，这是预期行为。
- **背景**：默认深空星野 `src/assets/bg-starfield.webp`（静态图 + 16 个星点闪烁，**漂移已取消**；
  `prefers-reduced-motion: reduce` 时星点不闪）。可上传自定义图片 / GIF（≤8 MB）或视频（≤30 MB）：
  字节存 **OPFS**，`settings.uiBackground` 只存描述符（kind / mime / size / updatedAt）；**只存本机、不进备份**，
  换设备后回落星空。GIF / 视频不做 L2 镜像。
- **沉浸取景 / L2 镜像只在记一笔页**：取景走 `getUserMedia`（后置相机 + 轻微视差，5 分钟无操作自动停流），
  退出 / 切后台 / 锁屏 / 路由离开都会 `stop()` 轨道；L2 背景镜像只作用于金额头卡与 ✓
  （`GlassMirror` + `useBackgroundMirror`），沉浸非 closed 时整体关闭。
- **维护注意**：`vite.config.js` 的 `workbox.globPatterns` 必须显式包含 `webp`（vite-plugin-pwa@2 默认不收），
  否则星野图不进 precache、离线时没有背景；新增图片类资源时同样要检查。

## GitHub Pages 部署

`vite.config.js` 已设 `base: './'`（相对路径），`npm run build` 后把 `dist/` 整个推到仓库的
`gh-pages` 分支（或 Settings → Pages 选择对应目录）即可；hash 路由 + 相对 base，
部署到 `https://<user>.github.io/<repo>/` 子路径刷新不 404。PWA 需 HTTPS，GitHub Pages 默认满足。
当前 `gh-pages` 分支已承载与现网并行的镜像（入口是 `assets/index-<hash>.js` 哈希产物）。

两条部署硬约束：

- **根目录必须有 `.nojekyll`**（空文件）。否则 Jekyll 会忽略 `_plugin-vue_export-helper-*.js` 这类下划线开头的
  chunk，表现为首屏白屏；该文件不在 `dist/` 里，推送脚本要显式注入。
- **GitHub Pages 对所有文件发 `cache-control: max-age=600`**（含 `sw.js`）。重推后旧访客的浏览器在约 10 分钟内
  仍可能把旧 `sw.js` 视为新鲜、`autoUpdate` 不触发，**短时间看到旧皮肤不是上线失败**；把标签页彻底关掉重开、
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
  退化成未分类」的存量缺陷。**入口两处**（底部 Tab 结构未动）：设置页「分类管理 ›」卡、
  统计页标题行右侧「分类管理 ›」快捷入口
- ✅ 统计图表 + 分类预算：统计页可前后翻月（跨年正确），概览 / 环图（支出构成 + 前 5 图例）/
  柱图（每日支出，今天高亮）/ 分类预算进度（80% 黄、超支红）全部跟随所选月份；
  环图与柱图均为手写 SVG（无图表库）；分类表单新增「月预算」（元输入，空 = 不设）
- ✅ 统一入口协议：`/#/add?amount=12.5&type=expense&note=午饭&category=餐饮` 打开即预填记账页
  （参数一次性，读完即从地址栏清除）；记账页新增「⌘ 粘贴」按钮解析剪贴板 JSON
  （`{"app":"jizhang",...}`，需用户手势触发）；解析规则集中在 `services/entry.js` 纯函数层。
  **给用户看的配置手册见 `SHORTCUTS.md`**
- ✅ 液态玻璃外观体系（V4-2，`cf1413e`）：强制深色、三档材质、质感 / 背景压暗两条滑块（持久化）、
  背景自适应极性（p88 亮度 + `.45/.32` 迟滞，亮底翻面并保留 `.2` scrim）、深空星野背景
  （静态图 + 16 星点闪烁，漂移已取消，reduced-motion 时静止）、自定义背景上传
  （图片 / GIF ≤8 MB、视频 ≤30 MB，OPFS 存字节、**不进备份**、换机回落星空）、记一笔页沉浸取景
  （相机背景，5 分钟无操作自动停流）与 L2 背景镜像（仅金额头卡与 ✓）
- ✅ 部署：GitHub Pages 镜像已上线（`gh-pages` 分支，根目录带 `.nojekyll`）；现网仍为 WorkBuddy Sites
  （地址由使用者保管，见 `docs/DESIGN.md` 的托管说明）
- ⬜ 下一步：`webapp://` 拉起 PWA 的真机验证（未验证前推荐 URL 参数路径）
- ⬜ 后期（Phase 3）：GitHub 私有仓库双人同步、三视角（各自/合并）、私密不上传
