# Y-CRM 功能指南

> DenchClaw AI 參考文件
> 最後更新：2026-04-09
> 適用版本：Y-CRM v1（基於 Twenty CRM v1.18.0 fork + 客製功能）

本文件提供 Y-CRM 所有功能的實用操作指引。當使用者詢問「怎麼做 X」時，請參考對應章節回答。

---

## 1. CRM 核心功能

### 1.1 聯絡人（Person）

**主要欄位：**

| 欄位 | API 名稱 | 說明 |
|------|----------|------|
| 名字 | nameFirstName | 聯絡人名字 |
| 姓氏 | nameLastName | 聯絡人姓氏 |
| Email | emailsPrimaryEmail | 主要電子郵件 |
| 電話 | phonesPrimaryPhoneNumber | 主要電話 |
| 職稱 | jobTitle | 職位名稱 |
| 城市 | city | 所在城市 |
| 所屬公司 | companyId | 關聯的公司 |

**LINE 整合欄位（系統自動管理，UI 唯讀）：**

| 欄位 | API 名稱 | 說明 |
|------|----------|------|
| LINE User ID | lineUserId | LINE 使用者識別碼 |
| LINE 顯示名稱 | lineDisplayName | LINE 好友名稱，自動同步 |
| LINE 大頭貼 | lineProfilePictureUrl | LINE 好友頭像 URL |
| LINE 狀態 | lineStatus | ACTIVE（已加入）/ BLOCKED（已封鎖）/ UNLINKED（已解除） |
| 最後 LINE 互動 | lastLineInteractionAt | 最後一次 LINE 訊息時間 |
| LINE 未讀數 | lineUnreadCount | 未讀 LINE 訊息數量 |
| LINE 指派客服 | lineAssigneeName | 目前負責的客服人員名稱 |
| LINE 對話狀態 | lineThreadStatus | PENDING（待處理）/ RESOLVED（已解決） |

**操作方式：**

- **新增聯絡人**：按快捷鍵 `P` 或點擊列表上方的「+」按鈕，在列表頂部直接輸入姓名後按 Enter
- **行內編輯**：在列表頁直接點擊欄位值即可編輯，修改自動儲存
- **搜尋**：按 `Cmd+K` 或 `/` 開啟全域搜尋，可依姓名、Email、電話、職稱搜尋
- **合併**：選取多筆重複記錄後合併，系統會自動檢查 LINE 資料一致性
- **CSV 匯入**：點擊匯入按鈕 -> 上傳 CSV -> 對應欄位 -> 開始匯入
- **CSV 匯出**：設定篩選條件後點擊匯出按鈕，自動下載 CSV
- **刪除**：進入明細頁 -> 右上角三點選單 -> Delete（移至垃圾桶，可恢復）

**關聯物件：** 公司（Company）、商機（Opportunity）、任務（Task）、備忘錄（Note）、報價單（SalesQuote）、LINE 聊天執行緒（LineChatThread）

---

### 1.2 公司（Company）

**主要欄位：**

| 欄位 | API 名稱 | 說明 |
|------|----------|------|
| 公司名稱 | name | 公司全名，工作區內唯一 |
| 網域名稱 | domainNamePrimaryLinkUrl | 公司網站 URL，系統自動抓取圖示 |
| 員工人數 | employees | 公司規模 |
| 地址 | addressCity | 公司所在地址 |
| 年度營收 | annualRecurringRevenue | 年度循環營收（金額+幣別） |
| 理想客戶 | idealCustomerProfile | 是否為 ICP（布林值） |
| 負責人 | accountOwner | 負責業務人員 |

**操作方式：**

- **新增公司**：按快捷鍵 `C` 或點擊「+」，輸入公司名稱後按 Enter
- **重複偵測**：新增時系統自動檢查公司名稱或網域是否已存在
- **CSV 匯入/匯出**：與聯絡人操作方式相同

**關聯物件：** 聯絡人（People）、商機（Opportunities）、報價單（SalesQuotes）、任務（Tasks）、備忘錄（Notes）

---

### 1.3 商機（Opportunity）

