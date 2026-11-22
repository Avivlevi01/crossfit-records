# העלאה לאונליין (מדריך)

המדריך מתאר את המסלול שהומלץ: **שרת VPS קטן עם Docker Compose**. כל הקבצים כבר מוכנים בפרויקט:

| קובץ | תפקיד |
|---|---|
| `docker-compose.prod.yml` | מריץ שלושה שירותים: מסד הנתונים, האפליקציה ו-Caddy (הדלת הקדמית עם HTTPS אוטומטי) |
| `Caddyfile` | מגדיר ל-Caddy לשרת את הדומיין שלך ולהעביר בקשות לאפליקציה |
| `.env.production.example` | תבנית להגדרות השרת (סיסמאות, קוד הזמנה, דומיין) |
| `scripts/backup.sh`, `scripts/restore.sh` | גיבוי ושחזור של מסד הנתונים |

בשרת רק Caddy חשוף לאינטרנט (פורטים 80 ו-443). האפליקציה והמסד נמצאים ברשת פנימית של Docker.

---

## 1. מה צריך לבחור (ועולה כסף)

**שרת.** המחירים משתנים, ולכן **בדוק באתר הרשמי של הספק לפני התשלום.** הסכומים הבאים הם אומדן מחיפוש:

| אפשרות | עלות בערך | הערות |
|---|---|---|
| **Hetzner Cloud** (שרת קטן, 2 ליבות, 4GB) | כ-4–5 € לחודש (כ-17–21 ₪) | המלצה. אירופה (גרמניה או פינלנד). מחירים עלו ב-2026. |
| Render או Railway (PaaS) | כ-5–10$ לחודש | קל יותר (בלי ניהול שרת), אבל יקר יותר, ושכבת החינם "נרדמת" והמסד החינמי נמחק אחרי כחודש. |
| Oracle Cloud "Always Free" | חינם | בפועל קשה לפעמים לקבל משאבים, וחשבון עלול להיסגר ללא התראה. לא מומלץ לאתר שחברים סומכים עליו. |

**כתובת (דומיין).** HTTPS דורש שם דומיין, לא כתובת IP.
- **שם חינמי:** שירות כמו DuckDNS נותן כתובת מהצורה `something.duckdns.org`. מתאים ואפשר להתחיל איתו.
- **דומיין משלך:** כ-10 € בשנה (כ-3–4 ₪ לחודש). נראה יותר רציני וקל לזכור.

**קוד האתר בשרת.** הקוד נמצא רק על המחשב שלך. שתי דרכים:
- **Repo פרטי ב-GitHub** (מומלץ): חינם, ומאפשר עדכון קל עם `git pull`. צריך ליצור אותו (אני לא אעשה זאת בלי אישור שלך).
- העתקה ידנית עם `scp` או `rsync`: עובד, אבל כל עדכון ידני.

---

## 2. הכנת השרת (פעם אחת)

אחרי שיצרת שרת עם **Ubuntu 24.04** והוספת מפתח SSH, התחבר ובצע:

```bash
# עדכון והתקנת Docker
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# חומת אש: רק SSH, HTTP ו-HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

הצבע את הדומיין על כתובת ה-IP של השרת (רשומת `A` אצל ספק הדומיין או ב-DuckDNS). **חכה שהיא תתעדכן** (דקות עד שעה) לפני ההפעלה, אחרת Caddy לא יצליח להוציא תעודת HTTPS.

## 3. הפעלה

```bash
# מביאים את הקוד (דוגמה עם repo פרטי)
git clone <כתובת-ה-repo> crossfit-records && cd crossfit-records

# הגדרות
cp .env.production.example .env
nano .env        # ממלאים: DOMAIN, סיסמאות, SECRET_KEY, INVITE_CODE
```

ליצירת סיסמה או מפתח אקראיים: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`.

> האפליקציה **מסרבת לעלות** בייצור אם נשארה בקובץ המילה `CHANGE-ME`. זו הגנה מפני טעות.

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # כל השירותים צריכים להיות Up
```

פתח `https://הדומיין-שלך`. אחרי שהאתר עולה:
1. הירשם עם קוד ההזמנה, זה המשתמש הראשון שלך.
2. שלח לחברים את הכתובת ואת קוד ההזמנה.

