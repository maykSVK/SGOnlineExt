# StarGame pomocnik

Tampermonkey userscript aj lokalne rozsirenie Manifest V3 pre kompatibilne prehliadace.
Funkcie su dostupne z hlavneho menu: **Utok na RR**, **Idealne zaludnenie**,
**Nase sektory** a **Vojna**.
Volitelna synchronizacia posiela iba historiu zrebovani do nastaveneho Gistu.
Doplnok nepozaduje pristup k hernemu heslu.
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

### Prehlad na hlavnom paneli

Pat kompaktnych riadkov hore na hlavnom prehlade zobrazuje denny bonus, Hernu,
posledne hlasenie NN z rasovej posty, stav dobijania Vala Mal Doran a stav
Odysseana. Zelena znamena OK (alebo na ciele este neda utocit / dobyvat),
oranzova nezname alebo neoverene udaje a cervena potrebnu akciu (napr. Vala UP
s utokom D alebo Odyssean k dobytiu). Kliknutim na riadok otvoris
prislusnu stranku hry; NN otvara **Obchod > Planety**, ale hlasenia sa
nadalej citaju z rasovej posty. Riadky Vala a Odyssean uvadzaju v zatvorke aj
ich aktualnu vojensku silu a otvaraju zoznam **Uprchlici** (`jak=98`) a
**Pribeh** (`jak=102`). Cas poslednej kontroly najdes v popise riadka.
Otvorenie prehladu ani hernej stranky nic
nenacitava navyse. Iba **Aktualizovat** vykona postupne sest kontrolnych GETov
(bonus, Herna, NN, celkove poradie hracov, Uprchlici pre Valu a Pribeh pre Odysseana),
ulozi stav s casom kontroly a zaloguje vysledky. Chyba citania jednej kontroly
nezablokuje ostatne; chyba nacitania, prihlasenia alebo overenia zastavi
postup bez automatickeho opakovania. Chyba historie nezmeni rozpoznany stav
stavky a nepreskoci NN. Zachovana lokalna historia sa moze stale synchronizovat.
Udaje bonusu z ineho dna, stavky starsie ako sest hodin a stavy Valy/Odysseana
starsie ako hodinu su oznacene ako
nezname; nejde o zivy stav. Vek a okno NN sa prehodnotia lokalne pri zobrazeni
prehladu, nie casovacom ani dalsou poziadavkou.
Bonus netoci a stavky nepodava. Pri nule zostavajucich pokusov oznaci denny
bonus zelenym stavom Dnesne pokusy vyuzite; pri zostavajucich pokusoch
upozorni na akciu. Ak pocet nevie precitat, zostava stav neznamy.
Kontrola nepotvrdzuje pripadne samostatne prevzatie odmeny.
Stav Herne je zeleny iba pri potvrdenej stavke;
samotny vyskyt slova vsadit nie je dokaz, ze stavka chyba.
Pred hlasenym oknom NN zobrazi cakanie, pocas okna upozorni na kontrolu,
po nom uvadza nezname. Pouziva cas Europe/Prague a zohladnuje polnoc;
hlasenie nie je potvrdenie aktualnej dostupnosti. Priamo vedla riadka NN su dostupne tlacidla
**Sledovať** a **Stop** (sledovanie je mozne spustit kedykolvek, aj mimo okna alebo ked okno nie je zname): po spusteni na stranke
**Obchod > Planety** (`page=obchod&s=3`) sleduje ponuky s nahodnym ludskym
oneskorenim (3,5–9,5 s) oproti pociatocnemu stavu. Pri objaveni novych ponuk
okamzite vykona 3 rychle kontrolne refreshe za sebou na odfiltrovanie
falosnych (anti-bot) ponuk a az po 3. potvrdeni vykresli mimo panela cez celu
obrazovku cervene upozornenie **MAME NN!**, ktore zmizne kliknutim kamkolvek.
Aktualizacia je blokovana pocas utokov.
Ak uz v Herni nie su k dispozicii ziadne pokusy (stav `Treba vsadit`), priamo vedla riadka Herne sa zobrazi
tlacidlo **Stavit** a volba **Cisto nahodne**. Kliknutie na
**Stavit** presmeruje na Hernu (`page=obchod&s=6`) a predvyplni 6 cisel (1–25)
vo formulari Super 6 podla vazenej pseudonahody z historickych tahov (alebo
rovnomerne nahodne, ak je zaskrtnuty checkbox). Samotne odoslanie stavky
tlacidlom **Vsadit** ostava na pouzivatelovi. V casti **Historia a Gist** sa
zobrazuju aj najcastejsie tazene cisla zo zachytenych zrebovani.

