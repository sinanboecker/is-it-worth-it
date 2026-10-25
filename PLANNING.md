# Is It Worth It? Planning

> Living planning doc. Edit freely. Items marked **[DECIDE]** are my defaults; change them if they don't fit how you use the spreadsheet.
> This file is the project's source of truth.

---

## 1. Context

Today: an Excel workbook with **one sheet per platform** (e.g. Nintendo, PlayStation, PC), each holding games and hardware.
Each row records **name, buy date, sell date, buy price, sell price, hours played, notes**. Calculated in Excel:

- **Net cost** = buy price − sell price
- **Cost per hour** = net cost ÷ hours played
- **Per-year stats:** money spent, hours played, cost per hour

What is planned:
- Categories, such as "Nintendo", "Playstation", "PC"
- Per category, add games and track the before mentioned data per entry
- Per category, add the hardware such as a PS5 for the category Playstation
- A general **"Handhelds & Other Hardware"** category for devices that fit no platform (e.g. Ayn Thor, Trimui Brick). These can be picked as the device for any game, with the emulated flag.
- Break-even value (e.g. 3 €/h): one value used for games **and** hardware. Below it, the entry counts as "worth it".
- Game status: wishlist, backlog, currently playing, on hold, played, finished, abandoned, endless
- Mark games as finished (also add finish date), can be multiple
- A **journal** (like Backloggd) that shows which games were finished when, with a calendar heatmap
- A **Now Playing** page for games in progress
- **Favorites:** a heart next to a game's stars, and a **Favorites** page listing all favorite games
- **Ratings** 0–5 stars in 0.5 steps, **for the game** (a finish has no rating of its own), plus short reviews per completion (Backloggd-style)
- For every entry, choose the hardware on which it was played. Can be multiple, or even emulated
- **Play times are entered per device**; the game shows the total
- **DLC** bought for a game (name, date, store, price) counts towards the game's cost; DLC picked from a list of available DLC (Steam)
- Game entries should get game info and cover artwork from the web
- **Multiple copies per game**, each with buy date, buy price, sell price, note, condition, physical/digital (and store). A copy is sold if it has a sell price; the game is sold if all copies are sold
- **Bundles** (e.g. console + game for one price), with the cost split across the items
- **Wishlist entries added manually**, with prices from **gg.deals** (incl. keyshops) and a link to the game's gg.deals page
- **Data export and import as JSON** (no Excel files); **CSV import of games per category**
- **Category totals include hardware; yearly costs count games only**
- **No access from the internet**: the app is only reachable in the home LAN or through WireGuard

Goal:
1. A **self-hosted web app** running as a Docker container on Unraid.
2. An **Android app** that talks to the same server.
3. Bring the existing games in via **CSV import per category** (Excel sheets saved as CSV), so nothing is retyped.

### Decisions already made
| Topic | Decision |
|---|---|
| Hours | **Always per device.** Hours are entered on each device a game was played on; the game's total is the sum (read-only). |
| Hardware value | Hardware also gets **cost per hour**, based on the hours of the games played on it, and the same break-even check. |
| Break-even | **One value for games and hardware.** A global default (3 €/h, changeable in Settings), which **each category can override**. |
| Cost totals | **Category totals = games + hardware.** **Yearly figures (money spent, cost per hour) = games only** (incl. their DLC). See §3. |
| Copies | Games **and hardware** can have **several copies**, each with buy date, buy price, store, physical/digital, condition (new/used), sell price/date, note. A copy is **sold** when it has a sell price; the item is **sold** when **all** copies are sold. Sell prices count in the copy's **buy year**. See §3. |
| DLC | Stored per game with name, date, store, price. **Game cost = base game + all DLC.** DLC suggestions from Steam (with price) or RAWG (names). See §3. |
| Game metadata | **RAWG** (rawg.io, free API key, personal use): info, landscape cover image, DLC names, store links (→ Steam ID). A visible "Data from RAWG" link is required. See §5b. |
| Game statuses | Wishlist, Backlog, Currently playing, On hold, Played, Finished, Abandoned, Endless (see §3). |
| Import / export | **No Excel file handling.** Games come in via **CSV import per category**; full export and restore via **JSON**. See §10. |
| Emulated | A **flag on the game ↔ device link**. The device can belong to another category (e.g. a Switch game emulated on the "Gaming PC" or a Trimui Brick). |
| Hours entry | **Manual only** (no playtime sync with Steam/PSN/etc.). Fast entry via "+ hours" quick actions on web and Android. |
| Wishlist | **Added manually** in the app. Prices from the gg.deals API (official stores **and keyshops, always shown**), with a link to the gg.deals page. See §5. |
| Network | **LAN + WireGuard only.** No port forwarding, no reverse proxy, no Tailscale. |
| Users | **Single user** for now (the schema keeps a `user` table so more users can be added later without a rewrite). |
| Ratings | 0–5 stars in **0.5 steps**, **only on the game**. A finish (completion) has no rating, only an optional review. |
| Hours on a finished game | Adding hours **keeps the status** (e.g. Finished stays Finished); only Backlog/On hold games get a "switch to Currently playing?" suggestion. |
| Bundles | One purchase → several items; the price is split across them (proportional to their standalone value by default). See §3. |

---

## 2. Architecture overview

```
 Home LAN / WireGuard tunnel only
┌──────────────┐        HTTP/JSON (REST, no login)           ┌────────────────────────────────┐
│ Android app  │ ──────────────────────────────────────────▶ │  Docker container (Unraid)     │
│ Kotlin/Compose│                                            │                                │
└──────────────┘                                             │  FastAPI  ── /api/*            │
┌──────────────┐                                             │     ├─ serves React SPA at /   │
│ Browser      │ ──────────────────────────────────────────▶ │     ├─ SQLite  /data/app.db    │
│ (React SPA)  │                                             │     └─ covers  /data/covers/   │
└──────────────┘                                             └──────────────┬─────────────────┘
                                                                            │ outbound only
                                                                            ▼
                               RAWG (game info, images, DLC names) · gg.deals API (wishlist prices) · Steam Store (DLC list + prices)
```

**One container, one port, one volume.** The backend serves both the REST API and the built web frontend.
Both web and Android use the **same REST API**, so the server holds all logic (calculations, break-even, status rules, journal, metadata lookups) and the clients only display data.
Cover images are downloaded **once** to `/data/covers` and served by the app itself, so the clients never call RAWG directly.
The server needs **outbound** internet only for RAWG, gg.deals and the Steam Store; nothing is reachable **from** the internet.

### Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python 3.12 + FastAPI** | Small, fast, generates OpenAPI docs automatically (useful for the Android client), good CSV/JSON handling in the standard library |
| ORM / migrations | **SQLModel (SQLAlchemy) + Alembic** | Typed models, safe schema upgrades between versions |
| Database | **SQLite** in `/data` volume | One user, small dataset; backup = copy the `/data` folder. No separate DB container |
| CSV import / JSON export | Python standard library (`csv`, `json`) + Pydantic for validation | No extra dependencies |
| Game metadata | **RAWG API** (free key for personal use) via `httpx` | No Twitch/IGDB account needed; release date, genres, developer, description, landscape image, DLC names, store links (Steam ID) |
| Web frontend | **React + TypeScript + Vite** | Built to static files and served by FastAPI |
| Web UI libs | **Mantine 8** (UI, forms, dates, charts on Recharts), TanStack Query (data fetching), React Router; API types generated from the OpenAPI schema (openapi-typescript + openapi-fetch) | Mature and well documented; sortable tables are built with Mantine directly |
| Android | **Kotlin + Jetpack Compose + Material 3**, Coil for images | Native look and feel; Retrofit + kotlinx.serialization for the API |
| Container | Multi-stage Dockerfile (node build → python slim runtime) | Small image, single artifact |