## 4. גיבויים (חשוב)

```bash
chmod +x scripts/*.sh
./scripts/backup.sh          # בדיקה ידנית: יוצר קובץ ב-backups/
```

**גיבוי יומי אוטומטי** (פותחים `crontab -e` ומוסיפים שורה; כאן כל לילה ב-03:00):

```
0 3 * * * cd /root/crossfit-records && ./scripts/backup.sh >> backups/backup.log 2>&1
```

> **גיבוי שנמצא רק על אותו שרת אינו מספיק**: אם השרת נמחק או נשבר, הגיבוי נעלם איתו. פעם בשבוע (או אוטומטית) תעתיק את התיקייה `backups/` למקום אחר, למשל למחשב שלך:
> `scp -r root@הדומיין:crossfit-records/backups ./crossfit-backups`

**שחזור** (מוחק את המסד הנוכחי ומחליף אותו בגיבוי!):

```bash
./scripts/restore.sh backups/crossfit-2026-11-20_030000.sql.gz
```

בדקתי את הגיבוי והשחזור על עותק מקומי של הסביבה: מחקתי בכוונה את הנתונים, שחזרתי, והכול חזר כולל התחברות. **כדאי לבצע שחזור ניסיון גם על השרת עצמו** לפני שמסתמכים על זה.

### גיבוי כשהמסד ב-Neon (Cloud Run)

הסקריפטים `backup-neon.sh` ו-`restore-neon.sh` צריכים רק Docker. את מחרוזת החיבור של Neon (סוד!) מדביקים כשהסקריפט שואל (ההקלדה מוסתרת), או מעבירים במשתנה `NEON_DATABASE_URL`. היא לא נכתבת לשום קובץ.

```bash
./scripts/backup-neon.sh                                  # יוצר backups/neon-<תאריך>.sql.gz
./scripts/restore-neon.sh backups/neon-<תאריך>.sql.gz     # מוחק את המסד שבחרת ומחליף בגיבוי
```

הסקריפט בוחר לבד את גרסת `pg_dump` שתואמת לשרת. בדקתי גיבוי ושחזור על Postgres 17 מקומי (200 שורות חזרו תקינות), **לא** על Neon עצמו. מומלץ לתרגל שחזור על מסד/ענף ריק ב-Neon, לא על החי. גם כאן: העתק את הקובץ למקום מחוץ למחשב.

## 5. עדכון האתר

```bash
cd crossfit-records
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

שינויים במבנה המסד מוחלים אוטומטית (מיגרציות) בהפעלה. **עשה `./scripts/backup.sh` לפני עדכון.**

## 6. שימושי

```bash
docker compose -f docker-compose.prod.yml logs -f app        # יומן האפליקציה
docker compose -f docker-compose.prod.yml logs -f caddy      # יומן ה-HTTPS
docker compose -f docker-compose.prod.yml exec app python -m app.admin list-users
docker compose -f docker-compose.prod.yml exec app python -m app.admin set-password <שם-משתמש>
```

**איפוס סיסמה לחבר:** הפקודה `set-password` למעלה. היא גם מנתקת את כל ההתחברויות הישנות שלו.

**שינוי קוד ההזמנה:** ערוך את `INVITE_CODE` ב-`.env` והרץ שוב `up -d`. חברים שכבר נרשמו לא מושפעים.

## 7. טעויות נפוצות

- **אין HTTPS או שגיאת תעודה:** הדומיין עדיין לא מצביע על השרת, או שפורטים 80/443 חסומים. בדוק `docker compose ... logs caddy`.
- **"בקשות מרובות" אחרי כמה ניסיונות התחברות:** זו ההגנה מפני ניחוש סיסמאות. מחכים כמה דקות או מפעילים מחדש את האפליקציה.
- **שכחת `COOKIE_SECURE=true`:** האתר יעבוד, אבל ללא ההגנות של HTTPS. השאר אותו `true`.