#### Vojna

Sekcia **Vojna** nacita udaje iba po rucnom kliknuti na **Obnovit**. Zobrazi
vlastne univerzaly oproti cielu 10 000, prehlad planet s deficitom cielovej
obrany 500 SDI a 500 BS na planetu a prijate spionazne zaznamy za poslednych
24 hodin. Pri spionazi zadaj presne meno svojho hraca; zaznamy sa uchovavaju
lokalne a oznacia sa nove udalosti od poslednej kontroly.

Tlacidla **Predvyplnit** otvoria nativny formular hry a nastavia iba pocet
univerzalov na presun z RA alebo deficit obrany na vybranej planete. Deficit
miest sa predvyplni iba vtedy, ak ho hra v zozname planét zobrazi. Nic sa
neodosiela automaticky; pred odoslanim skontroluj planetu, pocty aj cenu.
Prehlad planet neposkytuje maximum miest na kazdej planete, preto sa tato
hodnota zobrazi ako nezname a addon nevypocitava ani nepredvyplna ich deficit.
Sekcia nevybera ani nespusta utoky na inych hracov a nevykonava premenovanie
planet.

#### TOP 3 celkovo

Kompaktne dlazdice funkcii su v hlavnom prehlade vedla seba. Mensia hlavicka
a medzery setria vysku; dotykove ovladanie na mobile zostava zachovane.
Mala tabulka naspodku hlavneho prehladu ukazuje prvych troch hracov z
**Vesmir > Serazeni > Serazeni hracu** v poradi hry, bez vlastneho zoradovania.
Zobrazuje meno, rasu, pocet planet, populaciu, silu, celkovu rozlohu a dobytia.
Popisy stlpcov su spolocne, nie opakovane pri kazdom hracovi; cele meno
a rasu najdes aj v popise riadka, plne nazvy statistik v popisoch hodnot.
Nadpis aj riadky otvaraju tento rebricek. Udaje a cas kontroly sa uchovavaju
lokalne; bez nacitania alebo pri chybe ukazuje Nezname.
Pouziva spolocne tlacidlo **Aktualizovat** hore, nikdy automaticke nacitanie.

#### Historia zrebovani a Gist

Pri **Aktualizovat** sa z Herne precita posledne a predposledne zrebovanie.
Zaznamy maju cas hry `YYYY-MM-DDTHH:mm` a sest roznych kladnych cisel.
Rovnake casy s rovnakymi cislami sa zlucia; pri konflikte sa nezapisuje
sporny vysledok. Konflikt pri synchronizacii ju zastavi bez prepisania Gistu.
Zmeskane zrebovania addon nedopocitava.
Historia zostava lokalne aj bez Gistu. Nejde o predpoved buducich vysledkov.

V **hlavnom prehlade > Historia a Gist** na kazdom zariadeni zadaj ID alebo odkaz
na svoj Gist a GitHub token classic s jedinym opravnenim `gist`, potom
**Ulozit nastavenia**. Gist musi obsahovat subor `draws.json`:

```json
{"schemaVersion": 1, "draws": []}
```

