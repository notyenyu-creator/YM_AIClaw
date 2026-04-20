# Y-CRM 資料庫速查表

> PostgreSQL `localhost:5432`，資料庫名 `default`，透過 DuckDB postgres_scanner 查詢。
> 所有欄位名為 camelCase，查詢時須用雙引號包裹（如 `"nameFirstName"`）。
> 軟刪除：`"deletedAt" IS NULL` 表示有效資料。

---

## Core Schema（系統表）

### core.workspace

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 工作區 ID |
| displayName | text | 顯示名稱 |
| subdomain | text | 子網域 |
| logo | text | Logo URL |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除（NULL = 有效） |
| activationStatus | text | 啟用狀態 |

### core.user

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | 使用者 ID |
| firstName | text | 名 |
| lastName | text | 姓 |
| email | text | Email |
| passwordHash | text | **禁止查詢** |
| defaultAvatarUrl | text | 頭像 URL |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### core.userWorkspace

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| userId | uuid FK | → core.user |
| workspaceId | uuid FK | → core.workspace |
| createdAt | timestamp | 建立時間 |
| deletedAt | timestamp | 軟刪除 |

---

## Workspace Schema（業務表）

每個工作區有獨立的 schema，格式為 `workspace_<base36_id>`。以下表格存在於每個工作區 schema 中。

### person（聯絡人）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| nameFirstName | text | 名 |
| nameLastName | text | 姓 |
| emailsPrimaryEmail | text | 主要 Email |
| emailsAdditionalEmails | jsonb | 其他 Email（JSON 陣列） |
| phonesPrimaryPhoneNumber | text | 主要電話 |
| phonesPrimaryPhoneCountryCode | text | 國碼 |
| **shouJiHaoMaPrimaryPhoneNumber** | text | **手機號碼** |
| **lianLuoDianHuaFenJi** | text | **聯絡電話分機** |
| **dianZiYouJianEmailPrimaryEmail** | text | **電子郵件 Email（自訂欄位）** |
| **lineId** | text | **LINE ID（手動輸入）** |
| **line** | text | **LINE（備用欄位）** |
| **yuanGong** | enum | **員工（身份分類）** |
| **renYuanId** | uuid FK | **→ 自訂物件（人員關聯）** |
| jobTitle | text | 職稱 |
| city | text | 城市 |
| intro | text | 簡介 |
| companyId | uuid FK | → company |
| linkedinLinkPrimaryLinkUrl | text | LinkedIn |
| xLinkPrimaryLinkUrl | text | X (Twitter) |
| avatarUrl | text | 頭像 |
| position | double | 排序位置 |
| lineUserId | text | LINE User ID（系統自動，隱藏） |
| lineDisplayName | text | LINE 顯示名稱 |
| lineProfilePictureUrl | text | LINE 頭像（系統自動，隱藏） |
| lineStatus | enum | LINE 狀態：ACTIVE / BLOCKED / UNLINKED |
| lastLineInteractionAt | timestamp | 最後 LINE 互動時間 |
| createdByName | text | 記錄建立者 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### company（公司）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| name | text | 公司名稱 |
| domainNamePrimaryLinkUrl | text | 網域 |
| domainNameSecondaryLinks | jsonb | 其他連結 |
| employees | double | 員工數（標準欄位） |
| **yuanGongRenShu** | double | **員工人數（自訂欄位）** |
| **lianLuoDianHua** | text | **聯絡電話** |
| **chuanZhen** | text | **傳真** |
| **gongSiTongBian** | text | **公司統編** |
| **gongSiWangZhiPrimaryLinkUrl** | text | **公司網址** |
| **ziBenEAmountMicros** | numeric | **資本額（微單位，÷1000000＝元）** |
| **ziBenECurrencyCode** | text | **資本額幣別** |
| **yeWuFuZeRenId** | uuid FK | **→ workspaceMember（業務負責人）** |
| annualRecurringRevenueAmountMicros | numeric | 年營收（微單位） |
| annualRecurringRevenueCurrencyCode | text | 幣別 |
| addressAddressStreet1 | text | 地址（街道） |
| addressAddressCity | text | 城市 |
| addressAddressState | text | 州/省 |
| addressAddressCountry | text | 國家 |
| addressAddressPostcode | text | 郵遞區號 |
| idealCustomerProfile | boolean | 理想客戶 |
| linkedinLinkPrimaryLinkUrl | text | LinkedIn |
| xLinkPrimaryLinkUrl | text | X (Twitter) |
| position | double | 排序 |
| accountOwnerId | uuid FK | → workspaceMember |
| companyId | uuid FK | → 自關聯（母公司）|
| createdByName | text | 記錄建立者 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### opportunity（商機）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| name | text | 商機名稱 |
| **amountAmountMicros** | numeric | **金額（微單位，÷1000000＝元）** |
| amountCurrencyCode | text | 幣別 |
| closeDate | timestamp | 預計關閉日 |
| stage | enum | 階段（見下方） |
| **chengAnLu** | enum | **成案率**（見下方） |
| **fuZeYeWuId** | uuid FK | **→ workspaceMember（負責業務）** |
| **fuZeYeWuTuBiaoXianShiYong** | text | **負責業務姓名（顯示用，如 "Calleen Hong"）** |
| **yuJiJieDanRiQi** | date | **預計接單日期** |
| **shuoMing** | text | **說明** |
| companyId | uuid FK | → company |
| pointOfContactId | uuid FK | → person |
| opportunityId | uuid FK | → 自關聯（母案）|
| position | double | 排序（看板用） |
| createdByName | text | 記錄建立者（≠ 負責業務！） |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

