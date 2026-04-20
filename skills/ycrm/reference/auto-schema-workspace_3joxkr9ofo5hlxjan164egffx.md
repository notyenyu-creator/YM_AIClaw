# 自動產生的 Schema Reference

> **此檔案由 `scan-schema.py` 自動產生，請勿手動編輯。**
> 重新掃描：`python3 scripts/scan-schema.py workspace_3joxkr9ofo5hlxjan164egffx`

- Schema: `workspace_3joxkr9ofo5hlxjan164egffx`
- 掃描時間: 2026-04-09 23:10:34
- 標準表: 31 張
- 自訂表: 4 張

---

## 標準表

### attachment

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| noteId | uuid | FK → note |
| opportunityId | uuid | FK → opportunity |
| personId | uuid | FK → person |
| taskId | uuid | FK → task |
| workflowId | uuid | FK → workflow |
| authorId | uuid | FK → ?（需探查） |
| rocketId | uuid | FK → ?（需探查） |
| petId | uuid | FK → ?（需探查） |
| surveyResultId | uuid | FK → ?（需探查） |
| quoteId | uuid | FK → ?（需探查） |
| fullPath | text |  |
| quotelineitemId | uuid | FK → ?（需探查） |
| salesQuoteId | uuid | FK → salesQuote |
| salesQuoteLineItemId | uuid | FK → salesQuoteLineItem |
| fileCategory | text |  |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |
| **yeJiMuBiaoId** | uuid | FK → workspaceMember?（業績目標） |
| type | text |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| dashboardId | uuid | FK → dashboard |

> **createdBySource 值**：`MANUAL`

### blocklist

| 欄位 | 型別 | 說明 |
|------|------|------|
| handle | text |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| workspaceMemberId | uuid | FK → workspaceMember |

### calendarChannel

| 欄位 | 型別 | 說明 |
|------|------|------|
| handle | text |  |
| syncStageStartedAt | timestamp with time zone |  |
| throttleFailureCount | double precision |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| connectedAccountId | uuid | FK → connectedAccount |
| syncStatus | USER-DEFINED |  |
| syncStage | USER-DEFINED |  |
| visibility | USER-DEFINED |  |
| isContactAutoCreationEnabled | boolean |  |
| contactAutoCreationPolicy | USER-DEFINED |  |
| isSyncEnabled | boolean |  |
| syncCursor | text |  |
| syncedAt | timestamp with time zone |  |

> **syncStatus 值**：`ACTIVE, FAILED_INSUFFICIENT_PERMISSIONS`

> **syncStage 值**：`CALENDAR_EVENT_LIST_FETCH_PENDING, FAILED`

> **visibility 值**：`METADATA, SHARE_EVERYTHING`

> **contactAutoCreationPolicy 值**：`AS_PARTICIPANT_AND_ORGANIZER`

### calendarChannelEventAssociation

| 欄位 | 型別 | 說明 |
|------|------|------|
| eventExternalId | text |  |
| recurringEventExternalId | text |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| calendarChannelId | uuid | FK → calendarChannel |
| calendarEventId | uuid | FK → calendarEvent |

### calendarEvent

| 欄位 | 型別 | 說明 |
|------|------|------|
| title | text | 標題 |
| iCalUID | text |  |
| conferenceSolution | text |  |
| conferenceLinkPrimaryLinkLabel | text |  |
| conferenceLinkPrimaryLinkUrl | text |  |
| conferenceLinkSecondaryLinks | jsonb |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| isCanceled | boolean |  |
| isFullDay | boolean |  |
| startsAt | timestamp with time zone |  |
| endsAt | timestamp with time zone |  |
| externalCreatedAt | timestamp with time zone |  |
| externalUpdatedAt | timestamp with time zone |  |
| description | text |  |
| location | text |  |

### calendarEventParticipant

| 欄位 | 型別 | 說明 |
|------|------|------|
| handle | text |  |
| personId | uuid | FK → person |
| workspaceMemberId | uuid | FK → workspaceMember |
| displayName | text |  |
| isOrganizer | boolean |  |
| responseStatus | USER-DEFINED |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| calendarEventId | uuid | FK → calendarEvent |

> **responseStatus 值**：`NEEDS_ACTION, ACCEPTED`

