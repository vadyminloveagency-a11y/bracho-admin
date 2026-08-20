# Bracho program (operator)

Electron app for operators:

1. Sign in with Bracho operator email/password
2. Pick an assigned anketa
3. App logs into Golden Bride chat the same way HelpChat does:
   `POST https://goldenbride.net/goldenbride/services/login`
   with `username` (anketa ID), `userpass`, `doremember=true`, then opens `/lady`

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

API default: `https://bracho.onrender.com`  
Override: set env `BRACHO_API` or change via config in userData.
