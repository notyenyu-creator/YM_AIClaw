# DenchClaw Wiki Index

> 狀態：初始骨架
> 更新日期：2026-04-16

## 1. 目的

這份 index 是 DenchClaw Wiki 的總入口。

未來它的用途有三個：

1. 讓人類快速瀏覽目前 wiki 裡有哪些內容
2. 讓 agent 在 query 前先從 index 找相關頁面
3. 提供後續 ingest / lint / health-check 的基礎導航層

---

## 2. 使用規則

未來每次新增重要 wiki 頁面時，都應同步更新這份 index。

每個條目建議至少包含：

- 頁面名稱
- 所屬分類
- 一句摘要
- 最後更新日期
- 主要來源系統

---

## 3. 目錄結構

### Entities

| 頁面 | 摘要 | 來源系統 | 最後更新 |
|------|------|----------|----------|
| `wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md` | Y-CRM 客戶摘要模板，整理客戶、聯絡人、商機與互動脈絡 | Y-CRM | 2026-04-16 |
| `wiki/entities/opportunities/YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md` | Y-CRM 商機摘要模板，整理階段、金額、風險與下一步 | Y-CRM | 2026-04-16 |

### Operations

| 頁面 | 摘要 | 來源系統 | 最後更新 |
|------|------|----------|----------|
| `wiki/operations/ycrm/YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md` | Y-CRM LINE 互動摘要模板，整理對話脈絡與待辦訊號 | Y-CRM | 2026-04-16 |

### Playbooks

| 頁面 | 摘要 | 來源系統 | 最後更新 |
|------|------|----------|----------|
| `wiki/playbooks/ycrm/YCRM_SALES_ANALYSIS_PLAYBOOK_TEMPLATE.md` | Y-CRM 業務分析 playbook 模板，用於商機、業務、客戶分析 | Y-CRM | 2026-04-16 |

### Analysis

| 頁面 | 摘要 | 來源系統 | 最後更新 |
|------|------|----------|----------|
| _待新增_ | 高價值分析、根因報告、營運觀察 | 跨系統 | - |

### Reports

| 頁面 | 摘要 | 來源系統 | 最後更新 |
|------|------|----------|----------|
| _待新增_ | 月報、週報、每日營運摘要 | 跨系統 | - |

---

## 4. 初版維護規則

第一版先遵守下面幾條：

1. 不追求完整，先求穩定。
2. 有長期價值的內容才進 wiki。
3. 聊天中的暫時性回覆，不直接進 wiki。
4. 若某頁有跨系統衝突，應標記 source-of-truth 或 conflict note。
5. 若頁面被 AI 更新，後續應能追到來源與時間。

---

## 5. 後續待補

第二版建議加入：

- page tags
- owner
- source count
- freshness level
- inbound / outbound links
- orphan-page 檢查欄位