### company

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| xLinkPrimaryLinkUrl | text | X (Twitter) |
| xLinkSecondaryLinks | jsonb |  |
| annualRecurringRevenueAmountMicros | numeric | 年營收（÷1000000＝元） |
| annualRecurringRevenueCurrencyCode | text | 年營收幣別 |
| addressAddressStreet1 | text |  |
| addressAddressStreet2 | text |  |
| addressAddressCity | text |  |
| addressAddressPostcode | text |  |
| addressAddressState | text |  |
| addressAddressCountry | text |  |
| domainNamePrimaryLinkLabel | text |  |
| addressAddressLat | numeric |  |
| addressAddressLng | numeric |  |
| idealCustomerProfile | boolean | 理想客戶 |
| position | double precision | 排序 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |
| domainNamePrimaryLinkUrl | text | 網域 |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| accountOwnerId | uuid | FK → workspaceMember（帳戶擁有者） |
| tagline | text | 標語 |
| introVideoPrimaryLinkLabel | text |  |
| introVideoPrimaryLinkUrl | text |  |
| introVideoSecondaryLinks | jsonb |  |
| workPolicy | ARRAY | 工作政策 |
| visaSponsorship | boolean | 簽證贊助 |
| domainNameSecondaryLinks | jsonb | 其他網域 |
| companyId | uuid | FK → company |
| **yeWuFuZeRenId** | uuid | FK → workspaceMember（業務負責人） |
| **lianLuoDianHua** | text | 聯絡電話 |
| **yuanGongRenShu** | double precision | 員工人數 |
| **chuanZhen** | text | 傳真 |
| gongSiWangZhiPrimaryLinkLabel | text | 公司網址 |
| **gongSiWangZhiPrimaryLinkUrl** | text | 公司網址 |
| gongSiWangZhiSecondaryLinks | jsonb | 公司網址 |
| **gongSiTongBian** | text | 公司統編 |
| **ziBenEAmountMicros** | numeric | 資本額（÷1000000＝元） |
| employees | double precision | 員工數 |
| **ziBenECurrencyCode** | text | 資本額幣別 |
| linkedinLinkPrimaryLinkLabel | text |  |
| linkedinLinkPrimaryLinkUrl | text | LinkedIn |
| linkedinLinkSecondaryLinks | jsonb |  |
| xLinkPrimaryLinkLabel | text |  |

> **createdBySource 值**：`EMAIL, CALENDAR, MANUAL`

### connectedAccount

| 欄位 | 型別 | 說明 |
|------|------|------|
| handle | text |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| accountOwnerId | uuid | FK → workspaceMember（帳戶擁有者） |
| lastCredentialsRefreshedAt | timestamp with time zone |  |
| provider | text |  |
| accessToken | text |  |
| refreshToken | text |  |
| lastSyncHistoryId | text |  |
| authFailedAt | timestamp with time zone |  |
| handleAliases | text |  |
| scopes | ARRAY |  |
| connectionParameters | jsonb |  |

### dashboard

| 欄位 | 型別 | 說明 |
|------|------|------|
| title | text | 標題 |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| **fuZeYeWuFirstName** | text | 負責業務（名） |
| **fuZeYeWuLastName** | text | 負責業務（姓） |
| pageLayoutId | uuid | FK → pageLayout（版面） |
| position | double precision | 排序 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |

> **createdBySource 值**：`MANUAL`

### favorite

| 欄位 | 型別 | 說明 |
|------|------|------|
| position | double precision | 排序 |
| noteId | uuid | FK → note |
| opportunityId | uuid | FK → opportunity |
| personId | uuid | FK → person |
| taskId | uuid | FK → task |
| workflowId | uuid | FK → workflow |
| workflowRunId | uuid | FK → ?（需探查） |
| workflowVersionId | uuid | FK → workflowVersion |
| forWorkspaceMemberId | uuid | FK → ?（需探查） |
| rocketId | uuid | FK → ?（需探查） |
| petId | uuid | FK → ?（需探查） |
| viewId | uuid | FK → ?（需探查） |
| surveyResultId | uuid | FK → ?（需探查） |
| quoteId | uuid | FK → ?（需探查） |
| quotelineitemId | uuid | FK → ?（需探查） |
| salesQuoteId | uuid | FK → salesQuote |
| salesQuoteLineItemId | uuid | FK → salesQuoteLineItem |
| **yeJiMuBiaoId** | uuid | FK → workspaceMember?（業績目標） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| dashboardId | uuid | FK → dashboard |
| favoriteFolderId | uuid | FK → favoriteFolder |

