import type { StickerTemplate, Team, Page, Rarity } from "./types";

// ─── Team metadata ────────────────────────────────────────────────────────────
// [code, name_es, primary_color, accent_color, group]
const TEAM_DEFS: Array<[string, string, string, string, string]> = [
  ["mex", "México",          "#006847", "#CE1126", "A"],
  ["rsa", "Sudáfrica",       "#007A4D", "#FFB612", "A"],
  ["kor", "Corea del Sur",   "#003478", "#CD2E3A", "A"],
  ["cze", "Rep. Checa",      "#D7141A", "#11457E", "A"],
  ["can", "Canadá",          "#CC0000", "#1a3a6e", "B"],
  ["bih", "Bosnia y Herz.",  "#002395", "#FFCC00", "B"],
  ["qat", "Catar",           "#8D1B3D", "#a08060", "B"],
  ["sui", "Suiza",           "#CC0000", "#1a3a6e", "B"],
  ["bra", "Brasil",          "#009C3B", "#FFDF00", "C"],
  ["mar", "Marruecos",       "#C1272D", "#006233", "C"],
  ["hai", "Haití",           "#00209F", "#D21034", "C"],
  ["sco", "Escocia",         "#003F87", "#5080c0", "C"],
  ["usa", "Estados Unidos",  "#B22234", "#3C3B6E", "D"],
  ["par", "Paraguay",        "#D52B1E", "#0038A8", "D"],
  ["aus", "Australia",       "#00008B", "#FFCD00", "D"],
  ["tur", "Turquía",         "#E30A17", "#801010", "D"],
  ["ger", "Alemania",        "#1a1a1a", "#DD0000", "E"],
  ["cuw", "Curaçao",         "#003DA5", "#FFD700", "E"],
  ["civ", "Costa de Marfil", "#F77F00", "#009A44", "E"],
  ["ecu", "Ecuador",         "#0047AB", "#FFD100", "E"],
  ["ned", "Países Bajos",    "#FF6600", "#003DA5", "F"],
  ["jpn", "Japón",           "#BC002D", "#1a1a6e", "F"],
  ["swe", "Suecia",          "#006AA7", "#FECC02", "F"],
  ["tun", "Túnez",           "#E70013", "#802020", "F"],
  ["bel", "Bélgica",         "#ED2939", "#1a1a1a", "G"],
  ["egy", "Egipto",          "#CC0001", "#802020", "G"],
  ["irn", "Irán",            "#239F40", "#DA0000", "G"],
  ["nzl", "Nueva Zelanda",   "#00247D", "#CC0000", "G"],
  ["esp", "España",          "#AA151B", "#F1BF00", "H"],
  ["cpv", "Cabo Verde",      "#003893", "#CF2027", "H"],
  ["ksa", "Arabia Saudita",  "#006C35", "#508050", "H"],
  ["uru", "Uruguay",         "#75AADB", "#1a3a6e", "H"],
  ["fra", "Francia",         "#002395", "#ED2939", "I"],
  ["sen", "Senegal",         "#00853F", "#CF2027", "I"],
  ["irq", "Irak",            "#CE1126", "#1a1a1a", "I"],
  ["nor", "Noruega",         "#EF2B2D", "#1a2a6e", "I"],
  ["arg", "Argentina",       "#75AADB", "#1a3a6e", "J"],
  ["alg", "Argelia",         "#006233", "#D21034", "J"],
  ["aut", "Austria",         "#ED2939", "#802020", "J"],
  ["jor", "Jordania",        "#007A3D", "#CE1126", "J"],
  ["por", "Portugal",        "#006600", "#FF0000", "K"],
  ["cod", "Congo DR",        "#007FFF", "#CE1126", "K"],
  ["uzb", "Uzbekistán",      "#1EB53A", "#CE1126", "K"],
  ["col", "Colombia",        "#FCD116", "#003087", "K"],
  ["eng", "Inglaterra",      "#CC0000", "#1a1a6e", "L"],
  ["cro", "Croacia",         "#CC0000", "#0093DD", "L"],
  ["gha", "Ghana",           "#006B3F", "#FCD116", "L"],
  ["pan", "Panamá",          "#D21034", "#001489", "L"],
];

