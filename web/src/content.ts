// All website copy, keyed by language. Add a language by extending LANGS
// and adding a matching entry to `content`. `en` defines the shape.

export const LANGS = ['en', 'lt', 'lv', 'et', 'pl'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

// Native language names for the language switcher.
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  et: 'Eesti',
  pl: 'Polski',
};

// App store listing URLs. Leave null to render a disabled "Coming soon"
// badge. Paste the real URLs here once the apps are published.
export const storeLinks: { appStore: string | null; googlePlay: string | null } = {
  appStore: null,
  googlePlay: null,
};

export type Feature = { title: string; body: string };
export type Faq = { q: string; a: string };

export type Content = {
  meta: { title: string; description: string };
  nav: { features: string; family: string; download: string; faq: string; getApp: string };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    note: string;
    imageAlt: string;
  };
  preview: { status: string; ready: string };
  store: {
    comingSoon: string;
    appStore: string;
    appStoreLine: string;
    googlePlay: string;
    googlePlayLine: string;
  };
  stats: { label: string; value: string }[];
  features: { title: string; subtitle: string; items: Feature[] };
  family: { eyebrow: string; title: string; body: string; points: string[] };
  download: { title: string; body: string };
  faq: { title: string; items: Faq[] };
  footer: {
    tagline: string;
    sourcesLabel: string;
    sources: string;
    privacy: string;
    privacyBody: string;
    privacyPolicy: string;
    terms: string;
    languageLabel: string;
    rights: string;
    sourceCode: string;
  };
};

// Public source repository (the app is open source, MIT).
export const REPO_URL = 'https://github.com/programusprendimai/baltic72';