### favoriteFolder

| 欄位 | 型別 | 說明 |
|------|------|------|
| position | double precision | 排序 |
| name | text | 名稱 |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |

### message

| 欄位 | 型別 | 說明 |
|------|------|------|
| headerMessageId | text |  |
| subject | text |  |
| text | text |  |
| receivedAt | timestamp with time zone |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| messageThreadId | uuid | FK → messageThread |

### messageChannel

| 欄位 | 型別 | 說明 |
|------|------|------|
| visibility | USER-DEFINED |  |
| syncCursor | text |  |
| syncedAt | timestamp with time zone |  |
| syncStatus | USER-DEFINED |  |
| syncStage | USER-DEFINED |  |
| syncStageStartedAt | timestamp with time zone |  |
| throttleFailureCount | double precision |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| handle | text |  |
| connectedAccountId | uuid | FK → connectedAccount |
| syncAllFolders | boolean |  |
| pendingGroupEmailsAction | USER-DEFINED |  |
| type | USER-DEFINED |  |
| isContactAutoCreationEnabled | boolean |  |
| contactAutoCreationPolicy | USER-DEFINED |  |
| messageFolderImportPolicy | USER-DEFINED |  |
| excludeNonProfessionalEmails | boolean |  |
| excludeGroupEmails | boolean |  |
| isSyncEnabled | boolean |  |

> **visibility 值**：`METADATA, SHARE_EVERYTHING`

> **syncStatus 值**：`ACTIVE, FAILED_INSUFFICIENT_PERMISSIONS`

> **syncStage 值**：`MESSAGE_LIST_FETCH_PENDING, FAILED`

> **pendingGroupEmailsAction 值**：`NONE`

> **type 值**：`email`

> **contactAutoCreationPolicy 值**：`SENT_AND_RECEIVED, SENT, NONE`

> **messageFolderImportPolicy 值**：`ALL_FOLDERS, SELECTED_FOLDERS`

### messageChannelMessageAssociation

| 欄位 | 型別 | 說明 |
|------|------|------|
| messageExternalId | text |  |
| messageThreadExternalId | text |  |
| direction | USER-DEFINED |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| messageId | uuid | FK → message |
| messageChannelId | uuid | FK → messageChannel |

> **direction 值**：`INCOMING, OUTGOING`

### messageFolder

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| messageChannelId | uuid | FK → messageChannel |
| pendingSyncAction | USER-DEFINED |  |
| parentFolderId | text |  |
| syncCursor | text |  |
| isSentFolder | boolean |  |
| isSynced | boolean |  |
| externalId | text |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |

> **pendingSyncAction 值**：`NONE`

### messageParticipant

| 欄位 | 型別 | 說明 |
|------|------|------|
| role | USER-DEFINED |  |
| workspaceMemberId | uuid | FK → workspaceMember |
| handle | text |  |
| displayName | text |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| messageId | uuid | FK → message |
| personId | uuid | FK → person |

> **role 值**：`from, to, cc`

### messageThread

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |

### note

| 欄位 | 型別 | 說明 |
|------|------|------|
| position | double precision | 排序 |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| title | text | 標題 |
| bodyV2Blocknote | text | 內容（BlockNote 格式） |
| bodyV2Markdown | text | 內容（Markdown 格式） |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |
| searchVector | tsvector | 搜尋向量（系統） |

> **createdBySource 值**：`MANUAL`

### noteTarget

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| petId | uuid | FK → ?（需探查） |
| surveyResultId | uuid | FK → ?（需探查） |
| quoteId | uuid | FK → ?（需探查） |
| quotelineitemId | uuid | FK → ?（需探查） |
| salesQuoteId | uuid | FK → salesQuote |
| salesQuoteLineItemId | uuid | FK → salesQuoteLineItem |
| **yeJiMuBiaoId** | uuid | FK → workspaceMember?（業績目標） |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| noteId | uuid | FK → note |
| opportunityId | uuid | FK → opportunity |
| personId | uuid | FK → person |
| rocketId | uuid | FK → ?（需探查） |