// ─── Player lists ─────────────────────────────────────────────────────────────
// 20 entries per team: [0]=logo foil, [12]=team photo, rest=players
const TEAM_PLAYERS: Record<string, string[]> = {
  mex: ["Escudo","Luis Malagón","Johan Vásquez","Jorge Sánchez","César Montes","Jesús Gallardo","Israel Reyes","Diego Lainez","Carlos Rodríguez","Edson Álvarez","Orbelin Pineda","Marcel Ruiz","Foto del equipo","Érick Sánchez","Hirving Lozano","Santiago Giménez","Raúl Jiménez","Alexis Vega","Roberto Alvarado","César Huerta"],
  rsa: ["Escudo","Ronwen Williams","Sipho Chaine","Aubrey Modiba","Samukele Kabini","Mbekezeli Mbokazi","Khulumani Ndamane","Siyabonga Ngezana","Khuliso Mudau","Nkosinathi Sibisi","Teboho Mokoena","Thalente Mbatha","Foto del equipo","Bathasi Aubaas","Yaya Sithole","Sipho Mbule","Lyle Foster","Iqraam Rayners","Mohau Nkota","Oswin Appollis"],
  kor: ["Escudo","Hyeon-woo Jo","Seung-Gyu Kim","Min-jae Kim","Yu-min Cho","Young-woo Seol","Han-beom Lee","Tae-seok Lee","Myung-jae Lee","Jae-sung Lee","In-beom Hwang","Kang-in Lee","Foto del equipo","Seung-ho Paik","Jens Castrop","Dong-yeong Lee","Gue-sung Cho","Heung-min Son","Hee-chan Hwang","Hyeon-Gyu Oh"],
  cze: ["Escudo","Matej Kovár","Jindrich Stanek","Ladislav Krejci","Vladimir Coufal","Jaroslav Zeleny","Tomas Holes","David Zima","Michal Sadilek","Lukas Provod","Lukas Cerv","Tomas Soucek","Foto del equipo","Pavel Sulc","Matej Vydra","Vasil Kusej","Tomas Chory","Vaclav Cerny","Adam Hlozek","Patrik Schick"],
  can: ["Escudo","Dayne St.Clair","Alphonso Davies","Alistair Johnston","Samuel Adekugbe","Riche Larvea","Derek Cornelius","Moïse Bombito","Kamal Miller","Stephen Eustáquio","Ismaël Koné","Jonathan Osorio","Foto del equipo","Jacob Shaffelburg","Mathieu Choinière","Niko Sigur","Tajon Buchanan","Liam Millar","Cyle Larin","Jonathan David"],
  bih: ["Escudo","Nikola Vasilj","Amer Dedic","Sead Kolasinac","Tarik Muharemovic","Nihad Mujakic","Nikola Katic","Amir Hadziahmetovic","Benjamin Tahirovic","Armin Gigovic","Ivan Sunjic","Ivan Basic","Foto del equipo","Dzenis Burnic","Esmir Bajraktarevic","Amar Memic","Ermedin Demirovic","Edin Dzeko","Samed Bazdar","Haris Tabakovic"],
  qat: ["Escudo","Meshaal Barsham","Sultan Albrake","Lucas Mendes","Homam Ahmed","Boualem Khoukhi","Pedro Miguel","Tarek Salman","Mohamed Al-Mannai","Karim Boudiaf","Assim Madibo","Ahmed Fatehi","Foto del equipo","Mohammed Waad","Abdulaziz Hatem","Hassan Al-Haydos","Edmilson Junior","Akram Hassan Afif","Ahmed Al Ganehi","Almoez Ali"],
  sui: ["Escudo","Gregor Kobel","Yvon Mvogo","Manuel Akanji","Ricardo Rodriguez","Nico Elvedi","Aurèle Amenda","Silvan Widmer","Granit Xhaka","Denis Zakaria","Remo Freuler","Fabian Rieder","Foto del equipo","Ardon Jashari","Johan Manzambi","Michel Aebischer","Breel Embolo","Ruben Vargas","Dan Ndoye","Zeki Amdouni"],
  bra: ["Escudo","Alisson","Bento","Marquinhos","Éder Militão","Gabriel Magalhães","Danilo","Wesley","Lucas Paquetá","Casemiro","Bruno Guimarães","Luiz Henrique","Foto del equipo","Vinicius Júnior","Rodrygo","João Pedro","Matheus Cunha","Gabriel Martinelli","Raphinha","Estévão"],
  mar: ["Escudo","Yassine Bounou","Munir El Kajoui","Achraf Hakimi","Noussair Mazraoui","Nayef Aguerd","Roman Saiss","Jawad El Yamiq","Adam Masina","Sofyan Amrabat","Azzedine Ounahi","Eliesse Ben Seghir","Foto del equipo","Bilal El Khannouss","Ismael Saibari","Youssef En-Nesyri","Abde Ezzalzouli","Soufiane Rahimi","Brahim Díaz","Ayoub El Kaabi"],
  hai: ["Escudo","Johny Placide","Carlens Arcus","Martin Expérience","Jean-Kevin Duverne","Ricardo Adé","Duke Lacroix","Garven Metusala","Hannes Delcroix","Leverton Pierre","Danley Jean Jacques","Jean-Ricner Bellegarde","Foto del equipo","Christopher Attys","Derrick Etienne Jr.","Josue Casimir","Ruben Providence","Duckens Nazon","Louicius Deedson","Frantzdy Pierrot"],
  sco: ["Escudo","Angus Gunn","Jack Hendry","Kieran Tierney","Aaron Hickey","Andrew Robertson","Scott McKenna","John Souttar","Anthony Ralston","Grant Hanley","Scott McTominay","Billy Gilmour","Foto del equipo","Lewis Ferguson","Ryan Christie","Kenny McLean","John McGinn","Lyndon Dykes","Che Adams","Ben Doak"],
  usa: ["Escudo","Matt Freese","Chris Richards","Tim Ream","Mark McKenzie","Alex Freeman","Antonee Robinson","Tyler Adams","Tanner Tessmann","Weston McKennie","Christian Roldan","Timothy Weah","Foto del equipo","Diego Luna","Malik Tillman","Christian Pulisic","Brenden Aaronson","Ricardo Pepi","Haji Wright","Folarin Balogun"],
  par: ["Escudo","Roberto Fernández","Orlando Gill","Gustavo Gómez","Fabián Balbuena","Juan José Cáceres","Omar Alderete","Junior Alonso","Mathías Villasanti","Diego Gómez","Damián Bobadilla","Andrés Cubas","Foto del equipo","Matías Galarza","Julio Enciso","Alejandro Romero Gamarra","Miguel Almirón","Ramón Sosa","Ángel Romero","Antonio Sanabria"],
  aus: ["Escudo","Mathew Ryan","Joe Gauci","Harry Souttar","Alessandro Circati","Jordan Bos","Aziz Behich","Cameron Burgess","Lewis Miller","Milos Degenek","Jackson Irvine","Riley McGree","Foto del equipo","Aiden O'Neill","Connor Metcalfe","Patrick Yazbek","Craig Goodwin","Kusini Yengi","Nestory Irankunda","Mohamed Touré"],
  tur: ["Escudo","Uğurcan Çakır","Mert Müldür","Zeki Çelik","Abdulkerim Bardakci","Çağlar Söyüncü","Merih Demiral","Ferdi Kadıoğlu","Kaan Ayhan","İsmail Yüksek","Hakan Çalhanoğlu","Orkun Kökçü","Foto del equipo","Arda Güler","İrfan Can Kahveci","Yunus Akgün","Can Uzun","Barış Alper Yılmaz","Kerem Aktürkoğlu","Kenan Yıldız"],
  ger: ["Escudo","Marc-André ter Stegen","Jonathan Tah","David Raum","Nico Schlotterbeck","Antonio Rüdiger","Waldemar Anton","Ridle Baku","Maximilian Mittelstädt","Joshua Kimmich","Florian Wirtz","Felix Nmecha","Foto del equipo","Leon Goretzka","Jamal Musiala","Serge Gnabry","Kai Havertz","Leroy Sané","Karim Adeyemi","Nick Woltemade"],
  cuw: ["Escudo","Eloy Room","Armando Obispo","Sherel Floranus","Jurien Gaari","Joshua Brenet","Roshon Van Eijma","Shurandy Sambo","Livano Comenencia","Godfried Roemeratoe","Juninho Bacuna","Leandro Bacuna","Foto del equipo","Tahith Chong","Kenji Gorre","Jearl Margaritha","Jurgen Locadia","Jeremy Antonisse","Gervane Kastaneer","Sontje Hansen"],
  civ: ["Escudo","Yahia Fofana","Ghislain Konan","Wilfried Singo","Odilon Kossounou","Evan Ndicka","Willy Boly","Emmanuel Agbadou","Ousmane Diomande","Franck Kessie","Seko Fofana","Ibrahim Sangare","Foto del equipo","Jean-Philippe Gbamin","Amad Diallo","Sébastien Haller","Simon Adingra","Yan Diomande","Evann Guessand","Oumar Diakite"],
  ecu: ["Escudo","Hernán Galíndez","Gonzalo Valle","Piero Hincapié","Pervis Estupiñán","Willian Pacho","Ángelo Preciado","Joel Ordóñez","Moisés Caicedo","Alan Franco","Kendry Páez","Pedro Vite","Foto del equipo","John Yeboah","Leonardo Campana","Gonzalo Plata","Nilson Angulo","Alan Minda","Kevin Rodríguez","Enner Valencia"],
  ned: ["Escudo","Bart Verbruggen","Virgil van Dijk","Micky van de Ven","Jurriën Timber","Denzel Dumfries","Nathan Aké","Jeremie Frimpong","Jan Paul van Hecke","Tijjani Reijnders","Ryan Gravenberch","Teun Koopmeiners","Foto del equipo","Frenkie de Jong","Xavi Simons","Justin Kluivert","Memphis Depay","Donyell Malen","Wout Weghorst","Cody Gakpo"],
  jpn: ["Escudo","Zion Suzuki","Henry Heroki Mochizuki","Ayumu Seko","Junnosuke Suzuki","Shogo Taniguchi","Tsuyoshi Watanabe","Kaishu Sano","Yuki Soma","Ao Tanaka","Daichi Kamada","Takefusa Kubo","Foto del equipo","Ritsu Doan","Keito Nakamura","Takumi Minamino","Shuto Machino","Junya Ito","Koki Ogawa","Ayase Ueda"],
  swe: ["Escudo","Victor Johansson","Isak Hien","Gabriel Gudmundsson","Emil Holm","Victor Nilsson Lindelöf","Gustaf Lagerbielke","Lucas Bergvall","Hugo Larsson","Jesper Karlström","Yasin Ayari","Mattias Svanberg","Foto del equipo","Daniel Svensson","Ken Sema","Roony Bardghji","Dejan Kulusevski","Anthony Elanga","Alexander Isak","Viktor Gyökeres"],
  tun: ["Escudo","Bechir Ben Said","Aymen Dahmen","Yan Valery","Montassar Talbi","Yassine Meriah","Ali Abdi","Dylan Bronn","Ellyes Skhiri","Aissa Laidouni","Ferjani Sassi","Mohamed Ali Ben Romdhane","Foto del equipo","Hannibal Mejbri","Elias Achouri","Elias Saad","Hazem Mastouri","Ismael Gharbi","Sayfallah Ltaief","Naim Sliti"],
  bel: ["Escudo","Thibaut Courtois","Arthur Theate","Timothy Castagne","Zeno Debast","Brandon Mechele","Maxim De Cuyper","Thomas Meunier","Youri Tielemans","Amadou Onana","Nicolas Raskin","Alexis Saelemaekers","Foto del equipo","Hans Vanaken","Kevin De Bruyne","Jérémy Doku","Charles De Ketelaere","Leandro Trossard","Loïs Openda","Romelu Lukaku"],
  egy: ["Escudo","Mohamed El Shenawy","Mohamed Hany","Mohamed Hamdy","Yasser Ibrahim","Khaled Sobhi","Ramy Rabia","Hossam Abdelmaguid","Ahmed Fatouh","Marwan Attia","Zizo","Hamdy Fathy","Foto del equipo","Mohamed Lasheen","Emam Ashour","Osama Faisal","Mohamed Salah","Mostafa Mohamed","Trezeguet","Omar Marmoush"],
  irn: ["Escudo","Alireza Beiranvand","Morteza Pouraliganji","Ehsan Hajsafi","Milad Mohammadi","Shojae Khalilzadeh","Ramin Rezaeian","Hossein Kanaani","Sadegh Moharrami","Saleh Hardani","Saeed Ezatolahi","Saman Ghoddos","Foto del equipo","Omid Noorafkan","Roozbeh Cheshmi","Mohammad Mohebi","Sardar Azmoun","Mehdi Taremi","Alireza Jahanbakhsh","Ali Gholizadeh"],
  nzl: ["Escudo","Max Crocombe","Alex Paulsen","Michael Boxall","Liberato Cacace","Tim Payne","Tyler Bindon","Francis de Vries","Finn Surman","Joe Bell","Sarpreet Singh","Ryan Thomas","Foto del equipo","Matthew Garbett","Marko Stamenić","Ben Old","Chris Wood","Elijah Just","Callum McCowatt","Kosta Barbarouses"],
  esp: ["Escudo","Unai Simón","Robin Le Normand","Aymeric Laporte","Dean Huijsen","Pedro Porro","Dani Carvajal","Marc Cucurella","Martín Zubimendi","Rodri","Pedri","Fabián Ruiz","Foto del equipo","Mikel Merino","Lamine Yamal","Dani Olmo","Nico Williams","Ferran Torres","Álvaro Morata","Mikel Oyarzabal"],
  cpv: ["Escudo","Vozinha","Logan Costa","Pico","Diney","Steven Moreira","Wagner Pina","Joao Paulo","Yannick Semedo","Kevin Pina","Patrick Andrade","Jamiro Monteiro","Foto del equipo","Deroy Duarte","Garry Rodrigues","Jovane Cabral","Ryan Mendes","Dailon Livramento","Willy Semedo","Bebé"],
  ksa: ["Escudo","Nawaf Alaqidi","Abdulrahman Al-Sanbi","Saud Abdulhamid","Nawaf Bouwashl","Jihad Thakri","Moteb Al-Harbi","Hassan Altambakti","Musab Aljuwayr","Ziyad Aljohani","Abdullah Alkhaibari","Nasser Aldawsari","Foto del equipo","Saleh Abu Alshamat","Marwan Alsahafi","Salem Aldawsari","Abdulrahman Al-Aboud","Feras Akbrikan","Saleh Alshehri","Abdullah Al-Hamdan"],
  uru: ["Escudo","Sergio Rochet","Santiago Mele","Ronald Araújo","José María Giménez","Sebastián Cáceres","Mathias Olivera","Guillermo Varela","Nahitan Nández","Federico Valverde","Giorgian De Arrascaeta","Rodrigo Bentancur","Foto del equipo","Manuel Ugarte","Nicolás de la Cruz","Maxi Araújo","Darwin Núñez","Federico Viñas","Rodrigo Aguirre","Facundo Pellistri"],
  fra: ["Escudo","Mike Maignan","Theo Hernandez","William Saliba","Jules Koundé","Ibrahima Konaté","Dayot Upamecano","Lucas Digne","Aurélien Tchouaméni","Eduardo Camavinga","Manu Koné","Adrien Rabiot","Foto del equipo","Michael Olise","Ousmane Dembélé","Bradley Barcola","Désiré Doué","Kingsley Coman","Hugo Ekitiké","Kylian Mbappé"],
  sen: ["Escudo","Edouard Mendy","Yehvann Diouf","Moussa Niakhaté","Abdoulaye Seck","Ismail Jakobs","El Hadji Malick Diouf","Kalidou Koulibaly","Idrissa Gana Gueye","Pape Matar Sarr","Pape Gueye","Habib Diarra","Foto del equipo","Lamine Camara","Sadio Mané","Ismaïla Sarr","Boulaye Dia","Iliman Ndiaye","Nicolas Jackson","Krepin Diatta"],
  irq: ["Escudo","Jalal Hassan","Rebin Sulaka","Hussein Ali","Akam Hashem","Merchas Doski","Zaid Tahseen","Manaf Younis","Zidane Iqbal","Amir Al-Ammari","Ibrahim Bavesh","Ali Jasim","Foto del equipo","Youssef Amyn","Aimar Sher","Marko Farji","Osama Rashid","Ali Al-Hamadi","Aymen Hussein","Mohanad Ali"],
  nor: ["Escudo","Ørjan Nyland","Julian Ryerson","Leo Østigård","Kristoffer Ajer","Marcus Holmgren Pedersen","David Møller Wolfe","Torbjørn Heggem","Morten Thorsby","Martin Ødegaard","Sander Berge","Andreas Schjelderup","Foto del equipo","Patrick Berg","Erling Haaland","Alexander Sørloth","Aron Dønnum","Jørgen Strand Larsen","Antonio Nusa","Oscar Bobb"],
  arg: ["Escudo","Emiliano Martínez","Nahuel Molina","Cristian Romero","Nicolás Otamendi","Nicolás Tagliafico","Leonardo Balerdi","Enzo Fernández","Alexis Mac Allister","Rodrigo De Paul","Exequiel Palacios","Leandro Paredes","Foto del equipo","Nico Paz","Franco Mastantuono","Nico González","Lionel Messi","Lautaro Martínez","Julián Álvarez","Giuliano Simeone"],
  alg: ["Escudo","Alexis Guendouz","Ramy Bensebaini","Youcef Atal","Rayan Aït-Nouri","Mohamed Amine Tougai","Aïssa Mandi","Ismael Bennacer","Houssem Aouar","Hicham Boudaoui","Ramiz Zerrouki","Nabil Bentalab","Foto del equipo","Farès Chaibi","Riyad Mahrez","Said Benrahma","Anis Hadj Moussa","Amine Gouiri","Baghdad Bounedjah","Mohammed Amoura"],
  aut: ["Escudo","Alexander Schlager","Patrick Pentz","David Alaba","Kevin Danso","Philipp Lienhart","Stefan Posch","Phillipp Mwene","Alexander Prass","Xaver Schlager","Marcel Sabitzer","Konrad Laimer","Foto del equipo","Florian Grillitsch","Nicolas Seiwald","Romano Schmid","Patrick Wimmer","Christoph Baumgartner","Michael Gregoritsch","Marko Arnautović"],
  jor: ["Escudo","Yazeed Abulaila","Ihsan Haddad","Mohammad Abu Hashish","Yazan Al-Arab","Abdallah Nasib","Saleem Obaid","Mohammad Abualnadi","Ibrahim Saadeh","Nizar Al-Rashdan","Noor Al-Rawabdeh","Mohannad Abu Taha","Foto del equipo","Amer Jamous","Musa Al-Taamari","Yazan Al-Naimat","Mahmoud Al-Mardi","Ali Olwan","Mohammad Abu Zrayq","Ibrahim Sabra"],
  por: ["Escudo","Diogo Costa","Jose Sá","Rúben Dias","João Cancelo","Diogo Dalot","Nuno Mendes","Gonçalo Inácio","Bernardo Silva","Bruno Fernandes","Rúben Neves","Vitinha","Foto del equipo","João Neves","Cristiano Ronaldo","Francisco Trincão","João Félix","Gonçalo Ramos","Pedro Neto","Rafael Leão"],
  cod: ["Escudo","Lionel Mpasi","Aaron Wan-Bissaka","Axel Tuanzebe","Arthur Masuaku","Chancel Mbemba","Joris Kayembe","Charles Pickel","Ngal'ayel Mukau","Edo Kayembe","Samuel Moutoussamy","Noah Sadiki","Foto del equipo","Théo Bongonda","Meschak Elia","Yoane Wissa","Brian Cipenga","Fiston Mayele","Cédric Bakambu","Nathanaël Mbuku"],
  uzb: ["Escudo","Utkir Yusupov","Farrukh Savfiev","Sherzod Nasrullaev","Umar Eshmurodov","Husniddin Aliqulov","Rustamjon Ashurmatov","Khojiakbar Alijonov","Abdukodir Khusanov","Odiljon Hamrobekov","Otabek Shukurov","Jamshid Iskanderov","Foto del equipo","Azizbek Turgunboev","Khojimat Erkinov","Eldor Shomurodov","Oston Urunov","Jaloliddin Masharipov","Igor Sergeev","Abbosbek Fayzullaev"],
  col: ["Escudo","Camilo Vargas","David Ospina","Dávinson Sánchez","Yerry Mina","Daniel Muñoz","Johan Mojica","Jhon Lucumí","Santiago Arias","Jefferson Lerma","Kevin Castaño","Richard Ríos","Foto del equipo","James Rodríguez","Juan Fernando Quintero","Jorge Carrascal","Jon Arias","Jhon Córdoba","Luis Suárez","Luis Díaz"],
  eng: ["Escudo","Jordan Pickford","John Stones","Marc Guéhi","Ezri Konsa","Trent Alexander-Arnold","Reece James","Dan Burn","Jordan Henderson","Declan Rice","Jude Bellingham","Cole Palmer","Foto del equipo","Morgan Rogers","Anthony Gordon","Phil Foden","Bukayo Saka","Harry Kane","Marcus Rashford","Ollie Watkins"],
  cro: ["Escudo","Dominik Livaković","Duje Caleta-Car","Joško Gvardiol","Josip Stanišić","Luka Vušković","Josip Šutalo","Kristijan Jakić","Luka Modrić","Mateo Kovačić","Martin Baturina","Lovro Majer","Foto del equipo","Mario Pašalić","Petar Sucic","Ivan Perišić","Marco Pašalić","Ante Budimir","Andrej Kramarić","Franjo Ivanovic"],
  gha: ["Escudo","Lawrence Ati Zigi","Tariq Lamptey","Mohammed Salisu","Alidu Seidu","Alexander Djiku","Gideon Mensah","Caleb Yirenkyi","Abdul Issahaku Fatawu","Thomas Partey","Salis Abdul Samed","Kamaldeen Sulemana","Foto del equipo","Mohammed Kudus","Iñaki Williams","Jordan Ayew","Andrew Ayew","Joseph Paintsil","Osman Bukari","Antoine Semenyo"],
  pan: ["Escudo","Orlando Mosquera","Luis Mejia","Fidel Escobar","Andrés Andrade","Michael Amir Murillo","Eric Davis","Jose Córdoba","César Blackman","Cristian Martínez","Aníbal Godoy","Adalberto Carrasquilla","Foto del equipo","Édgar Bárcenas","Carlos Harvey","Ismael Díaz","Jose Fajardo","Cecilio Waterman","Jose Luis Rodríguez","Alberto Quintero"],
};

