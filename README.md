# ERR raamatupidamise avalduse prototüüp

Lihtne sisemine vorm töötajale, kes peab saatma raamatupidamisele avalduse, kui Web Desktopi litsentsi enam ei ole.

Andmebaasi **ei ole**, ja see on taotluslik. E-ITS-i mõttes ei looda uut isikuandmete hoidlat. Ärilihtne vajadus on saata e-kiri raamatupidamisele, mitte pidada avalduste registrit, kinnitusringi ega staatust.

## Mida prototüüp teeb

- Näitab identiteediväravat **ERR identiteet (prototüüp)**. Päris ERR SSO-d ei ole.
- Kolm näidistöötajat (nimi ja `@err.ee` aadress). Pärast sisenemist on nimi ja e-post vormil ainult loetavad.
- Avalduse liik valitakse esialgsest nimekirjast. Lõpliku loetelu kinnitab raamatupidamine. Alati on olemas ka „Muu“.
- Vaba tekst ja saatmine. Klient ei kuva õnnestumist ise: ta ootab serveri vastust.
- Kui `SMTP_HOST` on seatud, saadetakse päris kiri (`smtplib`) aadressile `ACCOUNTING_EMAIL`. Õnnestumine tuleb alles siis, kui server kirja vastu võtab.
- Kui SMTP-d ei ole (selle keskkonna vaikeseade), antakse kiri üle **prototüübi postkasti** (protsessi mälu, kaob taaskäivitusel) ja lisatakse rida faili `logs/avaldused.log`. Kasutajale öeldakse selgelt, et päris postkasti kiri ei läinud.
- „Simuleeri saatmise viga“ paneb serveri saatmisest keelduma. Kasutaja näeb viga, mitte õnnestumist. Katse logitakse.

Kirjas on saatja nimi, saatja ERR e-post, liik, tekst ja esitamise aeg (Europe/Tallinn).

## Mida prototüüp ei tee

- Kinnitusring, juhi kinnitus, staatuse jälgimine, esitamisajalugu.
- Raamatupidamise tööjärjekord, otsing, aruanded.
- Digiallkiri, dokumendiregister, keerulised rollid.
- Avalduste andmebaas.
- Päris ERR identiteet.

Prototüübi postkast on ainult demo, et näha üleantud kirja. See ei ole juhtumite haldus.

## Käivitus

Python 3.9 või uuem. Lisapakette ei ole.

```bash
python3 server.py
```

Avaneb aadressil [http://127.0.0.1:8741/](http://127.0.0.1:8741/).

## Jagatav ülevaatuse koopia

[https://marellaoo.github.io/RPavaldusedProto/](https://marellaoo.github.io/RPavaldusedProto/) on brauseris töötav koopia kaustast `docs/`. See ei saada e-kirja ja raamatupidamine avaldust ei saa. Postkast on ainult selle brauseri vahekaardi `sessionStorage`. Kohalik server jääb eraldi ja kasutab kausta `static/`.

## Seadistus

| Muutuja | Vaikimisi | Tähendus |
| --- | --- | --- |
| `ACCOUNTING_EMAIL` | `raamatupidamine@err.ee` | Saaja. Päris aadressi otsustab raamatupidamine, see on kohatäide. |
| `SMTP_HOST` | tühi | Kui tühi, kasutatakse prototüübi postkasti. |
| `SMTP_PORT` | `587` | `587` kasutab STARTTLS-i, `465` otse TLS-i. |
| `SMTP_USER` | tühi | Vajalik ainult siis, kui server nõuab sisselogimist. |
| `SMTP_PASSWORD` | tühi | |
| `SMTP_FROM` | `noreply-avaldused@err.ee` | Ümbriku saatja. Töötaja aadress on kirja sisus ja `Reply-To` päises. |
| `SMTP_STARTTLS` | `1` | Sea `0`, kui pordil 587 ei tohi STARTTLS-i teha. |

Päris saatmine:

```bash
SMTP_HOST=smtp.example.ee SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... \
ACCOUNTING_EMAIL=raamatupidamine@err.ee python3 server.py
```

## Logi

`logs/avaldused.log` tekib esimesel saatmiskatsel. Üks rida on üks katse:

`aeg (Europe/Tallinn) · tulemus · saatja · liik`

Tulemused: `ok-prototype`, `ok-smtp`, `fail-simulated`, `fail-smtp`.

Tühja välja tõttu tagasi lükatud avaldust ei saadeta ja logisse ei kirjutata. Avalduse vaba teksti logisse ei panda.

## Näidistöötajad

- Mari Tamm — mari.tamm@err.ee
- Kadri Lepp — kadri.lepp@err.ee
- Andres Kivi — andres.kivi@err.ee

Need ei ole päris ERR kataloog. Töökeskkonnas tulevad nimi ja e-post identiteedist.

## Esialgsed avalduse liigid

- Vaba päeva / puudumisega seotud avaldus
- Tasu või väljamaksega seotud avaldus
- Hüvitisega seotud avaldus
- Muu

Arendus ei lisa siia omi liike. Lõpliku nimekirja annab raamatupidamine.
