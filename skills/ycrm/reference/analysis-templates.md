# Y-CRM 分析模板

提供即用的 SQL 查詢與 `report-json` 圖表區塊，供 DenchClaw AI 在使用者要求分析或圖表時直接複製並調整使用。

## 使用說明

- 所有 SQL 使用 **DuckDB postgres_scanner** 語法。
- 表名必須以 `ycrm.<SCHEMA>.` 為前綴。
- 預設工作區 schema：`workspace_3joxkr9ofo5hlxjan164egffx`（Y-CRM / youngming）。
- 使用前將 `<SCHEMA>` 替換為實際的 workspace schema 名稱。
- `report-json` 區塊由 DenchClaw 聊天 UI 渲染為互動式圖表。
- camelCase 欄位名必須用雙引號包裹（如 `"createdAt"`）。
- 複合型別欄位在 DB 中會展平（如 `amount` CURRENCY 變為 `"amountAmountMicros"` 和 `"amountCurrencyCode"`）。

### 複合型別欄位對照

| Entity 欄位 | 型別 | DB 欄位 |
|------------|------|---------|
| `name` (Person) | FULL_NAME | `"nameFirstName"`, `"nameLastName"` |
| `emails` | EMAILS | `"emailsPrimaryEmail"`, `"emailsAdditionalEmails"` |
| `phones` | PHONES | `"phonesPrimaryPhoneNumber"`, `"phonesPrimaryPhoneCountryCode"` |
| `amount` (Opportunity) | CURRENCY | `"amountAmountMicros"`, `"amountCurrencyCode"` |
| `linkedinLink` | LINKS | `"linkedinLinkPrimaryLinkUrl"`, `"linkedinLinkPrimaryLinkLabel"` |
| `domainName` (Company) | LINKS | `"domainNamePrimaryLinkUrl"`, `"domainNameSecondaryLinks"` |
| `address` (Company) | ADDRESS | `"addressAddressStreet1"`, `"addressAddressStreet2"`, `"addressAddressCity"`, `"addressAddressState"`, `"addressAddressCountry"`, `"addressAddressPostcode"` |

### 欄位選項值參考