**主要欄位：**

| 欄位 | API 名稱 | 說明 |
|------|----------|------|
| 商機名稱 | name | 必填，支援全文搜尋 |
| 金額 | amount | 預估成交金額（含幣別） |
| 預計成交日 | closeDate | 預計關閉日期 |
| 階段 | stage | 銷售階段 |
| 聯絡窗口 | pointOfContact | 關聯的聯絡人 |
| 公司 | company | 關聯的公司 |

**銷售階段：**

| 值 | 顯示名稱 | 顏色 |
|----|---------|------|
| NEW | New | 紅色 |
| SCREENING | Screening | 紫色 |
| MEETING | Meeting | 天藍色 |
| PROPOSAL | Proposal | 青綠色 |
| CUSTOMER | Customer | 黃色 |

**操作方式：**

- **新增商機**：按快捷鍵 `O` 或點擊「+」
- **看板檢視**：切換到 Kanban 視圖，拖曳商機卡片到不同階段欄位即可更新進度
- **表格檢視**：標準表格列表，支援篩選/排序

---

### 1.4 任務（Task）

**主要欄位：**

| 欄位 | API 名稱 | 說明 |
|------|----------|------|
| 標題 | title | 必填，支援全文搜尋 |
| 內容 | body | 富文字描述 |
| 到期日 | dueAt | 預計完成日期 |
| 狀態 | status | TODO / IN_PROGRESS / DONE |
| 指派人 | assignee | 負責的工作區成員 |

**操作方式：**

- **新增任務**：按快捷鍵 `T` 或點擊「+」
- **更新狀態**：點擊狀態欄位，選擇 TODO（待辦）、IN_PROGRESS（進行中）、DONE（已完成）
- **關聯記錄**：在明細頁 Relations 區塊點「+」，可關聯到公司、聯絡人、商機等任意記錄（taskTarget）

---

### 1.5 備忘錄（Note）

**主要欄位：**

| 欄位 | API 名稱 | 說明 |
|------|----------|------|
| 標題 | title | 備忘錄標題 |
| 內容 | body | 富文字內容 |

**操作方式：**

- **新增備忘錄**：按快捷鍵 `N` 或點擊「+」
- **富文字編輯**：支援段落、標題、列表、引用、粗體/斜體/底線、連結、程式碼區塊
- **關聯記錄**：在 Relations 區塊關聯到任意 CRM 記錄（noteTarget）

---

### 1.6 報價單（SalesQuote）-- Y-CRM 客製

**報價單欄位：**

| 欄位 | 說明 |
|------|------|
| quoteName | 報價名稱 |
| quoteNumber | 報價單號（如 Q-2026-001） |
| company | 關聯公司 |
| person | 關聯聯絡人 |
| totalAmount | 含稅總金額（系統自動計算） |

**報價細項（SalesQuoteLineItem）欄位：**

| 欄位 | 說明 |
|------|------|
| itemName | 產品/服務名稱 |
| quantity | 數量 |
| unitPrice | 單價 |
| amount | 細項小計（自動計算） |

**報價狀態**：DRAFT -> SENT -> ACCEPTED / REJECTED / EXPIRED

**操作方式：**

- **新增報價單**：按快捷鍵 `Q` 或點擊「+」
- **新增細項**：在報價單明細頁的細項區塊點「+」，填寫品項名稱、數量、單價
- **自動計算**：細項金額 = 單價 x 數量 x (1 - 折扣%)，總計 = 小計 + 稅金
- **匯出 PDF**：在明細頁更多選單中選擇 Export to PDF

---

## 2. 檢視與篩選

### 2.1 檢視模式

| 模式 | 說明 | 適用物件 |
|------|------|---------|
| 表格檢視（Table View） | 標準表格列表，支援欄位顯示/隱藏、欄寬調整 | 所有物件 |
| 看板檢視（Kanban View） | 卡片式拖拉管理，依分組欄位分類 | 商機（依階段）、任務（依狀態） |
| 日曆檢視（Calendar View） | 日曆呈現有日期欄位的記錄 | 有日期欄位的物件 |