// ─── DT / Managers ───────────────────────────────────────────────────────────
export const TEAM_MANAGERS: Record<string, string> = {
  mex: "Javier Aguirre",
  rsa: "Hugo Broos",
  kor: "Hong Myung-bo",
  cze: "Miroslav Koubek",
  can: "Jesse Marsch",
  bih: "Sergej Barbarez",
  qat: "Julen Lopetegui",
  sui: "Murat Yakin",
  bra: "Carlo Ancelotti",
  mar: "Mohamed Ouahbi",
  hai: "Sébastien Migné",
  sco: "Steve Clarke",
  usa: "Mauricio Pochettino",
  par: "Gustavo Alfaro",
  aus: "Tony Popovic",
  tur: "Vincenzo Montella",
  ger: "Julian Nagelsmann",
  cuw: "Dick Advocaat",
  civ: "Emerse Faé",
  ecu: "Sebastián Beccacece",
  ned: "Ronald Koeman",
  jpn: "Hajime Moriyasu",
  swe: "Graham Potter",
  tun: "Sabri Lamouchi",
  bel: "Rudi Garcia",
  egy: "Hossam Hassan",
  irn: "Amir Ghalenoei",
  nzl: "Darren Bazeley",
  esp: "Luis de la Fuente",
  cpv: "Bubista",
  ksa: "Georgios Donis",
  uru: "Marcelo Bielsa",
  fra: "Didier Deschamps",
  sen: "Pape Thiaw",
  irq: "Graham Arnold",
  nor: "Ståle Solbakken",
  arg: "Lionel Scaloni",
  alg: "Vladimir Petković",
  aut: "Ralf Rangnick",
  jor: "Jamal Sellami",
  por: "Roberto Martínez",
  cod: "Sébastien Desabre",
  uzb: "Fabio Cannavaro",
  col: "Néstor Lorenzo",
  eng: "Thomas Tuchel",
  cro: "Zlatko Dalić",
  gha: "Carlos Queiroz",
  pan: "Thomas Christiansen",
};