| 欄位 | 選項值 |
|------|--------|
| opportunity.stage | `NEW`, `SCREENING`, `MEETING`, `PROPOSAL`, `CUSTOMER` |
| task.status | `TODO`, `IN_PROGRESS`, `DONE` |
| person.lineStatus | `ACTIVE`, `BLOCKED`, `UNLINKED` |
| person.lineThreadStatus | `PENDING`, `RESOLVED` |
| lineChatThread.status | `PENDING`, `RESOLVED` |
| lineChatMessage.direction | `INCOMING`, `OUTGOING` |
| lineChatMessage.messageType | `TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `FILE`, `STICKER`, `LOCATION` |

---

## 1. 銷售分析

### 1.1 商機階段分佈（圓餅圖）

```report-json
{
  "version": 1,
  "title": "商機階段分佈",
  "panels": [
    {
      "id": "opp_stage_pie",
      "title": "各階段商機數量",
      "type": "pie",
      "sql": "SELECT stage AS name, COUNT(*) AS value FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL GROUP BY stage ORDER BY value DESC",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    }
  ]
}
```

### 1.2 商機金額趨勢（折線圖）

金額使用 `amountAmountMicros`（以微單位儲存，1 元 = 1,000,000 micros），查詢時除以 1000000 轉換。

```report-json
{
  "version": 1,
  "title": "月度商機金額",
  "panels": [
    {
      "id": "opp_amount_trend",
      "title": "每月新增商機總金額",
      "type": "line",
      "sql": "SELECT strftime(\"createdAt\", '%Y-%m') AS month, ROUND(COALESCE(SUM(\"amountAmountMicros\"), 0) / 1000000.0, 2) AS total_amount FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL AND \"createdAt\" >= CURRENT_DATE - INTERVAL '12 months' GROUP BY month ORDER BY month",
      "mapping": { "xAxis": "month", "yAxis": ["total_amount"] },
      "size": "full"
    }
  ]
}
```

### 1.3 商機勝率分析（長條圖）

```report-json
{
  "version": 1,
  "title": "商機勝率分析",
  "panels": [
    {
      "id": "opp_win_rate",
      "title": "各階段商機數",
      "type": "bar",
      "sql": "SELECT stage, COUNT(*) AS count FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL GROUP BY stage ORDER BY count DESC",
      "mapping": { "xAxis": "stage", "yAxis": ["count"] },
      "size": "half"
    },
    {
      "id": "opp_win_amount",
      "title": "各階段商機金額",
      "type": "bar",
      "sql": "SELECT stage, ROUND(COALESCE(SUM(\"amountAmountMicros\"), 0) / 1000000.0, 2) AS total FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL GROUP BY stage ORDER BY total DESC",
      "mapping": { "xAxis": "stage", "yAxis": ["total"] },
      "size": "half"
    }
  ]
}
```

### 1.4 商機結案日分析（長條圖）

```report-json
{
  "version": 1,
  "title": "商機結案時程",
  "panels": [
    {
      "id": "opp_close_timeline",
      "title": "未來各月預計結案商機數",
      "type": "bar",
      "sql": "SELECT strftime(\"closeDate\", '%Y-%m') AS month, COUNT(*) AS count FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL AND \"closeDate\" IS NOT NULL AND \"closeDate\" >= CURRENT_DATE GROUP BY month ORDER BY month LIMIT 12",
      "mapping": { "xAxis": "month", "yAxis": ["count"] },
      "size": "full"
    }
  ]
}
```

---

## 2. 客戶分析

### 2.1 聯絡人-公司分佈（長條圖）

```report-json
{
  "version": 1,
  "title": "各公司聯絡人數",
  "panels": [
    {
      "id": "person_per_company",
      "title": "Top 10 公司（按聯絡人數）",
      "type": "bar",
      "sql": "SELECT c.name AS company, COUNT(p.id) AS person_count FROM ycrm.<SCHEMA>.person p JOIN ycrm.<SCHEMA>.company c ON p.\"companyId\" = c.id WHERE p.\"deletedAt\" IS NULL AND c.\"deletedAt\" IS NULL GROUP BY c.name ORDER BY person_count DESC LIMIT 10",
      "mapping": { "xAxis": "company", "yAxis": ["person_count"] },
      "size": "full"
    }
  ]
}
```

### 2.2 新客戶增長趨勢（面積圖）

```report-json
{
  "version": 1,
  "title": "新客戶增長趨勢",
  "panels": [
    {
      "id": "new_persons",
      "title": "每月新增聯絡人",
      "type": "area",
      "sql": "SELECT strftime(\"createdAt\", '%Y-%m') AS month, COUNT(*) AS new_persons FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"createdAt\" >= CURRENT_DATE - INTERVAL '12 months' GROUP BY month ORDER BY month",
      "mapping": { "xAxis": "month", "yAxis": ["new_persons"] },
      "size": "half"
    },
    {
      "id": "new_companies",
      "title": "每月新增公司",
      "type": "area",
      "sql": "SELECT strftime(\"createdAt\", '%Y-%m') AS month, COUNT(*) AS new_companies FROM ycrm.<SCHEMA>.company WHERE \"deletedAt\" IS NULL AND \"createdAt\" >= CURRENT_DATE - INTERVAL '12 months' GROUP BY month ORDER BY month",
      "mapping": { "xAxis": "month", "yAxis": ["new_companies"] },
      "size": "half"
    }
  ]
}
```

### 2.3 客戶城市分佈（圓餅圖）

```report-json
{
  "version": 1,
  "title": "客戶城市分佈",
  "panels": [
    {
      "id": "person_city",
      "title": "聯絡人按城市分佈",
      "type": "pie",
      "sql": "SELECT CASE WHEN city = '' THEN '未填寫' ELSE COALESCE(city, '未填寫') END AS city_name, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL GROUP BY city_name ORDER BY count DESC LIMIT 10",
      "mapping": { "nameKey": "city_name", "valueKey": "count" },
      "size": "half"
    }
  ]
}
```

### 2.4 公司規模分佈（長條圖）

```report-json
{
  "version": 1,
  "title": "公司規模分佈",
  "panels": [
    {
      "id": "company_size",
      "title": "公司員工人數區間",
      "type": "bar",
      "sql": "SELECT CASE WHEN employees IS NULL OR employees = 0 THEN '未填寫' WHEN employees <= 10 THEN '1-10' WHEN employees <= 50 THEN '11-50' WHEN employees <= 200 THEN '51-200' WHEN employees <= 1000 THEN '201-1000' ELSE '1000+' END AS size_range, COUNT(*) AS count FROM ycrm.<SCHEMA>.company WHERE \"deletedAt\" IS NULL GROUP BY size_range ORDER BY count DESC",
      "mapping": { "xAxis": "size_range", "yAxis": ["count"] },
      "size": "half"
    }
  ]
}
```

---

## 3. LINE 分析

### 3.1 LINE 好友狀態分佈（甜甜圈圖）

```report-json
{
  "version": 1,
  "title": "LINE 好友狀態",
  "panels": [
    {
      "id": "line_status",
      "title": "LINE 好友狀態分佈",
      "type": "donut",
      "sql": "SELECT \"lineStatus\" AS status, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY \"lineStatus\"",
      "mapping": { "nameKey": "status", "valueKey": "count" },
      "size": "half"
    }
  ]
}
```

### 3.2 LINE 對話指派分佈（長條圖）

```report-json
{
  "version": 1,
  "title": "LINE 對話指派",
  "panels": [
    {
      "id": "line_assignee",
      "title": "各客服指派數量",
      "type": "bar",
      "sql": "SELECT CASE WHEN \"lineAssigneeName\" IS NULL OR \"lineAssigneeName\" = '' THEN '未指派' ELSE \"lineAssigneeName\" END AS assignee, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY assignee ORDER BY count DESC",
      "mapping": { "xAxis": "assignee", "yAxis": ["count"] },
      "size": "half"
    }
  ]
}
```

### 3.3 LINE 未讀訊息排行（長條圖）

```report-json
{
  "version": 1,
  "title": "LINE 未讀訊息排行",
  "panels": [
    {
      "id": "line_unread_top",
      "title": "未讀最多的聯絡人 (Top 15)",
      "type": "bar",
      "sql": "SELECT COALESCE(\"nameLastName\", '') || COALESCE(\"nameFirstName\", '') AS name, \"lineUnreadCount\" AS unread FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUnreadCount\" > 0 ORDER BY \"lineUnreadCount\" DESC LIMIT 15",
      "mapping": { "xAxis": "name", "yAxis": ["unread"] },
      "size": "full"
    }
  ]
}
```

### 3.4 LINE 對話狀態概覽（甜甜圈圖）

```report-json
{
  "version": 1,
  "title": "LINE 對話狀態",
  "panels": [
    {
      "id": "line_thread_status",
      "title": "對話狀態分佈",
      "type": "donut",
      "sql": "SELECT CASE WHEN \"lineThreadStatus\" IS NULL THEN '無對話' ELSE \"lineThreadStatus\" END AS status, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY status",
      "mapping": { "nameKey": "status", "valueKey": "count" },
      "size": "half"
    }
  ]
}
```

### 3.5 LINE 訊息類型分佈（圓餅圖）

需要 `IS_LINE_CHAT_ENABLED` feature flag 啟用。查詢 `lineChatMessage` 表。

```report-json
{
  "version": 1,
  "title": "LINE 訊息類型分佈",
  "panels": [
    {
      "id": "line_msg_type",
      "title": "各類型訊息比例",
      "type": "pie",
      "sql": "SELECT \"messageType\" AS name, COUNT(*) AS value FROM ycrm.<SCHEMA>.\"lineChatMessage\" WHERE \"deletedAt\" IS NULL GROUP BY \"messageType\" ORDER BY value DESC",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    },
    {
      "id": "line_msg_direction",
      "title": "收發訊息比例",
      "type": "donut",
      "sql": "SELECT CASE WHEN direction = 'INCOMING' THEN '收到' ELSE '發出' END AS name, COUNT(*) AS value FROM ycrm.<SCHEMA>.\"lineChatMessage\" WHERE \"deletedAt\" IS NULL GROUP BY direction",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    }
  ]
}
```

### 3.6 LINE 每日訊息量趨勢（折線圖）

```report-json
{
  "version": 1,
  "title": "LINE 每日訊息量",
  "panels": [
    {
      "id": "line_daily_msgs",
      "title": "近 30 天每日訊息量",
      "type": "line",
      "sql": "SELECT strftime(\"sentAt\", '%Y-%m-%d') AS day, COUNT(*) FILTER (WHERE direction = 'INCOMING') AS incoming, COUNT(*) FILTER (WHERE direction = 'OUTGOING') AS outgoing FROM ycrm.<SCHEMA>.\"lineChatMessage\" WHERE \"deletedAt\" IS NULL AND \"sentAt\" >= CURRENT_DATE - INTERVAL '30 days' GROUP BY day ORDER BY day",
      "mapping": { "xAxis": "day", "yAxis": ["incoming", "outgoing"] },
      "size": "full"
    }
  ]
}
```

---

## 4. 工作區管理

### 4.1 各工作區成員數（長條圖）

此查詢使用 `core` schema，不需替換 `<SCHEMA>`。

```report-json
{
  "version": 1,
  "title": "各工作區成員數",
  "panels": [
    {
      "id": "ws_members",
      "title": "工作區成員人數",
      "type": "bar",
      "sql": "SELECT w.\"displayName\" AS workspace, COUNT(uw.id) AS members FROM ycrm.core.workspace w LEFT JOIN ycrm.core.\"userWorkspace\" uw ON w.id = uw.\"workspaceId\" AND uw.\"deletedAt\" IS NULL WHERE w.\"deletedAt\" IS NULL GROUP BY w.\"displayName\" ORDER BY members DESC",
      "mapping": { "xAxis": "workspace", "yAxis": ["members"] },
      "size": "full"
    }
  ]
}
```

### 4.2 各工作區記錄數對比

需要針對每個工作區分別查詢後用 UNION ALL 合併。以下是單一工作區的查詢模板：

```sql
SELECT '<WORKSPACE_NAME>' AS workspace,
  (SELECT COUNT(*) FROM ycrm.<SCHEMA>.person WHERE "deletedAt" IS NULL) AS persons,
  (SELECT COUNT(*) FROM ycrm.<SCHEMA>.company WHERE "deletedAt" IS NULL) AS companies,
  (SELECT COUNT(*) FROM ycrm.<SCHEMA>.opportunity WHERE "deletedAt" IS NULL) AS opportunities
