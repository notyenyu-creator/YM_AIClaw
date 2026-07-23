# DenchClaw Web Standalone 重建與重啟流程

## 目的

這份文件固定 DenchClaw Web 在 `standalone` 模式下的正確重建與重啟流程，避免再次發生：

- 只做 `build` 沒做 `prepack`
- 直接用 `next start`
- 首頁 `HTTP 200` 但 `_next/static` chunk `404`
- 前端停在 `Loading...`

---

## 根因摘要

DenchClaw Web 在 [next.config.ts](/Users/ym/DenchClaw/apps/web/next.config.ts) 中使用：

```ts
output: "standalone"
```

這代表正式啟動流程不是一般的：

```bash
next start
```

而是：

```bash
node .next/standalone/apps/web/server.js
```

同時，`build` 完成後還必須跑 `web:prepack`，因為這一步會把：

- `apps/web/.next/static`
- `apps/web/public`

複製進 standalone runtime 目錄。

專案裡已經明確寫在 [package.json](/Users/ym/DenchClaw/package.json)：

```json
"web:prepack": "cp -r apps/web/public apps/web/.next/standalone/apps/web/public && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static && node scripts/flatten-standalone-deps.mjs"
```

所以正確鏈路一定是：

1. `build`
2. `web:prepack`
3. `node .next/standalone/apps/web/server.js`

---

## 正式腳本

已新增腳本：

[dench-web-standalone.sh](/Users/ym/DenchClaw/scripts/dench-web-standalone.sh)

它會負責：

- 停掉舊的 `3200` listener
- 清理同一個 port 下殘留的 DenchClaw standalone wrapper / server 程序
- 重建 `apps/web`
- 執行 `web:prepack`
- 驗證 standalone bundle 是否完整
- 正確用 standalone `server.js` 啟動
- 寫入 pid/log 到 `/tmp`

---

## 常用用法

### 1. 正式重啟 `3200`

```bash
bash scripts/dench-web-standalone.sh restart --port 3200 --detach
```

### 2. 前景模式重啟

適合除錯。

```bash
bash scripts/dench-web-standalone.sh restart --port 3200 --foreground
```

### 3. 只停服務

```bash
bash scripts/dench-web-standalone.sh stop --port 3200
```

### 4. 看狀態

```bash
bash scripts/dench-web-standalone.sh status --port 3200
```

`status` 會同時顯示目前 listener、pid file、screen session、health，以及是否有 stale standalone process。

### 5. 只清理殘留程序，不重啟服務

適合看到多個舊 `next-server` / `denchclaw-web-3200` 程序時使用。腳本只會清理同一個 port、同一個 DenchClaw standalone 啟動路徑下的殘留程序，會保留目前正在 listen 的服務。

```bash
bash scripts/dench-web-standalone.sh cleanup --port 3200
```

### 6. 只做重建，不啟動

```bash
bash scripts/dench-web-standalone.sh build --port 3200
```

---

## 產物與檢查點

腳本預設使用：

- pid file: `/tmp/denchclaw-web-3200.pid`
- log file: `/tmp/denchclaw-web-3200.log`

健康檢查：

- `http://127.0.0.1:3200/`

如果腳本成功，通常應該能同時確認：

1. 首頁 `HTTP 200`
2. `_next/static` chunk 不再 `404`
3. `lsof -iTCP:3200 -sTCP:LISTEN` 能看到 listener
4. `status` 顯示 `stale standalone process(es): none`

---

## 禁止再做的事

不要再直接把這個專案當成一般 Next.js app 用：

```bash
npm exec -- next start --port 3200
```

雖然它有時候看起來能起來，但這不是 DenchClaw 這個 standalone runtime 的正確正式流程。

---

## 一句話版本

DenchClaw Web 的正式重啟原則是：

`一定先 build + web:prepack，再用 standalone server.js 啟動。`