> **⚠️ 重要**：查「業務人員」要用 `"fuZeYeWuTuBiaoXianShiYong"`，**不是** `createdByName`（那是記錄建立者）。
> 也可以 JOIN `workspaceMember`：`opportunity."fuZeYeWuId" = workspaceMember.id`

> **stage 值（Y-CRM 工作區）**：
> - `OPT0_XU_QIU_QUE_REN` — 需求確認
> - `OPT1_ZHUN_BEI_TI_AN` — 準備提案
> - `OPT2_YI_BAO_JIA` — 已報價
> - `OPT4_HE_YUE_QIAN_SHU_ZHONG` — 合約簽署中
> - `OPT5_YI_CHENG_JIAO_CLOSED_WON` — 已成交
> - `OPT6_WEI_CHENG_JIAO_CLOSED_LOST` — 未成交

> **chengAnLu（成案率）值**：
> - `OPT1_90_YI_SHANG` — 90% 以上
> - `OPT2_60_90` — 60%~90%
> - `OPT3_60_YI_XIA` — 60% 以下
> - `OPT4_YI_CHENG_JIAO` — 已成交
> - `OPT5_LOST` — Lost

### task（任務）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| title | text | 標題 |
| body | text | 內容（富文字） |
| dueAt | timestamp | 截止日期 |
| status | enum | TODO / IN_PROGRESS / DONE |
| assigneeId | uuid FK | → workspaceMember |
| position | integer | 排序 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### taskTarget（任務關聯）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| taskId | uuid FK | → task |
| personId | uuid FK | → person（可選） |
| companyId | uuid FK | → company（可選） |
| opportunityId | uuid FK | → opportunity（可選） |

### note（備忘錄）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| title | text | 標題 |
| body | text | 內容（富文字） |
| position | integer | 排序 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### noteTarget（備忘錄關聯）

與 taskTarget 相同模式：

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| noteId | uuid FK | → note |
| personId | uuid FK | → person（可選） |
| companyId | uuid FK | → company（可選） |
| opportunityId | uuid FK | → opportunity（可選） |