### opportunity

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| pointOfContactId | uuid | FK → person（聯繫人） |
| opportunityId | uuid | FK → opportunity |
| **fuZeYeWuId** | uuid | FK → workspaceMember（負責業務） |
| **fuZeYeWuTuBiaoXianShiYong** | text | 負責業務（圖表顯示用，存人名字串） |
| amountAmountMicros | numeric | 金額（÷1000000＝元） |
| stage | USER-DEFINED | 階段 |
| **chengAnLu** | USER-DEFINED | 成案率 |
| **yuJiJieDanRiQi** | date | 預計接單日期 |
| **shuoMing** | text | 說明 |
| amountCurrencyCode | text | 幣別 |
| closeDate | timestamp with time zone | 預計關閉日 |
| position | double precision | 排序 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

> **stage 值**：`OPT0_XU_QIU_QUE_REN, OPT1_ZHUN_BEI_TI_AN, OPT2_YI_BAO_JIA, OPT4_HE_YUE_QIAN_SHU_ZHONG, OPT5_YI_CHENG_JIAO_CLOSED_WON, OPT6_WEI_CHENG_JIAO_CLOSED_LOST`

> **chengAnLu 值**：`OPT1_90_YI_SHANG, OPT2_60_90, OPT3_60_YI_XIA, OPT4_YI_CHENG_JIAO, OPT5_LOST`

> **createdBySource 值**：`MANUAL`

### person

| 欄位 | 型別 | 說明 |
|------|------|------|
| nameFirstName | text | 名 |
| xLinkSecondaryLinks | jsonb |  |
| jobTitle | text | 職稱 |
| phonesPrimaryPhoneNumber | text | 主要電話 |
| phonesPrimaryPhoneCountryCode | text | 國碼 |
| phonesPrimaryPhoneCallingCode | text | 來電號碼 |
| phonesAdditionalPhones | jsonb | 其他電話 |
| city | text | 城市 |
| avatarUrl | text | 頭像 |
| position | double precision | 排序 |
| createdBySource | USER-DEFINED | 建立來源 |
| nameLastName | text | 姓 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| intro | text | 簡介 |
| emailsPrimaryEmail | text | 主要 Email |
| whatsappPrimaryPhoneNumber | text |  |
| whatsappPrimaryPhoneCountryCode | text |  |
| whatsappPrimaryPhoneCallingCode | text |  |
| whatsappAdditionalPhones | jsonb |  |
| workPreference | ARRAY |  |
| performanceRating | USER-DEFINED | 績效評級 |
| **renYuanId** | uuid | FK → 自訂物件（人員） |
| **lineId** | text | LINE ID |
| **lianLuoDianHuaFenJi** | text | 聯絡電話分機 |
| **yuanGong** | USER-DEFINED | 員工（身份） |
| emailsAdditionalEmails | jsonb | 其他 Email |
| line | text |  |
| shouJiHaoMaPrimaryPhoneNumber | text | 手機號碼 |
| shouJiHaoMaPrimaryPhoneCountryCode | text | 手機號碼 |
| shouJiHaoMaPrimaryPhoneCallingCode | text | 手機號碼 |
| shouJiHaoMaAdditionalPhones | jsonb | 手機號碼 |
| lineUserId | text | LINE User ID（系統自動） |
| lineDisplayName | text | LINE 顯示名稱 |
| lineProfilePictureUrl | text | LINE 頭像（系統自動） |
| lineStatus | USER-DEFINED | LINE 狀態 |
| lastLineInteractionAt | timestamp with time zone | 最後 LINE 互動 |
| linkedinLinkPrimaryLinkLabel | text |  |
| dianZiYouJianEmailPrimaryEmail | text |  |
| dianZiYouJianEmailAdditionalEmails | jsonb | 電子郵件 |
| linkedinLinkPrimaryLinkUrl | text | LinkedIn |
| linkedinLinkSecondaryLinks | jsonb |  |
| xLinkPrimaryLinkLabel | text |  |
| xLinkPrimaryLinkUrl | text | X (Twitter) |

> **createdBySource 值**：`EMAIL, IMPORT, MANUAL`

> **performanceRating 值**：`RATING_5`

> **yuanGong 值**：`SOU_JI_JIN_LAI_SHANG_WEI_GUO_LU, GUO_LU_HOU`

> **lineStatus 值**：`unlinked`