### 2.2 篩選與排序

- **篩選（Filter）**：點擊篩選器圖示，選擇欄位 -> 設定條件 -> 支援 AND/OR 組合邏輯
- **排序（Sort）**：點擊排序圖示，選擇欄位 -> 正序（ASC）或逆序（DESC）
- **自訂檢視（Custom Views）**：設定好篩選+排序+欄位後，儲存為自訂檢視，日後可快速切換

### 2.3 全域搜尋

- **開啟方式**：按 `Cmd+K`（macOS）/ `Ctrl+K`（Windows）或 `/` 鍵
- **搜尋範圍**：跨所有物件（公司、聯絡人、商機、任務、備忘錄、報價單、自訂物件）
- **操作**：輸入關鍵字 -> 300ms 後自動搜尋 -> 用方向鍵選擇 -> Enter 跳轉

---

## 3. LINE 官方帳號整合（Y-CRM 核心差異化功能）

這是 Y-CRM 最重要的客製功能，將 LINE Official Account 的聊天能力嵌入 CRM，讓業務/客服人員無需離開 CRM 即可與客戶溝通。

### 3.1 頻道設定

**設定步驟：**

1. 登入 LINE Developers Console（https://developers.line.biz）
2. 建立或選擇 Messaging API Channel
3. 取得三項資訊：Channel ID、Channel Secret、Channel Access Token
4. 進入 Y-CRM：Settings -> Integrations -> LINE
5. 填入上述三項資訊
6. 點擊「Test Connection」驗證連線
7. 將 Y-CRM 產生的 Webhook URL 貼入 LINE Developers Console 的 Webhook settings
8. 在 LINE Developers Console 啟用 Webhook（Use webhook: ON）

**Webhook URL 格式**：`https://<your-domain>/api/v1/webhooks/line`

**安全機制：**
- 敏感資訊以 AES-256-CBC 加密儲存於 `workspace_config` 表
- Webhook 接收時使用 HMAC-SHA256 簽章驗證（防偽造）
- 冪等性檢查：Redis 60 秒 TTL 防重複處理

**workspace_config 儲存的 key：**

| Key | 加密 | 說明 |
|-----|------|------|
| line_channel_id | AES-256-CBC | Channel ID |
| line_channel_secret | AES-256-CBC | 用於簽章驗證 |
| line_channel_access_token | AES-256-CBC | API 呼叫憑證 |
| line_bot_user_id | 不加密 | Webhook 路由用 |

---

### 3.2 聯絡人同步

LINE 好友與 CRM 聯絡人的自動同步機制：

| 事件 | 系統行為 |
|------|---------|
| LINE 好友加入（follow） | 自動建立 Person，lineStatus 設為 ACTIVE |
| LINE 好友封鎖/取消關注（unfollow） | lineStatus 更新為 BLOCKED |
| LINE 好友傳送訊息（無對應 Person 時） | 自動從 LINE Profile 建立新 Person |
| 每次 LINE 訊息互動 | 更新 lastLineInteractionAt |

同步的欄位：lineDisplayName、lineProfilePictureUrl、lineStatus

所有 LINE 欄位標記為 `@WorkspaceIsFieldUIReadOnly`，使用者無法手動編輯。

---

### 3.3 LINE Chat 即時對話（付費功能，需啟用 IS_LINE_CHAT_ENABLED）

**位置**：聯絡人明細頁 -> LINE Chat 標籤頁

**支援的訊息類型：**

| 方向 | 文字 | 圖片 | 影片 | 音訊 | 檔案 | 貼圖 | 位置 |
|------|------|------|------|------|------|------|------|
| 接收（LINE -> CRM） | O | O | O | O | O | O | O |
| 發送（CRM -> LINE） | O | O | O | O | O | O | X |

**貼圖發送：**
- 3 個貼圖包：Brown & Cony、Brown & Friends、Bossy Bear
- 每包 24 個貼圖，共 72 個
- 使用 LINE CDN 渲染，零後端成本

**排程訊息（定時發送）：**

