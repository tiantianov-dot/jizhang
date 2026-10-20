# 极简记账 PWA · 设计决策档案

> **演进说明（2026-10-15）**：本文件是 2026-10-06 立项时的原始计划，作为设计决策的**源头记录**保留。
> 实施过程中部分决策已演进，**以 README.md 为准**，主要差异：
>
> | 项 | 原计划 | 实际落地 |
> | --- | --- | --- |
> | 技术栈 | 原生 HTML+CSS+JS，无构建 | **Vue 3 + Vite + Pinia + vue-router(hash) + vite-plugin-pwa**（JS 非 TS） |
> | 托管 | GitHub Pages | **WorkBuddy Sites**（现网；真实站点地址不写入本公开仓库，由使用者自行保管并填入 `SHORTCUTS.md` 的 `<你的站点地址>`）**+ GitHub Pages 镜像**（`gh-pages` 已上线，入口为 `assets/index-<hash>.js` 哈希产物，根目录带 `.nojekyll`） |
> | 图表 | Chart.js CDN 或自绘 SVG | **手写 SVG**（DonutChart / BarChart，零依赖） |
> | 入口通道 A | `webapp://` 带参拉起 PWA | **仍未真机验证**，主推 URL 参数（`#/add?...`）+ 剪贴板 JSON 兜底 |
> | 快捷指令 | 四条捷径 | 已跑通**截图 OCR 链路**（截屏 → 提取文本 → 正则金额 → 弹窗选金额 → autosave 入账），详见 `SHORTCUTS.md` |
> | 新增（计划未含） | — | autosave 自动入账+4秒撤销、OCR 脏金额清洗（`services/entry.js` 的 `cleanAmount`） |
> | 外观与材质（计划未含） | — | **液态玻璃 V4 收口**：强制深色、三档材质（regular/clear/identity）、质感与背景压暗两条滑块（持久化）、背景自适应极性（32×32 降采样 + p88 亮度 + `.45/.32` 迟滞）、深空星野默认背景（静态图 + 星点闪烁，**无漂移**）、自定义背景上传（图片/GIF ≤8 MB、视频 ≤30 MB，OPFS 存字节、**不进备份**、换机回落星空）、沉浸取景与 L2 背景镜像仅限记一笔页。维护口径见 README「外观与材质」 |
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
| 双人同步 | 后期再加；现在预留 id / updatedAt / deleted / private 字段 |
| 私密账单 | 现在实现：记录含 private 标记，标记后只存本地、永不同步 |
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

- `records`：`{ id(uuid), amount(分,整数), type(expense|income), categoryId, note, date(YYYY-MM-DD), createdAt, updatedAt, deleted(false), private(false) }`
- `categories`：`{ id, name, emoji, color, monthlyBudget(分, 0=不设), order, archived, lastUsedAt }`
- `settings`：`{ monthlyBudget, ownerName, partnerName?, syncConfig?（预留） }`
  —— 外观落地后另含 `uiGlassIntensity` / `uiGlassDim`（进导出白名单）与 `uiBackground`（背景描述符，
  素材字节在 OPFS；**不进备份**，换机回落星空）

要点：

- 金额一律以「分」存整数，避免浮点误差
- `deleted` / `private` / `updatedAt` 现在建好，后期同步零迁移
- `categories.lastUsedAt` 驱动「最近使用排序」，把分类选择压到一次点击（体验硬指标：记一笔 ≤3 次点击、≤3 秒）

## 页面结构（底部 Tab，手机触控优先）

1. **记一笔**（主 Tab，打开即达）：金额数字键盘 + 分类大按钮平铺（≤一屏、最近使用排序、默认选中上次的分类）+ 备注可选 + 保存 toast（可撤销）
2. **流水**：按天分组、关键词搜索、分类/月份筛选、进入编辑/删除（软删除）
3. **统计**：月度收支总览、分类占比环图、每日支出柱图、预算进度（80% 黄 / 超支红）
4. **设置**：分类管理（增删改/排序/emoji）、预算设置、导出/导入 JSON、快捷指令配置指引入口

## 快捷指令（iOS 端交付物：逐条配置文档 + 协议说明）

四条捷径，全部投递到统一入口：

1. **截图 OCR（主用）**：轻点背面触发 → 截屏 → 从图像提取文本 → 正则取金额 → 词典映射分类 → 弹窗确认（可改）→ 投递
2. **Siri 语音**：听写文本 → 正则解析「午饭35」→ 确认 → 投递
3. **扣款短信**：自动化（收到含关键词短信）→ 正则提取 → 投递（确认可选）
4. **手动输入**：快捷指令表单直接录入 → 投递（应急兜底）

AI 接口预留：快捷指令里「解析」独立成块，后期可整块替换为「使用模型」（iOS 端侧，免 key）或 HTTPS 调云端大模型。

## 分期路线

- **Phase 1 单人核心**：数据层 → 记一笔 → 流水 → 统计+预算 → 导入导出 → PWA 离线（manifest+sw）→ 托管部署
- **Phase 2 快捷指令**：统一入口双通道 → 四条捷径配置文档 → 真机联调
- **Phase 3 双人**：GitHub 仓库同步层 → 三视角视图 → 私密不上传 → 配置包分享

## 验证清单（开发首日真机实测）

1. `webapp://` 能否带查询参数拉起 PWA（决定通道 A 是否成立；不成立则统一走通道 B）—— **仍未验证**
2. PWA 独立存储下 IndexedDB 的持久化表现（iOS 对长期未用的 Web App 有清理策略 → 导出备份必须显眼）
3. PWA 内 `navigator.clipboard.readText` 的授权弹窗体验 —— **已验证可用**
4. iOS「从图像提取文本」对微信/支付宝支付完成页的中文金额识别准确率 —— **已验证可用**
5. GitHub Pages + manifest + sw 在 iOS 主屏幕的 standalone 全屏表现 —— **WorkBuddy Sites 下已验证**；
   GitHub Pages 镜像已上线（含 `.nojekyll`），**该镜像在 iPhone 主屏幕的 standalone 表现尚未真机验证**

## 参考项目

cute-ledger（功能清单/GitHub 同步思路）、ctt062/finance-app（vanilla PWA 结构）、iCost-AI（AI 解析提示词）、蜜蜂记账（轻点背面交互）
