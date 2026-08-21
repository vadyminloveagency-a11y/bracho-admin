# Bracho program (operator)

Electron app for operators:

1. Sign in with Bracho operator email/password
2. Pick an assigned anketa
3. App opens Golden Bride **chat** (`/chat`) and logs in the same way HelpChat does:
   `POST https://goldenbride.net/goldenbride/services/login`
   with `username` (anketa ID), `userpass`, `doremember=true`, then reloads `/chat`
   (chat auth page with the button to enter the chat — not the `/lady` home page)

## Run

```bat
START.bat
```

or:

```bash
cd program
npm install
npm start
```

## Build Windows .exe

```bat
cd program
npm install
npm run dist
```

Output in `program/dist/`:

- `Bracho.exe` — portable (no install, just run)
- `Bracho-Setup-0.1.0.exe` — installer with shortcut

API default: `https://bracho.onrender.com`  
Override: set env `BRACHO_API` or change via config in userData.