Public aj Secret Gist funguju rovnako. Secret nie je sukromny: kto pozna
odkaz, moze citat vysledky. Token umoznuje aj pristup k dalsim Gistom uctu.
Uklada sa iba lokalne v Tampermonkey/rozsireni, nie do repozitara, historie,
logu ani Gistu. Ulozisko prehliadaca nie je trezor. Na jednotlivych zariadeniach
odporucame samostatne tokeny s obmedzenou platnostou. Vymazanim tokenu a
ulozenim nastaveni synchronizaciu vypnes.

Iba **Aktualizovat** spusti po kontrolach hry GitHub GET, pripadne PATCH
zlucenej historie a overovaci GET. Ziadne automaticke kontroly ani opakovania.
Pri chybe je historia lokalna; skontroluj hlasenie a neskor aktualizuj rucne.
Gist nema transakcne zlucovanie: overenie zachyti cast subeznych prepisov,
nie vsetky. Lokalne zaznamy sa preto zachovavaju pre dalsie zlucenie.
Ziadne tajne ani herne prihlasovacie udaje sa neodosielaju; token ide len
do GitHub API na autentifikaciu. Tampermonkey si moze pri aktualizacii
vyziadat povolenie pristupu k `api.github.com`.

Na PC zostava povodny panel vpravo hore. Na dotykovych zariadeniach
(mobil/tablet) alebo v okne do 700 CSS pixelov sa predvolene spusti zbalene tlacidlo
**SGO** vpravo dole. Hru neblokuje mimo samotneho tlacidla.
Cela hlavicka je tlacidlo na zbalenie/rozbalenie na PC a zavretie na mobile;
funguje aj klavesmi Enter a medzernik. Na mobile panel znovu otvoris cez SGO.
Kliknutim otvoris panel na vysku dostupnej obrazovky (na tablete najviac
480 px siroky), krizikom alebo Escape ho zavries. Zatvorenie nezastavi utoky;
na ich zastavenie pouzi **Zastavit**. Bodka na tlacidle signalizuje beh/cakanie,
cervena chybu. Po predplneni stavieb alebo fora sa panel na mobile sam skryje,
aby si mohol skontrolovat herny formular. Na PC ostava otvoreny.
Otvoreny/zavrety stav na mobile a zbalenie na PC sa pamataju lokalne aj po
obnoveni stranky, prechode na inu stranku hry alebo aktualizacii skriptu.
Oba rezimy maju vlastny stav, takze zmena sirky okna neprepise zbalenie na PC.

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
  Tlacidlo **Doplnit nezamestnanych** je aktivne, ak mas na obchodnej planete
  (v sekcii *Nase nabidky*) volnych nezamestnanych. Po kliknuti ich postupne
  presuva (`Presunout`) na planety presne v poradi nasho dropdownu (od
  najvyssieho odhadu narodenych pri idealnom zaludneni), az kym sa ponuky na
  obchodnej planete nevycerpaju alebo kym sa nenaplnia vsetky planety v zozname. Vedla tlacidla si mozes zvolit rezim: predvolene **Nepostavene do maxima** (vsetky planety, kde este nie su postavene vsetky vyrobne / plna kapacita `postavene < max`) alebo **Podla idealu (dropdown)** (len planety, kde chybaju vyrobne do idealu).
- Pre kazdu planetu: `Y = mesta * kapacita_mesta` (cita sa zo stavebneho formulara, napr. `9 000 000` alebo po vylepseni `9 480 000`), `K = 1 + denny prirastok / 100`,
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

### Utok na RR (Vala a zbehovia)

- Vyber ciela misie: rozbalovaci zoznam nacita hracov z rasy Uprchlici (`page=vesmir&jak=98`).
  V zozname ponuka Valu Mal Doran a hracov s viac ako 1 planetou, spolu s poctom planet a vojenskou silou.
  Hracov s najviac 1 planetou odfiltruje, kedze na nich hra nedovoluje zautocit.

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