1. 在聊天輸入框旁點擊排程圖示
2. 選擇發送時間（預設為台北時間 +5 分鐘）
3. 輸入訊息內容，確認排程
4. 系統建立 BullMQ delayed job，時間到自動發送
5. 發送前可在訊息氣泡上點擊取消

**媒體訊息處理：**
- 接收：Worker 進程從 LINE 下載媒體 -> 本地儲存 -> JWT 簽名 URL 供前端存取
- 發送：Server 進程直接處理（圖片/影片/音訊用原生 API，檔案用 Flex Message 模擬）
- 儲存路徑：`workspace-{id}/line-chat-media/{uuid}.{ext}`

---

### 3.4 對話管理

**指派客服：**

1. 在 LINE Chat 介面上方點擊指派下拉選單
2. 選擇工作區成員
3. 系統更新 LineChatThread.assignee 並同步 Person.lineAssigneeName

**對話狀態：**

| 狀態 | 說明 | 觸發 |
|------|------|------|
| PENDING | 待處理 | 每次收到新訊息自動重置為 PENDING |
| RESOLVED | 已解決 | 客服手動標記為已解決 |

**已讀標記：**
- 呼叫 LINE Mark as Read API 向 LINE 用戶發送已讀回條
- 同時將 Person.lineUnreadCount 歸零
- 可在每個對話或整個工作區層級設定是否自動發送已讀

**反正規化欄位（供 People 列表篩選用）：**

使用者可在 People 列表頁建立自訂 View，利用以下欄位篩選：
- lineUnreadCount > 0 -> 篩選出有未讀訊息的客戶
- lineThreadStatus = PENDING -> 篩選出待處理的對話
- lineAssigneeName = "某客服" -> 篩選出指派給特定客服的客戶

---

### 3.5 自動回覆

**設定位置**：Settings -> LINE -> Auto Reply（路由：`/settings/workspace/line/auto-reply`）

**三種回覆模式：**

| 模式 | 行為 |
|------|------|
| manual | 不自動回覆，所有訊息由人工處理 |
| auto | 所有訊息觸發規則匹配 |
| scheduled | 僅在非營業時間觸發規則匹配 |

**三層優先級架構（由高到低）：**

| 優先級 | 層級 | 控制者 | 說明 |
|--------|------|--------|------|
| 最高 | Thread.replyMode | 客服人員（per-conversation） | 在聊天介面針對單一客戶設定 |
| 中 | 全域 replyMode | 管理員（per-workspace） | workspace_config 設定 |
| 最低 | 營業時間判斷 | 管理員 | 僅在 scheduled 模式下生效 |

**自動回覆規則（LineAutoReplyRule）：**

| 欄位 | 說明 |
|------|------|
| ruleType | KEYWORD（關鍵字匹配）或 DEFAULT_REPLY（預設回覆） |
| matchType | EXACT（完全匹配）或 CONTAINS（包含匹配） |
| keywords | JSON 陣列，如 `["hello","hi","你好"]` |
| priority | 數字越小優先級越高 |
| replyText | 回覆的文字內容 |
| isActive | 是否啟用 |

**營業時間設定：**

| 設定項目 | workspace_config key | 範例 |
|---------|---------------------|------|
| 營業開始 | line_business_hours_start | "09:00" |
| 營業結束 | line_business_hours_end | "18:00" |
| 時區 | line_business_hours_timezone | "Asia/Taipei" |
| 工作日 | line_business_hours_days | [1,2,3,4,5]（週一到週五） |

**自動回覆流程：**
1. 僅處理文字訊息（非文字訊息不觸發）
2. 檢查 Thread.replyMode -> MANUAL 跳過、AUTO 強制執行
3. 檢查全域 replyMode -> manual 跳過、auto 繼續、scheduled 看營業時間
4. 依 priority 順序匹配關鍵字規則
5. 無匹配 -> 查 DEFAULT_REPLY 規則 -> 查全域預設回覆文字
6. 找到回覆文字 -> 發送 replyTextMessage

---

### 3.6 工作流整合