### salesQuote

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| baoJiaDanHao | text |  |
| mingCheng | text |  |
| baoJiaRiQi | timestamp with time zone |  |
| jieZhiRiQi | timestamp with time zone |  |
| companyId | uuid | FK → company |
| contactId | uuid | FK → ?（需探查） |
| opportunityId | uuid | FK → opportunity |
| **xiaoJiAmountMicros** | numeric | 小計（÷1000000＝元） |
| name | text | 名稱 |
| **xiaoJiCurrencyCode** | text | 小計幣別 |
| shuiLu | double precision |  |
| shuiJinAmountMicros | numeric |  |
| shuiJinCurrencyCode | text |  |
| zongJiAmountMicros | numeric |  |
| zongJiCurrencyCode | text |  |
| baoJiaDanZhuangTai | USER-DEFINED |  |
| **jiaoYiTiaoJian** | text | 交易條件 |
| **beiZhu** | text | 備註 |
| **fuZeYeWuId** | uuid | FK → workspaceMember（負責業務） |
| createdAt | timestamp with time zone | 建立時間 |
| jiaoYiTiaoJianBlocknote | text | 交易條件（Blocknote 格式） |
| jiaoYiTiaoJianMarkdown | text | 交易條件（Markdown 格式） |
| beiZhuBlocknote | text | 備註（Blocknote 格式） |
| beiZhuMarkdown | text | 備註（Markdown 格式） |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

### salesQuoteLineItem

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| salesQuoteId | uuid | FK → salesQuote |
| chanPinMingCheng | text |  |
| baoJiaDanXiXiangMiaoShu | text |  |
| **shuLiang** | double precision | 數量 |
| **danJiaAmountMicros** | numeric | 單價（÷1000000＝元） |
| **danJiaCurrencyCode** | text | 單價幣別 |
| zheKou | double precision |  |
| jinEAmountMicros | numeric |  |
| name | text | 名稱 |
| jinECurrencyCode | text |  |
| baoJiaDanXiXiangGuanLianId | uuid | FK → ?（需探查） |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

### task

| 欄位 | 型別 | 說明 |
|------|------|------|
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| assigneeId | uuid | FK → workspaceMember（指派人） |
| status | USER-DEFINED | 狀態 |
| title | text | 標題 |
| bodyV2Blocknote | text | 內容（BlockNote 格式） |
| bodyV2Markdown | text | 內容（Markdown 格式） |
| dueAt | timestamp with time zone | 截止日 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

> **status 值**：`TODO, JIN_XING_ZHONG, YI_WAN_CHENG, SHANG_WEI_ZHI_PAI`

> **createdBySource 值**：`IMPORT, MANUAL`

### taskTarget

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| petId | uuid | FK → ?（需探查） |
| surveyResultId | uuid | FK → ?（需探查） |
| quoteId | uuid | FK → ?（需探查） |
| quotelineitemId | uuid | FK → ?（需探查） |
| salesQuoteId | uuid | FK → salesQuote |
| salesQuoteLineItemId | uuid | FK → salesQuoteLineItem |
| **yeJiMuBiaoId** | uuid | FK → workspaceMember?（業績目標） |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| opportunityId | uuid | FK → opportunity |
| personId | uuid | FK → person |
| taskId | uuid | FK → task |
| rocketId | uuid | FK → ?（需探查） |

### timelineActivity

| 欄位 | 型別 | 說明 |
|------|------|------|
| happensAt | timestamp with time zone |  |
| deletedAt | timestamp with time zone | 軟刪除 |
| companyId | uuid | FK → company |
| dashboardId | uuid | FK → dashboard |
| noteId | uuid | FK → note |
| opportunityId | uuid | FK → opportunity |
| personId | uuid | FK → person |
| taskId | uuid | FK → task |
| workflowId | uuid | FK → workflow |
| workflowRunId | uuid | FK → ?（需探查） |
| workflowVersionId | uuid | FK → workflowVersion |
| name | text | 名稱 |
| workspaceMemberId | uuid | FK → workspaceMember |
| rocketId | uuid | FK → ?（需探查） |
| petId | uuid | FK → ?（需探查） |
| surveyResultId | uuid | FK → ?（需探查） |
| quoteId | uuid | FK → ?（需探查） |
| quotelineitemId | uuid | FK → ?（需探查） |
| salesQuoteId | uuid | FK → salesQuote |
| salesQuoteLineItemId | uuid | FK → salesQuoteLineItem |
| **yeJiMuBiaoId** | uuid | FK → workspaceMember?（業績目標） |
| properties | jsonb |  |
| linkedRecordCachedName | text |  |
| linkedRecordId | uuid | FK → ?（需探查） |
| linkedObjectMetadataId | uuid | FK → ?（需探查） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |

