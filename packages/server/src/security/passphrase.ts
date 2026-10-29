import { randomInt } from "node:crypto";

/** Common French words, lowercase, without accents, of four to eight letters. */
const words = `
  abeille abri abricot absolu accent accord achat acier acrobate actif action adage adresse adulte affaire
  agenda agile agneau aider aigle aiguille aile aimable aimant ajonc alarme album alerte algue allee allure
  alpage alpin altitude amande amateur ambre amical amiral amitie ampoule amusant ananas ancien ancrage ancre
  angle animal anis anneau annonce anorak antenne antilope appel appui aquarium arbitre arbre arcade arche
  argent argile arome arpent arrivee artiste asile asperge assiette astre atelier atlas atome atout attelage
  aube auberge audace augure aurore auteur autobus automne autruche aveline avenir aventure avenue averse avion
  avocat avoine avril azalee azur bagage bague baguette baie bain baiser balade balai balance balcon baleine
  balise ballon bambin bambou banane banc bande banjo banque baobab barbe barbu baril barque barrage baryton
  basalte bassin bateau baton bavard bazar beffroi beignet belette belier benitier berceau berger betail beton
  beurre biche bijou billard billet biscuit bison bivouac blague blanc blason bleuet blizzard bobine bocage
  bocal boisson boite bolet bolide bonbon bonheur bonnet bonsai bordeaux bordure bosquet botte bouchon boucle
  boudin bougie bouleau bouquet bourdon bourgeon boussole bouton boxeur bracelet braise branche brebis brigade
  brioche brique brise brocante brochet bronze brosse brouette bruine brume bruyere buffet buisson bulle bureau
  burin buvard cabane cabinet cable cacao cactus cadeau cadet cadran cadre cahier caille caillou caisse calcul
  calecon calepin calice calme camarade camelia camion campagne canal canard canif canne canoe canon canot
  cantine canyon caporal capsule capuche carafe caramel caravane cardinal caresse carillon carnet carotte carpe
  carreau carrosse cartable carte carton cascade casque castor cavalier caverne cedre ceinture cellule cerceau
  cerf cerfeuil cerise cerveau chaise chalet chaleur chambre chameau chamois champ chandail chanson chanvre
  chapeau chapelle charbon chariot charrue chasse chateau chaton chaud chausson chemin chemise chenal chene
  chenille cheval cheveu chevre chiffre chimie chiot chocolat chorale chou chouette ciboule cidre cigale cinema
  cirque citron civet civette clairon clapier clarte classe clavier clef climat cloche clocher clou clown cobalt
  cochon cocotier coffre collier colline colombe colonne comete commode compas comptine comptoir concert condor
  conifere conte copain copeau coquille corail corbeau cordon corne corsaire cortege costume coteau coton coucou
  coude couleur coulis coupole courage courbe couronne courrier cousin coussin couteau crabe crapaud cratere
  crayon credit creme crepe cresson crevette criquet cristal crochet croquis cuillere cuisine cuivre culture
  curieux cyclone cygne dahlia dallage dalle damier danse danseur dauphin debarras debut decembre decor dedale
  defi degre delice delta dentelle dentiste depart depot desert dessert dessin dessous detail detour devoir
  diamant dictee digue dimanche dindon diner disque divan docile domaine domicile domino donjon dormeur dortoir
  dossier douane doublure douceur douche dragee dragon drapeau dresseur droite druide dune durable duvet ebene
  eclair ecluse ecole ecorce ecran ecrin ecuelle ecume ecureuil edredon effort eglise egout elan elephant elite
  elixir embarras emeraude empire encens enclume encre energie enfant engin enigme entrepot envol epargne epaule
  eperon epice epinard epopee epoque equipe erable ermite escalier escargot escrime espace espoir essai estime
  estuaire etable etage etang etoile etrier etude eventail evier exemple exil fable facade facteur faisan
  falaise famille fanfare farine faucon fauteuil fauve favori fenetre fenouil ferme fermier festin feuille
  feutre fiacre ficelle fifre figue filature filet flamant flambeau flanc fleur fleuret fleuve flocon flute
  foire folie fontaine foret forge fortune fougere foulard fourmi fourneau fragment fraise frein frelon frisson
  fromage fronton fruit fuchsia fumee fusain fuseau fusee galerie galet galop gamelle gamin garage gardien
  garenne gateau gaufre gavotte gazelle gazon geant gelee gendarme genie gentiane gerbe gibier girafe givre
  glace glaive gland globe glycine gobelet goeland golfe gomme gondole gorille gouache gourde goutte graine
  grange granit grappe gravure grelot grenade grenier griffon grillage grillon grotte groupe guepe guidon
  guimauve guitare gymnase habit hache hamac hameau hamster haricot harpe hasard hautbois havre herbe hermine
  heron hetre hibou histoire hiver homard horizon horloge hotel houblon houle hublot huile humeur humour hutte
  icone idee igloo image impact indice infusion insecte instant intrigue iris isard ivoire jachere jacinthe
  jaguar jambon jardin jarret jasmin jeton jeudi jockey jongleur journal joyeux judo juillet jument jungle jupon
  justice kayak kermesse kiosque kiwi koala lagune laine laitue lampe lancier lanterne lapin larme laurier
  lavande lavoir layette lecteur legume lentille lessive lettre levure lezard liberte licorne lierre lilas
  limace limier limonade linge linotte lion liquide lisiere litiere litre livre loge logis loisir loriot losange
  lotus loupe loutre lucarne luciole lumiere lundi lustre lutin luxe lynx macareux macaron madame magasin magie
  magnolia maillon maillot maison major malice malle mammouth manche manege mangue manoir manteau marais marbre
  marche mardi marelle margelle mariage marin marmite marmotte marron mars marteau mascotte masque massif
  matelas matelot matin mauve meandre medaille melisse melodie melon membre menthe menu mercredi merle mesange
  mesure metal meteore meuble meunier miel miette mimosa minaret minuit miroir mitaine modele moineau moisson
  molette moment monde montagne montre moquette morille mortaise mortier mosaique moteur motif mouette moulin
  mousse mouton muguet mulet muraille murier muscade musique myrtille mystere nacelle nageur nappe napperon
  narcisse nature navet navire nectar neige nenuphar niveau noisette noix nomade nombre nougat novembre nuage
  nuit numero oasis objet ocean ocelot octave octobre odeur oeillet offre oiseau olive ombre omelette onde ongle
  onyx opale opera orage orange orchidee ordre oreille orfevre orge orgue origami origan orme ortie otarie
  ouragan ourson outil ouvrage ovale pagaie pagode paille pain palais palette palmier palourde pampa panache
  panda panier panneau panorama papier papillon papyrus paquet parade parc parfum parole parquet partage passage
  passion pastel pastille patience patin pavot paysage peche pecheur peigne pelerin pelle pelouse pendule
  penseur pepin peplum percale perche perdrix perle persil peuplier phalene phare phoque piano pierre pigeon
  pilier pilote piment pinceau pinede pingouin pinson pioche piolet pirate piscine pistache piste pivoine
  placard plafond plage plaine planche planete platane plateau pleiade plongeur plume poche poeme poirier
  poisson poivre poivron polaire police pollen pommade pomme pompier poney pont portail portrait poteau poterie
  potiron poucet poulain poupee poutre prairie premier prince prune prunelle puits pupitre puzzle pyjama
  pyramide quai quartier quatuor question quiche quille quinoa rabot racine raclette radeau radis rafale raisin
  rameau rampe ramure rangee rapace rapiere raquette rasoir rateau ravin rayon recif recolte recueil refuge
  regard regate reglage reine relais remise remorque rempart renard repaire repas requin reseau resine retable
  reve ricochet rigole riviere robot rocher roitelet roman romarin ronce rondin rosace roseau rosier rouage
  rouleau roulotte route royaume ruban rucher ruelle ruisseau rythme sable sablier sabot sacoche safran saison
  salade salon samedi sandale saphir sapin sarcelle sardine satin sauge saule saumon savane savon scarabee
  sceptre secret seigle semaine semoule sentier serein seringue serpent sextant sifflet signal silence silex
  singe sirene sirop soleil solstice sommet sonate sonnette sorbet soucoupe sourire souris spatule sphinx statue
  studio stylo sucre sucrier sultane sureau surprise symbole tableau tablier tabouret talent tamaris tambour
  tamis tanche tanniere tapis tarte tasse taupe taureau taxi teinture tempete temple tenue terrasse terrier
  terrine tetard theatre thym tiare tigre tilleul timbre tirelire tiroir tisane tissage titre toboggan toison
  tomate tonneau tonnelle topaze torche torrent tortue toucan toupie tourbe tourelle tourteau tracteur traineau
  tramway trapeze trefle treille tresor treteau triangle tribu tricot tronc tropique trottoir truffe truite
  tulipe tunnel turban tuyau ukulele uniforme univers usine utile vacances vague vaillant valet valise vallon
  vanille vannerie vapeur varech velin velours vendange venin ventail veranda verger vernis verrou verveine
  vestige veston viaduc victoire vigie vigne village violon vipere virgule visage vitrail vitrine voilier volcan
  voliere voyage wagon yaourt yoga zebre zeste zinc zodiaque
`
  .trim()
  .split(/\s+/);

export const passphraseWordCount = 5;

export function passphraseWords(): readonly string[] {
  return words;
}

// @implements-requirement HALL-FR-USR-010
/** Five words drawn with a cryptographic generator and joined by hyphens: at least 50 bits, always over 12 characters. */
export function generatePassphrase(): string {
  return Array.from({ length: passphraseWordCount }, () => words[randomInt(words.length)]!).join("-");
}
