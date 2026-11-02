# 🔌 Jay Baudhimai Tally Web Sync — Setup & Usage Guide (v2.2.0 Portable)

Yeh guide TallyPrime me **Web Reporting Connector (TDL)** ko kisi bhi computer aur kisi bhi alag-alag folders me setup karne ke liye hai.

---

## 🌟 Dual Path Configuration (TDL & Proxy Kahi Bhi Ho Sakte Hain)

Ab aap Tally ke andar hi **dono paths** alag-alag specify kar sakte hain:
1. **TDL Folder Path**: Jahan `JayBaudhimaiWebSync.tdl`, `start-proxy-silent.vbs`, aur `stop-proxy.bat` rakhe hain.
2. **Proxy Folder Path**: Jahan `tally-proxy` (yani `server.js` aur `node_modules`) rakha hai.

> Dono folders chahe alag-alag drive me hon (jaise `C:\Tally\tally-tdl` aur `D:\Servers\tally-proxy`), yeh bilkul smooth kaam karega!

---

## ⚡ Quick 1-Minute Setup

### Step 1: TallyPrime Kholein
- TallyPrime open karein (Company open karein).
- Keyboard par **`F1`** (Help) → **`TDLs & Add-Ons`** → **`F4` (Manage Local TDLs)**.
- `JayBaudhimaiWebSync.tdl` load karein (agar pehle se loaded hai toh Tally restart karein).

### Step 2: Gateway of Tally par 'W' Dabayein
1. Gateway of Tally par **`W`** dabayein (Web Sync Connector).
2. Configuration screen khulegi jisme 2 boxes milenge:
   - **`TDL Folder Path :`** `[ C:\Users\dell\Documents\GitHub\TALLY_REPORTING\tally-tdl ]`
   - **`Proxy Folder Path :`** `[ C:\Users\dell\Documents\GitHub\TALLY_REPORTING\tally-proxy ]`
3. Agar kisi aur computer me hain, toh apne folders ka sahi path type ya paste (**Ctrl+V**) karein.
4. **`Ctrl + A`** dabakar **Save** kar dein!
5. **Bas!** Settings permanently save ho gayi hain.

---

## 🖥️ Screen Layout (Tally Ke Andar)

```
+----------------------------------------------------------------------------------+
| JAY BAUDHIMAI TRADERS - WEB REPORTING CONNECTOR                    v2.2 Portable |
| -------------------------------------------------------------------------------- |
|                                                                                  |
| [ 1. FOLDER PATH CONFIGURATION ]                                                 |
|           TDL Folder Path :  [C:\Users\dell\Documents\GitHub\TALLY_REPORTING\...]|
|         Proxy Folder Path :  [C:\Users\dell\Documents\GitHub\TALLY_REPORTING\...]|
|   --> TDL folder me scripts hoti hain aur Proxy folder me server.js hota hai    |
| -------------------------------------------------------------------------------- |
|                                                                                  |
| [ 2. CURRENT STATUS ]                                                            |
|          Active Company :  JBMT                                                  |
|            Sync Service :  ENABLED (Active)                                      |
|        Configured Ports :  Tally HTTP Port: 9000   |   Proxy Port: 3001          |
| -------------------------------------------------------------------------------- |
|                                                                                  |
| [ 3. CONNECTOR PREFERENCES ]                                                     |
|        Enable Web Sync :  [ Yes ]                                                |
|       Auto-Start Proxy :  [ Yes ]                                                |
|         Web Portal URL :  [ http://localhost:3000 ]                              |
| -------------------------------------------------------------------------------- |
| Quick Buttons: [F4] Open Portal  [F5] Start Proxy  [F6] Stop Proxy  [Alt+W] Toggle|
| Press Enter through fields to save, or press Ctrl+A to save immediately.        |
+----------------------------------------------------------------------------------+
```

---

## 🎮 Shortcut Keys & Quick Buttons

| Shortcut / Button | Function |
| :--- | :--- |
| **`W`** (Gateway of Tally) | Settings screen open karein jahan TDL aur Proxy dono paths set hote hain |
| **`Alt + W`** | Quick Sync ON / OFF Toggle |
| **`F4`** | Web Portal direct default browser me kholein |
| **`F5`** | Proxy Server manual start karein |
| **`F6`** | Proxy Server stop karein |
| **`Ctrl + A`** | Preferences ko permanently save karein |

---

## 💻 Kisi Naye Computer Par Setup Kaise Karein?

1. `tally-tdl` folder jahan marzi wahan rakhein (e.g. `C:\MyTDL`).
2. `tally-proxy` folder jahan marzi wahan rakhein (e.g. `D:\Apps\tally-proxy`).
3. `tally-proxy` folder me ek baar command prompt kholein aur `npm install` run karein.
4. TallyPrime me `JayBaudhimaiWebSync.tdl` load karein.
5. Gateway of Tally par **`W`** dabayein aur dono paths enter karke **`Ctrl + A`** se save kar dein!
