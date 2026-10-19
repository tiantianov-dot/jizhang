/**
 * models.js — 数据模型定义（JSDoc typedef，全项目统一的字段约定）
 *
 * 约定（不可破坏）：
 * - 金额一律以「分」存整数，3550 表示 ¥35.50，禁止浮点运算
 * - id / updatedAt / deleted 是后期双人同步的合并依据，字段名不可改
 * - private = true 的账目只存本地、永不参与将来的双人同步（防同步泄露）
 * - categories.lastUsedAt 是本地使用信号，不参与同步；刷新它不得同时刷新 updatedAt
 *
 * @typedef {Object} RecordItem 账目
 * @property {string}  id         uuid 主键
 * @property {number}  amount     金额（分，正整数）
 * @property {'expense'|'income'} type 收支类型
 * @property {string}  categoryId 关联 Category.id
 * @property {string}  note       备注（可为空串）
 * @property {string}  date       发生日期 YYYY-MM-DD（本地时区）
 * @property {number}  createdAt  创建时间戳 ms
 * @property {number}  updatedAt  最后修改时间戳 ms（同步合并依据：新者胜）
 * @property {boolean} deleted    软删除标记（records 永不硬删）
 * @property {number|null} deletedAt 软删除时间戳 ms（null = 未删除；墓碑回收依据）
 * @property {boolean} private    私密账单：只存本地，永不同步
 * @property {'me'|'partner'} owner 记录归属（三视角用；旧数据缺失时按 'me' 处理）
 *
 * @typedef {Object} Category 分类
 * @property {string}  id            uuid 主键
 * @property {string}  name          名称（如「餐饮」）
 * @property {string}  emoji         图标
 * @property {string}  color         主题色（统计图表用）
 * @property {'expense'|'income'} type 该分类属于支出还是收入
 * @property {number}  monthlyBudget 分类月预算（分，0 = 不设）
 * @property {number}  order         手动排序权重（小者靠前）
 * @property {boolean} archived      归档标记（有流水引用的分类只归档不删除）
 * @property {number}  lastUsedAt    最近使用时间戳 ms（驱动「最近使用排前」，0 = 未用过）
 * @property {number}  createdAt     创建时间戳 ms
 * @property {number}  updatedAt     最后修改时间戳 ms
 *
 * @typedef {Object} SettingRow 设置行（key-value 存储）
 * @property {string} key   设置名：'monthlyBudget' | 'ownerName' | 'lastBackupAt' | 'partnerName' | 'syncConfig' ...
 * @property {*}      value 设置值（monthlyBudget 为分；syncConfig 为 Phase 3 预留对象）
 * @property {number} updatedAt 最后写入时间戳 ms（同步合并依据；旧行可能缺失，视为 0）
 */

export {}