### workspaceMember（工作區成員）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| nameFirstName | text | 名 |
| nameLastName | text | 姓 |
| userEmail | text | Email |
| avatarUrl | text | 頭像 |
| locale | text | 語系 |
| colorScheme | text | 主題 |
| userId | uuid FK | → core.user |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

---

## LINE Chat 表

付費功能，`IS_LINE_CHAT_ENABLED=true` 的工作區才有資料。

### lineChatThread（LINE 對話）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| personId | uuid FK | → person |
| assigneeId | uuid FK | → workspaceMember（指派客服） |
| status | enum | PENDING / RESOLVED |
| replyMode | enum | AUTO / MANUAL / null（跟隨全域設定） |
| lastMessageAt | timestamp | 最後訊息時間 |
| lastMessagePreview | text | 最後訊息預覽 |
| unreadCount | integer | 未讀數 |
| markAsReadEnabled | boolean | 是否發送已讀回條 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### lineChatMessage（LINE 訊息）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| threadId | uuid FK | → lineChatThread |
| senderId | uuid FK | → workspaceMember（outgoing 時填入） |
| direction | enum | INCOMING / OUTGOING |
| messageType | enum | TEXT / IMAGE / VIDEO / AUDIO / FILE / STICKER / LOCATION |
| textContent | text | 文字內容 |
| mediaUrl | text | 媒體 URL |
| originalFileName | text | 原始檔名 |
| stickerPackageId | text | 貼圖包 ID |
| stickerId | text | 貼圖 ID |
| lineMessageId | text | LINE 訊息 ID |
| sentAt | timestamp | 實際發送時間 |
| scheduledAt | timestamp | 排程時間（sentAt=null 表示尚未發送） |
| markAsReadToken | text | 已讀回條 token |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

### lineAutoReplyRule（自動回覆規則）

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| name | text | 規則名稱 |
| ruleType | enum | KEYWORD / DEFAULT_REPLY |
| priority | integer | 優先級（數字越小越優先） |
| isActive | boolean | 是否啟用 |
| keywords | text | 關鍵字（JSON 陣列，如 `["你好","hello"]`） |
| matchType | enum | EXACT / CONTAINS |
| replyText | text | 回覆文字 |
| position | integer | 排序 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 更新時間 |
| deletedAt | timestamp | 軟刪除 |

---

## 工作流表

### workflow

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| name | text | 工作流名稱 |
| statuses | jsonb | 版本狀態（DRAFT/ACTIVE/ARCHIVED） |
| position | integer | 排序 |

### workflowVersion

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| workflowId | uuid FK | → workflow |
| trigger | jsonb | 觸發器定義（JSON） |
| steps | jsonb | 步驟定義（JSON 陣列） |
| status | text | DRAFT / ACTIVE / ARCHIVED |

### workflowRun

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| workflowVersionId | uuid FK | → workflowVersion |
| status | text | RUNNING / COMPLETED / FAILED |
| state | jsonb | 執行狀態（每步結果） |
| startedAt | timestamp | 開始時間 |
| completedAt | timestamp | 完成時間 |

---

## Email 相關表

### message

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| subject | text | 主旨 |
| text | text | 內文 |
| receivedAt | timestamp | 接收時間 |
| headerMessageId | text | Email Message-ID header |

### messageThread

訊息執行緒，將同一串信件群組在一起。

### messageParticipant

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | ID |
| messageId | uuid FK | → message |
| role | enum | from / to / cc / bcc |
| handle | text | Email 地址 |
| displayName | text | 顯示名稱 |
| personId | uuid FK | → person（自動匹配） |

> **connectedAccount 包含 OAuth token -- 禁止查詢 token 相關欄位。**

---

## 其他常用表