export const content: Record<Lang, Content> = {
  en: {
    meta: {
      title: 'Baltic72, civil safety information for the Baltic region',
      description:
        'Baltic72 is a free civil-safety app for Lithuania, Latvia, Estonia and Poland. It works offline and helps you find shelters and sirens, read emergency guidance, prepare a 72-hour kit and share family status securely.',
    },
    nav: { features: 'Features', family: 'Family', download: 'Download', faq: 'Questions', getApp: 'Get the app' },
    hero: {
      eyebrow: 'Civil safety information that remains available offline',
      title: 'Prepare for the first 72 hours.',
      subtitle:
        'Baltic72 keeps shelter and siren maps, emergency guidance and a household kit checklist on your phone. The key information stays available even when mobile networks are unavailable.',
      note: 'Free and open source. No account, no advertising and no tracking.',
      imageAlt: 'Family reviewing emergency information with shelter, map and preparedness supplies nearby.',
    },
    preview: { status: 'No active alerts', ready: 'Offline information ready' },
    store: {
      comingSoon: 'Coming soon',
      appStore: 'App Store',
      appStoreLine: 'Download on the',
      googlePlay: 'Google Play',
      googlePlayLine: 'Get it on',
    },
    stats: [
      { value: '98,000+', label: 'Shelters and sirens' },
      { value: '4', label: 'Countries covered' },
      { value: 'Offline', label: 'Works without network access' },
      { value: 'Free', label: 'Open source, no advertising' },
    ],
    features: {
      title: 'Essential information in one place',
      subtitle: 'Designed for clear use before and during an emergency.',
      items: [
        {
          title: 'Shelter and siren map',
          body: 'Find nearby civil-protection shelters, collective-protection buildings, evacuation points and sirens on a map that is available offline.',
        },
        {
          title: 'Emergency guidance',
          body: 'Read clear instructions for air alerts, missile threats, nuclear incidents, severe weather and other emergencies.',
        },
        {
          title: '72-hour kit checklist',
          body: 'Prepare the water, food, documents, medicine and other supplies your household may need for the first three days.',
        },
        {
          title: 'Offline access',
          body: 'Maps, guides and your checklist are saved on the device, so the information remains available when connectivity is limited.',
        },
        {
          title: 'Private family status',
          body: 'Create a private group and share a short status: safe, going to shelter, in shelter or needs help. Messages are end-to-end encrypted.',
        },
        {
          title: 'Local data and languages',
          body: 'Coverage includes Lithuania, Latvia, Estonia and Poland, using official open data where it is available.',
        },
      ],
    },
    family: {
      eyebrow: 'Family',
      title: 'Check in with your family privately.',
      body: 'During an emergency, people need a quick way to know whether close family members are safe. Baltic72 lets a private group share short status updates without exposing the content to the server.',
      points: [
        'End-to-end encryption: the server stores public keys and encrypted messages only.',
        'Simple status options: safe, going to shelter, in shelter or needs help.',
        'Private keys remain in secure storage on your device.',
      ],
    },
    download: {
      title: 'Get Baltic72',
      body: 'The iOS and Android apps are being prepared for release. They will be free to use, with no account and no advertising.',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Is Baltic72 free?', a: 'Yes. Baltic72 is free and open source. It has no advertising, no account requirement and no in-app purchases.' },
        { q: 'Does it work without internet?', a: 'Yes. Shelter data, siren data and emergency guidance are stored on the device, so the app remains useful when there is no mobile signal.' },
        { q: 'Which countries are included?', a: 'Lithuania, Latvia, Estonia and Poland. The website is available in English and in the local languages shown in the language menu.' },
        { q: 'Where does the shelter data come from?', a: 'The data comes from official open sources including PAGD, data.gov.lt, Päästeamet, SMIT, VUGD, 112.lv, KG PSP and dane.gov.pl.' },
        { q: 'How private is the Family feature?', a: 'Family status messages are end-to-end encrypted. The server stores public keys and encrypted content, not readable names or status messages.' },
        { q: 'When can I download the app?', a: 'The App Store and Google Play links will be added here when the apps are published.' },
      ],
    },
    footer: {
      tagline: 'Civil safety information for the Baltic region, available offline.',
      sourcesLabel: 'Data sources',
      sources: 'PAGD · data.gov.lt (LT) · Päästeamet · SMIT (EE) · VUGD · 112.lv (LV) · KG PSP · dane.gov.pl (PL)',
      privacy: 'Privacy',
      privacyBody: 'Baltic72 does not use accounts, advertising or tracking. Family status data is end-to-end encrypted.',
      privacyPolicy: 'Privacy Policy',
      terms: 'Terms and Conditions',
      languageLabel: 'Language',
      rights: 'Baltic72 is free and open source.',
      sourceCode: 'Source code',
    },
  },

  lt: {
    meta: {
      title: 'Baltic72, civilinės saugos informacija Baltijos regionui',
      description:
        'Baltic72 yra nemokama civilinės saugos programėlė Lietuvai, Latvijai, Estijai ir Lenkijai. Ji veikia be interneto, padeda rasti priedangas ir sirenas, skaityti veiksmų nurodymus, pasiruošti 72 valandų atsargas ir saugiai pranešti šeimos būseną.',
    },
    nav: { features: 'Funkcijos', family: 'Šeima', download: 'Atsisiųsti', faq: 'Klausimai', getApp: 'Atsisiųsti' },
    hero: {
      eyebrow: 'Civilinės saugos informacija, pasiekiama ir be interneto',
      title: 'Pasiruoškite pirmosioms 72 valandoms.',
      subtitle:
        'Baltic72 telefone saugo priedangų ir sirenų žemėlapį, veiksmų nurodymus ir namų atsargų sąrašą. Svarbiausia informacija lieka pasiekiama net tada, kai neveikia mobilusis ryšys.',
      note: 'Nemokama ir atvirojo kodo. Be paskyros, reklamų ir sekimo.',
      imageAlt: 'Šeima peržiūri saugos informaciją šalia priedangos, žemėlapio ir pasiruošimo priemonių.',
    },
    preview: { status: 'Aktyvių įspėjimų nėra', ready: 'Informacija paruošta naudoti be interneto' },
    store: {
      comingSoon: 'Netrukus',
      appStore: 'App Store',
      appStoreLine: 'Atsisiųskite iš',
      googlePlay: 'Google Play',
      googlePlayLine: 'Atsisiųskite iš',
    },
    stats: [
      { value: '98 000+', label: 'Priedangų ir sirenų' },
      { value: '4', label: 'Šalys' },
      { value: 'Be interneto', label: 'Informacija lieka įrenginyje' },
      { value: 'Nemokama', label: 'Atviras kodas, be reklamų' },
    ],
    features: {
      title: 'Svarbiausia informacija vienoje vietoje',
      subtitle: 'Sukurta naudoti aiškiai ir ramiai prieš ekstremalią situaciją ir jos metu.',
      items: [
        {
          title: 'Priedangų ir sirenų žemėlapis',
          body: 'Raskite netoliese esančias priedangas, kolektyvinės apsaugos statinius, evakavimo vietas ir sirenas žemėlapyje, kuris veikia be interneto.',
        },
        {
          title: 'Veiksmų nurodymai',
          body: 'Skaitykite aiškius nurodymus oro pavojaus, raketų grėsmės, branduolinio įvykio, pavojingų orų ir kitų ekstremalių situacijų atvejais.',
        },
        {
          title: '72 valandų atsargų sąrašas',
          body: 'Pasiruoškite vandenį, maistą, dokumentus, vaistus ir kitas priemones, kurių šeimai gali prireikti pirmąsias tris paras.',
        },
        {
          title: 'Prieiga be interneto',
          body: 'Žemėlapiai, nurodymai ir jūsų sąrašas saugomi įrenginyje, todėl informacija lieka pasiekiama ir sutrikus ryšiui.',
        },
        {
          title: 'Privati šeimos būsena',
          body: 'Sukurkite privačią grupę ir trumpai praneškite būseną: saugus, einu į priedangą, esu priedangoje arba reikia pagalbos. Pranešimai šifruojami nuo pradžios iki galo.',
        },
        {
          title: 'Vietiniai duomenys ir kalbos',
          body: 'Aprėptis apima Lietuvą, Latviją, Estiją ir Lenkiją, naudojant oficialius atvirus duomenis, kai jie prieinami.',
        },
      ],
    },
    family: {
      eyebrow: 'Šeima',
      title: 'Susisiekite su šeima privačiai.',
      body: 'Ekstremalios situacijos metu svarbu greitai suprasti, ar artimieji saugūs. Baltic72 leidžia privačiai grupei dalytis trumpais būsenos pranešimais taip, kad jų turinio nematytų serveris.',
      points: [
        'Šifravimas nuo pradžios iki galo: serveris saugo tik viešuosius raktus ir šifruotus pranešimus.',
        'Paprastos būsenos: saugus, einu į priedangą, esu priedangoje arba reikia pagalbos.',
        'Privatūs raktai lieka saugioje jūsų įrenginio saugykloje.',
      ],
    },
    download: {
      title: 'Atsisiųskite Baltic72',
      body: 'iOS ir Android programėlės ruošiamos išleidimui. Jos bus nemokamos, be paskyros ir be reklamų.',
    },
    faq: {
      title: 'Klausimai',
      items: [
        { q: 'Ar Baltic72 nemokama?', a: 'Taip. Baltic72 yra nemokama ir atvirojo kodo. Programėlėje nėra reklamų, privalomos paskyros ar pirkimų.' },
        { q: 'Ar veikia be interneto?', a: 'Taip. Priedangų, sirenų duomenys ir veiksmų nurodymai saugomi įrenginyje, todėl programėlė naudinga ir be mobiliojo ryšio.' },
        { q: 'Kurios šalys įtrauktos?', a: 'Lietuva, Latvija, Estija ir Lenkija. Svetainė pateikiama anglų kalba ir kalbomis, nurodytomis kalbų meniu.' },
        { q: 'Iš kur gaunami priedangų duomenys?', a: 'Duomenys gaunami iš oficialių atvirų šaltinių, įskaitant PAGD, data.gov.lt, Päästeamet, SMIT, VUGD, 112.lv, KG PSP ir dane.gov.pl.' },
        { q: 'Kiek privati yra šeimos funkcija?', a: 'Šeimos būsenos pranešimai šifruojami nuo pradžios iki galo. Serveris saugo viešuosius raktus ir šifruotą turinį, o ne perskaitomus vardus ar būsenas.' },
        { q: 'Kada bus galima atsisiųsti programėlę?', a: 'App Store ir Google Play nuorodos šiame puslapyje bus pridėtos tada, kai programėlės bus paskelbtos.' },
      ],
    },
    footer: {
      tagline: 'Civilinės saugos informacija Baltijos regionui, pasiekiama be interneto.',
      sourcesLabel: 'Duomenų šaltiniai',
      sources: 'PAGD · data.gov.lt (LT) · Päästeamet · SMIT (EE) · VUGD · 112.lv (LV) · KG PSP · dane.gov.pl (PL)',
      privacy: 'Privatumas',
      privacyBody: 'Baltic72 nenaudoja paskyrų, reklamų ar sekimo. Šeimos būsenos duomenys šifruojami nuo pradžios iki galo.',
      privacyPolicy: 'Privatumo politika',
      terms: 'Naudojimo sąlygos',
      languageLabel: 'Kalba',
      rights: 'Baltic72 yra nemokama ir atvirojo kodo.',
      sourceCode: 'Pirminis kodas',
    },
  },

  lv: {
    meta: {
      title: 'Baltic72, civilās aizsardzības informācija Baltijas reģionam',
      description:
        'Baltic72 ir bezmaksas civilās aizsardzības lietotne Lietuvai, Latvijai, Igaunijai un Polijai. Tā darbojas bezsaistē un palīdz atrast patvertnes un sirēnas, lasīt rīcības norādījumus, sagatavot 72 stundu krājumus un droši paziņot ģimenes statusu.',
    },
    nav: { features: 'Iespējas', family: 'Ģimene', download: 'Lejupielādēt', faq: 'Jautājumi', getApp: 'Iegūt lietotni' },
    hero: {
      eyebrow: 'Civilās aizsardzības informācija, pieejama arī bezsaistē',
      title: 'Sagatavojieties pirmajām 72 stundām.',
      subtitle:
        'Baltic72 tālrunī glabā patvertņu un sirēnu karti, rīcības norādījumus un mājsaimniecības krājumu sarakstu. Svarīgākā informācija paliek pieejama arī tad, ja nav mobilā tīkla.',
      note: 'Bezmaksas un atvērtā koda. Bez konta, reklāmām un izsekošanas.',
      imageAlt: 'Ģimene pārskata drošības informāciju pie patvertnes, kartes un sagatavotiem krājumiem.',
    },
    preview: { status: 'Aktīvu brīdinājumu nav', ready: 'Informācija sagatavota bezsaistes lietošanai' },
    store: {
      comingSoon: 'Drīzumā',
      appStore: 'App Store',
      appStoreLine: 'Lejupielādējiet no',
      googlePlay: 'Google Play',
      googlePlayLine: 'Saņemiet pakalpojumā',
    },
    stats: [
      { value: '98 000+', label: 'Patvertnes un sirēnas' },
      { value: '4', label: 'Valstis' },
      { value: 'Bezsaistē', label: 'Darbojas bez interneta' },
      { value: 'Bezmaksas', label: 'Atvērtais kods, bez reklāmām' },
    ],
    features: {
      title: 'Svarīgākā informācija vienuviet',
      subtitle: 'Paredzēta skaidrai lietošanai pirms ārkārtas situācijas un tās laikā.',
      items: [
        {
          title: 'Patvertņu un sirēnu karte',
          body: 'Atrodiet tuvumā esošās civilās aizsardzības patvertnes, kolektīvās aizsardzības ēkas, evakuācijas punktus un sirēnas kartē, kas pieejama bezsaistē.',
        },
        {
          title: 'Rīcības norādījumi',
          body: 'Lasiet skaidrus norādījumus gaisa trauksmes, raķešu apdraudējuma, kodolincidenta, bīstamu laikapstākļu un citu ārkārtas situāciju gadījumā.',
        },
        {
          title: '72 stundu krājumu saraksts',
          body: 'Sagatavojiet ūdeni, pārtiku, dokumentus, zāles un citus piederumus, kas mājsaimniecībai var būt vajadzīgi pirmajās trīs diennaktīs.',
        },
        {
          title: 'Pieeja bezsaistē',
          body: 'Kartes, norādījumi un jūsu saraksts tiek saglabāti ierīcē, tāpēc informācija paliek pieejama arī ierobežota savienojuma apstākļos.',
        },
        {
          title: 'Privāts ģimenes statuss',
          body: 'Izveidojiet privātu grupu un nosūtiet īsu statusu: drošībā, dodos uz patvertni, patvertnē vai vajadzīga palīdzība. Ziņojumi ir pilnībā šifrēti.',
        },
        {
          title: 'Vietējie dati un valodas',
          body: 'Aptverta Lietuva, Latvija, Igaunija un Polija, izmantojot oficiālus atvērtos datus tur, kur tie ir pieejami.',
        },
      ],
    },
    family: {
      eyebrow: 'Ģimene',
      title: 'Sazinieties ar ģimeni privāti.',
      body: 'Ārkārtas situācijā ir svarīgi ātri saprast, vai tuvinieki ir drošībā. Baltic72 ļauj privātai grupai kopīgot īsus statusa paziņojumus, neatklājot to saturu serverim.',
      points: [
        'Pilnīga šifrēšana: serveris glabā tikai publiskās atslēgas un šifrētus ziņojumus.',
        'Vienkārši statusi: drošībā, dodos uz patvertni, patvertnē vai vajadzīga palīdzība.',
        'Privātās atslēgas paliek jūsu ierīces drošajā krātuvē.',
      ],
    },
    download: {
      title: 'Iegūstiet Baltic72',
      body: 'iOS un Android lietotnes tiek gatavotas publicēšanai. Tās būs bezmaksas, bez konta un bez reklāmām.',
    },
    faq: {
      title: 'Jautājumi',
      items: [
        { q: 'Vai Baltic72 ir bezmaksas?', a: 'Jā. Baltic72 ir bezmaksas un atvērtā koda. Lietotnē nav reklāmu, obligāta konta vai pirkumu.' },
        { q: 'Vai tā darbojas bez interneta?', a: 'Jā. Patvertņu dati, sirēnu dati un rīcības norādījumi tiek glabāti ierīcē, tāpēc lietotne ir noderīga arī bez mobilā signāla.' },
        { q: 'Kuras valstis ir iekļautas?', a: 'Lietuva, Latvija, Igaunija un Polija. Vietne ir pieejama angļu valodā un valodās, kas redzamas valodas izvēlnē.' },
        { q: 'No kurienes tiek iegūti patvertņu dati?', a: 'Dati tiek iegūti no oficiāliem atvērtiem avotiem, tostarp PAGD, data.gov.lt, Päästeamet, SMIT, VUGD, 112.lv, KG PSP un dane.gov.pl.' },
        { q: 'Cik privāta ir ģimenes funkcija?', a: 'Ģimenes statusa ziņojumi ir pilnībā šifrēti. Serveris glabā publiskās atslēgas un šifrētu saturu, nevis lasāmus vārdus vai statusus.' },
        { q: 'Kad lietotni varēs lejupielādēt?', a: 'App Store un Google Play saites šajā lapā tiks pievienotas, kad lietotnes būs publicētas.' },
      ],
    },
    footer: {
      tagline: 'Civilās aizsardzības informācija Baltijas reģionam, pieejama bezsaistē.',
      sourcesLabel: 'Datu avoti',
      sources: 'PAGD · data.gov.lt (LT) · Päästeamet · SMIT (EE) · VUGD · 112.lv (LV) · KG PSP · dane.gov.pl (PL)',
      privacy: 'Privātums',
      privacyBody: 'Baltic72 neizmanto kontus, reklāmas vai izsekošanu. Ģimenes statusa dati ir pilnībā šifrēti.',
      privacyPolicy: 'Privātuma politika',
      terms: 'Lietošanas noteikumi',
      languageLabel: 'Valoda',
      rights: 'Baltic72 ir bezmaksas un atvērtā koda.',
      sourceCode: 'Pirmkods',
    },
  },

  et: {
    meta: {
      title: 'Baltic72, elanikkonnakaitse teave Balti piirkonnale',
      description:
        'Baltic72 on tasuta elanikkonnakaitse rakendus Leedu, Läti, Eesti ja Poola jaoks. See töötab võrguühenduseta ning aitab leida varjumiskohti ja sireene, lugeda hädaolukorra juhiseid, valmistada ette 72 tunni varud ja jagada pere olekut turvaliselt.',
    },
    nav: { features: 'Võimalused', family: 'Pere', download: 'Laadi alla', faq: 'Küsimused', getApp: 'Hangi rakendus' },
    hero: {
      eyebrow: 'Elanikkonnakaitse teave, mis on kättesaadav ka võrguühenduseta',
      title: 'Valmistu esimeseks 72 tunniks.',
      subtitle:
        'Baltic72 hoiab varjumiskohtade ja sireenide kaarti, hädaolukorra juhiseid ning majapidamise varude nimekirja sinu telefonis. Oluline teave jääb kättesaadavaks ka siis, kui mobiilivõrk ei tööta.',
      note: 'Tasuta ja avatud lähtekoodiga. Ilma konto, reklaamide ja jälgimiseta.',
      imageAlt: 'Pere vaatab ohutusteavet varjumiskoha, kaardi ja valmis pandud varude juures.',
    },
    preview: { status: 'Aktiivseid hoiatusi ei ole', ready: 'Teave on võrguühenduseta kasutamiseks valmis' },
    store: {
      comingSoon: 'Varsti',
      appStore: 'App Store',
      appStoreLine: 'Laadi alla',
      googlePlay: 'Google Play',
      googlePlayLine: 'Saadaval',
    },
    stats: [
      { value: '98 000+', label: 'Varjumiskohad ja sireenid' },
      { value: '4', label: 'Riiki' },
      { value: 'Võrguta', label: 'Töötab ilma internetita' },
      { value: 'Tasuta', label: 'Avatud lähtekood, reklaamideta' },
    ],
    features: {
      title: 'Oluline teave ühes kohas',
      subtitle: 'Mõeldud selgeks kasutamiseks enne hädaolukorda ja selle ajal.',
      items: [
        {
          title: 'Varjumiskohtade ja sireenide kaart',
          body: 'Leia lähedal asuvad elanikkonnakaitse varjumiskohad, kollektiivkaitse hooned, evakuatsioonipunktid ja sireenid kaardilt, mis on kättesaadav võrguühenduseta.',
        },
        {
          title: 'Hädaolukorra juhised',
          body: 'Loe selgeid juhiseid õhuhäire, raketiohu, tuumaintsidendi, ohtliku ilma ja teiste hädaolukordade puhuks.',
        },
        {
          title: '72 tunni varude nimekiri',
          body: 'Valmista ette vesi, toit, dokumendid, ravimid ja muud vahendid, mida sinu majapidamine võib esimesel kolmel ööpäeval vajada.',
        },
        {
          title: 'Kasutatav võrguühenduseta',
          body: 'Kaardid, juhised ja sinu nimekiri salvestatakse seadmesse, nii et teave jääb kättesaadavaks ka piiratud ühenduse korral.',
        },
        {
          title: 'Privaatne pere olek',
          body: 'Loo privaatne grupp ja jaga lühikest olekut: turvaliselt, lähen varjuma, varjun või vajan abi. Sõnumid on otspunktkrüpteeritud.',
        },
        {
          title: 'Kohalikud andmed ja keeled',
          body: 'Kaetud on Leedu, Läti, Eesti ja Poola, kasutades ametlikke avaandmeid seal, kus need on kättesaadavad.',
        },
      ],
    },
    family: {
      eyebrow: 'Pere',
      title: 'Võta perega ühendust privaatselt.',
      body: 'Hädaolukorras on oluline kiiresti teada, kas lähedased on turvaliselt. Baltic72 võimaldab privaatsel grupil jagada lühikesi olekuteateid nii, et server ei näe nende sisu.',
      points: [
        'Otspunktkrüpteering: server salvestab ainult avalikud võtmed ja krüpteeritud sõnumid.',
        'Lihtsad olekud: turvaliselt, lähen varjuma, varjun või vajan abi.',
        'Privaatvõtmed jäävad sinu seadme turvalisse hoidlasse.',
      ],
    },
    download: {
      title: 'Hangi Baltic72',
      body: 'iOS-i ja Androidi rakendusi valmistatakse avaldamiseks ette. Need on tasuta, ilma konto ja reklaamideta.',
    },
    faq: {
      title: 'Küsimused',
      items: [
        { q: 'Kas Baltic72 on tasuta?', a: 'Jah. Baltic72 on tasuta ja avatud lähtekoodiga. Rakenduses ei ole reklaame, kohustuslikku kontot ega oste.' },
        { q: 'Kas see töötab ilma internetita?', a: 'Jah. Varjumiskohtade andmed, sireenide andmed ja hädaolukorra juhised salvestatakse seadmesse, nii et rakendus on kasulik ka ilma mobiililevita.' },
        { q: 'Millised riigid on kaasatud?', a: 'Leedu, Läti, Eesti ja Poola. Veebisait on saadaval inglise keeles ning keeltes, mis on näha keelemenüüs.' },
        { q: 'Kust pärinevad varjumiskohtade andmed?', a: 'Andmed pärinevad ametlikest avaandmete allikatest, sealhulgas PAGD, data.gov.lt, Päästeamet, SMIT, VUGD, 112.lv, KG PSP ja dane.gov.pl.' },
        { q: 'Kui privaatne on pere funktsioon?', a: 'Pere olekusõnumid on otspunktkrüpteeritud. Server salvestab avalikud võtmed ja krüpteeritud sisu, mitte loetavaid nimesid ega olekuid.' },
        { q: 'Millal saab rakenduse alla laadida?', a: 'App Store’i ja Google Play lingid lisatakse sellele lehele siis, kui rakendused on avaldatud.' },
      ],
    },
    footer: {
      tagline: 'Elanikkonnakaitse teave Balti piirkonnale, kättesaadav võrguühenduseta.',
      sourcesLabel: 'Andmeallikad',
      sources: 'PAGD · data.gov.lt (LT) · Päästeamet · SMIT (EE) · VUGD · 112.lv (LV) · KG PSP · dane.gov.pl (PL)',
      privacy: 'Privaatsus',
      privacyBody: 'Baltic72 ei kasuta kontosid, reklaame ega jälgimist. Pere olekuandmed on otspunktkrüpteeritud.',
      privacyPolicy: 'Privaatsuspoliitika',
      terms: 'Kasutustingimused',
      languageLabel: 'Keel',
      rights: 'Baltic72 on tasuta ja avatud lähtekoodiga.',
      sourceCode: 'Lähtekood',
    },
  },

  pl: {
    meta: {
      title: 'Baltic72, informacje o ochronie ludności dla regionu bałtyckiego',
      description:
        'Baltic72 to bezpłatna aplikacja ochrony ludności dla Litwy, Łotwy, Estonii i Polski. Działa offline i pomaga znaleźć schrony oraz syreny, przeczytać zalecenia na wypadek zagrożenia, przygotować zapasy na 72 godziny i bezpiecznie przekazać status rodziny.',
    },
    nav: { features: 'Funkcje', family: 'Rodzina', download: 'Pobierz', faq: 'Pytania', getApp: 'Pobierz aplikację' },
    hero: {
      eyebrow: 'Informacje o bezpieczeństwie dostępne także offline',
      title: 'Przygotuj się na pierwsze 72 godziny.',
      subtitle:
        'Baltic72 przechowuje w telefonie mapę schronów i syren, zalecenia na wypadek zagrożeń oraz listę zapasów domowych. Najważniejsze informacje pozostają dostępne nawet wtedy, gdy nie działa sieć komórkowa.',
      note: 'Bezpłatna i open source. Bez konta, reklam i śledzenia.',
      imageAlt: 'Rodzina sprawdza informacje bezpieczeństwa obok schronu, mapy i przygotowanych zapasów.',
    },
    preview: { status: 'Brak aktywnych ostrzeżeń', ready: 'Informacje gotowe do użycia offline' },
    store: {
      comingSoon: 'Wkrótce',
      appStore: 'App Store',
      appStoreLine: 'Pobierz z',
      googlePlay: 'Google Play',
      googlePlayLine: 'Pobierz z',
    },
    stats: [
      { value: '98 000+', label: 'Schrony i syreny' },
      { value: '4', label: 'Kraje' },
      { value: 'Offline', label: 'Działa bez internetu' },
      { value: 'Bezpłatna', label: 'Open source, bez reklam' },
    ],
    features: {
      title: 'Najważniejsze informacje w jednym miejscu',
      subtitle: 'Przygotowane do jasnego użycia przed sytuacją kryzysową i w jej trakcie.',
      items: [
        {
          title: 'Mapa schronów i syren',
          body: 'Znajdź pobliskie schrony, obiekty ochrony zbiorowej, punkty ewakuacji i syreny na mapie dostępnej offline.',
        },
        {
          title: 'Zalecenia na wypadek zagrożeń',
          body: 'Czytaj jasne instrukcje na wypadek alarmu powietrznego, zagrożenia rakietowego, zdarzenia jądrowego, niebezpiecznej pogody i innych sytuacji kryzysowych.',
        },
        {
          title: 'Lista zapasów na 72 godziny',
          body: 'Przygotuj wodę, żywność, dokumenty, leki i inne rzeczy, których domownicy mogą potrzebować przez pierwsze trzy doby.',
        },
        {
          title: 'Dostęp offline',
          body: 'Mapy, zalecenia i Twoja lista są zapisywane na urządzeniu, dlatego informacje pozostają dostępne przy ograniczonej łączności.',
        },
        {
          title: 'Prywatny status rodziny',
          body: 'Utwórz prywatną grupę i przekaż krótki status: bezpiecznie, idę do schronu, w schronie albo potrzebuję pomocy. Wiadomości są szyfrowane end-to-end.',
        },
        {
          title: 'Lokalne dane i języki',
          body: 'Zakres obejmuje Litwę, Łotwę, Estonię i Polskę, z użyciem oficjalnych danych otwartych tam, gdzie są dostępne.',
        },
      ],
    },
    family: {
      eyebrow: 'Rodzina',
      title: 'Skontaktuj się z rodziną prywatnie.',
      body: 'W sytuacji kryzysowej trzeba szybko wiedzieć, czy bliscy są bezpieczni. Baltic72 pozwala prywatnej grupie udostępniać krótkie statusy bez ujawniania ich treści serwerowi.',
      points: [
        'Szyfrowanie end-to-end: serwer przechowuje tylko klucze publiczne i zaszyfrowane wiadomości.',
        'Proste statusy: bezpiecznie, idę do schronu, w schronie albo potrzebuję pomocy.',
        'Klucze prywatne pozostają w bezpiecznym magazynie na Twoim urządzeniu.',
      ],
    },
    download: {
      title: 'Pobierz Baltic72',
      body: 'Aplikacje na iOS i Androida są przygotowywane do publikacji. Będą bezpłatne, bez konta i bez reklam.',
    },
    faq: {
      title: 'Pytania',
      items: [
        { q: 'Czy Baltic72 jest bezpłatna?', a: 'Tak. Baltic72 jest bezpłatna i open source. W aplikacji nie ma reklam, obowiązkowego konta ani zakupów.' },
        { q: 'Czy działa bez internetu?', a: 'Tak. Dane schronów, dane syren i zalecenia na wypadek zagrożeń są zapisane na urządzeniu, więc aplikacja pozostaje przydatna bez zasięgu sieci komórkowej.' },
        { q: 'Które kraje są objęte?', a: 'Litwa, Łotwa, Estonia i Polska. Strona jest dostępna po angielsku oraz w językach widocznych w menu wyboru języka.' },
        { q: 'Skąd pochodzą dane o schronach?', a: 'Dane pochodzą z oficjalnych otwartych źródeł, w tym PAGD, data.gov.lt, Päästeamet, SMIT, VUGD, 112.lv, KG PSP i dane.gov.pl.' },
        { q: 'Jak prywatna jest funkcja Rodzina?', a: 'Statusy rodziny są szyfrowane end-to-end. Serwer przechowuje klucze publiczne i zaszyfrowaną treść, a nie czytelne imiona ani statusy.' },
        { q: 'Kiedy będzie można pobrać aplikację?', a: 'Linki do App Store i Google Play zostaną dodane na tej stronie, gdy aplikacje zostaną opublikowane.' },
      ],
    },
    footer: {
      tagline: 'Informacje o ochronie ludności dla regionu bałtyckiego, dostępne offline.',
      sourcesLabel: 'Źródła danych',
      sources: 'PAGD · data.gov.lt (LT) · Päästeamet · SMIT (EE) · VUGD · 112.lv (LV) · KG PSP · dane.gov.pl (PL)',
      privacy: 'Prywatność',
      privacyBody: 'Baltic72 nie używa kont, reklam ani śledzenia. Dane statusu rodziny są szyfrowane end-to-end.',
      privacyPolicy: 'Polityka prywatności',
      terms: 'Regulamin',
      languageLabel: 'Język',
      rights: 'Baltic72 jest bezpłatna i open source.',
      sourceCode: 'Kod źródłowy',
    },
  },
};