```

多工作區合併範例：

```report-json
{
  "version": 1,
  "title": "工作區記錄數對比",
  "panels": [
    {
      "id": "ws_records",
      "title": "各工作區資料量",
      "type": "bar",
      "sql": "SELECT 'Y-CRM' AS workspace, (SELECT COUNT(*) FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.person WHERE \"deletedAt\" IS NULL) AS persons, (SELECT COUNT(*) FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.company WHERE \"deletedAt\" IS NULL) AS companies UNION ALL SELECT 'HOPET', (SELECT COUNT(*) FROM ycrm.workspace_5sgeef4h8tfcbqihsmg9numuh.person WHERE \"deletedAt\" IS NULL), (SELECT COUNT(*) FROM ycrm.workspace_5sgeef4h8tfcbqihsmg9numuh.company WHERE \"deletedAt\" IS NULL)",
      "mapping": { "xAxis": "workspace", "yAxis": ["persons", "companies"] },
      "size": "full"
    }
  ]
}
```

> 注意：實際使用時，先查詢 `ycrm.core.workspace` 取得所有工作區 schema，再動態組合 UNION ALL。

---

## 5. 任務分析

### 5.1 任務狀態分佈（圓餅圖）

```report-json
{
  "version": 1,
  "title": "任務狀態總覽",
  "panels": [
    {
      "id": "task_status",
      "title": "任務狀態分佈",
      "type": "pie",
      "sql": "SELECT COALESCE(status, '無狀態') AS name, COUNT(*) AS value FROM ycrm.<SCHEMA>.task WHERE \"deletedAt\" IS NULL GROUP BY name",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    }
  ]
}
```

### 5.2 任務到期日分析（長條圖）

```report-json
{
  "version": 1,
  "title": "任務到期分析",
  "panels": [
    {
      "id": "task_due",
      "title": "逾期 vs 未逾期",
      "type": "bar",
      "sql": "SELECT CASE WHEN \"dueAt\" < CURRENT_TIMESTAMP AND status != 'DONE' THEN '已逾期' WHEN \"dueAt\" IS NULL THEN '無截止日' WHEN status = 'DONE' THEN '已完成' ELSE '正常' END AS due_status, COUNT(*) AS count FROM ycrm.<SCHEMA>.task WHERE \"deletedAt\" IS NULL GROUP BY due_status",
      "mapping": { "xAxis": "due_status", "yAxis": ["count"] },
      "size": "half"
    }
  ]
}
```

### 5.3 每月任務建立量（折線圖）

```report-json
{
  "version": 1,
  "title": "每月任務建立量",
  "panels": [
    {
      "id": "task_monthly",
      "title": "近 12 個月任務建立趨勢",
      "type": "line",
      "sql": "SELECT strftime(\"createdAt\", '%Y-%m') AS month, COUNT(*) AS count FROM ycrm.<SCHEMA>.task WHERE \"deletedAt\" IS NULL AND \"createdAt\" >= CURRENT_DATE - INTERVAL '12 months' GROUP BY month ORDER BY month",
      "mapping": { "xAxis": "month", "yAxis": ["count"] },
      "size": "full"
    }
  ]
}
```

---

## 6. 綜合儀表板

### 6.1 業務總覽（多面板）

```report-json
{
  "version": 1,
  "title": "Y-CRM 業務總覽",
  "description": "客戶、商機、任務的關鍵指標一覽",
  "panels": [
    {
      "id": "overview_counts",
      "title": "各類記錄總數",
      "type": "bar",
      "sql": "SELECT '聯絡人' AS category, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL UNION ALL SELECT '公司', COUNT(*) FROM ycrm.<SCHEMA>.company WHERE \"deletedAt\" IS NULL UNION ALL SELECT '商機', COUNT(*) FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL UNION ALL SELECT '任務', COUNT(*) FROM ycrm.<SCHEMA>.task WHERE \"deletedAt\" IS NULL",
      "mapping": { "xAxis": "category", "yAxis": ["count"] },
      "size": "half"
    },
    {
      "id": "overview_opp_stage",
      "title": "商機階段",
      "type": "pie",
      "sql": "SELECT stage AS name, COUNT(*) AS value FROM ycrm.<SCHEMA>.opportunity WHERE \"deletedAt\" IS NULL GROUP BY stage",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    },
    {
      "id": "overview_line",
      "title": "LINE 好友狀態",
      "type": "donut",
      "sql": "SELECT \"lineStatus\" AS status, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY \"lineStatus\"",
      "mapping": { "nameKey": "status", "valueKey": "count" },
      "size": "half"
    },
    {
      "id": "overview_tasks",
      "title": "任務狀態",
      "type": "pie",
      "sql": "SELECT COALESCE(status, '無狀態') AS name, COUNT(*) AS value FROM ycrm.<SCHEMA>.task WHERE \"deletedAt\" IS NULL GROUP BY name",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    }
  ]
}
```

### 6.2 LINE 營運儀表板（多面板）

```report-json
{
  "version": 1,
  "title": "LINE 營運儀表板",
  "description": "LINE 好友、對話、訊息的即時狀態",
  "panels": [
    {
      "id": "line_dashboard_status",
      "title": "好友狀態",
      "type": "donut",
      "sql": "SELECT \"lineStatus\" AS status, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY \"lineStatus\"",
      "mapping": { "nameKey": "status", "valueKey": "count" },
      "size": "half"
    },
    {
      "id": "line_dashboard_thread",
      "title": "對話狀態",
      "type": "donut",
      "sql": "SELECT CASE WHEN \"lineThreadStatus\" IS NULL THEN '無對話' ELSE \"lineThreadStatus\" END AS status, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY status",
      "mapping": { "nameKey": "status", "valueKey": "count" },
      "size": "half"
    },
    {
      "id": "line_dashboard_assignee",
      "title": "指派分佈",
      "type": "bar",
      "sql": "SELECT CASE WHEN \"lineAssigneeName\" IS NULL OR \"lineAssigneeName\" = '' THEN '未指派' ELSE \"lineAssigneeName\" END AS assignee, COUNT(*) AS count FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUserId\" IS NOT NULL GROUP BY assignee ORDER BY count DESC",
      "mapping": { "xAxis": "assignee", "yAxis": ["count"] },
      "size": "half"
    },
    {
      "id": "line_dashboard_unread",
      "title": "未讀 Top 10",
      "type": "bar",
      "sql": "SELECT COALESCE(\"nameLastName\", '') || COALESCE(\"nameFirstName\", '') AS name, \"lineUnreadCount\" AS unread FROM ycrm.<SCHEMA>.person WHERE \"deletedAt\" IS NULL AND \"lineUnreadCount\" > 0 ORDER BY \"lineUnreadCount\" DESC LIMIT 10",
      "mapping": { "xAxis": "name", "yAxis": ["unread"] },
      "size": "half"
    }
  ]
}
```

---

## 7. 進階查詢片段

以下為不含 `report-json` 的實用查詢片段，可在回覆中直接使用或組合進面板。

### 7.1 商機 Pipeline 總金額

```sql
SELECT
  stage,
  COUNT(*) AS deal_count,
  ROUND(COALESCE(SUM("amountAmountMicros"), 0) / 1000000.0, 2) AS total_amount,
  "amountCurrencyCode" AS currency
