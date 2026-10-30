# Scripturi pentru ro-rp.mp

Acest repository conține câteva dintre scripturile mele realizate pentru proiectul **ro-rp.mp**, un proiect care a fost între timp discontinuat. Fișierele sunt păstrate ca arhivă și nu sunt neapărat complete, actualizate sau pregătite pentru a fi folosite în producție.

## Conținut

- `source/client/` — scripturi și resurse pentru partea de client, inclusiv interfețe și funcționalități precum casino, chat, comenzi, poliție și graffiti.
- `source/server/` — scripturi pentru partea de server și logica funcționalităților proiectului.
- `data/` — fișiere JSON și loguri cu date de configurare sau date salvate de anumite funcționalități.
- `github_build.bat` și `github_update.bat` — scripturi Windows pentru copierea fișierelor între directoarele de lucru și structura `source`.

## Scripturile `.bat`

### `github_build.bat`

Șterge directorul `source` existent, îl recreează și copiază conținutul din `client_packages` în `source/client` și din `packages` în `source/server`. La final, structura `source` poate fi folosită pentru arhivare sau încărcare.

**Atenție:** scriptul șterge complet `source` înainte de copiere. Fă o copie de siguranță a modificărilor din acel director înainte să îl rulezi. Are nevoie de directoarele `client_packages` și `packages` în rădăcina proiectului.

### `github_update.bat`

Copiază fișierele din `source/client` în `client_packages` și din `source/server` în `packages`. Dacă unul dintre directoarele `source` nu există, afișează un mesaj pentru acel director. Copierea nu șterge fișierele suplimentare care există deja în directoarele destinație.

Aceste scripturi sunt unelte locale de copiere și organizare; nu instalează și nu pornesc serverul.