// ─── FWC intro stickers (20 total, global nums 1-20) ─────────────────────────
const FWC_NAMES: string[] = [
  "Logo Figu",         //  1
  "Mascota oficial",     //  2
  "Trofeo FIFA",         //  3
  "Est. MetLife (USA)",  //  4
  "Est. Azteca (MEX)",   //  5
  "Est. BC Place (CAN)", //  6
  "Emblema oficial",     //  7
  "Balón oficial",       //  8
  "Uruguay 1930",        //  9
  "Brasil 1950",         // 10
  "Inglaterra 1966",     // 11
  "Brasil 1970",         // 12
  "Argentina 1978",      // 13
  "Italia 1982",         // 14
  "México 1986",         // 15
  "Brasil 1994",         // 16
  "Francia 1998",        // 17
  "Brasil 2002",         // 18
  "España 2010",         // 19
  "Argentina 2022",      // 20
];

// ─── Rarity overrides ────────────────────────────────────────────────────────
// "teamCode:pos" where pos is 1-based (1=logo, 13=team photo, 2-12/14-20=players)
const RARITY_OVERRIDES: Record<string, Rarity> = {
  // ── Legendary (8 superstars) ──────────────────────────────────────────────
  "arg:17": "legendary", // Lionel Messi
  "fra:20": "legendary", // Kylian Mbappé
  "por:15": "legendary", // Cristiano Ronaldo
  "bra:14": "legendary", // Vinicius Júnior
  "nor:15": "legendary", // Erling Haaland
  "eng:11": "legendary", // Jude Bellingham
  "egy:17": "legendary", // Mohamed Salah
  "bel:15": "legendary", // Kevin De Bruyne

  // ── Shiny players ─────────────────────────────────────────────────────────
  "mex:15": "shiny", // Hirving Lozano
  "mex:16": "shiny", // Santiago Giménez
  "mex:17": "shiny", // Raúl Jiménez
  "kor:18": "shiny", // Heung-min Son
  "kor:4": "shiny",  // Min-jae Kim
  "cze:20": "shiny", // Patrik Schick
  "can:3": "shiny",  // Alphonso Davies
  "can:20": "shiny", // Jonathan David
  "bih:18": "shiny", // Edin Dzeko
  "sui:9": "shiny",  // Granit Xhaka
  "bra:2": "shiny",  // Alisson
  "bra:4": "shiny",  // Marquinhos
  "bra:10": "shiny", // Casemiro
  "bra:15": "shiny", // Rodrygo
  "bra:19": "shiny", // Raphinha
  "bra:20": "shiny", // Estévão
  "mar:4": "shiny",  // Achraf Hakimi
  "sco:11": "shiny", // Scott McTominay
  "usa:16": "shiny", // Christian Pulisic
  "par:17": "shiny", // Miguel Almirón
  "tur:14": "shiny", // Arda Güler
  "tur:20": "shiny", // Kenan Yıldız
  "ger:11": "shiny", // Florian Wirtz
  "ger:15": "shiny", // Jamal Musiala
  "ger:10": "shiny", // Joshua Kimmich
  "civ:10": "shiny", // Franck Kessie
  "ecu:9": "shiny",  // Moisés Caicedo
  "ned:3": "shiny",  // Virgil van Dijk
  "ned:14": "shiny", // Frenkie de Jong
  "ned:20": "shiny", // Cody Gakpo
  "jpn:12": "shiny", // Takefusa Kubo
  "swe:19": "shiny", // Alexander Isak
  "swe:20": "shiny", // Viktor Gyökeres
  "swe:17": "shiny", // Dejan Kulusevski
  "bel:2": "shiny",  // Thibaut Courtois
  "bel:20": "shiny", // Romelu Lukaku
  "esp:10": "shiny", // Rodri
  "esp:11": "shiny", // Pedri
  "esp:15": "shiny", // Lamine Yamal
  "esp:17": "shiny", // Nico Williams
  "uru:10": "shiny", // Federico Valverde
  "uru:17": "shiny", // Darwin Núñez
  "fra:2": "shiny",  // Mike Maignan
  "fra:9": "shiny",  // Aurélien Tchouaméni
  "fra:14": "shiny", // Michael Olise
  "fra:15": "shiny", // Ousmane Dembélé
  "nor:10": "shiny", // Martin Ødegaard
  "nor:16": "shiny", // Alexander Sørloth
  "arg:2": "shiny",  // Emiliano Martínez
  "arg:9": "shiny",  // Alexis Mac Allister
  "arg:18": "shiny", // Lautaro Martínez
  "arg:19": "shiny", // Julián Álvarez
  "alg:15": "shiny", // Riyad Mahrez
  "por:9": "shiny",  // Bernardo Silva
  "por:10": "shiny", // Bruno Fernandes
  "por:18": "shiny", // Gonçalo Ramos
  "por:20": "shiny", // Rafael Leão
  "col:14": "shiny", // James Rodríguez
  "col:20": "shiny", // Luis Díaz
  "eng:10": "shiny", // Declan Rice
  "eng:12": "shiny", // Cole Palmer
  "eng:17": "shiny", // Bukayo Saka
  "eng:18": "shiny", // Harry Kane
  "cro:9": "shiny",  // Luka Modrić
  "cro:4": "shiny",  // Joško Gvardiol
  "gha:14": "shiny", // Mohammed Kudus
  "sen:15": "shiny", // Sadio Mané

  // ── Rare ──────────────────────────────────────────────────────────────────
  "mex:10": "rare", // Edson Álvarez
  "rsa:17": "rare", // Lyle Foster
  "kor:3": "rare",  // Seung-Gyu Kim
  "can:10": "rare", // Stephen Eustáquio
  "sui:4": "rare",  // Manuel Akanji
  "bra:9": "rare",  // Lucas Paquetá
  "bra:11": "rare", // Bruno Guimarães
  "mar:5": "rare",  // Noussair Mazraoui
  "mar:10": "rare", // Sofyan Amrabat
  "mar:16": "rare", // Youssef En-Nesyri
  "sco:6": "rare",  // Andrew Robertson
  "usa:10": "rare", // Weston McKennie
  "par:15": "rare", // Julio Enciso
  "tur:11": "rare", // Hakan Çalhanoğlu
  "ger:6": "rare",  // Antonio Rüdiger
  "ger:17": "rare", // Kai Havertz
  "civ:11": "rare", // Seko Fofana
  "ecu:5": "rare",  // Pervis Estupiñán
  "ned:10": "rare", // Tijjani Reijnders
  "ned:11": "rare", // Ryan Gravenberch
  "ned:12": "rare", // Teun Koopmeiners
  "jpn:11": "rare", // Daichi Kamada
  "jpn:14": "rare", // Ritsu Doan
  "bel:9": "rare",  // Youri Tielemans
  "bel:10": "rare", // Amadou Onana
  "irn:18": "rare", // Mehdi Taremi
  "irn:17": "rare", // Sardar Azmoun
  "esp:9": "rare",  // Martín Zubimendi
  "esp:14": "rare", // Mikel Merino
  "uru:3": "rare",  // Ronald Araújo
  "uru:14": "rare", // Manuel Ugarte
  "fra:3": "rare",  // Theo Hernandez
  "fra:4": "rare",  // William Saliba
  "fra:10": "rare", // Eduardo Camavinga
  "sen:9": "rare",  // Idrissa Gana Gueye
  "sen:10": "rare", // Pape Matar Sarr
  "nor:11": "rare", // Sander Berge
  "arg:4": "rare",  // Cristian Romero
  "arg:10": "rare", // Rodrigo De Paul
  "alg:8": "rare",  // Ismael Bennacer
  "aut:4": "rare",  // David Alaba
  "aut:20": "rare", // Marko Arnautović
  "por:4": "rare",  // Rúben Dias
  "por:14": "rare", // João Neves
  "por:17": "rare", // João Félix
  "cod:16": "rare", // Yoane Wissa
  "uzb:16": "rare", // Eldor Shomurodov
  "col:10": "rare", // Jefferson Lerma
  "col:12": "rare", // Richard Ríos
  "eng:6": "rare",  // Trent Alexander-Arnold
  "eng:16": "rare", // Phil Foden
  "cro:10": "rare", // Mateo Kovačić
  "gha:10": "rare", // Thomas Partey
  "gha:15": "rare", // Iñaki Williams
  "pan:12": "rare", // Adalberto Carrasquilla
};