在工作流中可使用「發送 LINE 訊息」動作步驟（SEND_LINE_MESSAGE）。

**設定方式：**
1. 在工作流編輯器中新增動作步驟
2. 選擇「Send LINE Message」
3. 設定目標聯絡人和訊息內容

**前提條件：**
- 目標 Person 必須有 lineUserId
- lineStatus 必須為 ACTIVE

**行為差異（依 Feature Flag）：**

| IS_LINE_CHAT_ENABLED | 行為 |
|----------------------|------|
| true | 推播訊息 + 建立 LineChatMessage 記錄 |
| false | 僅推播訊息，不留記錄 |

---

## 4. 工作流自動化

### 4.1 概述

- 視覺化流程編輯器（基於 React Flow）
- 版本管理：Draft（草稿）-> Active（啟用）-> Archived（封存）
- 執行引擎：BullMQ 佇列 -> Worker 進程逐步處理
- 狀態追蹤：每個步驟的 status/result/error 記錄在 WorkflowRun.state（JSONB）

### 4.2 觸發器（4 種）

| 觸發器 | 說明 | 設定項目 | 適用場景 |
|--------|------|---------|---------|
| Database Event | 記錄 created/updated/deleted 時觸發 | 目標物件、監聽欄位 | 新客戶自動分派、階段變更通知 |
| Cron Schedule | 定時自動執行 | Cron 表達式或每 N 分鐘/小時/天/週 | 每日報表、定期清理 |
| Manual | 使用者手動觸發 | 目標物件（選填） | 全域/單筆/批次記錄操作 |
| Webhook | 接收外部 HTTP 請求 | GET/POST，可設 API Key 驗證 | 外部系統對接 |

### 4.3 動作類型（16 種）

| 動作 | 說明 |
|------|------|
| Create Record | 自動建立 CRM 記錄 |
| Update Record | 自動更新欄位 |
| Delete Record | 自動刪除記錄 |
| Upsert Record | 存在則更新，不存在則建立 |
| Find Records | 依條件查詢記錄 |
| Send Email | 發送 Email 通知 |
| Draft Email | 建立 Email 草稿 |
| **Send LINE Message** | **發送 LINE 訊息（Y-CRM 獨有）** |
| HTTP Request | 呼叫外部 API（GET/POST/PUT/DELETE） |
| If-Else | 條件分支（走不同路徑） |
| Filter | JSON Logic 過濾條件 |
| Iterator | 迴圈處理陣列 |
| Delay | 等待指定時間 |
| Form | 暫停等待人工審核/填寫表單 |
| Code | 執行自訂 JavaScript |
| AI Agent | 呼叫 AI 智慧處理 |

### 4.4 建立工作流步驟

1. 左側選單點擊 Workflows，進入工作流列表
2. 點擊「+ New Workflow」建立新工作流，輸入名稱
3. 點擊「+ Add Trigger」選擇觸發器類型並設定
4. 點擊觸發器下方的「+」新增動作步驟
5. 每個步驟可引用前序步驟的輸出做為輸入（資料流水線）
6. 點擊「Test」測試執行
7. 確認無誤後點擊「Publish」啟用（狀態變為 ACTIVE）
8. 在 Runs 頁籤監控執行紀錄和每個步驟的結果

**注意：** 標準版使用者僅能執行管理員預建的工作流。自行建立/編輯工作流需要 WORKFLOWS 權限（進階自動化流程 DPA 付費功能）。

---

## 5. 儀表板與圖表

**操作步驟：**

1. 進入系統首頁（Dashboard）
2. 點擊「+ New Tab」建立新頁籤（如「銷售概覽」）
3. 點擊「+ Add Widget」新增小工具
4. 選擇小工具類型：
   - 資料類：VIEW（記錄列表）、FIELDS（欄位顯示）、GRAPH（圖表）
   - 活動類：TIMELINE、TASKS、NOTES、EMAILS、CALENDAR
   - 內容類：RICH_TEXT、IFRAME（嵌入外部頁面）、FILES
5. 拖曳調整小工具位置與大小

**圖表類型：**

