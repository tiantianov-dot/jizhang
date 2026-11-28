# `cloud-inbox` 部署手册（GCP Always Free + DeepSeek）

> 本文面向项目部署者，提供一套控制在 **Google Cloud Always Free 永久免费额度** 内的无服务器部署方案（Cloud Run + Firestore Native Mode）。  
> **安全约定**：本文所有命令均使用占位符与标准输入注入密钥，严禁把真实项目 ID、真实线上地址、`DEEPSEEK_API_KEY` 或 `INBOX_TOKEN` 写入 Git 仓库。

---

## 一、架构与 Always Free 免费额度选型（关键避坑）

| 组件     | 选型                                               | Always Free 免费额度（每月/每日）            | 必选避坑项                                                                                      |
| -------- | -------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 计算服务 | **Cloud Run**（Node 22 原生 `http`，`256Mi` 内存） | 每月 200 万请求、36 万 vCPU 秒、18 万 GiB 秒 | **必须选 Tier 1 区域**：首选 `us-central1`（备选 `us-west1`、`us-east1`）；`--min-instances=0`  |
| 临时存储 | **Firestore Native Mode**                          | 1 GiB 存储、每日 5 万读 / 2 万写 / 2 万删    | **仅 `(default)` 数据库**且设为 **Native Mode** 才免费；建库区域与 Cloud Run 同选 `us-central1` |
| 镜像仓库 | **Artifact Registry**                              | 0.5 GiB 存储                                 | 定期清理旧版构建镜像，防止超 0.5 GiB                                                            |
| AI 解析  | **DeepSeek API**（`deepseek-chat`）                | 按 DeepSeek 官方用量计费                     | 建议在 DeepSeek 后台开启消费上限告警                                                            |

> ⚠️ **区域警告**：切勿选择亚洲（如 `asia-east1`、`asia-northeast1`）或欧洲区，这些区域不在 Cloud Run / Firestore Always Free Tier 1 范围内，从第 1 次请求就会直接计费。

---

## 二、开通 GCP 服务与创建 Firestore 数据库

将 `<你的GCP项目ID>` 替换为你的 Google Cloud 项目 ID：

```bash
# 1. 登录并绑定目标项目
gcloud auth login
gcloud config set project "<你的GCP项目ID>"

# 2. 启用必要 API（Cloud Run / Firestore / Cloud Build / Secret Manager / Artifact Registry）
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# 3. 创建 Firestore Native Mode 默认数据库（必须为 (default) 且同区 us-central1）
gcloud firestore databases create \
  --database="(default)" \
  --location=us-central1 \
  --type=firestore-native
```

---

## 三、设置 1 美元月度预算告警（防止意外超额）

1. 打开 Google Cloud Console → **Billing（结算）** → **Budgets & alerts（预算与提醒）** → **CREATE BUDGET**。
2. 名称填写 `jizhang-cloud-inbox-1usd`，作用域选当前项目。
3. 预算金额设为 **Specified amount：`1` USD**。
4. 触发阈值（Threshold rules）保留并核对 **50%**、**90%**、**100%**（Actual spend）。
5. 勾选 **Email alerts to billing admins and users** 后保存。

---

## 四、生成随机同步密码并写入 Secret Manager（主推）

强烈推荐使用 **Google Cloud Secret Manager** 通过标准输入（stdin）写入密钥，避免私钥出现在命令历史或环境变量快照中。

### 1. 本地生成随机 `INBOX_TOKEN`

**Windows PowerShell：**

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 })) -replace '[+/=]',''
```

**macOS / Linux：**

```bash
openssl rand -hex 32
```

记下生成的随机字符串（稍后同时填入 App 设置页的「同步密码」）。

### 2. 创建 Secret 并通过 stdin 写入（无历史留痕）

```bash
# 创建两个 Secret 容器
gcloud secrets create inbox-token --replication-policy="automatic"
gcloud secrets create deepseek-api-key --replication-policy="automatic"

# 通过交互式 stdin 注入 INBOX_TOKEN（粘贴后按 Ctrl+D / Windows 按 Ctrl+Z 回车）
gcloud secrets versions add inbox-token --data-file=-

# 通过交互式 stdin 注入 DEEPSEEK_API_KEY（粘贴后按 Ctrl+D / Windows 按 Ctrl+Z 回车）
gcloud secrets versions add deepseek-api-key --data-file=-
```

### 3. 最小权限 IAM 授权

查询 Cloud Run 默认运行时服务账号（或自定义最小权限服务账号）并授予读取 Secret 与读写 Firestore 的权限：

```bash
PROJECT_NUMBER=$(gcloud projects describe "<你的GCP项目ID>" --format="value(projectNumber)")
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# 仅允许读取 inbox-token 与 deepseek-api-key
gcloud secrets add-iam-policy-binding inbox-token \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding deepseek-api-key \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor"

# 仅授予 Firestore 数据读写权限
gcloud projects add-iam-policy-binding "<你的GCP项目ID>" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/datastore.user"
```

> 备选环境变量方式：若仅在本地调试，可复制 `cloud-inbox/.env.example` 为 `cloud-inbox/.env` 并填入测试凭据（`cloud-inbox/.gitignore` 已忽略 `.env*`）。生产部署请勿使用明文 `.env` 或 `--set-env-vars` 传入密钥。

---

## 五、一键部署到 Cloud Run

在仓库的 **`cloud-inbox/`** 目录内执行部署命令（注意 `ALLOWED_ORIGINS` 只填浏览器 Origin，即 `https://<你的GitHub用户名>.github.io`，**末尾不带斜杠、不带子路径**）：

