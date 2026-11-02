# 🔌 Jay Baudhimai Tally Web Sync — Installation & Setup Guide

Yeh guide TallyPrime me **Auto-Connect TDL Add-on** load karne aur use use karne ke liye hai.

---

## 📁 Files Ka Vivran (Files in this folder)

1. **`JayBaudhimaiWebSync.tdl`**: TallyPrime ka main TDL add-on code file.
2. **`start-proxy-silent.vbs`**: Tally open hone par background me proxy ko silently (bina black screen ke) chalane wala launcher.
3. **`start-proxy.bat`**: Proxy ko manual start karne ke liye script.
4. **`stop-proxy.bat`**: Proxy ko band karne ke liye script.

---

## 🚀 Step-by-Step Installation (TallyPrime me TDL kaise load karein)

### Step 1: TallyPrime Kholein
- TallyPrime open karein aur apni Company load karein.

### Step 2: TDL & Add-On Menu me Jayein
- Keyboard par **`F1`** (Help) dabayein.
- Menu me se **`TDLs & Add-Ons`** select karein (ya keyboard par **`T`** dabayein).

### Step 3: Local TDL Load Karein
- Screen ke right side me **`F4: Manage Local TDLs`** par click karein (ya **`F4`** dabayein).
- Screen par aayega:
  - **Load selected TDL files on startup?** → Isse **`Yes`** karein.
  - **File to Load**: Yahan par `JayBaudhimaiWebSync.tdl` ka poora path paste karein:
    ```
    C:\Users\dell\Documents\GitHub\TALLY_REPORTING\tally-tdl\JayBaudhimaiWebSync.tdl
    ```
- **`Enter`** dabakar save (Accept) karein.

### Step 4: Verification
- Ab screen ke bottom-right me aapko dikhega:
  **`TDLs Loaded: 1`** (Agar 1 loaded dikh raha hai toh TDL 100% successfully install ho chuka hai).

---

## 🎮 Tally Ke Andar Kaise Use Karein (Features & Controls)

### 1. Gateway of Tally Par Menu & Status
- **Gateway of Tally** par aapko ek naya menu item dikhega:
  👉 **`Web Reporting Connector [ON]`** (Hot-key: **`W`**)
- Right-side button bar me live status button dikhega:
  👉 **`● Web Sync: ON (Alt+W)`**

### 2. Tally Ke Andar Se Sync ON / OFF Karna:
- **Shortcut:** Kisi bhi samay **`Alt + W`** dabayein → Sync instant **ON** ya **OFF** toggle ho jayega!
- **Settings Screen:** Gateway of Tally par **`W`** dabayein:
  - **Enable Web Sync:** `[Yes / No]` (Spacebar se change karein)
  - **Auto-Start Proxy on Tally Open:** `[Yes / No]`
  - **Web Portal URL:** `http://localhost:3000`
  - Enter dabakar save karein — Tally aapki preference ko permanently save rakhega.

### 3. Tally Se Direct One-Click Actions:
- **`F4` (Open Web Portal):** Tally ke andar se hi direct aapka web browser khulega aur web reporting dashboard open ho jayega!
- **`F5` (Start Proxy):** Agar proxy band ho gayi ho toh Tally ke andar se hi 1 second me restart ho jayegi.
- **`F6` (Stop Proxy):** Proxy ko band karne ke liye.

---

## 🔄 Auto-Connect Kaise Kaam Karta Hai?

Jab aapka TallyPrime start hota hai:
1. TDL check karta hai ki kya `Enable Web Sync` **Yes** hai.
2. Agar **Yes** hai, toh TDL turant `start-proxy-silent.vbs` ko call karke proxy ko background me start kar deta hai.
3. Web App bina kisi error ke seedhe Tally se connect ho jata hai!