// ─── FWC sticker → country whose ostrich/colors to use ───────────────────────
// Key = sticker number (9-20), value = team code in TEAMS
export const FWC_CHAMPION_TEAMS: Record<number, string> = {
  9:  "uru", // Uruguay 1930
  10: "bra", // Brasil 1950
  11: "eng", // Inglaterra 1966
  12: "bra", // Brasil 1970
  13: "arg", // Argentina 1978
  14: "ita", // Italia 1982 — usa fwc-14.png + colores ITA
  15: "mex", // México 1986
  16: "bra", // Brasil 1994
  17: "fra", // Francia 1998
  18: "bra", // Brasil 2002
  19: "esp", // España 2010
  20: "arg", // Argentina 2022
};

// Stickers FWC con imagen real en /public/fwc-{num}.png
export const FWC_IMAGE_STICKERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 14]);

// ─── Team flags (Unicode emoji) ───────────────────────────────────────────────
export const TEAM_FLAGS: Record<string, string> = {
  mex: "🇲🇽", rsa: "🇿🇦", kor: "🇰🇷", cze: "🇨🇿",
  can: "🇨🇦", bih: "🇧🇦", qat: "🇶🇦", sui: "🇨🇭",
  bra: "🇧🇷", mar: "🇲🇦", hai: "🇭🇹", sco: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  usa: "🇺🇸", par: "🇵🇾", aus: "🇦🇺", tur: "🇹🇷",
  ger: "🇩🇪", cuw: "🇨🇼", civ: "🇨🇮", ecu: "🇪🇨",
  ned: "🇳🇱", jpn: "🇯🇵", swe: "🇸🇪", tun: "🇹🇳",
  bel: "🇧🇪", egy: "🇪🇬", irn: "🇮🇷", nzl: "🇳🇿",
  esp: "🇪🇸", cpv: "🇨🇻", ksa: "🇸🇦", uru: "🇺🇾",
  fra: "🇫🇷", sen: "🇸🇳", irq: "🇮🇶", nor: "🇳🇴",
  arg: "🇦🇷", alg: "🇩🇿", aut: "🇦🇹", jor: "🇯🇴",
  por: "🇵🇹", cod: "🇨🇩", uzb: "🇺🇿", col: "🇨🇴",
  eng: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", cro: "🇭🇷", gha: "🇬🇭", pan: "🇵🇦",
  fwc: "🏆",
};