| 類型 | 適用場景 |
|------|---------|
| 垂直/水平長條圖（Bar Chart） | 比較各類別數據 |
| 折線圖（Line Chart） | 時間序列趨勢 |
| 圓餅圖（Pie Chart） | 資料分佈比例 |
| 儀表板（Gauge） | 目標達成率 |
| 聚合數值（Aggregate） | KPI 計數/總和/平均值 |

**圖表設定**：選擇資料來源物件 -> 設定篩選條件 -> 選擇分組欄位 -> 選擇聚合方式 -> 預覽後儲存

---

## 6. Email 與行事曆

### 6.1 Gmail 同步

1. Settings -> Accounts -> Emails -> + Connect Account
2. 選擇 Google，完成 OAuth 授權
3. 設定同步範圍和可見性
4. 同步完成後，Email 往來記錄會顯示在聯絡人/公司明細頁的時間軸

### 6.2 Google Calendar 同步

1. Settings -> Accounts -> Calendars
2. 連結 Google 帳號並完成 OAuth 授權
3. 選擇要同步的日曆
4. 行事曆事件會顯示在聯絡人/公司明細頁

### 6.3 封鎖清單

Settings -> Accounts -> Blocklist，設定不同步的 Email 地址或網域

---

## 7. AI 功能（付費功能，需啟用 IS_AI_ENABLED）

| 功能 | 說明 |
|------|------|
| AI 對話助理（Ask AI） | 側邊欄 AI 對話，可查詢/建立/更新 CRM 資料 |
| AI Agent 管理 | 建立自訂 AI 代理，設定工具存取權限 |
| AI 發送 LINE 訊息 | AI 可代為發送 LINE 訊息（Y-CRM 獨有） |
| 工作流 AI 步驟 | 在工作流中加入 AI Agent 動作 |

**支援的 AI 模型：**

| 提供商 | 模型 |
|--------|------|
| OpenAI | GPT-4.1, o3, o4-mini |
| Anthropic | Claude Opus 4, Claude Sonnet 4 |
| xAI | Grok-3, Grok-4 |

---

## 8. 系統設定

### 8.1 個人設定

**路徑**：Settings -> Profile / Experience

| 設定項目 | 說明 |
|---------|------|
| 個人資料 | 姓名、頭像（JPG/PNG，上限 2MB）、密碼 |
| 雙因素認證（2FA） | TOTP（Google Authenticator 等），啟用後登入需輸入 6 位驗證碼 |
| 外觀 | 主題（Light/Dark/System）、語言、日期格式、時間格式、時區 |

### 8.2 工作區管理

**路徑**：Settings -> General / Members / Roles

| 設定項目 | 說明 |
|---------|------|
| 一般設定 | 工作區名稱、Logo、時區、認證方式（Google/Microsoft/Password） |
| 成員管理 | 邀請新成員（輸入 Email）、指派角色、移除成員 |
| 角色權限 | 建立自訂角色、設定 21 種功能權限旗標、物件層級讀寫權限 |
| 核准網域 | 設定可自動加入工作區的 Email 網域 |

**預設角色**：Owner、Admin、Member、Guest（均不可編輯/刪除）

**邀請成員步驟：**
1. Settings -> Members -> + Invite
2. 輸入 Email 地址
3. 選擇角色
4. 發送邀請

### 8.3 資料模型

**路徑**：Settings -> Data Model

| 功能 | 說明 |
|------|------|
| 自訂物件 | 建立新的業務物件（如產品、合約）：+ New Object -> 輸入名稱、標籤、圖示 |
| 自訂欄位 | 在任何物件上新增欄位：物件詳情頁 -> + New Field -> 選擇類型 |
| 物件關聯 | 新增 RELATION 類型欄位，選擇關聯目標物件和類型 |

**常用欄位類型：**

| 類型 | 說明 | 類型 | 說明 |
|------|------|------|------|
| TEXT | 文字 | SELECT | 單選下拉 |
| NUMBER | 數字 | MULTI_SELECT | 多選 |
| BOOLEAN | 布林 | CURRENCY | 貨幣（金額+幣別） |
| DATE_TIME | 日期時間 | RICH_TEXT | 富文本 |
| FULL_NAME | 全名 | RELATION | 物件關聯 |
| ADDRESS | 地址 | MORPH_RELATION | 多型關聯 |

