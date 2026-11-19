# ⚽ Teamsheet

Five-a-side organiser. The organiser creates a squad and a weekly game, then shares **one link** in WhatsApp. Players open it, tap their name and choose **In / Maybe / Out**. No accounts.

- Live **"7/10 playing, need 3 more"** counter, with a **reserve list** once full (reserves move up automatically when someone drops out)
- **Fair teams** by skill, one keeper per side, with reshuffle and tap-to-swap
- **Who paid** per game, and a running "owes" total
- **Attendance log** with games played and attendance rate per player
- Mobile-first, light and dark mode

---

## How it fits together

```
Phone browser ──► Netlify (hosts the files in this folder)
      │
      └──────► Supabase (the database: squads, players, games, replies)
```

| File | What it does |
|---|---|
| `index.html` | The page shell. Loads the scripts below. |
| `styles.css` | All the looks. Colours are variables at the top. |
| `config.js` | **Your** Supabase address and public key. The only file you must edit. |
| `js/app.js` | The screens: home, player page, organiser page. |
| `js/api.js` | Talks to Supabase and handles live updates. |
| `js/teams.js` | The fair-teams algorithm. |
| `supabase/schema.sql` | Creates the database tables and functions. |
| `../netlify.toml` | Tells Netlify to publish this folder. |

### The three links

- `https://your-site.netlify.app/`: home page, where you create a squad
- `https://your-site.netlify.app/?s=abcd2345`: **player link**, post this in WhatsApp
- `https://your-site.netlify.app/#o=…long secret…`: **organiser link**, keep it private. There is no password: whoever has this link can manage the squad.

### How security works without accounts

The database tables are locked, so the website can't read them directly. The site can only call a small set of database functions. Each function checks the squad code (players) or the organiser's secret token (organiser) first. Player skill ratings and payments are never sent to the player page. The organiser token is stored only as a hash (a scrambled fingerprint), so even the database doesn't hold the real token.

The trade-off is that anyone in the group chat could tap In for someone else, just like editing a list pasted into WhatsApp. For a friendly kickabout that's normally fine.

---

## Setup, step by step (about 15 minutes)

### Step 1: Create the Supabase project (the database)

1. Go to [supabase.com](https://supabase.com) and sign up (the free plan is plenty).
2. Click **New project**. Give it a name (e.g. `teamsheet`), choose a database password (save it somewhere; Teamsheet doesn't need it), and pick the region closest to you.
3. Wait a minute or two while the project starts.

### Step 2: Create the tables

1. In your project, open **SQL Editor** in the left sidebar and click **New query**.
2. Open `supabase/schema.sql` from this folder, copy **everything**, and paste it in.
3. Click **Run**. You should see "Success. No rows returned".

You can run it again whenever this file is updated. It keeps your data.

### Step 3: Connect the app to your project

1. In Supabase, open **Project Settings → API Keys**. Older dashboards call this **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://abcdxyz.supabase.co`). It's on the **Data API** page, or on the project's home page under "Connect".
3. Copy the **publishable key** (starts with `sb_publishable_`). If you only see legacy keys, use the **anon public** key (a long `eyJ…` string).
4. Open `teamsheet/config.js` and replace the two placeholder values:

   ```js
   window.TEAMSHEET_CONFIG = {
     supabaseUrl: 'https://abcdxyz.supabase.co',
     supabaseKey: 'sb_publishable_xxxxxxxx'
   };
   ```

   Both values are **safe to be public**. Never paste the **secret** or **service_role** key here.

5. Commit and push the change to GitHub.

### Step 4: Try it on your computer (optional)

You can double-click `index.html` to open it, but a tiny local web server is more reliable:

```bash
cd teamsheet
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

### Step 5: Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) and sign up with your GitHub account.
2. Click **Add new project → Import an existing project → GitHub**, and choose this repository.
3. Netlify reads `netlify.toml` automatically: publish directory `teamsheet`, no build command. Leave the settings as they are and click **Deploy**.
4. After about 30 seconds you get a link like `https://random-name-123.netlify.app`. You can rename it under **Project configuration → Change project name**, e.g. `thursday-ballers.netlify.app`.
5. From now on, every push to your main branch redeploys the site automatically.

### Step 6: Use it

1. Open your Netlify link and **create a squad** (paste everyone's names, one per line).
2. **Save the organiser link** (the app reminds you). Bookmark it, or WhatsApp it to yourself.
3. In the **Squad** tab, set each player's skill (1–5) and tick who plays in goal.
4. In the **Game** tab, schedule the game and tap **Share in WhatsApp**.
5. Before kick-off: **Teams → Pick fair teams → Show to players**.
6. After the game: **History → Log attendance**, untick no-shows, then **finish game**. Mark payments as they come in. Then schedule next week (the time and place are pre-filled).

---

## Live updates

When someone taps In, their phone sends a tiny "something changed" ping through **Supabase Realtime**, and every other open page reloads the list. As a backup, every page also refreshes every 15 seconds and whenever you switch back to it.

If updates aren't instant, look in **Supabase → Realtime → Settings** for an option that limits it to private channels only, and turn that off. Everything still works without live updates, through the 15-second refresh.

## Troubleshooting

| You see | Fix |
|---|---|
| "Almost there… isn't connected to a database yet" | `config.js` still has the placeholder values (Step 3). |
| "Could not find the function public.get_squad…" | Run `supabase/schema.sql` again (Step 2). |
| "Invalid API key" | You copied the wrong key. Use the publishable / anon key. |
| "This organiser link is not valid" | The link was cut off when copied. Find the full one. |
| Free Supabase project "paused" | Free projects pause after a week with no activity. Click **Restore** in Supabase. A weekly game normally keeps it awake. |
