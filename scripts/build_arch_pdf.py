# -*- coding: utf-8 -*-
"""Narda Pro — tizim arxitekturasi hujjati (PDF). O'zbek tilida."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    NextPageTemplate, PageBreak, KeepTogether, HRFlowable,
)

# ── Palette (premium dark game theme) ───────────────────────────────
NAVY   = colors.HexColor("#0b1020")
NAVY2  = colors.HexColor("#161d33")
SLATE  = colors.HexColor("#3a4666")
GOLD   = colors.HexColor("#f4b23e")
GREEN  = colors.HexColor("#4ad0a0")
INK    = colors.HexColor("#1d2333")
GREY   = colors.HexColor("#5b647d")
LIGHT  = colors.HexColor("#eef1f7")
ROW    = colors.HexColor("#f4f6fb")
LINE   = colors.HexColor("#d7dce8")

PDF = "C:/NARDA/Narda-Pro-Arxitektura.pdf"

styles = getSampleStyleSheet()
def S(name, **kw):
    styles.add(ParagraphStyle(name, parent=styles["Normal"], **kw))

S("Cover",     fontName="Helvetica-Bold", fontSize=34, textColor=colors.white, leading=40, alignment=TA_CENTER)
S("CoverSub",  fontName="Helvetica",      fontSize=13, textColor=GOLD, leading=20, alignment=TA_CENTER)
S("CoverMeta", fontName="Helvetica",      fontSize=10, textColor=colors.HexColor("#c8cfe0"), leading=16, alignment=TA_CENTER)
S("H1",   fontName="Helvetica-Bold", fontSize=17, textColor=NAVY,  leading=22, spaceBefore=6, spaceAfter=8)
S("H2",   fontName="Helvetica-Bold", fontSize=12.5, textColor=SLATE, leading=17, spaceBefore=10, spaceAfter=4)
S("Body", fontName="Helvetica",      fontSize=10, textColor=INK, leading=15, spaceAfter=5, alignment=TA_LEFT)
S("Bull", fontName="Helvetica",      fontSize=10, textColor=INK, leading=15, leftIndent=12, bulletIndent=2, spaceAfter=3)
S("Small",fontName="Helvetica",      fontSize=8.5, textColor=GREY, leading=12)
S("Cell", fontName="Helvetica",      fontSize=9,  textColor=INK, leading=12)
S("CellB",fontName="Helvetica-Bold", fontSize=9,  textColor=NAVY, leading=12)
S("CellW",fontName="Helvetica-Bold", fontSize=9,  textColor=colors.white, leading=12)
S("Box",  fontName="Helvetica-Bold", fontSize=9.5,textColor=colors.white, leading=13, alignment=TA_CENTER)
S("BoxSub",fontName="Helvetica",     fontSize=7.5,textColor=colors.HexColor("#dfe4f0"), leading=10, alignment=TA_CENTER)
S("Conn", fontName="Helvetica-Oblique", fontSize=8, textColor=GREY, leading=11, alignment=TA_CENTER)

def P(t, s="Body"): return Paragraph(t, styles[s])
def bullets(items, style="Bull"):
    return [Paragraph(f"&bull;&nbsp; {t}", styles[style]) for t in items]

# ── Page furniture ──────────────────────────────────────────────────
def cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY); canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(NAVY2); canvas.rect(0, A4[1]-250, A4[0], 250, fill=1, stroke=0)
    canvas.setFillColor(GOLD); canvas.rect(0, 232, A4[0], 3, fill=1, stroke=0)
    # simple dice dots motif
    canvas.setFillColor(colors.HexColor("#222c48"))
    for cx in (70, A4[0]-70):
        canvas.roundRect(cx-26, A4[1]-150, 52, 52, 8, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    for cx in (70, A4[0]-70):
        for dx,dy in ((-14,-14),(0,0),(14,14)):
            canvas.circle(cx+dx, A4[1]-150+26+dy, 3.4, fill=1, stroke=0)
    canvas.restoreState()

def content_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY); canvas.rect(0, A4[1]-24*mm, A4[0], 24*mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD); canvas.rect(0, A4[1]-24*mm-2, A4[0], 2, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 11); canvas.setFillColor(colors.white)
    canvas.drawString(20*mm, A4[1]-16*mm, "Narda Pro")
    canvas.setFont("Helvetica", 8.5); canvas.setFillColor(GOLD)
    canvas.drawRightString(A4[0]-20*mm, A4[1]-16*mm, "Tizim arxitekturasi")
    canvas.setFont("Helvetica", 8); canvas.setFillColor(GREY)
    canvas.drawCentredString(A4[0]/2, 12*mm, f"— {doc.page} —")
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(20*mm, 17*mm, A4[0]-20*mm, 17*mm)
    canvas.restoreState()

# ── Reusable builders ───────────────────────────────────────────────
def kv_table(rows, col0=48*mm, header=None):
    data = []
    if header: data.append([P(header[0], "CellW"), P(header[1], "CellW")])
    for k, v in rows:
        data.append([P(k, "CellB"), P(v, "Cell")])
    t = Table(data, colWidths=[col0, None])
    st = [
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
        ("LINEBELOW",(0,0),(-1,-1),0.4,LINE),
        ("BACKGROUND",(0,0),(0,-1), ROW),
    ]
    start = 0
    if header:
        st += [("BACKGROUND",(0,0),(-1,0),SLATE),("BACKGROUND",(0,0),(0,0),SLATE)]
        start = 1
    for i in range(start, len(data)):
        if (i-start) % 2 == 1:
            st.append(("BACKGROUND",(1,i),(1,i),ROW))
    t.setStyle(TableStyle(st))
    return t

def box(title, sub, bg, w):
    inner = [[P(title,"Box")]]
    if sub: inner.append([P(sub,"BoxSub")])
    t = Table(inner, colWidths=[w])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),bg),
        ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),
        ("ROUNDEDCORNERS",[5,5,5,5]),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ]))
    return t

def layer_row(boxes, total_w):
    """boxes: list of (title, sub, bg). Lay them out evenly across total_w."""
    n = len(boxes)
    gap = 6
    w = (total_w - gap*(n-1)) / n
    cells = [box(t,s,c,w) for (t,s,c) in boxes]
    data = [[]]
    row = []
    for i,c in enumerate(cells):
        row.append(c)
        if i != n-1: row.append("")
    widths = []
    for i in range(n):
        widths.append(w)
        if i != n-1: widths.append(gap)
    t = Table([row], colWidths=widths)
    t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                           ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
                           ("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    return t

def connector(text):
    return P(text, "Conn")

CW = A4[0] - 40*mm  # content width

# ── Document assembly ───────────────────────────────────────────────
story = []

# Cover
story += [Spacer(1, 250),
          P("NARDA&nbsp;PRO", "Cover"),
          Spacer(1, 6),
          P("Tizim Arxitekturasi", "CoverSub"),
          Spacer(1, 40),
          P("Telegram Mini App &nbsp;&middot;&nbsp; Long Narda (uzun nardi) o'yin platformasi", "CoverMeta"),
          Spacer(1, 6),
          P("Server-authoritative &nbsp;&middot;&nbsp; Realtime multiplayer &nbsp;&middot;&nbsp; AI raqib", "CoverMeta"),
          Spacer(1, 120),
          P("Texnik hujjat &nbsp;&middot;&nbsp; v1.0 &nbsp;&middot;&nbsp; 2026", "CoverMeta"),
          NextPageTemplate("content"), PageBreak()]

# 1. Overview
story += [P("1. Umumiy ma'lumot", "H1"),
    P("<b>Narda Pro</b> — Telegramning Mini App platformasi ustida qurilgan, ishlab chiqarish "
      "(production) darajasidagi <b>Long Narda (uzun nardi)</b> o'yin platformasi. Ikki o'yinchi "
      "real vaqtda onlayn o'ynaydi yoki 5 darajali sun'iy intellekt (AI) raqibga qarshi kurashadi.", "Body"),
    P("Arxitektura tamoyillari:", "H2")]
story += bullets([
    "<b>Server-authoritative</b> — har bir yurish serverda toza o'yin dvigateli (engine) tomonidan qayta tekshiriladi; klient hech qachon noqonuniy yurishni majburlay olmaydi (adolat kafolati).",
    "<b>Clean Architecture + DDD</b> — modulli monolit; har bir bounded-context (auth, game, matchmaking, ...) alohida modul, kelajakda ajratib olinadigan qilib qurilgan.",
    "<b>Pure, immutable engine</b> — o'yin qoidalari sof funksional, o'zgarmas (immutable) va deterministik paketda; klient ham, server ham AYNAN bir dvigateldan foydalanadi.",
    "<b>Redis-koordinatsiya, Postgres-haqiqat</b> — Redis tezkor koordinatsiya (lock, navbat, presence), PostgreSQL esa yakuniy haqiqat manbai (natijalar, statistika).",
])

# 2. Tech stack
story += [Spacer(1,6), P("2. Texnologiyalar steki", "H1"),
    kv_table([
        ("Frontend", "React 18, Vite, <b>PixiJS v8</b> (o'yin taxtasi), Zustand, React Query, TypeScript, Tailwind CSS"),
        ("Backend", "<b>NestJS 10</b>, Socket.IO, TypeScript, Prisma ORM"),
        ("O'yin dvigateli", "@narda/game-engine — sof TypeScript paket (CommonJS chiqish)"),
        ("Ma'lumotlar bazasi", "PostgreSQL 16 (haqiqat manbai)"),
        ("Koordinatsiya / kesh", "Redis 7 (lock, navbat, presence, soat, Socket.IO adapter)"),
        ("Monorepo", "pnpm workspaces + Turborepo"),
        ("Autentifikatsiya", "Telegram initData (HMAC) + JWT (rotating refresh)"),
        ("Joylashtirish", "Docker (bitta image), single-origin ServeStatic"),
    ], header=("Qatlam", "Texnologiya"))]

# 3. Monorepo
story += [Spacer(1,8), P("3. Monorepo tuzilishi", "H1"),
    kv_table([
        ("packages/game-engine", "Sof o'yin dvigateli: qoidalar, holat mashinasi (state machine), AI. Klient va server umumiy foydalanadi."),
        ("apps/api", "NestJS backend: REST + WebSocket, server-authoritative o'yin yadrosi."),
        ("apps/web", "React + PixiJS Mini App frontend."),
    ], col0=52*mm)]

# 4. High-level architecture (layered diagram)
story += [Spacer(1,8), P("4. Yuqori darajali arxitektura", "H1"),
    P("Bitta origin (port) orqali API, WebSocket va Mini App'ning o'zi xizmat qilinadi — CORS "
      "muammosi yo'q. Klient va server bir xil o'yin dvigatelini bo'lishadi.", "Body"),
    Spacer(1,8)]
story += [layer_row([
        ("KLIENT — Telegram Mini App", "React &middot; PixiJS taxta &middot; Zustand &middot; i18n", SLATE),
    ], CW),
    connector("HTTPS (REST /api)  &nbsp;&nbsp;+&nbsp;&nbsp;  WSS (Socket.IO: /matchmaking, /game)"),
    layer_row([
        ("NestJS API", "REST controllerlar", NAVY2),
        ("Socket.IO Gateway'lar", "realtime intentlar", NAVY2),
        ("Server-authoritative yadro", "engine + Redis lock", NAVY2),
    ], CW),
    connector("har bir yurish dvigatel tomonidan tekshiriladi"),
    layer_row([
        ("PostgreSQL", "haqiqat manbai: natija, statistika, ELO", colors.HexColor("#2a5d8f")),
        ("Redis", "lock, navbat, presence, soat, pub/sub", colors.HexColor("#8f3a2a")),
    ], CW),
    Spacer(1,6),
    layer_row([
        ("@narda/game-engine — sof, o'zgarmas dvigatel (klient + server umumiy)", "", colors.HexColor("#3d7a5a")),
    ], CW),
]

story += [PageBreak()]

# 5. Game engine
story += [P("5. O'yin dvigateli (Game Engine)", "H1"),
    P("Sof, o'zgarmas (immutable), deterministik TypeScript paket. Backgammon emas — "
      "<b>Long Narda (uzun nardi)</b> qoidalari:", "Body")]
story += bullets([
    "Har bir o'yinchida 15 tosh <b>boshda</b> (White 24-nuqta, Black 12-nuqta); ikkalasi ham BIR yo'nalishda yuradi.",
    "<b>Urish yo'q</b> — raqibning yolg'iz toshi nuqtani BLOKLAYDI (o'sha nuqtaga tushib bo'lmaydi).",
    "<b>Bosh qoidasi</b> — har navbatda boshdan ko'pi bilan 1 tosh (ochilish 3-3/4-4/6-6 da 2 ta).",
    "Mars = 2 ochko, oddiy g'alaba = 1 ochko.",
])
story += [P("Asosiy qism (modullar):", "H2"),
    kv_table([
        ("GameState", "Holat mashinasi: roll -> move -> validate; g'alaba/mars aniqlash; event log; snapshot."),
        ("turn / move", "Qonuniy yurishlar generatsiyasi; bosh qoidasi qidiruv paytida qat'iy tekshiriladi."),
        ("evaluate", "Pozitsiyani baholovchi heuristika (progress, pip-race, made points, prime, blot risk)."),
        ("AI (chooseTurn)", "5 daraja: EASY / MEDIUM / HARD / EXPERT / GRANDMASTER; yuqori darajalar 2-ply expectimax."),
        ("SeededRandom / CryptoRandom", "Deterministik test uchun urug'li RNG; jonli o'yinda CSPRNG zarlar."),
    ], col0=44*mm)]

# 6. Backend modules
story += [Spacer(1,6), P("6. Backend modullari (NestJS)", "H1"),
    kv_table([
        ("config", "Zod bilan tekshiriladigan environment; xato sozlamada server darrov to'xtaydi (fail-fast)."),
        ("auth", "Telegram initData HMAC tekshiruvi + JWT; rotating refresh token (family theft-detection)."),
        ("users", "Profil, displayName, ELO/statistika; auth-context Redis'da keshlanadi."),
        ("realtime", "Socket.IO WS handshake autentifikatsiyasi + presence; Redis IO adapter."),
        ("game", "Server-authoritative yadro: intentlar, Redis lock, soat, /game gateway, do'st taklifi."),
        ("matchmaking", "Redis navbatlari (ELO bo'yicha RANKED, FIFO CASUAL); reaktiv + davriy juftlash."),
        ("progression", "O'yin tugagach ELO (K=32) va statistikani atomik tranzaksiyada yangilaydi."),
    ], header=("Modul", "Vazifa"), col0=36*mm)]

story += [PageBreak()]

# 7. Realtime & coordination
story += [P("7. Realtime va koordinatsiya", "H1"),
    P("<b>Socket.IO namespace'lar:</b>", "H2")]
story += bullets([
    "<b>/matchmaking</b> — navbatga qo'shilish, juftlash haqida <i>matchmaking:found</i> push; do'st taklifini kutish (<i>invite:wait</i>).",
    "<b>/game</b> — o'yin xonasi: intentlar (roll, move, double, resign); holat o'zgarishi butun xonaga tarqatiladi.",
])
story += [P("<b>Redis nima uchun ishlatiladi:</b>", "H2"),
    kv_table([
        ("Distributed lock", "Har match uchun `game:{id}` lock — holat o'zgarishlari ketma-ket (race yo'q)."),
        ("Game state store", "Jonli o'yin holati (snapshot) Redis'da; reconnect bepul (holat saqlanib turadi)."),
        ("Matchmaking navbatlari", "Mode bo'yicha sorted-set; RANKED ELO-skorli, kengayuvchi oyna."),
        ("Deadline ZSET", "Soat muddatlari; har soniyada sweep — vaqt tugagan o'yinchi forfeit."),
        ("Presence", "`game:online:{id}` to'plami; ulanish/uzilishda `game:presence` broadcast."),
        ("Socket.IO adapter", "Redis pub/sub — broadcast'lar bir nechta API node'ga tarqaladi (gorizontal masshtab)."),
    ], col0=44*mm)]
story += [P("<b>Chess-clock (shaxmat soati):</b> har yurishga 10 soniya bepul (grace); undan oshgani "
      "o'yinchining 3.5 daqiqalik zaxira bankidan yechiladi. Bank tugab, grace o'tsa — forfeit. "
      "Soat birinchi o'yinchi ulanganda quriladi (ulanishdan oldingi kutish hisoblanmaydi).", "Body")]

# 8. Data model
story += [Spacer(1,6), P("8. Ma'lumotlar modeli (PostgreSQL / Prisma)", "H1"),
    kv_table([
        ("User", "Telegram foydalanuvchi: telegramId, displayName, elo, photoUrl, ..."),
        ("Match", "Bir o'yin: mode (RANKED/CASUAL/AI), variant, status, winner, endReason, pointsAwarded."),
        ("MatchPlayer", "O'rindiq: color (WHITE/BLACK), userId | isAI + aiLevel, eloBefore/eloAfter, isWinner."),
        ("GameEvent", "To'liq event log (GAME_STARTED, ROLLED, TURN_PLAYED, GAME_ENDED) — audit / qayta o'ynash."),
        ("PlayerStats", "gamesPlayed, wins, losses, gammonsWon, streak, totalPointsWon, ..."),
        ("RefreshToken", "Aylanuvchi refresh tokenlar oilasi (theft-detection)."),
    ], header=("Jadval", "Mazmuni"), col0=34*mm)]

story += [PageBreak()]

# 9. Game flows
story += [P("9. Asosiy o'yin oqimlari", "H1")]
story += [P("<b>9.1 Do'st bilan onlayn o'yin (private invite)</b>", "H2")]
story += bullets([
    "Host <i>POST /games/invite</i> -> Redis'da 6 belgili kod (1 soat TTL) -> /matchmaking'da <i>invite:wait</i> bilan kutadi.",
    "Do'st kodni <i>POST /games/invite/:code/accept</i> bilan qabul qiladi -> odatdagi <i>createGame</i> match yaratiladi.",
    "<i>INVITE_ACCEPTED</i> hodisasi host'ga <i>matchmaking:found</i> push qiladi -> ikkovi /game xonasiga ulanadi.",
])
story += [P("<b>9.2 Reyting/oddiy juftlash (matchmaking)</b>", "H2")]
story += bullets([
    "O'yinchi <i>matchmaking:join</i> -> Redis navbatiga tushadi (RANKED: ELO-skor, CASUAL: FIFO).",
    "Reaktiv + har 4 soniyada sweep juftlaydi; oyna kutish bilan kengayadi -> hammaga juft topiladi.",
    "Juft topilganda ikkala o'yinchiga <i>matchmaking:found {matchId}</i> yuboriladi.",
])
story += [P("<b>9.3 Jonli yurish (server-authoritative)</b>", "H2")]
story += bullets([
    "Klient intent yuboradi (roll/move) -> gateway -> GameService Redis lock ostida.",
    "Toza dvigatel intentni qayta tekshiradi (navbat + qoida qonuniyligi) -> yangi holat.",
    "Holat Postgres'ga emas, Redis'ga saqlanadi; <i>GAME_STATE_CHANGED</i> butun xonaga broadcast.",
    "O'yin tugaganda: natija + event log + ELO/statistika BITTA atomik tranzaksiyada Postgres'ga yoziladi.",
])

# 10. Frontend
story += [Spacer(1,6), P("10. Frontend arxitekturasi", "H1"),
    kv_table([
        ("Ekranlar", "Splash, Login, Name, Home (lobby), Invite, Game — lozim bo'lganda lazy-load."),
        ("Holat (Zustand)", "auth.store, game.store (socketlar), ui.store; React Query bilan profil kesh."),
        ("BoardRenderer (PixiJS)", "1500x900 'design-space'da chizib, ekranga masshtablanadi; vertikal/yotiq va per-viewer perspektiva."),
        ("Animatsiya + ovoz", "Zar tumbling, tosh siljishi; Web Audio protsedural SFX (asset fayl yo'q)."),
        ("i18n", "uz / ru / en; Telegram tilidan avtomatik aniqlanadi."),
    ], col0=44*mm)]

# 11. Security
story += [Spacer(1,6), P("11. Xavfsizlik", "H1")]
story += bullets([
    "<b>Server-authoritative</b> — har bir yurish serverda tekshiriladi; klientga ishonilmaydi.",
    "<b>Telegram initData HMAC</b> — kirish imzosi bot tokeni bilan tasdiqlanadi (replay himoyasi bilan).",
    "<b>JWT + rotating refresh</b> — qisqa umrli access token; refresh oilasi o'g'irlikni aniqlaydi.",
    "<b>Anti-cheat</b> — intent tezligi cheklanadi; noqonuniy urinishlar qayd etiladi.",
    "<b>Redis lock + rate limiting</b> — poyga (race) va flood himoyasi.",
])

# 12. Deployment
story += [Spacer(1,6), P("12. Joylashtirish (Deployment)", "H1")]
story += bullets([
    "<b>Single-origin</b> — NestJS ServeStatic Mini App'ni ham beradi (web + API + WS bitta portda).",
    "<b>Docker</b> — bitta image monorepo'ni build qilib, migratsiyalarni qo'llab, serverni ishga tushiradi.",
    "<b>Bepul bulut</b> — Render (ilova) + Neon (PostgreSQL) + Upstash (Redis); doimiy HTTPS manzil.",
    "<b>Migratsiyalar</b> — konteyner ishga tushganda <i>prisma migrate deploy</i> avtomatik.",
])
story += [Spacer(1,14), HRFlowable(width="100%", thickness=0.6, color=LINE),
    Spacer(1,6), P("Narda Pro — Telegram Mini App Long Narda platformasi. Ushbu hujjat loyihaning "
    "joriy arxitekturasini aks ettiradi (v1.0, 2026).", "Small")]

# ── Build ───────────────────────────────────────────────────────────
doc = BaseDocTemplate(PDF, pagesize=A4,
                      leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm,
                      title="Narda Pro — Tizim Arxitekturasi", author="Narda Pro")
cover_frame = Frame(0, 0, A4[0], A4[1], leftPadding=40, rightPadding=40, topPadding=0, bottomPadding=0, id="cover")
content_frame = Frame(20*mm, 20*mm, A4[0]-40*mm, A4[1]-20*mm-28*mm, id="content")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[cover_frame], onPage=cover_bg),
    PageTemplate(id="content", frames=[content_frame], onPage=content_bg),
])
doc.build(story)
print("OK ->", PDF)