// ─── Team groups ───────────────────────────────────────────────────────────────
export const TEAM_GROUPS: Record<string, string> = Object.fromEntries(
  TEAM_DEFS.map(([code, , , , group]) => [code, group])
);

// ─── Exported team record ─────────────────────────────────────────────────────
export const TEAMS: Record<string, Team> = Object.fromEntries(
  TEAM_DEFS.map(([code, name, color, accent]) => [
    code,
    { id: code, name, color, accent },
  ])
);
// FWC pseudo-team for intro stickers
TEAMS["fwc"] = { id: "fwc", name: "Copa del Mundo", color: "#b8860b", accent: "#0d1117" };
// Italia — no está en el WC 2026 pero sí en los campeones históricos (#14)
TEAMS["ita"] = { id: "ita", name: "Italia",          color: "#003DA5", accent: "#1a1a6e" };

// ─── English team names ───────────────────────────────────────────────────────
const TEAM_NAMES_EN: Record<string, string> = {
  mex: "Mexico",        rsa: "South Africa",   kor: "South Korea",
  cze: "Czech Republic",can: "Canada",          bih: "Bosnia & Herz.",
  qat: "Qatar",         sui: "Switzerland",     bra: "Brazil",
  mar: "Morocco",       hai: "Haiti",           sco: "Scotland",
  usa: "United States", tur: "Turkey",          ger: "Germany",
  civ: "Ivory Coast",   ned: "Netherlands",     jpn: "Japan",
  swe: "Sweden",        tun: "Tunisia",         bel: "Belgium",
  egy: "Egypt",         nzl: "New Zealand",     esp: "Spain",
  cpv: "Cape Verde",    ksa: "Saudi Arabia",    fra: "France",
  irq: "Iraq",          nor: "Norway",          alg: "Algeria",
  jor: "Jordan",        uzb: "Uzbekistan",      eng: "England",
  cro: "Croatia",       pan: "Panama",          fwc: "World Cup",
  ita: "Italy",
};