FROM ycrm.<SCHEMA>.opportunity
WHERE "deletedAt" IS NULL
GROUP BY stage, "amountCurrencyCode"
ORDER BY total_amount DESC;
```

### 7.2 LINE 最近活躍好友

```sql
SELECT
  "nameLastName" || "nameFirstName" AS name,
  "lineDisplayName",
  "lineStatus",
  "lastLineInteractionAt",
  "lineUnreadCount"
FROM ycrm.<SCHEMA>.person
WHERE "deletedAt" IS NULL
  AND "lineUserId" IS NOT NULL
  AND "lastLineInteractionAt" IS NOT NULL
ORDER BY "lastLineInteractionAt" DESC
LIMIT 20;
```

### 7.3 無公司的聯絡人

```sql
SELECT
  "nameLastName" || "nameFirstName" AS name,
  "emailsPrimaryEmail" AS email,
  "jobTitle",
  city
FROM ycrm.<SCHEMA>.person
WHERE "deletedAt" IS NULL
  AND "companyId" IS NULL
ORDER BY "createdAt" DESC
LIMIT 50;
```

### 7.4 任務逾期清單

```sql
SELECT
  title,
  status,
  "dueAt",
  "assigneeId"
FROM ycrm.<SCHEMA>.task
WHERE "deletedAt" IS NULL
  AND "dueAt" < CURRENT_TIMESTAMP
  AND status != 'DONE'
ORDER BY "dueAt" ASC;
```

### 7.5 LINE 排程訊息（待發送）

```sql
SELECT
  m."textContent",
  m."scheduledAt",
  m."messageType",
  t."personId"
FROM ycrm.<SCHEMA>."lineChatMessage" m
JOIN ycrm.<SCHEMA>."lineChatThread" t ON m."threadId" = t.id
WHERE m."deletedAt" IS NULL
  AND m."scheduledAt" IS NOT NULL
  AND m."sentAt" IS NULL
ORDER BY m."scheduledAt" ASC;
```

### 7.6 工作區成員與角色

```sql
SELECT
  wm."nameFirstName",
  wm."nameLastName",
  wm."userEmail",
  wm."createdAt"
FROM ycrm.<SCHEMA>."workspaceMember" wm
WHERE wm."deletedAt" IS NULL
ORDER BY wm."createdAt";
```
