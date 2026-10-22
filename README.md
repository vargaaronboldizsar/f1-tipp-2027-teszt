# f1-tipp-2027-teszt

## Sisakavatár-gyűjtemény (világbajnokok, 1950–2025)

- A `assets/helmets/world-champions/` könyvtárban 76 külön SVG sisakavatár található, három korszak szerinti almappában.
- A `data/helmet-avatars-world-champions.json` a kliensoldali katalógus; a profilgaléria ebből a beépített katalógusból dolgozik.
- A `data/firestore-helmetAvatars-seed.json` Firestore seed-adatként szolgál, `helmetAvatars` kollekcióhoz. Ez egy JSON exportformátum, nem automatikus feltöltés.
- **Fontos:** ezek egységes, eredeti stilizált sisakillusztrációk a bajnoki év és a versenyző alapján; nem hitelesen ellenőrzött, hivatalos sisakmásolatok, és nem tartalmaznak csapatlogókat/szponzorlogókat. A történeti bajnoklista 1950–2025 között a Motorsport Magazine listája alapján készült.
- Jelenleg a képek a GitHub Pages projekt `assets/` mappájából töltődnek be. Firebase Storage-ra történő feltöltéshez külön feltöltési lépés és Storage-szabályok szükségesek.