### 8.4 安全

| 功能 | 說明 |
|------|------|
| Email + 密碼登入 | 標準認證方式 |
| Google/Microsoft OAuth | 第三方 OAuth 授權登入 |
| SSO（OIDC/SAML） | 企業級身分驗證，Settings -> Security -> + Add SSO Identity Provider |
| 2FA 強制 | 管理員可在 Settings -> General 啟用強制全工作區 2FA |

---

## 9. 管理員功能（Admin Panel）

需要 Super Admin 權限才能存取。

| 功能 | 說明 | 操作方式 |
|------|------|---------|
| 系統總覽 | 健康狀態、佇列指標 | Admin Panel -> Health Status |
| 使用者查找 | 跨工作區搜尋使用者 | User Lookup -> 輸入 Email |
| 模擬登入 | 以指定使用者身份登入排查問題 | 點擊 Impersonate -> 完成後 End Impersonation |
| 功能開關 | 為各工作區個別啟停功能 | 功能開關頁面 -> 切換開關 |
| 佇列監控 | BullMQ 佇列狀態、重試/刪除失敗任務 | Queue Metrics |
| 設定變數 | 查看/修改系統環境變數 | 設定變數管理 |

---

## 10. 快捷鍵參考

| 快捷鍵 | 功能 |
|--------|------|
| `C` | 新增公司 |
| `P` | 新增聯絡人 |
| `O` | 新增商機 |
| `T` | 新增任務 |
| `N` | 新增備忘錄 |
| `Q` | 新增報價單 |
| `/` 或 `Cmd+K` / `Ctrl+K` | 開啟全域搜尋 |
| `Esc` | 關閉對話框/面板 |
| `Enter` | 確認選擇 |
| `Up` / `Down` | 搜尋結果中上下移動 |

---

## 11. 功能分類速查表

| 功能類別 | 標準功能（免費） | 付費功能 |
|---------|----------------|---------|
| 客戶管理 | 聯絡人、公司、商機、任務、備忘錄、報價單、自訂物件/欄位 | -- |
| 檢視 | 表格、看板、日曆、篩選、排序、自訂檢視 | -- |
| Email | Gmail 同步、時間軸 | -- |
| 行事曆 | Google Calendar 同步 | -- |
| LINE 整合 | 頻道設定、聯絡人同步、工作流發訊息 | LINE Chat 即時對話、自動回覆 |
| 工作流 | 執行預建工作流 | 進階自動化（DPA）：自行建立/編輯工作流 |
| 儀表板 | 五種圖表、Widget | -- |
| AI | 名片辨識 | AI 對話、Agent、多模型 |
| 認證 | Email + 密碼、2FA、Google/Microsoft OAuth | SSO（OIDC/SAML） |
| API | REST + GraphQL + Webhook | -- |
| 管理 | 成員管理、角色權限 | -- |

---

## 12. 常見問題

| 問題 | 解決方式 |
|------|---------|
| 無法登入 | 確認 Email/密碼正確，或使用忘記密碼功能重設。2FA 驗證碼無效時確認手機時間同步 |
| CSV 匯入失敗 | 確認 UTF-8 編碼、逗號分隔、第一行為標題列 |
| LINE 好友資料未同步 | 確認 LINE Developers Console 的 Webhook URL 正確，Channel 資訊正確 |
| 欄位無法編輯 | LINE 欄位為系統自動管理（唯讀）；其他欄位確認角色權限 |
| 工作流未執行 | 確認工作流已 Publish 為 ACTIVE；在 Runs 頁籤查看錯誤訊息 |
| 刪除的記錄找不到 | 垃圾桶保留天數由管理員設定（預設 7 天），超過期限永久刪除 |
| 快捷鍵無反應 | 確認焦點不在輸入欄位中，點擊頁面空白處後重試 |