| Table | Description |
|-------|-------------|
| favorite | 使用者收藏的記錄 |
| view | 自訂檢視 |
| viewField | 檢視欄位設定 |
| viewFilter | 檢視篩選條件 |
| viewSort | 檢視排序規則 |
| attachment | 附件 |
| dashboard | 儀表板 |
| calendarEvent | 行事曆事件 |
| calendarEventParticipant | 行事曆參與者 |
| auditLog | 審計日誌 |

---

## 關聯關係圖

```
workspaceMember ←── userId ──→ core.user
person ←── companyId ──→ company
person ←── lineChatThread (personId)
lineChatThread ←── lineChatMessage (threadId)
lineChatThread ←── assigneeId ──→ workspaceMember
opportunity ←── companyId ──→ company
opportunity ←── pointOfContactId ──→ person
opportunity ←── fuZeYeWuId ──→ workspaceMember（負責業務）
company ←── yeWuFuZeRenId ──→ workspaceMember（業務負責人）
company ←── accountOwnerId ──→ workspaceMember（帳戶擁有者）
task ←── assigneeId ──→ workspaceMember
task ←── taskTarget ──→ person / company / opportunity
note ←── noteTarget ──→ person / company / opportunity
```

> **⚠️ 查「業務」「負責人」→ 找 workspaceMember 的 FK（xxxId），不要用 createdByName**

---

## 拼音欄位名 → 中文對照（自訂欄位）

Y-CRM 自訂欄位使用漢語拼音命名。以下為常見拼音欄位：

| 拼音欄位 | 中文含義 | 表 | 說明 |
|----------|---------|-----|------|
| fuZeYeWuId | 負責業務 ID | opportunity | FK → workspaceMember |
| fuZeYeWuTuBiaoXianShiYong | 負責業務（圖表顯示用） | opportunity | 直接存人名，如 "Calleen Hong" |
| chengAnLu | 成案率 | opportunity | enum（90%以上/60~90%/60%以下/已成交/Lost） |
| yuJiJieDanRiQi | 預計接單日期 | opportunity | date |
| shuoMing | 說明 | opportunity | text |
| yeWuFuZeRenId | 業務負責人 ID | company | FK → workspaceMember |
| lianLuoDianHua | 聯絡電話 | company | text |
| chuanZhen | 傳真 | company | text |
| gongSiTongBian | 公司統編 | company | text |
| gongSiWangZhiPrimaryLinkUrl | 公司網址 | company | text |
| ziBenEAmountMicros | 資本額 | company | 微單位，÷1000000＝元 |
| yuanGongRenShu | 員工人數 | company | double |
| shouJiHaoMaPrimaryPhoneNumber | 手機號碼 | person | text |
| lianLuoDianHuaFenJi | 聯絡電話分機 | person | text |
| dianZiYouJianEmailPrimaryEmail | 電子郵件 | person | text |
| lineId | LINE ID | person | 手動輸入 |
| yuanGong | 員工 | person | enum（身份分類） |

> **規則：遇到不在此表的拼音欄位，嘗試將拼音轉中文理解。**

---

## 標準欄位中文對照

| 中文 | DB 欄位 | 表 |
|------|---------|-----|
| 姓 | nameLastName | person |
| 名 | nameFirstName | person |
| Email | emailsPrimaryEmail | person |
| 電話 | phonesPrimaryPhoneNumber | person |
| 職稱 | jobTitle | person |
| 公司名稱 | name | company |
| 商機名稱 | name | opportunity |
| 金額（微單位） | amountAmountMicros | opportunity |
| 階段 | stage | opportunity |
| 任務標題 | title | task |
| 截止日 | dueAt | task |
| LINE 名稱 | lineDisplayName | person |
| LINE 狀態 | lineStatus | person |

---

## 欄位命名慣例

Y-CRM 欄位名使用 **camelCase**，複合型別會展平為多個欄位：

