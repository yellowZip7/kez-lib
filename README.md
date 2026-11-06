# K’s Dramas

A private, Netflix-style watchlist. It links out to official places to watch (Viki, Netflix, library apps, official YouTube channels) and hosts no video.

## What’s in this folder

- `index.html` — the whole site (one file).
- `api/shows.js` — a small Vercel function that stores her shows and statuses in Upstash Redis, behind a passcode.
- `tests/` — automated tests (not needed to run the site).

## Deploy on Vercel (one-time, about 15 minutes)

1. Put this folder in a new GitHub repository (the `tests/` folder is optional; leave `node_modules` out).
2. In Vercel, choose **Add New → Project**, import the repository, and deploy. There is nothing to build.
3. In the Vercel project, open **Storage**, add **Upstash Redis** (the free plan is plenty), and connect it to the project. This adds the database settings for you.
4. Open **Settings → Environment Variables** and add `SHOWS_PASSCODE` with a passcode you choose. Use something she can type easily but others won’t guess.
5. **Redeploy** (Deployments → the latest one → Redeploy) so the new settings are picked up.
6. Open your `*.vercel.app` address. Keep using that same address, because her browser remembers things per address.

### First real run (checklist)

- [ ] Open the site on your phone: it asks for the passcode. Enter it.
- [ ] Tap **+**, add a show with a link and a photo, and save.
- [ ] Open the site on a laptop, enter the passcode once, and see the same show.
- [ ] Change its status on one device and refresh the other.
- [ ] Turn on airplane mode, add a show, turn it off: it should say it will sync, then catch up.

## How she adds a show

Tap **+** in the header. Only the title is required. Links work with or without `https://`. A poster photo is shrunk to a small thumbnail automatically. Her own shows have **Edit** and **Remove** in their details panel.

## Adding a show yourself in the code

Open `index.html`, find `const SHOWS = [];`, and add entries like `{ title: "…", poster: "", synopsis: "…", watchUrl: "https://…", service: "Viki" }`, separated by commas. Shows listed here appear for everyone, can’t be edited or removed from the site, and keep their Watching/Up next/Finished status on each device only.

## Extras on the site

- **Search and filters:** a search box and chips (All, Watching, Up next, Finished, From Baba) above the shows.
- **Ratings and notes:** open a show to give it stars and write a note. These are saved on that device only.
- **From Baba:** tap **+**, fill in the show, tick **This is a pick from Baba** and write a note. It appears in the “From Baba” row; she can tap **Add to my list**. This needs the updated `api/shows.js` (it keeps the pick flag and the note).
- **Baba the mascot:** the button in the corner opens help, notes and the letter. A random note pops up in a bubble each time she opens the site. To change the notes and letter, open `index.html` and look for `MASCOT` and `LETTER`.
- **The letter:** shows once per browser the first time the site is opened (add `#letter` to the address to preview it again). Open the real link yourself only after she has, or use a private window.

## Troubleshooting

- **“Enter the passcode” keeps coming back:** the passcode is wrong, or `SHOWS_PASSCODE` was changed and the project wasn’t redeployed.
- **“Too many tries”:** after 10 wrong passcodes from one address the site pauses for 15 minutes.
- **“Sync is off here”:** the page can’t reach `/api/shows` (for example, it was opened as a plain file or in a preview). Shows are saved on that device only.
- **Shows missing on a new phone or address:** shows live in the database, not the device. Check you entered the passcode and are on the same Vercel address.

## Running the tests

```
node tests/logic.test.js
node tests/shows-logic.test.js
node tests/api.test.js
cd tests && npm install && cd ..
for f in tests/ui/*.test.js; do node "$f" || break; done
```

## Known limits

- The passcode is a hobby-level lock, not strong security.
- If two devices edit the same show at the same moment, the last save wins.
- The free Vercel and Upstash plans are far above what one person needs.
- A backup/restore button is not included.