### workflow

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| lastPublishedVersionId | text |  |
| statuses | ARRAY |  |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

> **createdBySource 值**：`MANUAL`

### workflowAutomatedTrigger

| 欄位 | 型別 | 說明 |
|------|------|------|
| type | USER-DEFINED |  |
| settings | jsonb |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| workflowId | uuid | FK → workflow |

> **type 值**：`DATABASE_EVENT, CRON`

### workflowRun

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| state | jsonb |  |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| workflowId | uuid | FK → workflow |
| workflowVersionId | uuid | FK → workflowVersion |
| enqueuedAt | timestamp with time zone |  |
| startedAt | timestamp with time zone |  |
| endedAt | timestamp with time zone |  |
| status | USER-DEFINED | 狀態 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

> **status 值**：`RUNNING, COMPLETED, FAILED`

> **createdBySource 值**：`WORKFLOW, MANUAL`

### workflowVersion

| 欄位 | 型別 | 說明 |
|------|------|------|
| name | text | 名稱 |
| deletedAt | timestamp with time zone | 軟刪除 |
| workflowId | uuid | FK → workflow |
| trigger | jsonb |  |
| steps | jsonb |  |
| status | USER-DEFINED | 狀態 |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |

> **status 值**：`DRAFT, ACTIVE, ARCHIVED`

### workspaceMember

| 欄位 | 型別 | 說明 |
|------|------|------|
| position | double precision | 排序 |
| timeZone | text |  |
| dateFormat | USER-DEFINED |  |
| timeFormat | USER-DEFINED |  |
| searchVector | tsvector | 搜尋向量（系統） |
| numberFormat | USER-DEFINED |  |
| id | uuid | ID |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| yeWuId | uuid | FK → ?（需探查） |
| nameFirstName | text | 名 |
| nameLastName | text | 姓 |
| colorScheme | text |  |
| locale | text |  |
| avatarUrl | text | 頭像 |
| userEmail | text |  |
| calendarStartDay | double precision |  |
| userId | uuid | FK → core.user |

> **dateFormat 值**：`SYSTEM, MONTH_FIRST`

> **timeFormat 值**：`SYSTEM, HOUR_24`

> **numberFormat 值**：`SYSTEM`

---

## 自訂物件表（_ 開頭）

### _pet

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| species | USER-DEFINED |  |
| traits | ARRAY |  |
| comments | text |  |
| age | double precision |  |
| locationAddressStreet1 | text |  |
| locationAddressStreet2 | text |  |
| locationAddressCity | text |  |
| locationAddressPostcode | text |  |
| name | text | 名稱 |
| locationAddressState | text |  |
| locationAddressCountry | text |  |
| locationAddressLat | numeric |  |
| locationAddressLng | numeric |  |
| vetPhonePrimaryPhoneNumber | text |  |
| vetPhonePrimaryPhoneCountryCode | text |  |
| vetPhonePrimaryPhoneCallingCode | text |  |
| vetPhoneAdditionalPhones | jsonb |  |
| vetEmailPrimaryEmail | text |  |
| vetEmailAdditionalEmails | jsonb |  |
| createdAt | timestamp with time zone | 建立時間 |
| birthday | date |  |
| isGoodWithKids | boolean |  |
| picturesPrimaryLinkLabel | text |  |
| picturesPrimaryLinkUrl | text |  |
| picturesSecondaryLinks | jsonb |  |
| averageCostOfKibblePerMonthAmountMicros | numeric |  |
| averageCostOfKibblePerMonthCurrencyCode | text |  |
| makesOwnerThinkOfFirstName | text |  |
| makesOwnerThinkOfLastName | text |  |
| soundSwag | USER-DEFINED |  |
| updatedAt | timestamp with time zone | 更新時間 |
| bio | text |  |
| interestingFacts | ARRAY |  |
| extraData | jsonb |  |
| ownerSurveyResultId | uuid | FK → ?（需探查） |
| ownerRocketId | uuid | FK → ?（需探查） |
| deletedAt | timestamp with time zone | 軟刪除 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

### _rocket

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| helpedById | uuid | FK → ?（需探查） |
| name | text | 名稱 |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