export function teamName(id: string, lang: string): string {
  if (lang === "en" && id in TEAM_NAMES_EN) return TEAM_NAMES_EN[id];
  return TEAMS[id]?.name ?? id;
}

export const RARITY_META: Record<
  Rarity,
  { label: string; odds: number; ring: string; glow: string }
> = {
  common:    { label: "Común",     odds: 0.78,  ring: "#9a8c6d", glow: "rgba(154,140,109,.5)"  },
  rare:      { label: "Rara",      odds: 0.17,  ring: "#3b82f6", glow: "rgba(59,130,246,.55)"  },
  shiny:     { label: "Brillante", odds: 0.045, ring: "#f5c518", glow: "rgba(245,197,24,.75)"  },
  legendary: { label: "Legendaria",odds: 0.005, ring: "#ff2d78", glow: "rgba(255,45,120,.85)"  },
};

// Team display order (matches teams.json)
const TEAM_ORDER = TEAM_DEFS.map(([code]) => code);

// ─── Build CATALOG ────────────────────────────────────────────────────────────
export const CATALOG: Record<number, StickerTemplate> = (() => {
  const out: Record<number, StickerTemplate> = {};

  // FWC intro stickers (1-20)
  FWC_NAMES.forEach((name, i) => {
    const n = i + 1;
    out[n] = { number: n, name, team: "fwc", page: "fwc", rarity: "common" };
  });

  // Team stickers (21-980)
  TEAM_ORDER.forEach((code, teamIdx) => {
    const players = TEAM_PLAYERS[code];
    players.forEach((name, i) => {
      const pos = i + 1;           // 1-based position within team
      const n = 21 + teamIdx * 20 + i; // global sticker number

      let rarity: Rarity = "common";
      if (pos === 1) rarity = "shiny";        // logo always shiny
      const key = `${code}:${pos}`;
      if (RARITY_OVERRIDES[key]) rarity = RARITY_OVERRIDES[key];

      out[n] = { number: n, name, team: code, page: code, rarity };
    });
  });

  // DT / Managers (981-1028)
  TEAM_ORDER.forEach((code, teamIdx) => {
    const name = TEAM_MANAGERS[code];
    if (!name) return;
    const n = 981 + teamIdx;
    out[n] = { number: n, name, team: code, page: code, rarity: "shiny" };
  });

  return out;
})();