> **Android = native app** (decided), built **after** the web app is stable. A native app works over plain HTTP on the LAN and can show
> real Android notifications (deal alerts) without HTTPS or a push service, which a web app (PWA) couldn't.

---

## 3. Data model

Money is stored as **integer cents** to avoid floating-point rounding errors. Currency: **EUR** (decided), no multi-currency.

```
setting (global break-even, gg.deals region, …)
category 1──n item (kind = game | hardware)
item     1──n copy                    ← each purchased copy: buy/sell data, condition, format
bundle   1──n copy                    ← optional: copies bought together
item(game) 1──n dlc                   ← bought DLC, adds to the game's cost
item(game) 1──n completion            ← feeds the journal (date, device, review)
item(game) 1──n price_snapshot        ← gg.deals prices (wishlist)
item(game) n──n item(hardware)   via play_link (emulated flag, hours per device)
```

### `setting` (key/value)
| key | example | notes |
|---|---|---|
| break_even_cph | `300` | Global default break-even in **cents per hour** (300 = 3 €/h), used for games and hardware. Seeded on first start, editable in Settings |
| bundle_split_mode | `proportional` | default split mode for new bundles (`proportional` / `equal` / `manual`) |
| ggdeals_region | `de` | region/currency for gg.deals prices (also used as Steam Store country code for DLC prices) |

### `category`
| field | type | notes |
|---|---|---|
| id | int PK | |
| name | text unique | "Nintendo", "PlayStation", "PC", "Handhelds & Other Hardware", … |
| type | enum `platform` / `hardware_only` | `hardware_only` has no Games tab; its devices default to **emulated = on** when linked to a game |
| break_even_cph | int, nullable | Per-category override (null = use the global default). Applies to games and hardware in that category alike |
| default_device_id | FK → item (hardware), nullable | device pre-selected when adding a game / hours in this category (e.g. Nintendo → Switch OLED) |
| sort_order | int | |

The **"Handhelds & Other Hardware"** category (`hardware_only`) is created automatically on first start (name editable).
Examples: Ayn Thor, Trimui Brick, Anbernic, Retroid, Miyoo.

### `item` (games and hardware share one table)
| field | type | notes |
|---|---|---|
| id | int PK | |
| category_id | FK → category | Games only in `platform` categories |
| kind | enum `game` / `hardware` | |
| name | text | required |
| status | enum, **games only** | play status, see *Game status* below (independent of owned/sold) |
| started_on | date, nullable | **games only.** Start of the current playthrough; set automatically when the status becomes Currently playing, moved into the completion when finished |
| last_played_on | date, nullable | **games only.** Updated automatically when hours are added (editable); used to sort Now Playing |
| favorite | bool | **games only.** Set with the heart next to the stars; listed on the Favorites page |
| rating | int 0–10, nullable | **games only.** Stored as half-stars (7 = ★★★½), shown as 0–5 stars in 0.5 steps; null = unrated. Can be rated in any status except wishlist |
| notes | text, nullable | |
| *metadata (games):* rawg_id, summary, release_date, genres, developer, cover_path | nullable | Filled from RAWG, editable by hand |
| steam_app_id | int, nullable | games only; filled from RAWG's store links; used for gg.deals prices and the Steam DLC list |
| ggdeals_slug | text, nullable | games only; from a pasted gg.deals URL (for games without a Steam ID) |
| target_price_cents | int, nullable | wishlist only; "tell me when it's this cheap" |
| deal_since | timestamp, nullable | wishlist only; set when the price first reaches the target, cleared when it rises again (drives one-time notifications) |
| image_path | text, nullable | Optional manual photo/image upload (useful for hardware) |
| created_at / updated_at | timestamp | updated_at is useful for Android sync later |

There is **no hours field on the game**: hours live on the device links (`play_link.hours`), and the game total is derived.
There are **no purchase fields on the item** either: buy/sell data lives on its **copies** (below).

### `copy` (one purchased copy of a game, or one unit of hardware)
A game entry can have **several copies**, e.g. bought physical in 2019, sold, re-bought digital in 2024; or a standard and a collector's edition.
| field | type | notes |
|---|---|---|
| id | int PK | |
| item_id | FK → item | |
| buy_date | date | required |
| buy_price_cents | int | required, ≥ 0. For bundle copies, this is the **allocated share** (see *Bundles*). DLC is stored separately |
| store | text, nullable | Free text with autocomplete from values used before (Steam, eShop, PS Store, Amazon, MediaMarkt, Kleinanzeigen, …) |
| format | enum `physical` / `digital` | games; hardware is always physical |
| condition | enum `new` / `used`, nullable | physical only |
| sell_price_cents | int, nullable | **set = this copy is sold** |
| sell_date | date, nullable | prefilled with today when a sell price is entered (editable, optional) |
| note | text, nullable | e.g. "Collector's Edition", "bought used, no manual" |
| bundle_id | FK → bundle, nullable | set when the copy was bought as part of a bundle |
| reference_price_cents | int, nullable | bundle copies only: standalone value that drives the price split |

**Sold logic**
- A **copy is sold** when it has a `sell_price_cents` (0 € allowed, e.g. given away).
- A **game/hardware item is sold** when it has at least one copy and **all** copies are sold. Otherwise it's **owned** (shows "2 copies, 1 sold").
- **Wishlist** games have no copies. "Bought it" creates the first copy; adding a copy to a wishlist game moves it out of the wishlist.
- Copies apply to **hardware** the same way (decided), e.g. 2 identical controllers or a re-bought console;
  in the UI a single copy is shown inline, so for most hardware it looks like one buy/sell block.

### Game status
| Status | Meaning | Counts in money/hours stats? |
|---|---|---|
| **Wishlist** | Not bought yet; no copies | No |
| **Backlog** | Bought, not started | Yes |
| **Currently playing** | In progress (also for a replay of a finished game) | Yes |
| **On hold** | Paused, you plan to come back (keeps "Currently playing" clean) | Yes |
| **Played** | Played, but not finished (yet) | Yes |
| **Finished** | At least one completion exists | Yes |
| **Abandoned** | Dropped, you won't come back | Yes, and also in its own "money spent on abandoned games" stat |
| **Endless** | No real ending (multiplayer, roguelites, Minecraft…), so it never sits "unfinished" | Yes |

*100 % / Mastered* is not a status but a checkbox on a completion (see `completion`).
*Sold* is not a status either: it's derived from the copies, so a game can be e.g. **Finished + sold**.