| 模式 | 範例 |
|------|------|
| 名稱 | `nameFirstName`, `nameLastName` |
| Email | `emailsPrimaryEmail`, `emailsAdditionalEmails` |
| 電話 | `phonesPrimaryPhoneNumber`, `phonesPrimaryPhoneCountryCode` |
| 地址 | `addressAddressStreet1`, `addressAddressCity`, `addressAddressState` |
| 連結 | `linkedinLinkPrimaryLinkUrl`, `xLinkPrimaryLinkUrl` |
| 金額 | `amount`, `amountCurrencyCode`（或 `annualRecurringRevenue` + `...CurrencyCode`） |
| 外鍵（標準） | `companyId`, `assigneeId`, `pointOfContactId` |
| 外鍵（自訂物件） | 中文拼音，如 `renYuanId`（人員）、`chanPinId`（產品）— 各工作區不同，需探查 |
| 系統 | `id`, `createdAt`, `updatedAt`, `deletedAt`, `position` |

---

## 自訂物件（各工作區不同）

自訂物件表名以 `_` 開頭（例如 `_pet`、`_yeJiMuBiao`、`_salesQuote`）。

探查自訂物件：

```sql
SELECT table_name FROM ycrm.information_schema.tables
WHERE table_schema = '<SCHEMA>' AND table_name LIKE '\_%' ESCAPE '\'
ORDER BY table_name;
```

探查自訂物件欄位：

```sql
SELECT column_name, data_type FROM ycrm.information_schema.columns
WHERE table_schema = '<SCHEMA>' AND table_name = '_xxx'
ORDER BY ordinal_position;
```

**永遠先探查再查詢** -- 自訂物件的欄位完全由使用者定義，無法預先得知。

---

## 常用查詢範例

### 列出所有工作區

```sql
SELECT id, "displayName", subdomain, "activationStatus"
FROM ycrm.core.workspace
WHERE "deletedAt" IS NULL;
```

### 查詢某工作區的聯絡人數量

```sql
SELECT COUNT(*) FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.person
WHERE "deletedAt" IS NULL;
```

### 聯絡人 + 公司 JOIN

```sql
SELECT p."nameLastName" || p."nameFirstName" AS full_name,
       p."emailsPrimaryEmail",
       c.name AS company_name
FROM ycrm.<SCHEMA>.person p
LEFT JOIN ycrm.<SCHEMA>.company c ON p."companyId" = c.id AND c."deletedAt" IS NULL
WHERE p."deletedAt" IS NULL
LIMIT 50;
```

### LINE 活躍聯絡人

```sql
SELECT "nameLastName" || "nameFirstName" AS full_name,
       "lineDisplayName", "lineStatus", "lastLineInteractionAt", "lineUnreadCount"
FROM ycrm.<SCHEMA>.person
WHERE "deletedAt" IS NULL AND "lineStatus" = 'ACTIVE'
ORDER BY "lastLineInteractionAt" DESC NULLS LAST
LIMIT 20;
```

### 商機總金額（按階段）

```sql
SELECT stage, COUNT(*) AS count, SUM(amount) AS total_amount
FROM ycrm.<SCHEMA>.opportunity
WHERE "deletedAt" IS NULL
GROUP BY stage
ORDER BY total_amount DESC;
```

### LINE 對話統計

```sql
SELECT t.status, COUNT(*) AS thread_count,
       SUM(t."unreadCount") AS total_unread
FROM ycrm.<SCHEMA>."lineChatThread" t
WHERE t."deletedAt" IS NULL
GROUP BY t.status;
```

### 最近訊息

```sql
SELECT m."direction", m."messageType", m."textContent",
       m."sentAt", p."lineDisplayName"
FROM ycrm.<SCHEMA>."lineChatMessage" m
JOIN ycrm.<SCHEMA>."lineChatThread" t ON m."threadId" = t.id
JOIN ycrm.<SCHEMA>.person p ON t."personId" = p.id
WHERE m."deletedAt" IS NULL
ORDER BY m."sentAt" DESC NULLS LAST
LIMIT 20;
```