export const ALL_NUMBERS: number[] = Object.keys(CATALOG).map(Number).sort((a, b) => a - b);

// ─── Pages (one per team + FWC intro) ────────────────────────────────────────
export const PAGES: Page[] = [
  {
    id: "fwc",
    name: "Introducción · Copa del Mundo",
    numbers: ALL_NUMBERS.filter((x) => CATALOG[x].page === "fwc"),
  },
  ...TEAM_DEFS.map(([code, name, , , group]) => ({
    id: code,
    name: `Grupo ${group} · ${name}`,
    numbers: ALL_NUMBERS.filter((x) => CATALOG[x].page === code),
  })),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function suggestedPrice(num: number): number {
  const r = CATALOG[num]?.rarity ?? "common";
  return r === "common" ? 200 : r === "rare" ? 500 : r === "shiny" ? 1000 : 1500;
}

export function rollSticker(): number {
  const r = Math.random();
  let acc = 0;
  let chosen: Rarity = "common";
  for (const k of ["legendary", "shiny", "rare", "common"] as Rarity[]) {
    acc += RARITY_META[k].odds;
    if (r <= acc) { chosen = k; break; }
  }
  const pool = ALL_NUMBERS.filter((x) => CATALOG[x].rarity === chosen);
  const fallback = pool.length ? pool : ALL_NUMBERS;
  return fallback[Math.floor(Math.random() * fallback.length)];
}
