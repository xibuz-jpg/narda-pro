# Narda Pro — bepul bulutga joylashtirish (Free cloud deploy)

Doimiy, o'zgarmas HTTPS manzil. Tunnel muammosi butunlay yo'qoladi; do'stlar istagan payt o'ynay oladi.

**Stek (hammasi bepul, karта kerak emas):**
| Qism | Xizmat | Nima |
|------|--------|------|
| Kod  | **GitHub** | loyiha kodi shu yerda turadi |
| Ilova | **Render** (Web Service, Docker) | API + WebSocket + Mini App'ni serve qiladi |
| Ma'lumotlar bazasi | **Neon** | PostgreSQL (doimiy) |
| Redis | **Upstash** | presence / matchmaking / lock / soat |

> ⚠️ **Yagona kamchilik:** Render bepul xizmati 15 daqiqa faoliyatsizlikdan keyin "uxlaydi". Keyingi ochilishda ~1 daqiqa "uyg'onadi". Do'st bilan kelishib o'ynash uchun bu odatda muammo emas (birinchi ochgan odam uyg'otadi).

---

## 1. GitHub — kodni joylash
1. [github.com](https://github.com) da hisob oching (bepul).
2. Yangi **private** repo yarating, masalan `narda-pro` (README qo'shmang).
3. Kompyuterda (men yordam beraman):
   ```bash
   git init
   git add -A
   git commit -m "Narda Pro"
   git branch -M main
   git remote add origin https://github.com/<sizning-nomingiz>/narda-pro.git
   git push -u origin main
   ```
   `.env` (maxfiy) `.gitignore`da — commit'ga tushmaydi.

## 2. Neon — PostgreSQL
1. [neon.tech](https://neon.tech) da hisob oching → **Create project**.
2. Project → **Connection string** → **direct** (pooled emas) nusxa oling.
   Ko'rinishi: `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`
3. Buni `DATABASE_URL` sifatida saqlab qo'ying (3-qadamda Render'ga kiritasiz).

## 3. Upstash — Redis
1. [upstash.com](https://upstash.com) da hisob oching → **Create Database** (Redis, region yaqinroq).
2. Database → **ioredis / rediss** ulanish satrini nusxa oling.
   Ko'rinishi: `rediss://default:xxxxx@yyyy.upstash.io:6379`
3. Buni `REDIS_URL` sifatida saqlab qo'ying.

## 4. Render — ilovani joylashtirish
1. [render.com](https://render.com) da hisob oching → GitHub bilan bog'lang.
2. **New → Web Service** → repongizni tanlang.
3. Sozlamalar:
   - **Runtime:** `Docker` (Render `Dockerfile`ni avtomatik topadi)
   - **Instance type:** `Free`
   - **Region:** yaqinroq (masalan Frankfurt)
4. **Environment** bo'limida quyidagilarni qo'shing:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(Neon'dan)* |
   | `REDIS_URL` | *(Upstash'dan)* |
   | `JWT_ACCESS_SECRET` | *(tasodifiy, ≥16 belgi — pastga qarang)* |
   | `JWT_REFRESH_SECRET` | *(boshqa tasodifiy ≥16)* |
   | `TELEGRAM_BOT_TOKEN` | *(BotFather tokeni)* |
   | `TELEGRAM_BOT_USERNAME` | `nardapro_bot` |

   Tasodifiy sirlarni yaratish (kompyuterda):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```
   `PORT`ni qo'lda qo' shmang — Render avtomatik beradi.
5. **Create Web Service** → build boshlanadi (~5-10 daqiqa). Loglarni kuzating.
6. Tayyor bo'lgach Render sizga doimiy manzil beradi:
   `https://narda-pro-xxxx.onrender.com`

## 5. Telegram'ni doimiy manzilga ulash
Render manzilini menga bering — men bot menyu tugmasini avtomatik yangilayman
(`setChatMenuButton`, token ekranda ko'rsatilmaydi).

**Bir-tap taklif (ixtiyoriy):** BotFather → `/mybots` → @nardapro_bot →
**Bot Settings → Configure Mini App → Edit URL** → Render manzilини qo'ying.
Endi manzil o'zgarmagani uchun `?startapp=<kod>` havolasi ham bir tap bilan ishlaydi
(shundan keyin ulashish deep-link'ni qayta yoqamiz).

---

## Migratsiyalar
Konteyner har ishga tushganда `prisma migrate deploy` avtomatik bajariladi
(Dockerfile CMD) — baza sxemasi o'zi tayyorlanadi.

## Yangilanish (keyingi o'zgarishlardan so'ng)
`git push` qilsangiz, Render avtomatik qayta build qilib deploy qiladi. Tamom.
