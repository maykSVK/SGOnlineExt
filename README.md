# StarGame pomocnik

Tampermonkey userscript aj lokalne rozsirenie Manifest V3 pre kompatibilne prehliadace.
Funkcie su dostupne z hlavneho menu: **Utok na Valu**, **Idealne zaludnenie**
a **Nase sektory**.
Herny kod neodosiela udaje mimo herneho servera a nepozaduje pristup k heslam.
Tampermonkey stahuje instalaciu a aktualizacie z GitHubu.

## Instalacia

### Tampermonkey (odporucane pre Opera a Lemur na Androide)

1. Nainstaluj a povol Tampermonkey v kazdom prehliadaci. Ak prehliadac vyzaduje
   osobitne povolenie spustania userscriptov, postupuj podla upozornenia Tampermonkey.
2. Otvor [instalacny odkaz](https://raw.githubusercontent.com/maykSVK/SGOnlineExt/main/stargame-pomocnik.user.js)
   a potvrd instalaciu v Tampermonkey. Repozitar musi byt verejne dostupny.
3. Vypni povodne rozsirenie StarGame pomocnik, aby nebezali dve verzie.
4. Obnov hernu stranku. Na kazdom zariadeni tento postup vykonas iba raz.

Tampermonkey kontroluje novsie verzie cez `@updateURL` a stahuje ich cez
`@downloadURL`. Interval zavisi od jeho nastaveni; kontrolu mozes vyvolat aj
rucne v sprave skriptov. Aktualizacia teda nie je okamzita po pushi.
Zdroj aj vysledny skript zostavaju v tomto repozitari.

Nastavenia a poslednych 500 logov sa uchovavaju v ulozisku Tampermonkey a
preziju navigaciu aj aktualizaciu skriptu. **Medzi zariadeniami sa automaticky
nesynchronizuju.** Nastavenia povodneho rozsirenia sa automaticky neprenesu;
pri prechode ich nastav znova. Beh utokov a rozpracovane forum su viazane na
aktualnu kartu, nie na vsetky zariadenia. Nespustaj utoky sucasne na viacerych.

### Povodne rozsirenie

1. Otvor `chrome://extensions` alebo `edge://extensions`.
2. Zapni vyvojarsky rezim.
3. Zvol **Nacitat rozbalene / Load unpacked** a vyber tento priecinok.
4. Prihlas sa do hry a obnov hernu stranku. Vpravo sa zobrazi panel.

Integrovanemu prehliadacu VS Code sa panel da vlozit na ukazku, ale bez
nainstalovaneho rozsirenia sa po navigacii sam nenacita. Na trvalu prevadzku
pouzi instalaciu v beznom prehliadaci.

## Pouzitie

Na PC zostava povodny panel vpravo hore. Na dotykovych zariadeniach
(mobil/tablet) alebo v okne do 700 CSS pixelov sa spusti zbalene tlacidlo
**SGO** vpravo dole. Hru neblokuje mimo samotneho tlacidla.
Kliknutim otvoris panel na vysku dostupnej obrazovky (na tablete najviac
480 px siroky), krizikom alebo Escape ho zavries. Zatvorenie nezastavi utoky;
na ich zastavenie pouzi **Zastavit**. Bodka na tlacidle signalizuje beh/cakanie,
cervena chybu. Po predplneni stavieb alebo fora sa panel na mobile sam skryje,
aby si mohol skontrolovat herny formular. Na PC ostava otvoreny.

Tlacidlo **Vsetky funkcie** vrati hlavne menu. Utoky so svojim nastavenim
a dennikom su v samostatnom podmenu. Prebiehajuca seria sa otvorenim menu nerusi;
na jej zastavenie pouzi **Zastavit** v podmenu utokov.

### Idealne zaludnenie

- **Prepocitat planety** cita Planety > Staveni, Druhy a Obchod > Nezamestnani.
  Prepocet prebehne aj automaticky pri otvoreni sekcie, vybere planety a pred
  predvyplnenim. Su bezne naraz iba jedny nacitavane udaje, nie viac paralelnych
  prepoctov. Planety s nulovym poctom chybajucich vyroben sa v zoznamoch nezobrazuju.
  Pri otvoreni Staveni sa prevezme planeta vybrana v hernom formulari.
  Zmena herneho vyberu prepne aj planetu v doplnku; vlastny vyber v doplnku
  zostava mozny. Ak je herna planeta hotova, zobrazi sa iba oznacenie hotovo,
  nie navrh pre inu planetu. Samotny vyber nic nestavia ani nepredvyplna.
  Neposiela ziadne formularove akcie ani nemeni ponuky na obchodnej planete.
  Hra uvadza transport na obchodnu planetu 5 az 20 minut a ma hromadnu akciu
  naplnenia planet z vlastnych ponuk. Doplnok tieto akcie nepouziva: transporty
  aj pridelovanie nezamestnanych zatial ovladas vyhradne ty.
- Pre kazdu planetu: `Y = mesta * 9 000 000`, `K = 1 + denny prirastok / 100`,
  `idealna populacia = Y / K`. Dennym prirastkom je hodnota z Druhov planet,
  nie spokojenost zo Spravy planet.
- Dropdown aj zoznam planet su zoradene od najvyssieho odhadu narodenych
  pri idealnom zaludneni: `floor(idealna populacia * denny prirastok / 100)`.
  Zohladnuje sa velkost planety aj percento, nie iba samotna porodnost.
  Pri rovnosti rozhoduje nazov a ID. Odhad je cielovy potencial za denny
  prepocet, nie predpoved pri aktualnom stave obyvatelov; vyzaduje doplnenie
  obyvatelov na ideal. Poradie nemeni rucne alebo v hre vybranu planetu.
- Ciel vyroben je `floor((idealna populacia - ostatni zamestnani) / pracovnici vyrobne)`,
  najmenej nula. Pracovnikov vyroben, SDI, BS a laboratorii cita zo stavebneho
  formulara. Aktualne ide o 36 000 / 26 000 / 30 000 / 35 000 ludi.
- Aktualna populacia sa odvodi ako kapacita miest minus kolonka **Lze koupit**
  v obchode. Nezamestnani su rozdiel medzi populaciou a pracovnikmi budov.
  Pri nesuhlase dat sa vypocet zastavi s chybou a vyziada obnovenie.
  Plna zastavanost moze byt v hre zobrazena jedinym cislom bez lomky;
  ak sa rovna kapacite, doplnok ju korektne nacita ako plnu planetu.
  Plne zastavane planety aj planety na cieli alebo nad nim maju na dostavanie
  nulu a su skryte. Ziadna demolicia ani dalsie doplnanie sa pre ne nenavrhuje.
- **Predvyplnit** nastavi zvolenu planetu, rezim pristavovania a cely chybajuci
  pocet vyroben. Pocet sa neoreze na dostupnych nezamestnanych ani stavebne
  miesta; oba limity panel zobrazi. Naqiton a ludi skontroluj pred potvrdenim.
  Prislusny riadok planety v hernej tabulke zvyrazni a posunie do zobrazenia.
  Pri predvyplneni inej planety sa oznacenie presunie; pri rucnej zmene
  planety v stavebnom formulari sa neaktualne oznacenie zrusi.
- Predvyplnenie funguje na Planety > Staveni. Nikdy neklikne na **Postavit**,
  nic nebura ani nepresuva. Ak mas rozpisane ine stavby, odmietne ich prepisat.
  Nadbytocne vyrobne iba oznami. Pohyb nezamestnanych riesis zatial rucne.
- Vypocet vsetkych planet aj predvyplnenie sa zaznamena do spolocneho dennika.

### Utok na Valu

- Panel ma karty **Utoky** a **Dennik**. Nevybrane utoky su kompaktne;
  nastavenia jednotiek a planety sa zobrazuju iba pri vybranych typoch.
  Pocitadla v hlavicke ukazuju pocet vybranych typov a ulozenych udalosti.
  Po spusteni sa otvori dennik; posledna udalost ostava viditelna aj v pate.
  Panel sa da zbalit a karty prepnut klavesmi sipok, Home a End.
- **Obnovit** precita typy, limity, jednotky a planety.
  Nedostupne/nevyvinute typy sa nedaju spustit.
- Zaskrtni iba pozadovane typy. Zadaj pevne pocty alebo klikni na tlacidlo
  s dostupnym poctom: rezim **vsetky** vzdy pred utokom nacita aktualny stav.
- Vyber konkretnu planetu alebo prvu aktualne dostupnu. Ak zvolena konkretna
  planeta zmizne, seria sa zastavi; ciel sa potichu nezmeni.
- **Spustit utoky** po potvrdeni strieda iba vybrane typy. Zostavajuce pocty
  utokov cita z DOM pred kazdym pokusom, nepredpoklada denny limit.
- Vycerpany limit (aj serverova hlaska bez pocitadiel) sa iba zaloguje a dany
  typ sa vyradi zo serie. Ostatne vybrane typy pokracuju. Seria sa dokonci,
  az ked uz nema ziaden aktivny typ; necaka automaticky do dalsieho prepoctu.
- Medzi krokmi je nahodna prestavka 2,5 az 6 sekund a pred odoslanim
  formulara 1,5 az 4 sekundy. Prestavky sa loguju a daju sa zrusit tlacidlom
  **Zastavit**. Nikdy neskracuju cooldown hry. Nezarucuju nerozpoznatelnost
  automatizacie a neobchadzaju overovanie ani pravidla hry.
- Cooldown sa sleduje samostatne pre kazdy typ. Ak server oznami cas, respektuje
  ho s rezervou. Ak oznami iba nutnost cakat, pouzije obmedzeny postupny odstup
  5 az 60 sekund, najviac 5 opakovani bez pokroku. Medzitym skusa iny vybrany typ.
- Kazdy utok ide cez aktualny nativny formular hry, vratane jeho validacie.
  Ziadne obchadzanie CAPTCHA ani overenia. Neznamy vysledok, zmena formulara,
  odhlasenie alebo nedostatok jednotiek seriu zastavi, nie potichu zopakuje.
- **Zastavit** zrusi dalsie kroky, nie uz odoslany utok. Zavretie karty ukonci
  beh; nastavenia a poslednych 500 zaznamov ostanu v lokalnom ulozisku rozsirenia.
- Log obsahuje casy, nacitane zasoby, odoslane pocty, vysledky, chyby a cakanie.
  **Exportovat log** stiahne textovy subor. Nezaznamenavaju sa hesla ani skryte tokeny.

### Nase sektory

- Pod ciarou sa zobrazuju najviac dva dalsie sektory najblizsie k vedeniu:
  remizy a potom najmensia strata na najsilnejsiu inu rasu. Pri rovnosti
  rozhoduje nazov a ID. Nula znamena remizu, zaporne cislo stratu.
  Ak je kandidatov menej, zobrazi sa ich skutocny pocet. Ide o aktualny stav,
  nie historicky trend. Tato cast sa nepridava do hlasenia ani tabulky na fore.

- Pri otvoreni sekcie sa z Mapy nacita rasa prihlaseneho hraca a zo Sektorov
  pocty planet jednotlivych ras. Rasa nie je nastavena napevno.
- Zobrazuju sa iba sektory, kde nasa rasa ma striktne viac planet nez kazda ina
  rasa (vratane Uprchlikov). Remizy a planety mimo sektorov sa vynechaju.
  Ide o vedenie poctom planet, nie o oficialnu podmienku sektorovej odmeny.
- Nasleduje zoradenie od najmensieho naskoku: nase planety minus pocet
  najsilnejsej inej rasy. Pri rovnakom naskoku rozhodne nazov sektora.
  Pri remize superov sa zobrazia vsetky rovnako silne rasy.
  Prehlad pouziva kompaktne riadky s nazvom, pomerom planet, superom a naskokom;
  dlhe nazvy superov su cele dostupne po prejdeni mysou.
- **Predplnit forum** otvori Oznámení vedení a predplni nadpis aj casovo
  oznacenu tabulku s rovnakym poriadkom ako panel. Ak uz si na tomto fore,
  formular sa predplni bez navigacie. Pouziva vlastny BBCode paste handler hry.
  Rozpisany prispevok neprepise, namiesto toho zobrazi chybu.
- **Obnovit** vytvori novy aktualny prehlad. Pred predplnenim skontroluj cas
  nacitania; nejde o automaticke publikovanie ani archiv denných porovnani.
- Hlasenie sa prenasa cez docasne ulozisko aktualnej karty a spracuje sa iba raz.
  Predplnenie je blokovane pocas utokov. Doplnok nevyuziva schranku a ziadny
  prispevok neodosiela; nadpis aj obsah skontroluj a odosli sam.
- Instalovane rozsirenie po aktualizacii znovu nacitaj a obnov hernu kartu.

Pouzivaj len v sulade s pravidlami hry. Rozsirenie nezarucuje vitazstvo ani
bezstratove utoky. Nenechavaj sucasne bezat viac kariet/prehliadacov s automatom
na tom istom ucte; stav cooldownu a behu je viazany na kartu.

## Overenie

### Zostavenie a vydanie userscriptu

Neprepisuj `stargame-pomocnik.user.js` ani `stargame-pomocnik.meta.js` rucne.
Generuju sa zo suborov uvedenych v `manifest.json`, vratane CSS; rozsirenie aj
userscript preto pouzivaju rovnaku implementaciu. Nie su potrebne ziadne zavislosti.

1. Uprav zdroje a zvys verziu rovnako v `package.json` a `manifest.json`.
2. Spusti `npm run build`, potom `npm test` a `npm run check`.
3. Commitni zdroje aj oba vygenerovane subory a pushni na `main`.

Samotny commit bez pushu aktualizaciu nespristupni. Bez zvysenia verzie ju
Tampermonkey nemusi ponuknut. `npm run check` odhali aj neaktualny bundle.

Bez externych zavislosti: `npm test` a `npm run check` (Node.js 18+).
DOM parser a nativne odosielanie treba overit aj v prihlasenej hre.
