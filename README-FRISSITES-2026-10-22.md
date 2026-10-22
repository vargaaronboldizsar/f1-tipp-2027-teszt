# APEX F1 Tipp – fiók és PWA frissítés

- A Profil és Beállítások egyetlen **Fiókom** menüpont alá került.
- A profil, kedvenc csapat/pilóta, téma és értesítési preferenciák ugyanazon az oldalon állíthatók.
- Az értesítési preferenciák Firestore `notificationPrefs` mezőben mentődnek; tényleges e-mail/push kézbesítés még nincs bekötve.
- A fejléc avatárja a kiválasztott sisak katalógusbeli képét használja.
- A korábbi Pilóták menüpont Hírek néven szerepel, a csapat/pilóta szűrőkkel; a kártyák demo tartalmak, amíg az élő hírszolgáltatás nincs bekötve.
- `sw.js` kezeli az alkalmazás-shell frissítését, és új verzió esetén frissítés gombot jelenít meg.

A GitHub Pages-en való publikálás után első betöltéskor a böngésző frissít, az új service worker pedig a következő körben veszi át a vezérlést. Érdemes külön ellenőrizni Androidon és iOS-en a telepített webappot, mert a platformok frissítési viselkedése eltérhet.
