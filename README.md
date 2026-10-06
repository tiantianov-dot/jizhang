# 极简记账 (jizhang)

> 理念：**极简功能不减，唯一宗旨 = 方便快速记账**（记一笔 ≤3 次点击、≤3 秒）

Local-first 记账 PWA：无后端，数据全部存在浏览器 IndexedDB；可添加到 iOS 主屏幕当 App 用；远景是异地情侣双人同步（字段已预留，同步层未实现）。

**给 Agent 的提示**：接手本项目请先读完本文件，再读 `src/models.js`（字段约定源头）与 `src/db/index.js`（引擎层）。完整设计决策见计划文件 `C:\Users\lenovo\.workbuddy\plans\cosmic-beacon-darwin-2VbV2MeX.md`。

## 环境要求

- Node `^22.18.0 || >=24.12.0`（本机路径 `C:\Users\lenovo\.workbuddy\binaries\node\versions\22.22.2-6`，低于 22.18 的 Node 跑不起来）
- 项目内 `.npmrc` 已指向 npmmirror 源（国内加速）
- 图标重新生成：`python scripts/gen_icons.py`（需 Pillow，本机 venv 在 `C:\Users\lenovo\.workbuddy\binaries\python\envs\default`）

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
铁律：**IndexedDB 操作只存在于 `db/` 与 `repositories/`**，视图和 store 不得直接写 SQL 式存取。

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
│   └── backup.js        #   导出/导入 JSON（id 对齐、updatedAt 新者胜）
├── services/
│   ├── stats.js         # 统计纯函数（按月过滤/求和/预算用量/按天分组/翻月/按分类汇总/每日汇总），可单测
│   └── entry.js         # 统一入口协议的解析层：URL query / 剪贴板 JSON → 表单草稿（纯函数）
├── utils/
│   └── format.js        # 金额(分)↔显示、日期 YYYY-MM-DD、输入框预填串，全局唯一格式化入口
├── stores/              # Pinia：records / categories / settings（薄层，直通 repository）
├── router/index.js      # hash 路由（GitHub Pages 刷新不 404）；/add 是外部入口路径，带参跳到 /
├── views/               # Add(记一笔) / List(流水) / Edit(编辑单笔) / Stats(统计)
│                        #   / Settings(设置) / Categories(分类管理)
├── components/          # TabBar；AmountPad(金额键盘) 与 CategoryGrid(分类平铺) 被 Add、Edit 复用；
│                        #   CategoryForm(分类增改/删除) 与 IconColorPicker(图标+配色) 供 Categories 用；
│                        #   DonutChart(环图) / BarChart(柱图) / CategoryBudgetList(分类预算) 供 Stats 用
└── styles/base.css      # CSS 变量、深浅色、safe-area
public/icons/            # PWA 图标（scripts/gen_icons.py 生成）
vite.config.js           # base './' + VitePWA(manifest + SW 离线缓存，build 自动注入注册脚本)
```

## 核心约定（改动时必须遵守）

1. **金额一律以「分」存整数**（`utils/format` 的 `toFen` / `fenToYuan` 转换），禁止浮点
2. **删除 = 软删除**（`deleted: true`），为后期同步服务，禁止硬删 records
3. **`private: true` 的账目是私密账单**（异地情侣买礼物防剧透），永不同步、永不进入共享视图
4. records/categories 都有 `id` / `updatedAt` —— 是双人同步的合并依据，改字段前必读计划文件
5. 分类排序由 `lastUsedAt` 驱动（最近使用排前），这是"3 秒记账"的核心体验，不要改成固定排序
6. 收支颜色遵循中式习惯：收入红、支出默认色；预算 80% 变黄、超支变红（口径在 `services/stats.budgetUsage`）
7. 统计/格式化一律走 `services/stats` 与 `utils/format` 的纯函数，不得在组件里另写口径
8. **分类删除 = 有流水引用则归档**（`archived: true`，历史账目保留原分类名与 emoji）。categories store 的
   `list` 载入**含归档的全量**（`listAll()`），所以记账/编辑页必须用 `expense` / `income` getter（已过滤归档），
   而 `byId` 必须查得到归档分类 —— 否则历史流水会退化成「未分类」

## GitHub Pages 部署

`vite.config.js` 已设 `base: './'`（相对路径），`npm run build` 后把 `dist/` 整个推到仓库的
`gh-pages` 分支（或 Settings → Pages 选择对应目录）即可；hash 路由 + 相对 base，
部署到 `https://<user>.github.io/<repo>/` 子路径刷新不 404。PWA 需 HTTPS，GitHub Pages 默认满足。

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
- ⬜ 下一步：GitHub Pages 部署、`webapp://` 拉起 PWA 的真机验证（未验证前推荐 URL 参数路径）
- ⬜ 后期（Phase 3）：GitHub 私有仓库双人同步、三视角（我的/TA的/我们）、私密不上传