```bash
cd cloud-inbox

gcloud run deploy jizhang-cloud-inbox \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=256Mi \
  --cpu=1 \
  --concurrency=20 \
  --timeout=30 \
  --set-env-vars="NODE_ENV=production,STORAGE_MODE=firestore,DEFAULT_TIMEZONE=Asia/Shanghai,DEEPSEEK_MODEL=deepseek-chat,DEEPSEEK_BASE_URL=https://api.deepseek.com/v1,ALLOW_LOCALHOST_ORIGINS=true,ALLOWED_ORIGINS=https://<你的GitHub用户名>.github.io" \
  --set-secrets="INBOX_TOKEN=inbox-token:latest,DEEPSEEK_API_KEY=deepseek-api-key:latest"
```

说明：

- `--allow-unauthenticated` 仅用于放行浏览器和 iOS 快捷指令访问 HTTP 入口，服务内部所有业务路由（`/ingest`、`/pending`、`/ack`、`/categories`）均强制使用常量时间 `Bearer <INBOX_TOKEN>` 鉴权。
- `--min-instances=0` 确保闲置时自动缩容至零，不消耗空闲计费实例时间；`DEFAULT_TIMEZONE=Asia/Shanghai` 防止 Cloud Run 默认 UTC 时区造成跨午夜错日。
- 部署完成后，终端会输出服务地址（形如 `Service URL: https://<服务名>-<项目哈希>.us-central1.run.app`），即你的 `<你的云端收件箱地址>`（末尾不带 `/`）。

---

## 六、部署后验证命令（`curl`）

将 `<你的云端收件箱地址>` 与 `<你的同步密码>` 替换为实际部署输出值（测试完毕后注意清理临时终端变量）：

```bash
# 1. 健康检查（公开免鉴权，仅返回固定健康状态，零敏感信息）
curl -sS "<你的云端收件箱地址>/health"
# 预期：{"ok":true,"service":"jizhang-cloud-inbox"}

# 2. 无 Token 请求必须返回 401
curl -i -sS "<你的云端收件箱地址>/pending"
# 预期：HTTP/2 401 + {"error":"unauthorized"}

# 3. 携带合法 Bearer Token 拉取队列
curl -sS -H "Authorization: Bearer <你的同步密码>" "<你的云端收件箱地址>/pending"
# 预期：{"items":[]}

# 4. 冒烟测试 POST /ingest（返回 text/plain 简短中文通知文案）
curl -i -sS -X POST "<你的云端收件箱地址>/ingest" \
  -H "Authorization: Bearer <你的同步密码>" \
  -H "Content-Type: application/json" \
  -d '{"text":"瑞幸咖啡 原价38 满减5 实付¥28.50"}'
# 预期：HTTP/2 200 + Content-Type: text/plain; charset=utf-8 + ✅ 已暂存：餐饮 -¥28.50（瑞幸咖啡）

# 5. 无有效金额必须拒收并返回 422（不写入脏数据）
curl -i -sS -X POST "<你的云端收件箱地址>/ingest" \
  -H "Authorization: Bearer <你的同步密码>" \
  -H "Content-Type: application/json" \
  -d '{"text":"您好，您的验证码是 123456"}'
# 预期：HTTP/2 422 + ⚠️ 未识别到有效金额，未记账
```

测试完毕后若不想让刚才的测试账单入账，可在记账 App 设置页测试同步后删除，或用 `GET /pending` 取回测试 `id` 后调 `POST /ack` 清理。

---

## 七、Artifact Registry 旧镜像清理与版本回滚

### 1. 清理旧镜像（控制存储 < 0.5 GiB）

每次 `--source .` 构建会在 Artifact Registry（`cloud-run-source-deploy`）生成新镜像。部署多次后建议列出并清理旧镜像摘要，或直接在控制台为仓库设置「保留最近 2 个版本」的 Cleanup Policy：

```bash
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/<你的GCP项目ID>/cloud-run-source-deploy/jizhang-cloud-inbox
```

### 2. 版本回滚

```bash
# 列出历史 Revision
gcloud run revisions list --service=jizhang-cloud-inbox --region=us-central1

# 将 100% 流量切回指定 Revision
gcloud run services update-traffic jizhang-cloud-inbox \
  --region=us-central1 \
  --to-revisions=<目标Revision名称>=100
```

---

## 八、常见故障排查

| 现象                                      | 可能原因                                                                | 排查与解决                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 请求返回 `401 unauthorized`               | `INBOX_TOKEN` 不匹配或缺少 `Bearer ` 前缀                               | 核对请求头 `Authorization: Bearer <你的同步密码>`；如重置过 Secret，需重新部署新版本使 `:latest` 生效    |
| 浏览器设置页「测试连接」跨域失败          | `ALLOWED_ORIGINS` 漏配、末尾多了 `/` 或带了仓库子路径                   | 确保 `ALLOWED_ORIGINS` 精确等于浏览器 `Origin`（如 `https://<你的GitHub用户名>.github.io`）              |
| `/ingest` 返回 `502 ⚠️ AI 解析暂时不可用` | `DEEPSEEK_API_KEY` 无效/欠费、Secret 权限不足或网络超时                 | 检查 Cloud Run 日志：`gcloud run services logs read jizhang-cloud-inbox --region=us-central1 --limit=30` |
| `/pending` 或 `/ingest` 返回 `500`        | Firestore `(default)` 数据库未创建，或运行账号缺 `roles/datastore.user` | 核对 Firestore 是否已建为 Native Mode `(default)` 及运行服务账号 IAM 权限                                |
| 凌晨记账日期差一天                        | `DEFAULT_TIMEZONE` 未设为 `Asia/Shanghai`                               | 检查环境变量 `DEFAULT_TIMEZONE=Asia/Shanghai`                                                            |
