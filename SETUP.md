# 家庭防災庫：設定步驟

整體架構和植牙登記一樣：

- **Google 試算表**：資料正本
- **Apps Script**：後台，負責登入檢查、讀寫試算表、存照片
- **GitHub Pages**：前端網頁，可加到手機主畫面，沒網路也能打開

照片存在你的 Google Drive「家庭防災庫照片」資料夾。

預計 30–40 分鐘。順序很重要：A → B → C → D → E。

---

## A. 建立試算表與後台

1. 在 Google Drive 新增一份試算表，命名「家庭防災庫」。
2. 上方選單 **擴充功能 → Apps Script**，把預設的程式碼全部刪掉，貼上 `Code.gs` 的內容。
3. 修改最上面的設定：
   - `EDITORS`：你和太太的 Gmail（這兩個帳號才能編輯）。
   - `CLIENT_ID`：先不用動，B 步驟拿到後再回來填。
4. 按 💾 儲存。上方函式選單選 `setup`，按「執行」。
   - 第一次會要求授權。看到「Google 尚未驗證這個應用程式」時，點 **進階 → 前往（不安全）**，這是你自己的程式。
5. 回到試算表，會多出 9 個分頁。到 **Members** 分頁：
   - 填每個人的 **生日**（格式 `2018-03-01`），系統會自動判斷成人、兒童、幼兒。
   - 稱呼可以改成名字。以後要增加成員，就在這裡加一列（成員ID 用英文，不要重複）。
6. 設定家庭密碼：
   - 把 `NEW_FAMILY_PASSWORD` 改成家庭密碼（至少 6 個字）。
   - 執行 `setFamilyPassword`。
   - **改回空字串 `''` 並儲存**，密碼只以加密形式保存。

## B. 建立 Google 登入用的用戶端 ID

建議開一個新專案，登入畫面才會顯示「家庭防災庫」。沿用植牙登記的「Patient record」專案也可以，只是畫面會顯示「手術紀錄」。

1. 到 [Google Cloud Console](https://console.cloud.google.com/)，左上角專案選單 → **新增專案**，命名「家庭防災庫」。
2. **API 和服務 → OAuth 同意畫面**：
   - 使用者類型選「外部」。
   - 應用程式名稱填「家庭防災庫」，填你的 Email。
   - 維持「測試」狀態。
   - 在「測試使用者」加入你和太太的 Gmail。
3. **API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID**：
   - 應用程式類型：**網頁應用程式**。
   - 已授權的 JavaScript 來源：`https://omsdrchangyu-rgb.github.io`
   - 建立後複製「用戶端 ID」（結尾是 `.apps.googleusercontent.com`）。
4. 回到 Apps Script，把用戶端 ID 貼到 `CLIENT_ID` 並儲存。

## C. 部署後台

1. Apps Script 右上角 **部署 → 新增部署作業**。
2. 齒輪選「網頁應用程式」，然後設定：
   - 執行身分：**我**
   - 存取權：**所有人**
3. 部署後複製「網頁應用程式網址」（結尾是 `/exec`）。

「所有人」是指網址打得開。程式會檢查 Google 帳號或家庭密碼，沒登入的人讀不到任何資料。

> 以後修改 `Code.gs`：**部署 → 管理部署作業 → ✏️ 編輯 → 版本選「新版本」→ 部署**。這樣網址不變，手機不用重設。

## D. 放上 GitHub Pages

1. 在 GitHub 建立新的 repository，名稱 `family-prep`，設為 Public。
   - Repo 裡只有程式，資料都在你的試算表裡。
2. 上傳 `site` 資料夾裡的 7 個檔案：
   - `index.html`
   - `config.js`
   - `sw.js`
   - `manifest.webmanifest`
   - 三個 png 圖示
3. 在 GitHub 上直接編輯 `config.js`，填入兩個值：
   ```js
   window.FP_CONFIG = {
     API: 'https://script.google.com/macros/s/……/exec',
     CLIENT_ID: '……apps.googleusercontent.com'
   };
   ```
4. **Settings → Pages**：Source 選 `Deploy from a branch`，Branch 選 `main`、`/ (root)`，儲存。
5. 等 1–2 分鐘，打開 `https://omsdrchangyu-rgb.github.io/family-prep/`。

## E. 安裝到手機

- **iPhone**：用 Safari 打開網址 → 分享 → **加入主畫面**。
  - 一定要加到主畫面。只在 Safari 分頁裡開，iOS 可能會清掉離線資料。
- **Android**：用 Chrome 打開 → 選單 → **安裝應用程式**。
- 你和太太按「使用 Google 帳號登入」。
- 其他家人（或長輩的手機）用家庭密碼登入，只能查看。

---

## 平常使用須知

| 情況 | 會怎樣 |
|---|---|
| 沒有網路 | 自動顯示這台手機最後一次同步的資料，只能看不能改。網路恢復後自動更新。 |
| 修改後網路剛好斷掉 | 修改留在手機上，右上顯示「未同步 N 項」，恢復網路後自動送出。 |
| 兩人同時改同一個品項 | 以後送出的為準。 |
| 直接在試算表修改 | 可以，App 下次打開時會讀到。日期請用 `2027-01-10` 格式；多個值用逗號分隔。 |
| 手機遺失 | 在 Apps Script 執行 `logoutEveryone`，所有裝置都要重新登入。 |
| 想換家庭密碼 | 重做 A-6，再執行 `logoutEveryone`。 |
| 刪除照片 | 只從品項移除，Drive 裡的檔案會保留，需要時自己到資料夾清理。 |

## 試算表分頁對照

| 分頁 | 內容 |
|---|---|
| Members | 家庭成員、生日、每日飲水／餐數／熱量 |
| Items | 所有品項（七大類共用） |
| Usage | 消耗紀錄 |
| Wishlist | 待購清單 |
| Needs | 應變情境的勾選、目標、處理細節、手動連結的品項 |
| Scenarios | 你修改過的情境步驟（沒改過的用預設內容） |
| Plan | 集合點、最終目標、1991 約定電話、外縣市聯絡人 |
| Settings | 生活用水、避難包目標天數 |
| Photos | 照片縮圖（App 離線時顯示用） |