### _surveyResult

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| score | double precision |  |
| percentageOfCompletion | double precision |  |
| participants | double precision |  |
| averageEstimatedNumberOfAtomsInTheUniverse | double precision |  |
| comments | text |  |
| shortNotes | text |  |
| helpedById | uuid | FK → ?（需探查） |
| name | text | 名稱 |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

### _yeJiMuBiao

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | ID |
| position | double precision | 排序 |
| searchVector | tsvector | 搜尋向量（系統） |
| jiDu | USER-DEFINED |  |
| muBiaoJinEAmountMicros | numeric |  |
| muBiaoJinECurrencyCode | text |  |
| nianDu | USER-DEFINED |  |
| name | text | 名稱 |
| createdAt | timestamp with time zone | 建立時間 |
| updatedAt | timestamp with time zone | 更新時間 |
| deletedAt | timestamp with time zone | 軟刪除 |
| createdBySource | USER-DEFINED | 建立來源 |
| createdByWorkspaceMemberId | uuid | 建立者 member ID |
| createdByName | text | ⚠️ 記錄建立者（≠負責人） |
| createdByContext | jsonb | 建立上下文 |

---

## 外鍵關聯總表

以下為所有 UUID 型 `xxxId` 欄位（外鍵關聯）：

| 來源表 | FK 欄位 | 目標 |
|--------|---------|------|
| attachment | noteId | → note |
| attachment | opportunityId | → opportunity |
| attachment | personId | → person |
| attachment | taskId | → task |
| attachment | workflowId | → workflow |
| attachment | authorId | → ?（需探查） |
| attachment | rocketId | → ?（需探查） |
| attachment | petId | → ?（需探查） |
| attachment | surveyResultId | → ?（需探查） |
| attachment | quoteId | → ?（需探查） |
| attachment | quotelineitemId | → ?（需探查） |
| attachment | salesQuoteId | → salesQuote |
| attachment | salesQuoteLineItemId | → salesQuoteLineItem |
| attachment | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| attachment | yeJiMuBiaoId | → workspaceMember?（業績目標） |
| attachment | companyId | → company |
| attachment | dashboardId | → dashboard |
| blocklist | workspaceMemberId | → workspaceMember |
| calendarChannel | connectedAccountId | → connectedAccount |
| calendarChannelEventAssociation | calendarChannelId | → calendarChannel |
| calendarChannelEventAssociation | calendarEventId | → calendarEvent |
| calendarEventParticipant | personId | → person |
| calendarEventParticipant | workspaceMemberId | → workspaceMember |
| calendarEventParticipant | calendarEventId | → calendarEvent |
| company | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| company | accountOwnerId | → workspaceMember（帳戶擁有者） |
| company | companyId | → company |
| company | yeWuFuZeRenId | → workspaceMember（業務負責人） |
| connectedAccount | accountOwnerId | → workspaceMember（帳戶擁有者） |
| dashboard | pageLayoutId | → pageLayout（版面） |
| dashboard | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| favorite | noteId | → note |
| favorite | opportunityId | → opportunity |
| favorite | personId | → person |
| favorite | taskId | → task |
| favorite | workflowId | → workflow |
| favorite | workflowRunId | → ?（需探查） |
| favorite | workflowVersionId | → workflowVersion |
| favorite | forWorkspaceMemberId | → ?（需探查） |
| favorite | rocketId | → ?（需探查） |
| favorite | petId | → ?（需探查） |
| favorite | viewId | → ?（需探查） |
| favorite | surveyResultId | → ?（需探查） |
| favorite | quoteId | → ?（需探查） |
| favorite | quotelineitemId | → ?（需探查） |
| favorite | salesQuoteId | → salesQuote |
| favorite | salesQuoteLineItemId | → salesQuoteLineItem |
| favorite | yeJiMuBiaoId | → workspaceMember?（業績目標） |
| favorite | companyId | → company |
| favorite | dashboardId | → dashboard |
| favorite | favoriteFolderId | → favoriteFolder |
| message | messageThreadId | → messageThread |
| messageChannel | connectedAccountId | → connectedAccount |
| messageChannelMessageAssociation | messageId | → message |
| messageChannelMessageAssociation | messageChannelId | → messageChannel |
| messageFolder | messageChannelId | → messageChannel |
| messageParticipant | workspaceMemberId | → workspaceMember |
| messageParticipant | messageId | → message |
| messageParticipant | personId | → person |
| note | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| noteTarget | petId | → ?（需探查） |
| noteTarget | surveyResultId | → ?（需探查） |
| noteTarget | quoteId | → ?（需探查） |
| noteTarget | quotelineitemId | → ?（需探查） |
| noteTarget | salesQuoteId | → salesQuote |
| noteTarget | salesQuoteLineItemId | → salesQuoteLineItem |
| noteTarget | yeJiMuBiaoId | → workspaceMember?（業績目標） |
| noteTarget | companyId | → company |
| noteTarget | noteId | → note |
| noteTarget | opportunityId | → opportunity |
| noteTarget | personId | → person |
| noteTarget | rocketId | → ?（需探查） |
| opportunity | companyId | → company |
| opportunity | pointOfContactId | → person（聯繫人） |
| opportunity | opportunityId | → opportunity |
| opportunity | fuZeYeWuId | → workspaceMember（負責業務） |
| opportunity | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| person | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| person | companyId | → company |
| person | renYuanId | → 自訂物件（人員） |
| salesQuote | companyId | → company |
| salesQuote | contactId | → ?（需探查） |
| salesQuote | opportunityId | → opportunity |
| salesQuote | fuZeYeWuId | → workspaceMember（負責業務） |
| salesQuote | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| salesQuoteLineItem | salesQuoteId | → salesQuote |
| salesQuoteLineItem | baoJiaDanXiXiangGuanLianId | → ?（需探查） |
| salesQuoteLineItem | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| task | assigneeId | → workspaceMember（指派人） |
| task | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| taskTarget | petId | → ?（需探查） |
| taskTarget | surveyResultId | → ?（需探查） |
| taskTarget | quoteId | → ?（需探查） |
| taskTarget | quotelineitemId | → ?（需探查） |
| taskTarget | salesQuoteId | → salesQuote |
| taskTarget | salesQuoteLineItemId | → salesQuoteLineItem |
| taskTarget | yeJiMuBiaoId | → workspaceMember?（業績目標） |
| taskTarget | companyId | → company |
| taskTarget | opportunityId | → opportunity |
| taskTarget | personId | → person |
| taskTarget | taskId | → task |
| taskTarget | rocketId | → ?（需探查） |
| timelineActivity | companyId | → company |
| timelineActivity | dashboardId | → dashboard |
| timelineActivity | noteId | → note |
| timelineActivity | opportunityId | → opportunity |
| timelineActivity | personId | → person |
| timelineActivity | taskId | → task |
| timelineActivity | workflowId | → workflow |
| timelineActivity | workflowRunId | → ?（需探查） |
| timelineActivity | workflowVersionId | → workflowVersion |
| timelineActivity | workspaceMemberId | → workspaceMember |
| timelineActivity | rocketId | → ?（需探查） |
| timelineActivity | petId | → ?（需探查） |
| timelineActivity | surveyResultId | → ?（需探查） |
| timelineActivity | quoteId | → ?（需探查） |
| timelineActivity | quotelineitemId | → ?（需探查） |
| timelineActivity | salesQuoteId | → salesQuote |
| timelineActivity | salesQuoteLineItemId | → salesQuoteLineItem |
| timelineActivity | yeJiMuBiaoId | → workspaceMember?（業績目標） |
| timelineActivity | linkedRecordId | → ?（需探查） |
| timelineActivity | linkedObjectMetadataId | → ?（需探查） |
| workflow | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| workflowAutomatedTrigger | workflowId | → workflow |
| workflowRun | workflowId | → workflow |
| workflowRun | workflowVersionId | → workflowVersion |
| workflowRun | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| workflowVersion | workflowId | → workflow |
| workspaceMember | yeWuId | → ?（需探查） |
| workspaceMember | userId | → core.user |
| _pet | ownerSurveyResultId | → ?（需探查） |
| _pet | ownerRocketId | → ?（需探查） |
| _pet | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| _rocket | helpedById | → ?（需探查） |
| _rocket | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| _surveyResult | helpedById | → ?（需探查） |
| _surveyResult | createdByWorkspaceMemberId | → workspaceMember（建立者） |
| _yeJiMuBiao | createdByWorkspaceMemberId | → workspaceMember（建立者） |

---

> **使用方式**：AI 查詢時 `read` 此檔案即可獲得完整 schema。
> **更新方式**：`python3 scripts/scan-schema.py workspace_3joxkr9ofo5hlxjan164egffx`
