# BarberOS in your browser (GitHub Codespaces)

**Open:** https://codespaces.new/luisggcalves-ops/luisggcalves-ops?ref=claude/nifty-ramanujan-peplt0

1. Click **Create codespace**.
2. Wait 3–5 minutes the first time. It installs everything, creates the database, loads the demo shop and builds the app.
3. BarberOS opens in a new browser tab. If it doesn't, open the **Ports** tab at the bottom and click the 🌐 globe next to port **3000**.

On the sign-in page, click **Demo owner** or **Demo barber**. Nothing to type. Or sign in with password `barberos-demo`:

| Account | What you'll see |
|---|---|
| `owner@demo.barberos.test` | Owner dashboard: calendar, customers, staff, settings |
| `barber@demo.barberos.test` | Barber phone app (use a private window to be signed in as both) |

The customer booking page link is under **Settings → Online booking → Open**.

**Good to know**

- The codespace stops by itself after 30 minutes without use, and your data is kept. To come back, open https://github.com/codespaces and click it. The app starts again automatically.
- Personal GitHub accounts include free Codespaces hours each month. Delete the codespace there when you no longer need it.
- The address is private to your GitHub login. To show someone else, set port 3000 to **Public** in the Ports tab (right-click → Port visibility). Turn it back to Private afterwards.

**Something not working?** In the codespace terminal (bottom panel), paste:

```bash
bash barberos/scripts/codespace-repair.sh
```

It updates the code, fixes the database and demo data, restarts the app and tests sign-in. It ends with ✅ or a message to send to Claude.
