# מפלצת הבלגן 🧽

משחק שיתופי לזוגות לחלוקת מטלות הבית.

1. **מחלקים:** כל שבוע קלפי המטלות מתהפכים. כל מטלה הולכת לאחד מכם, או לשניכם ביחד, עד שהחלוקה נכנסת ל"אזור האיזון".
2. **מביסים:** לאורך השבוע כל אחד מסמן מהטלפון שלו מה עשה. כל מטלה יורה על מפלצת הבלגן ומורידה לה חיים. מטלה משותפת נספרת רק כששניכם מאשרים.
3. **חוגגים:** אם המדים של שניכם מתאפסים עד סוף השבוע, המפלצת מובסת והפרס המשותף שלכם. כל שבוע נשמר בהיסטוריה.

כל זוג נרשם עם חשבון Google: אחד פותח "בית" ושולח קוד הזמנה, והשני מצטרף מהטלפון שלו.

**לנסות בלי הרשמה:** פותחים את `index.html?demo=1`. במצב הזה הכול נשמר בדפדפן בלבד. אפשר לפתוח שתי לשוניות ולבחור שחקן אחר בכל אחת.

---

## Stack

- Static site (HTML, CSS, vanilla JS modules). No build step. Hosted on **GitHub Pages**.
- **Firebase Authentication** (Google sign-in) and **Cloud Firestore** for each couple's data. Both are on the free Spark plan.

```
index.html               page shell
css/style.css            all styles
js/app.js                game, screens, animation, sound
js/backend-firebase.js   Firebase sign-in + Firestore
js/backend-demo.js       same interface, stored in localStorage (?demo=1)
js/firebase-config.js    your Firebase web config (fill this in)
firestore.rules          security rules: only a couple's two members can read or write their data
```

### Data model

```
users/{uid}                        { householdId }
invites/{code}                     { householdId }        6-character join code
households/{hid}                   members[2], inviteCode, game state (players, chores, draft, current week…)
households/{hid}/marks/{id}        one document per "I did this chore" tap
households/{hid}/pings/{id}        cheers and thank-yous between partners
households/{hid}/weeks/{n}         saved summary of each finished week (history screen)
```

## Setup (about 10 minutes, one time)

1. **Create a Firebase project:** go to https://console.firebase.google.com, then **Add project**. Google Analytics isn't needed.
2. **Turn on Google sign-in:** Build → Authentication → Get started → Sign-in method → **Google** → Enable.
3. **Create the database:** Build → Firestore Database → Create database. Choose **production mode** and a nearby location.
4. **Paste the security rules:** Firestore → Rules. Replace the contents with [`firestore.rules`](firestore.rules), then click **Publish**.
5. **Register a web app:** Project settings (gear icon) → General → Your apps → **Web** (`</>`). Copy the `firebaseConfig` values into [`js/firebase-config.js`](js/firebase-config.js).
6. **Authorize your site's domain:** Authentication → Settings → Authorized domains → **Add domain**. Add `<your-github-username>.github.io`. (`localhost` is already on the list.)
7. **Turn on GitHub Pages:** in the repo, Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)`. The game goes live at `https://<your-github-username>.github.io/<repo-name>/`.

## Run locally

Any static server works, for example:

```bash
npx serve .
```

Then open `http://localhost:3000/?demo=1`, or open it without `?demo=1` once `firebase-config.js` is filled in.