**Status rules** (server-side, the clients just show them)
- Adding a completion → status becomes **Finished** (unless it's currently **Currently playing**, which is a replay, and that stays).
- Moving from **Wishlist** to any other status → asks for the first copy (buy date, price, store, format; "Bought it?").
- Setting **Finished** without a completion → asks for the finish date (default today) and creates the completion.
- **Endless** games can still get completions (e.g. "finished the campaign"); the status stays Endless.
- Adding hours to a **Backlog** or **On hold** game → offers to switch to **Currently playing**.
- Setting **Currently playing** sets `started_on` (if empty); finishing moves it into the completion and clears it, so a replay starts fresh.
- CSV-imported games without a status column: **Played** if hours > 0, otherwise **Backlog**; you can adjust them in bulk later.

### `play_link` (devices a game was played on, **with the hours per device**)
| field | type | notes |
|---|---|---|
| game_id | FK → item (game) | |
| hardware_id | FK → item (hardware) | Can be in **any** category incl. "Handhelds & Other Hardware" |
| emulated | bool | defaults to **on** for devices from a `hardware_only` category, editable |
| hours | decimal, default 0 | hours played on **this** device |

- **Game total hours = Σ `play_link.hours`** (shown on the game, read-only).
- A new game gets its category's **default device** linked automatically (removable), so "+ hours" always has a target.
- "+ hours" asks for the device; pre-selected is the device used last for that game.
- Hardware hours are exact: **hours on a device = Σ hours of all links to that device**. No estimating or even splitting needed.

### `dlc` (bought DLC / expansions / season passes of a game)
| field | type | notes |
|---|---|---|
| id | int PK | |
| game_id | FK → item (game) | |
| name | text | required |
| buy_date | date | required |
| store | text, nullable | autocomplete like copies; defaults to the store of the game's latest copy |
| price_cents | int | ≥ 0 (free DLC can be tracked with 0 €) |
| steam_app_id | int, nullable | set when picked from the Steam list |
| rawg_id | int, nullable | set when picked from the RAWG list |
| notes | text, nullable | |

**Adding DLC (dropdown):** the "Add DLC" dialog offers a searchable dropdown of **available DLC**, with free text as fallback:
1. **Steam** (game has a `steam_app_id`): the server asks the Steam Store (`store.steampowered.com/api/appdetails?appids=<id>&cc=de`), which lists the game's DLC app IDs,
   then fetches name + **current Steam price** for each. Name and price are prefilled (editable, e.g. if you bought it on sale or at a keyshop).
   The list is cached for 7 days (the store endpoint is public but rate-limited, and it isn't an official, documented API; to verify).
2. **RAWG** (non-Steam games, e.g. Nintendo/PlayStation): DLC and expansion **names** from RAWG's "additions", no prices.
3. **Free text:** if nothing fits, type the name.
Already-owned DLC is marked ✔ in the list.

### `completion` (a game can be finished several times; the source of the journal)
| field | type | notes |
|---|---|---|
| id | int PK | |
| item_id | FK → item (game) | |
| finished_on | date, nullable | null = **finished, date unknown** (e.g. imported from a sheet that only has a ✓); the journal lists these under "Date unknown" |
| started_on | date, nullable | copied from the game's `started_on`, or entered by hand; lets the journal show "played 12 Mar – 4 Apr" |
| hardware_id | FK → item (hardware), nullable | device it was finished on (shown in the journal) |
| mastered | bool | 100 % / all achievements |
| review | text, nullable | short review, shown in the journal |
| note | text, nullable | e.g. "NG+", "on Hard" |

**Ratings belong to the game.** A completion has no rating of its own; the journal shows the game's rating on every finish of that game.
Reviews are per completion (what you thought of that playthrough).

### `price_snapshot` (gg.deals prices of wishlist games, see §5)
| field | type | notes |
|---|---|---|
| id | int PK | |
| item_id | FK → item (game) | |
| fetched_at | timestamp | |
| retail_cents | int, nullable | best price at official stores |
| keyshop_cents | int, nullable | best keyshop price |
| historical_low_cents | int, nullable | as reported by gg.deals (retail; keyshop low too if the API provides it) |
| currency | text | e.g. `EUR` |
| url | text | gg.deals game page |

Only a new row when a price changed (keeps the table small). The newest row is the "current price".

### `bundle` (one purchase, several copies)
| field | type | notes |
|---|---|---|
| id | int PK | |
| name | text | e.g. "PS5 Slim + Astro Bot Bundle" |
| buy_date | date | copied to all copies in the bundle |
| total_price_cents | int | what you actually paid |
| store | text, nullable | copied to the copies |
| split_mode | enum `proportional` / `manual` / `equal` | how the total is divided; chosen per bundle, preselected from the **default split mode** in Settings |
| sold_as_bundle | bool | true = sold together for one price (split the same way) |
| sell_date / sell_total_cents | nullable | only when sold as a bundle |
| notes | text, nullable | |

**How a bundle is handled**
1. **Create:** in the **"Add hardware" or "Add game" dialog**, tick "Bought as a bundle" → bundle name, date, store, **total price**,
   the first item's standalone price, then add the other items (games or accessories, existing or new, any category) with their
   standalone prices; a live preview shows each share. Examples: console + game, a Steam bundle, a Humble Bundle (usually "equal shares").
   For game bundles the other items default to games in the same format; the first game also gets the chosen status and RAWG match.
   Each item gets a normal copy with `bundle_id` set. There is no separate bundles page.
2. **Split the price** (`buy_price_cents` of each copy). The split mode is **configurable**: a default in Settings (`bundle_split_mode`, initially `proportional`),
   which can be changed for every bundle, also afterwards (the shares are then recalculated):
   - `proportional` (default): `share = total × reference_price ÷ Σ reference_prices`.
     *Example:* bundle 449 €, PS5 alone 499 €, game alone 59 € → PS5 = 449 × 499/558 = **401.53 €**, game = **47.47 €**.
   - `equal`: total ÷ number of items.
   - `manual`: type each share yourself; the form shows "x € left to assign" until the sum matches.
   - Rounding: the cents are distributed so the shares always add up **exactly** to the total (the largest item takes the remainder).
3. **Afterwards every copy behaves like any other copy**, and the games/hardware keep their own hours, DLC, cost/hr, break-even, status, rating. So all stats work unchanged
   (the game share counts in yearly game costs; the hardware share counts in the category total).
4. **Selling:** copies can be sold **individually** (each gets its own sell price), or the bundle is sold **as a whole** (`sold_as_bundle`), and the sell total is split with the same mode.
5. **Changing the total or the split** recalculates the shares of all copies in the bundle.
6. **Display & editing:** bundle copies show a 📦 "Bundle" button in the copies list of the game/device page; it opens the bundle dialog
   (name, date, total, split mode, standalone prices, "sold as a whole", delete).
7. **Also works for game bundles** (e.g. a Humble Bundle or a collection of 3 games for one price), with `equal` or `proportional` split.
   *(A "Game + Season Pass" edition bought as one product is simply one game; extra DLC bought later goes into `dlc`.)*

### Derived values (computed by the server, never stored)
`threshold = category.break_even_cph ?? setting.break_even_cph` (same for games and hardware)

**Copies** (per game/hardware)
- `copies_count`, `sold_copies`, `owned_copies`
- `copies_paid = Σ copy.buy_price`, `copies_received = Σ copy.sell_price` (sold copies only)
- `first_bought_on = min(copy.buy_date)`: the date used for the **yearly hours attribution** and for sorting
- `sold = copies_count > 0 and all copies sold`, `owned = not sold`
- `days_owned` per copy = (sell_date or today) − buy_date

**Games** (not computed for wishlist)
- `hours_played = Σ play_link.hours`
- `dlc_cost = Σ dlc.price_cents`
- `total_paid = copies_paid + dlc_cost`
- `net_cost = total_paid − copies_received` (DLC usually can't be resold, so it stays part of the cost after selling the game)
- `cost_per_hour = net_cost / hours_played` (null if hours is 0); hours are per game, so all copies share them
- `worth_it = cost_per_hour ≤ threshold`. Also true when `net_cost ≤ 0` (sold for at least what was paid)
- `hours_to_break_even = max(0, net_cost / threshold − hours_played)`, e.g. "4.5 h left until it's worth it"
- `times_finished`, `last_finished_on`

**Hardware**
- `net_cost = copies_paid − copies_received`
- `hours_on_device = Σ play_link.hours` of all links to this device
- `cost_per_hour = net_cost / hours_on_device`, plus `worth_it` / `hours_to_break_even` with the same threshold
- `games_played_on` (count), `emulated_games` (count)

### Category totals (lifetime): **include hardware**
Per category (and summed over all categories):
- **Total cost** = Σ net_cost of **games (incl. DLC) + hardware** in the category, shown as total plus the split (games x €, of which DLC y €, hardware z €).
- **Total hours** = Σ hours of the category's games.
- **All-in cost per hour** = total cost (games + hardware) ÷ total hours, e.g. "Nintendo costs me 1.85 €/h including the Switch".
  Also shown: games-only cost per hour for comparison.
- Item counts per status, worth-it rate, backlog value.
- Note: hardware from "Handhelds & Other Hardware" counts in **that** category's total, even when used to emulate games of other categories.

### Per-year statistics: **games only**
Hardware purchases are **not** part of the yearly figures; they appear in the category totals and the hardware stats.

**Which year do things count toward?** Everything counts in the **buy year** (decided): hours, and money including sell prices.
- **Money spent in year Y** = Σ (buy price − sell price) of **game copies bought** in Y **+ DLC bought in Y**.
  Each copy and each DLC counts by **its own** buy date (a copy re-bought in 2026 or a DLC bought in 2026 for a 2023 game counts in 2026). Wishlist excluded.
  A copy's sell price is subtracted in the copy's **buy year**, not the year it was sold (no cash-flow view).
- **Hours played in year Y** = Σ hours of games **first bought** in Y (**decided:** all hours of a game count in the buy year of its first copy, like in your current spreadsheet).
  *(Later, a play-session log could split hours into the years they were actually played. See Future ideas.)*
- **Cost per hour in year Y** = (Σ net_cost of games first bought in Y, incl. all their copies and DLC) ÷ (Σ hours of those games).
  This is a weighted value, **not** the average of the per-item ratios.
- **Games finished in year Y** = count of completions with `finished_on` in Y (same data as the journal).
- **Worth-it rate** = share of games bought in Y that have reached break-even.
- **Average rating** of games finished in Y (the games' ratings, counted once per finish).
- **Abandoned in year Y:** count and net cost of games bought in Y that are now Abandoned.

All stats can be filtered by category.

### Store, format & rating statistics
- **Spending per store** (lifetime and per year; per year = games + DLC only, like the other yearly figures).
- **DLC spending:** total, per year, and the games with the most DLC money.
- **Physical vs digital** (per copy): share of copies, money spent, money received from sales, and average net cost.
  Physical copies can be resold, so this shows whether buying physical actually comes out cheaper.
- **Resale:** number of copies sold, money received, average resale value in % of the buy price (also split new vs used).
- **Value vs fun:** scatter plot of rating vs cost per hour. Highlights cheap and great games, and expensive and disappointing ones.
- **Rating distribution** (histogram of half-star steps), like the Backloggd profile.

> ✅ To check: once the CSV import is done, these numbers must match your spreadsheet's figures exactly. If they don't, the definitions above need adjusting.

---

## 4. Journal (Backloggd-style)

A chronological diary of finished games, built from `completion` rows (no extra data entry).

- **Layout:** grouped by **year → month**, newest first. Each month shows a row/grid of **covers** with the day of the month on each card
  (like Backloggd's journal). Re-finishes appear again with a "Replay" badge; 100 % runs get a "Mastered" badge.
- **Card details:** name, cover, finish date, (started → finished span if known), device + 🕹 emulated marker, hours, the game's **star rating**, cost/hr and worth-it badge.
  Clicking a card opens the completion with its **review**.
- **Year header:** number of games finished, total hours of those games, average rating, most used device.
- **Calendar heatmap:** a GitHub-style grid (one square per day, 53 weeks × 7 days) at the top of each year. Colour intensity = games finished that day.
  Hovering/tapping a day shows the games; clicking jumps to that month in the journal. Year switcher next to it.
- **Filters:** year picker, category, device, rating (e.g. ≥ 4★), mastered only.
- **Quick add:** "Log a finish" button directly on the journal page (pick game → date → device → review; rate the game if not rated yet).
- The journal only shows **finished** games. Games in progress have their own **Now Playing** page (§8).

---

## 5. Wishlist with gg.deals prices

**Wishlist entries are added manually** in the app (RAWG search → pick the game → optional target price). No import from Steam or gg.deals.

**gg.deals API:** official, free for personal/hobby use, API key generated in your gg.deals account settings.
It returns **price data per game**: current best price at official stores **and at keyshops**, historical low, and the URL of the gg.deals page.
Games are looked up by **Steam App ID** (up to 100 IDs per call) or, since Oct 2026, by **gg.deals game slug** (the last part of a gg.deals game URL).
Limits on the free key: **100 records/minute, 1,000/hour** (each ID = 1 record). The API has **no user/profile endpoints**, which is why the wishlist lives in the app.

> ⚠ The API docs page is behind Cloudflare and couldn't be read automatically while planning. Exact field names, the region parameter and the
> slug endpoint path will be checked against https://gg.deals/api/ with your key at the start of this milestone.

**How it works**
1. **Link to gg.deals (automatic where possible):** when a wishlist game is added, the server takes the `steam_app_id` from RAWG's store links and asks gg.deals right away.
   If the game has no Steam ID (e.g. console-only), you paste the gg.deals URL once, which sets `ggdeals_slug`.
   Games without a gg.deals link show "Not linked: paste gg.deals URL".
2. **Price sync:** a background job refreshes the prices of **all wishlist games** once a day (configurable), batched to 100 IDs per call, well within the limits.
   A "Refresh now" button refreshes one game. Region = `de` / EUR (otherwise the API answers in USD).
3. **Shown directly on each wishlist entry** (list and detail page):
   - **Official stores:** best current price
   - **Keyshops:** best current price, always shown next to it (clearly labelled "Keyshop")
   - **Historical low**, and the difference to the current price
   - **"Open on gg.deals"** button/link to the game's gg.deals page (URL from the API, or built from the slug), where the individual shop offers can be compared
4. **Price history:** each change is stored in `price_snapshot`, which gives a small chart on the game page (official vs keyshop line).
5. **Price target:** each wishlist game can have a `target_price_cents`. When the official **or** keyshop price falls to the target or below → "🔥 Deal" badge
   (shows which of the two hit it), a "Wishlist deals" box on the dashboard, and an **Android notification** (see §9).
   The server records when a game became a deal (`deal_since`), so each deal is reported only once.
6. **Buying:** "Bought it" on a wishlist game creates the **first copy**, prefilled with buy price + store from the chosen deal (official or keyshop, editable) and format = digital,
   then switches the status to Backlog / Currently playing.
   Price sync stops for that game.

---

## 5b. Game metadata via RAWG

**Why RAWG:** free API key for personal use (sign up at rawg.io → "Get API key"), no Twitch/IGDB developer account needed.
Free plan: non-commercial, up to **20,000 requests/month**; this app needs a few per added game, and results are cached.

**What the app takes from RAWG**
| Data | RAWG endpoint | Used for |
|---|---|---|
| Search results (name, year, platforms, thumbnail) | `GET /api/games?search=…` | "Find metadata" / adding a game |
| Description, release date, genres, developers | `GET /api/games/{id}` | game page |
| Image (`background_image`) | `GET /api/games/{id}` | cover; downloaded **once** to `/data/covers` |
| Store links | `GET /api/games/{id}/stores` | Steam URL → `steam_app_id` (Steam DLC list, gg.deals prices) |
| DLC / editions ("additions") | `GET /api/games/{id}/additions` | DLC dropdown names for non-Steam games |

**Things to know**
- **Images are landscape** (key art / screenshot, roughly 16:9). RAWG has no portrait box covers, so cover cards, the journal and lists use a **wide image format**.
  An own image can still be uploaded per game/device.
- **Attribution is required:** the free plan requires a visible link to RAWG on every page that shows its data. The app shows a small
  "Game data and images from RAWG" link (rawg.io) in the footer of every page.
- **No redistribution:** the data is only used inside this app (the JSON export is your personal backup).
- The API key (`RAWG_API_KEY`) stays on the server; without a key the app works normally, just without metadata lookups.
- Matching after a CSV import: by name (+ platform from the category, e.g. Nintendo → Switch platforms), confident matches applied automatically, the rest in a review list.

---

## 6. REST API (v1)

All under `/api/v1`, JSON, **no login** (access is limited to the LAN/WireGuard, see §7). Interactive docs at `/api/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/settings` | global break-even, default bundle split mode, gg.deals region, … |
| GET / POST / PATCH / DELETE | `/categories[/{id}]` | list and manage (type, break-even override, default device) |
| GET | `/items?category=&kind=&status=&owned=&sold=&worth_it=&store=&format=&condition=&rating_min=&bundle=&year=&q=&sort=` | list with derived fields (store/format/condition filter on copies) |
| GET | `/items/{id}` | detail incl. per-device hours, DLC, completions, metadata |
| POST / PATCH / DELETE | `/items[/{id}]` | create (optionally with a first copy), update (status, rating, …), delete |
| GET / POST / PATCH / DELETE | `/items/{id}/copies[/{copy_id}]` | copies of a game/hardware; setting `sell_price` marks the copy sold |
| PUT | `/items/{id}/play-links` | set devices with **hours per device** and emulated flag |
| POST | `/items/{id}/hours` | quick "add N hours on device X"; updates `last_played_on` |
| GET / POST / PATCH / DELETE | `/items/{id}/dlc[/{dlc_id}]` | bought DLC of a game |
| GET | `/items/{id}/dlc/available?q=` | DLC suggestions for the dropdown (Steam with price, or RAWG names), owned ones flagged |
| GET / POST / PATCH / DELETE | `/items/{id}/completions[/{cid}]` | finish dates (applies status rules) |
| GET | `/hardware?q=` | all devices across categories, for the device picker |
| GET / POST / PATCH / DELETE | `/bundles[/{id}]` | bundle with its items; create/patch recalculates the price split |
| POST | `/bundles/{id}/preview-split` | shows the shares for a given mode/total before saving |
| GET | `/stores` | distinct store names (for autocomplete) |
| GET | `/wishlist?sort=price\|keyshop\|discount\|target` | wishlist games with official + keyshop price, historical low, gg.deals URL, deal flag |
| GET | `/wishlist/deals?since=<timestamp>` | deals that started after `since` (used by the Android app for notifications) |
| PUT | `/items/{id}/ggdeals` | link a game via pasted gg.deals URL (sets the slug) |
| POST | `/items/{id}/prices/refresh` | refresh gg.deals price of one game now |
| GET | `/items/{id}/prices` | price history (snapshots) |
| GET | `/journal?year=&category=&device=&rating_min=` | completions grouped by year/month with game cover, rating, review |
| GET | `/journal/heatmap?year=` | `{date: count}` for the calendar heatmap |
| GET | `/now-playing` | Currently playing + On hold games with hours per device, last played, break-even progress; plus "up next" backlog |
| GET | `/metadata/search?q=` | RAWG search → candidate list with thumbnails |
| POST | `/items/{id}/metadata` | apply a RAWG match: stores the fields (incl. Steam ID) and downloads the image |
| POST | `/items/{id}/image` | upload own image (hardware/fallback) |
| GET | `/media/{file}` | serve cached covers/images |
| GET | `/stats/summary?category=` | lifetime totals: total cost **incl. hardware** (+ split games/DLC/hardware), hours, all-in and games-only cost/hr, counts per status, worth-it rate, backlog value |
| GET | `/stats/categories` | the same totals for every category side by side |
| GET | `/stats/yearly?category=` | per-year rows, **games + DLC only** (see §3) |
| GET | `/stats/top?metric=cost_per_hour&kind=&order=asc&limit=10` | best/worst value; also `metric=hours_to_break_even` ("almost worth it") |
| GET | `/stats/hardware` | per device: net cost, cost/hr, hours, games played, emulated count |
| GET | `/stats/stores`, `/stats/format`, `/stats/resale`, `/stats/ratings`, `/stats/dlc` | spending per store, physical vs digital, resale values, rating distribution + value-vs-fun points, DLC spending |
| POST | `/categories/{id}/import-csv/preview` | upload CSV (+ optional column mapping, device) → parsed rows, warnings, duplicates, totals |
| POST | `/categories/{id}/import-csv/commit` | import the previewed rows (with your edits from the preview) |
| GET | `/import-csv/template` | CSV template with the expected header row |
| GET | `/export/json?images=false` | full lossless export (`.json`, or `.zip` with images), see §10 |
| POST | `/import/json?mode=empty\|replace` | import/restore from a JSON/ZIP export |
| GET | `/health` | for the Docker healthcheck |

---

## 7. Network & access (LAN + WireGuard only, no login)

- **Reachable only from the home LAN and the WireGuard tunnel.** No port forwarding on the router, no reverse proxy, no Tailscale.
- **WireGuard:** use Unraid's built-in VPN Manager (*Settings → VPN Manager*), tunnel type **"Remote access to LAN"**. The phone uses the official WireGuard Android app;
  when the tunnel is up, the app talks to `http://<unraid-lan-ip>:8080` exactly like at home.
- **Extra safety net (defense in depth):** env var `ALLOWED_NETWORKS` (e.g. `192.168.178.0/24,10.253.0.0/24`). The server rejects requests from any other source address.
  Default = private ranges only (10/8, 172.16/12, 192.168/16).
- **Plain HTTP** inside the LAN/tunnel (the WireGuard traffic is already encrypted). The Android app allows cleartext only for private IP ranges via `network_security_config`.
  *(Optional later: a self-signed cert / local CA for HTTPS.)*
- **No login** (decided): being on the home network or the WireGuard tunnel is the access control. Single user.
  Trade-off: anyone on your home Wi-Fi (e.g. guests) could open the app. If that becomes a concern, a guest Wi-Fi in a separate subnet (excluded from `ALLOWED_NETWORKS`)
  or a simple login can be added later.
- API keys (`RAWG_API_KEY`, `GGDEALS_API_KEY`) stay on the server only.
  **Outbound** connections: RAWG, gg.deals, Steam Store (DLC lists); nothing inbound from the internet.

---

## 8. Web app (frontend)

Pages:
1. **Dashboard:** lifetime totals (tiles, incl. hardware), **cost per category** (bar: games / DLC / hardware stacked, with all-in €/h),
   game spending per year (bar, incl. DLC), hours per year (bar), cost/hour per year (line), games finished per year,
   status counts (backlog size, **backlog value** = money in games not started yet), a "Now Playing" tile (count + link to the page), "almost worth it" list, best/worst value items,
   **"Wishlist deals"** (games at or below their target price, official or keyshop).
2. **Journal:** see §4 (incl. calendar heatmap).
3. **Now Playing:** a dedicated page for games in progress.
   - **Currently playing** as large cover cards, sorted by last played. Each card shows: total hours with a small **per-device breakdown**, last played,
     started on + days since start, rating, and a **break-even progress bar** ("12.5 / 20 h, 7.5 h left").
   - **Quick actions** on each card: + hours (device pre-selected), Finished (date → device → review; rate the game if not rated yet), On hold, Abandoned.
   - Below: a collapsible **On hold** section ("continue?" with a one-tap move back to Currently playing).
   - Small **"Up next"** row: the 5 oldest backlog games, to pick the next game.
3b. **Favorites:** all games marked with the heart, as cover grid or table.
4. **Category page** (one per platform, like your current sheets): "Import games from CSV" button; header with the **category totals** (total cost incl. hardware, hours, all-in €/h, games-only €/h),
   then a **Games** tab and a **Hardware** tab.
   - Games: table *or* cover grid view; columns incl. status, rating (stars), total hours, cost (incl. DLC, with a "+DLC" hint), cost/hr, worth-it badge (✔ / "x h left"),
     finished count, devices (with 🕹 emulated marker), copies ("2×", formats 💿 / ☁), **Sold** badge when all copies are sold, 📦 bundle badge.
     Filters: status, owned / sold, worth it, store, format, condition, rating. Bulk status change.
   - Hardware: cost/hr from games played on it, hours, number of games, worth-it badge.
   - "Handhelds & Other Hardware" shows only the Hardware tab.
5. **Wishlist:** cross-category list with cover, **official price**, **keyshop price**, historical low, target price, 🔥 deal badge and an **"Open on gg.deals"** link per entry.
   Sortable by official price, keyshop price, discount vs. historical low, or "closest to target". "Add to wishlist" button (RAWG search).
   **Backlog** view: cross-category, sorted by first buy date.
6. **Game detail/edit:** image + info from RAWG ("Find metadata" → pick the match), status, **star rating** (half-star click/tap widget), notes.
   - **Copies:** a list/table, one row per copy: buy date, buy price, store (autocomplete), physical/digital, condition (physical only), sell price, sell date, note, 📦 bundle badge.
     Sold copies are greyed out with a "Sold" tag. "Add copy" and per-copy "Sell" (enter sell price → date prefilled with today).
     Above the list: "2 copies · 1 owned" or **"Sold"** when all copies are sold.
   - **Devices & hours:** a small table, one row per device (device picker searches **all** categories; handheld devices pre-tick emulated), hours per row,
     **total shown below** (read-only).
   - **DLC:** list (name, date, store, price) with sum; "Add DLC" opens the dialog with the **dropdown of available DLC** (Steam with prices / RAWG names / free text).
     Cost summary: copies + DLC = total paid, − received from sold copies = net cost.
   - **Completions** list with date, device and review (+ "Finished today").
   - Wishlist games instead show the price box (official / keyshop / historical low / gg.deals link / target price / price history chart).
7. **Hardware detail/edit:** prices/dates, store, image, list of games played on it (emulated ones marked) with their hours on this device.
8. **Bundles:** no own page. Created in the "Add hardware" / "Add game" dialog ("Bought as a bundle"), edited via the "Bundle" button on a bundle copy.
9. **Stats:** yearly table (**games + DLC only**, the replacement for your spreadsheet's summary) + category filter; category comparison table (**incl. hardware**);
   store / DLC / physical-vs-digital / rating charts.
10. **Settings:** gg.deals (region, refresh interval, API key status), global default break-even value,
    default bundle split mode, categories (type, default device, break-even override shown as "default (3 €/h)" until set), stores (rename/merge duplicates),
    **JSON export (with or without images)** and **JSON import/restore**, "fetch missing metadata" bulk job.

Prices are shown in EUR with German formatting `1.234,56 €`. Responsive layout so it also works in a mobile browser.

---

## 9. Android app

- **Native app** (decided): **Kotlin, Jetpack Compose, Material 3**, min SDK 26. Coil loads covers from `/api/v1/media/…`.
- Networking: Retrofit + OkHttp + kotlinx.serialization. API models can be written by hand or generated from `/api/openapi.json`.
- Architecture: MVVM (ViewModel + StateFlow), Hilt for DI (optional for an app this size), DataStore for settings (server URL, notification settings).
- Screens: **Setup** (server URL, connection test) → **Now Playing** (start screen; fastest way to log hours or a finish) → **Dashboard** → **Journal** → **Category** (totals header, Games/Hardware tabs, cover grid, search) → **Game/Hardware detail & edit** → **Wishlist/Backlog** → **Stats**.
- Journal screen with the calendar heatmap (horizontally scrollable) above the month list.
- Quick actions on a game: **"+ hours"** (device chips, last used pre-selected), **status change**, **"Finished"** (adds a completion with today's date + device, then asks for an optional review and the game rating if it has none yet), **"Sell copy"** (pick the copy if there are several → sell price).
- Game detail: copies list with "Add copy" / "Sell".
- Game detail: per-device hours with total, DLC list + "Add DLC" with the available-DLC dropdown.
- Adding a game: type the name → pick the RAWG match (searched via the server) → pick status (wishlist needs no copy) → first copy: price, store, physical/digital (+ condition) → done
  (category's default device linked automatically).
- Bundles: created in the "Add hardware" / "Add game" dialog like on the web; editable via the copy's "Bundle" button.
- Wishlist screen with official + keyshop prices, deal badges and an "Open on gg.deals" button (opens the browser); "Bought it" creates the first copy, prefilled with price + store from the chosen deal.
- Export: JSON download via the server, then Android's share sheet (save to Files, send to Drive, …). CSV import and JSON restore are done in the web app.
- **Deal alerts (notifications):** a WorkManager job checks `/wishlist/deals?since=…` periodically (default every 6 h, configurable, plus on app start).
  New deals → Android notification ("🔥 Hades: 9,99 € at a keyshop, target 12 €"), tapping opens the wishlist entry; several deals are grouped.
  No Google push service needed; the app only gets alerts when it can reach the server (home Wi-Fi or WireGuard on), and catches up on the next check otherwise.
  Notifications can be switched off in the app settings (Android 13+: asks for the notification permission once).
- Connection error screen hints "Not at home? Turn on WireGuard."
- **v1 is online-only.** Offline cache with Room + sync using `updated_at` is a later phase.
- Distribution: sideloaded APK, built locally with `scripts/build-apk.sh`; no Play Store needed.

---

## 10. Import & export (CSV game import, JSON export/import)

No Excel file handling at all (no `.xlsx` reading or writing). Two mechanisms:

### CSV game import (per category)

For bringing in games in bulk, e.g. your existing Excel sheets: in Excel, save each sheet as CSV ("Save as → CSV"), then import it into the matching category.

1. **Where:** on a category page, "Import games from CSV" (or CLI: `python -m app.cli import-csv --category Nintendo file.csv`). The target category is the one you're on.
2. **Games only.** Every row becomes a game in that category. Hardware is added by hand (only a few items per category).
3. **CSV parsing** handles typical German Excel output: `;` or `,` separator (auto-detected), decimal comma (`59,99`), dates as `31.12.2024` or `2024-12-31`,
   UTF-8 or Windows-1252 encoding, `€` signs and thousand separators in prices.
4. **Columns** are matched by header name (German or English, e.g. "Name", "Kaufdatum"/"Buy date", "Kaufpreis"/"Buy price", "Verkaufsdatum", "Verkaufspreis", "Stunden"/"Hours",
   "Notizen"/"Notes"). An editable column mapping is shown if auto-detection fails; unmapped columns (e.g. calculated cost or cost/hour) are **ignored**.
   Optional columns if present: store, format (physical/digital), condition, copy note, status, rating.
   Only **name** is required. Each row with buy date + price becomes a game with **one copy** (buy/sell data, store, format, condition go onto the copy);
   a row without buy date + price becomes a **wishlist** game.
5. **Hours → device:** the CSV has one hours value per game. You pick the **device the hours are booked on** for the whole file (default: the category's default device),
   changeable per row in the preview. Splitting hours across devices is done later in the app.
6. **Status:** from a status column if present; otherwise **Finished** if the "finished" column (e.g. "Durchgespielt") has a ✓/x/ja or a date,
   **Played** if hours > 0, else **Backlog** (editable in the preview). A ✓ creates a completion with **unknown date**; a date in that column is used as the finish date.
7. **Duplicates & copies:**
   - Same name **and** same buy date as an existing copy → duplicate, skipped by default, so a file can be re-imported safely.
   - Same name, **different** buy date (in the file or already in the category) → offered as an **additional copy** of that game (default), or as a separate game.
8. **Preview** shows the parsed rows, warnings (bad dates, unreadable prices, unknown status) and totals (count, money spent, hours) so you can compare them with your sheet.
   Nothing is saved until you click **Import**.
9. Afterwards: optional **"Fetch missing metadata"** job matches the new games against RAWG (image, info, Steam ID). Confident matches are applied automatically; unclear ones go to a review list.
10. DLC, bundles, completions and device splits are added in the app after the import.
11. A **CSV template** with the expected header row can be downloaded from the import dialog.

> 📎 **Action for you:** put one exported CSV sheet (or a version with dummy values but the real headers) in the project folder so the importer's header matching fits your format.

### JSON export & import (complete backup / restore)

- **Export:** Settings → Export (web and Android) or CLI (`python -m app.cli export`). One file with **all tables**
  (categories, items, copies, play links, DLC, bundles, completions, price snapshots, settings) plus `schema_version` and `exported_at`.
  IDs are kept so relations stay intact. Derived values (totals, cost/hr, …) are left out, because they are recomputed on import.
- **Not included:** API keys.
- Option **"include images"** → a `.zip` with `data.json` + `covers/` + `uploads/`.
- **Import / restore:** Settings → "Import JSON" into an **empty** database, or a "replace everything" mode after a confirmation step.
  Older `schema_version`s are migrated on import. Useful for moving to another server or recovering from mistakes.
- The format is documented (JSON schema in the repo), so the data can also be processed by other tools.

The nightly backup (see §11) stays an SQLite copy; the JSON export is for manual use.

---

## 11. Deployment (Docker on Unraid)

**Repo layout**
```
is_it_worth_it/
├── PLANNING.md
├── backend/            FastAPI app, Alembic migrations, tests
│   ├── app/ (main.py, models.py, schemas.py, calc.py, bundles.py, status.py, journal.py, metadata.py, ggdeals.py, steam_store.py,
│   │        scheduler.py, netguard.py, routers/, csv_import.py, json_io.py, cli.py)
│   └── tests/
├── frontend/           Vite + React + TS
├── android/            Gradle project
├── Dockerfile          multi-stage: build frontend → copy into python image
├── docker/entrypoint.sh  hands /data to PUID:PGID, drops root
├── docker-compose.yml  for local dev / testing
├── unraid/is-it-worth-it.xml   Unraid container template (local image)
└── scripts/            deploy.sh (build + copy image to Unraid), build-apk.sh
```

**Container contract**
- Port `8080`, network type **bridge** (reachable on the Unraid LAN IP, and via WireGuard because the tunnel routes into the LAN)
- Volume `/data` → Unraid `/mnt/user/appdata/is-it-worth-it` (contains `app.db`, `covers/`, `uploads/`, `backups/`)
- Env: `ALLOWED_NETWORKS`, `RAWG_API_KEY`, `GGDEALS_API_KEY`, `TZ`, `PUID`/`PGID` (99/100 Unraid defaults)
- Background jobs (daily wishlist price sync, nightly backup) run **inside** the container via APScheduler, so no extra cron container is needed
- Migrations run automatically on startup; the default "Handhelds & Other Hardware" category and the default break-even (3 €/h) are seeded on first start
- `HEALTHCHECK` hits `/api/v1/health`

**Getting the image to Unraid: built locally, no registry** (nothing goes through GitHub or any other registry)
- `scripts/deploy.sh` on your PC:
  1. `docker build -t is-it-worth-it:<version> -t is-it-worth-it:latest .`
  2. `docker save is-it-worth-it:latest | ssh root@<unraid> docker load` (SSH key login to Unraid needed once)
  3. retags podman's `localhost/` image names on Unraid. Then **recreate** the container in Unraid (*Docker → is-it-worth-it → Edit → Apply*);
     a plain `docker restart` keeps running the old image. Migrations run on start.
- Alternative without your PC: clone the repo on Unraid and run `docker build` there (Unraid has Docker built in).
- The Unraid template points to the **local** image `is-it-worth-it:latest`. Unraid's "Check for updates" shows "not available" for local images, which is expected;
  updating = running `deploy.sh` again + *Edit → Apply*.
- Images are tagged with a version (e.g. `0.3.0`) besides `latest`, so rolling back = `docker tag is-it-worth-it:0.2.0 is-it-worth-it:latest` + *Edit → Apply*.
- The Android APK is also built locally (`scripts/build-apk.sh`, Gradle) and copied to the phone.

**Backups:** nightly SQLite copy inside `/data/backups` (keep last N), plus your normal Unraid appdata backup (covers can always be re-downloaded).

---

## 12. Milestones

1. ✅ **Backend core:** models (user, setting, category, item, copy, play_link, dlc, bundle, completion), migrations, seeding, CRUD, `calc.py` (copies → paid/received/sold, hours per device → totals, cost incl. DLC,
   cost/hr, break-even, hardware hours, category totals incl. hardware, yearly games + DLC figures), `bundles.py` (price split + rounding), `status.py` (status rules), with unit tests.
2. ✅ **CSV import + JSON export/import:** CSV game import per category + CLI (parsing, header mapping, hours → device, status, duplicates, preview);
   import your sheets saved as CSV; **numbers match your spreadsheet** ✅. JSON export + import/restore (early, so your data is never locked in).
3. ✅ **Stats + journal endpoints:** summary / categories / yearly / top / hardware / stores / format / resale / ratings / dlc / journal / heatmap / now playing.
4. ✅ **Web frontend:** category pages with totals, game/hardware forms (copies, devices & hours table, DLC, rating), bundles, status, completions, Now Playing,
   journal + heatmap, wishlist/backlog, dashboard, stats.
5. ✅ **Metadata + DLC lists:** RAWG search + apply (incl. Steam ID from store links, DLC names), RAWG attribution, cover caching, bulk "fetch missing" job, image upload; Steam Store DLC list with prices + cache.
6. **Network guard + Docker:** ✅ `ALLOWED_NETWORKS` (loopback always allowed for the healthcheck), ✅ Dockerfile, ✅ compose, ✅ Unraid template, ✅ `deploy.sh`;
   still to do on your side: deploy to Unraid; test over WireGuard.
   *(From here on, the app is usable day-to-day and replaces the spreadsheet.)*
7. **gg.deals wishlist prices:** verify API fields with your key, linking (Steam ID / pasted URL), daily price sync, snapshots, official + keyshop display,
   gg.deals link, target price/deal badge, "Bought it" prefill.
8. **Android app v1 (native):** setup, Now Playing, journal, category lists, detail/edit (devices & hours, DLC), quick actions, wishlist + deal notifications, dashboard, stats, export.
9. **Polish:** backups, APK build script.

---

## 13. Verification

- `pytest` on `calc.py` with hand-calculated fixtures: game hours = sum of device hours, hardware hours = sum of its links, cost/hr,
  worth-it edge cases (sold at profit, 0 hours, global vs category threshold), hardware cost/hr incl. emulated links.
- **Copies:** game with copy A (physical, 60 €, 2019, sold for 30 € in 2021) and copy B (digital, 20 €, 2024), 25 h → net cost 50 €, 2 €/h, **not sold** (B owned);
  sell B for 0 € → game **sold**. Yearly spending: 2019 +30 € (A: 60 − 30), 2024 +20 € (B). Hours count in 2019 (first copy). Wishlist game has 0 copies; "Bought it" creates copy 1.
  Copy sold = sell price set (0 € counts), sell date prefilled.
- **DLC:** game 40 € + DLC 20 € + DLC 10 €, 35 h → total paid 70 €, 2 €/h; its only copy sold for 25 € → net cost 45 €. A DLC bought a year after the game counts in **its own** year's spending;
  the game's cost/hr includes it.
- **Cost scope:** a category with one game (60 €, 30 h) and one console (300 €) → category total 360 €, all-in 12 €/h, games-only 2 €/h;
  the yearly row for that year shows **60 €** spent (console excluded). Bundle: the game share counts in the yearly figure, the console share only in the category total.
- `pytest` on status rules: completion → Finished, replay keeps Currently playing, wishlist → backlog requires price, wishlist excluded from stats,
  `started_on` set on Currently playing and moved into the completion.
- `pytest` on bundle splits: proportional example from §3 (449 € → 401.53 € + 47.47 €), equal split with odd cents, manual split must match the total,
  re-split after changing the total, selling as a bundle vs individually.
- Ratings: only 0–5 in 0.5 steps accepted, wishlist games can't be rated, completions have no rating; adding hours to a finished game keeps it finished.
- Steam DLC list (recorded responses as fixtures): DLC of a known game (e.g. The Witcher 3, App ID 292030) listed with names + EUR prices, owned DLC flagged, cache used on second call;
  non-Steam game falls back to RAWG names.
- gg.deals (mocked HTTP): batching of 100 IDs, rate limit respected (back-off on HTTP 429), snapshot only written on price change, deal flag when official **or** keyshop price ≤ target,
  games without Steam ID/slug shown as "not linked", pasted gg.deals URL → slug. One manual live test with your real key + a known Steam game (e.g. App ID 1145360, Hades),
  checking that EUR official + keyshop prices and the gg.deals URL come back.
- Export: **round trip** test (export JSON → restore into an empty DB → export again → files identical apart from `exported_at`);
  secrets not present in the JSON; `.zip` with images restores covers.
- CSV import (fixture files): `;` and `,` separators, decimal comma, German and ISO dates, Windows-1252 umlauts, `€` signs; header mapping German/English;
  unknown columns ignored; row without price → wishlist; each row → game + one copy; same name with another date → extra copy; hours booked on the chosen device;
  duplicates skipped on re-import; nothing saved before commit.
- Journal tests: grouping by year/month, replays listed twice, filters, heatmap counts per day (incl. two finishes on the same day).
- API tests for the stats endpoints and the per-device hours endpoints.
- Network guard: a request from a non-allowed IP (simulated via test client) gets 403.
- Import your real sheets as CSV and compare the totals per category and per year with your spreadsheet's values.
- Metadata: search a few known titles (incl. an old Nintendo game) and check that image + info are stored and served from `/data/covers`; Steam ID extracted from the store link. Mocked RAWG in tests.
- `docker compose up`, then open `http://localhost:8080`, log in, add a game with RAWG data and a physical copy, add a second (digital) copy, sell the physical one (game stays owned), link it to the Switch and to a Trimui Brick (emulated pre-ticked),
  add hours on both devices from Now Playing (total updates), add a DLC from the dropdown, finish it twice with reviews, rate it, sell it; create a console + game bundle;
  add a wishlist game, check official + keyshop price and the gg.deals link; check the journal + heatmap, dashboard, category totals, yearly stats, hardware, DLC and store stats.
- Run `scripts/deploy.sh` against Unraid, then deploy a second time with a new version and check that data and covers persist in `/data`; test a rollback to the previous tag. From the phone: works on home Wi-Fi, works on mobile data **with** WireGuard, fails **without** it.
- Android: run on emulator against the dev server (`10.0.2.2:8080`), then on a real phone.
- Deal alerts: set a target above the current price → `deal_since` set once, `/wishlist/deals?since=` returns it once, the app shows one notification (not again on the next check);
  with the phone off the network, the alert arrives on the next successful check.
- Bundle split: change the default mode in Settings → new bundles use it; switching an existing bundle's mode recalculates its copies.

---

## 14. Open questions / decisions (edit me)

*No open questions at the moment.*

**Resolved:** bundles created in the add-hardware and add-game dialogs (console, Steam and Humble bundles), no bundles page · favorites (heart next to the stars + Favorites page) · bundle split mode configurable (default in Settings + per bundle) · no login, LAN/WireGuard only · deal alerts as Android notifications · EUR · native Android app · multiple copies per game **and hardware** (buy/sell data, condition new/used, format, note per copy; sold = all copies sold) · sell prices count in the copy's buy year · hours entered per device, game total = sum · yearly hours attributed to the game's buy year · DLC tracked per game and added to its cost, with Steam/RAWG dropdown · game metadata from RAWG instead of IGDB (no Twitch account) ·
wishlist added manually, gg.deals prices incl. keyshops always shown, link to gg.deals · category totals include hardware, yearly figures games (+ DLC) only ·
no playtime sync (manual hours) · Now Playing as its own page · statuses On hold / Abandoned / Endless added · global default break-even (3 €/h) with per-category override ·
single user for now · calendar heatmap included · store + physical/digital fields added · ratings 0–5 in 0.5 steps · bundles included · no Excel handling: CSV game import per category + JSON export/import ·
Docker image (and APK) built locally, no registry.

## 15. Future ideas

- **Manual play-session log** (date + hours + device), plus a "log session" widget on Android. Enables exact hours per year, "hours this week" on Now Playing and an hours-per-day heatmap
- "Broke even on" date (needs the session log)
- DLC on the wishlist (with gg.deals prices, since the API also covers DLC by Steam App ID)
- Multiple users (e.g. household) with their own journals and ratings
- Offline mode + sync in the Android app
- Self-signed HTTPS via a local CA
- Optional login (e.g. if guests on the home Wi-Fi become a concern)
