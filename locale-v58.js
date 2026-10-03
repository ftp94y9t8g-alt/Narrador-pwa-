// Narrador v58 — automatic interface language from the user's iPhone/browser language.
// UI language is independent from the narration/book language.
(() => {
  const SUPPORTED = new Set(["es", "en", "fr", "pt", "it", "de"]);
  const SOURCE = "es";
  const $ = (s) => document.querySelector(s);

  function deviceLocale() {
    const raw = String(navigator.languages?.[0] || navigator.language || Intl.DateTimeFormat().resolvedOptions().locale || "en");
    const base = raw.toLowerCase().split(/[-_]/)[0];
    return { raw, base: SUPPORTED.has(base) ? base : "en" };
  }

  let locale = deviceLocale();
  let lang = locale.base;
  document.documentElement.lang = lang;
  document.documentElement.dataset.narradorLocale = lang;

  const P = {
    "Audiolibros inteligentes": {en:"Smart audiobooks",fr:"Livres audio intelligents",pt:"Audiolivros inteligentes",it:"Audiolibri intelligenti",de:"Intelligente Hörbücher"},
    "Tu próxima historia empieza aquí": {en:"Your next story starts here",fr:"Votre prochaine histoire commence ici",pt:"Sua próxima história começa aqui",it:"La tua prossima storia inizia qui",de:"Deine nächste Geschichte beginnt hier"},
    "Toca el + de arriba para importar tu primer PDF.": {en:"Tap the + above to import your first PDF.",fr:"Touchez le + ci-dessus pour importer votre premier PDF.",pt:"Toque no + acima para importar seu primeiro PDF.",it:"Tocca il + qui sopra per importare il tuo primo PDF.",de:"Tippe oben auf +, um deine erste PDF zu importieren."},
    "Recientes": {en:"Recent",fr:"Récents",pt:"Recentes",it:"Recenti",de:"Zuletzt"},
    "Ver biblioteca": {en:"View library",fr:"Voir la bibliothèque",pt:"Ver biblioteca",it:"Vedi libreria",de:"Bibliothek anzeigen"},
    "Mi colección": {en:"My collection",fr:"Ma collection",pt:"Minha coleção",it:"La mia raccolta",de:"Meine Sammlung"},
    "TU COLECCIÓN": {en:"YOUR COLLECTION",fr:"VOTRE COLLECTION",pt:"SUA COLEÇÃO",it:"LA TUA RACCOLTA",de:"DEINE SAMMLUNG"},
    "Mi biblioteca": {en:"My library",fr:"Ma bibliothèque",pt:"Minha biblioteca",it:"La mia libreria",de:"Meine Bibliothek"},
    "Todos tus libros, organizados en un solo lugar.": {en:"All your books, organized in one place.",fr:"Tous vos livres, organisés au même endroit.",pt:"Todos os seus livros, organizados em um só lugar.",it:"Tutti i tuoi libri, organizzati in un unico posto.",de:"Alle deine Bücher an einem Ort organisiert."},
    "Buscar por título o autor…": {en:"Search by title or author…",fr:"Rechercher par titre ou auteur…",pt:"Buscar por título ou autor…",it:"Cerca per titolo o autore…",de:"Nach Titel oder Autor suchen…"},
    "Todos": {en:"All",fr:"Tous",pt:"Todos",it:"Tutti",de:"Alle"},
    "En progreso": {en:"In progress",fr:"En cours",pt:"Em andamento",it:"In corso",de:"In Bearbeitung"},
    "Organizar": {en:"Organize",fr:"Organiser",pt:"Organizar",it:"Organizza",de:"Organisieren"},
    "Puedes ordenar tus libros manualmente.": {en:"You can arrange your books manually.",fr:"Vous pouvez trier vos livres manuellement.",pt:"Você pode organizar seus livros manualmente.",it:"Puoi ordinare i tuoi libri manualmente.",de:"Du kannst deine Bücher manuell anordnen."},
    "Mis libros": {en:"My books",fr:"Mes livres",pt:"Meus livros",it:"I miei libri",de:"Meine Bücher"},
    "Vaciar": {en:"Clear",fr:"Vider",pt:"Limpar",it:"Svuota",de:"Leeren"},
    "Aún no hay libros": {en:"No books yet",fr:"Aucun livre pour le moment",pt:"Ainda não há livros",it:"Nessun libro ancora",de:"Noch keine Bücher"},
    "Importa un PDF y Narrador lo organizará por capítulos.": {en:"Import a PDF and Narrador will organize it into chapters.",fr:"Importez un PDF et Narrador l’organisera en chapitres.",pt:"Importe um PDF e o Narrador irá organizá-lo em capítulos.",it:"Importa un PDF e Narrador lo organizzerà in capitoli.",de:"Importiere eine PDF und Narrador ordnet sie in Kapitel."},
    "Tu actividad": {en:"Your activity",fr:"Votre activité",pt:"Sua atividade",it:"La tua attività",de:"Deine Aktivität"},
    "RECIENTEMENTE ESCUCHADO": {en:"RECENTLY LISTENED",fr:"ÉCOUTÉ RÉCEMMENT",pt:"OUVIDO RECENTEMENTE",it:"ASCOLTATO DI RECENTE",de:"KÜRZLICH GEHÖRT"},
    "Historial": {en:"History",fr:"Historique",pt:"Histórico",it:"Cronologia",de:"Verlauf"},
    "Vuelve rápidamente al capítulo donde te quedaste.": {en:"Quickly return to the chapter where you left off.",fr:"Revenez rapidement au chapitre où vous vous êtes arrêté.",pt:"Volte rapidamente ao capítulo onde parou.",it:"Torna rapidamente al capitolo da cui hai interrotto.",de:"Kehre schnell zu dem Kapitel zurück, bei dem du aufgehört hast."},
    "Preferencias": {en:"Preferences",fr:"Préférences",pt:"Preferências",it:"Preferenze",de:"Einstellungen"},
    "PERSONALIZA TU EXPERIENCIA": {en:"PERSONALIZE YOUR EXPERIENCE",fr:"PERSONNALISEZ VOTRE EXPÉRIENCE",pt:"PERSONALIZE SUA EXPERIÊNCIA",it:"PERSONALIZZA LA TUA ESPERIENZA",de:"PERSONALISIERE DEIN ERLEBNIS"},
    "Ajustes": {en:"Settings",fr:"Réglages",pt:"Ajustes",it:"Impostazioni",de:"Einstellungen"},
    "Narración": {en:"Narration",fr:"Narration",pt:"Narração",it:"Narrazione",de:"Erzählung"},
    "Motor predeterminado": {en:"Default voice engine",fr:"Moteur vocal par défaut",pt:"Mecanismo de voz padrão",it:"Motore vocale predefinito",de:"Standard-Sprachengine"},
    "Elige lectura instantánea o IA": {en:"Choose instant reading or AI",fr:"Choisissez la lecture instantanée ou l’IA",pt:"Escolha leitura instantânea ou IA",it:"Scegli lettura istantanea o IA",de:"Sofortige Wiedergabe oder KI wählen"},
    "Idioma": {en:"Language",fr:"Langue",pt:"Idioma",it:"Lingua",de:"Sprache"},
    "Detección automática o idioma fijo": {en:"Automatic detection or fixed language",fr:"Détection automatique ou langue fixe",pt:"Detecção automática ou idioma fixo",it:"Rilevamento automatico o lingua fissa",de:"Automatische Erkennung oder feste Sprache"},
    "Automático": {en:"Automatic",fr:"Automatique",pt:"Automático",it:"Automatico",de:"Automatisch"},
    "Español": {en:"Spanish",fr:"Espagnol",pt:"Espanhol",it:"Spagnolo",de:"Spanisch"},
    "Estilo de lectura": {en:"Reading style",fr:"Style de lecture",pt:"Estilo de leitura",it:"Stile di lettura",de:"Lesestil"},
    "Tono predeterminado": {en:"Default tone",fr:"Ton par défaut",pt:"Tom padrão",it:"Tono predefinito",de:"Standardton"},
    "Cálida": {en:"Warm",fr:"Chaleureux",pt:"Acolhedor",it:"Caldo",de:"Warm"},
    "Cinematográfica": {en:"Cinematic",fr:"Cinématographique",pt:"Cinematográfico",it:"Cinematografico",de:"Filmisch"},
    "Expresiva": {en:"Expressive",fr:"Expressif",pt:"Expressivo",it:"Espressivo",de:"Ausdrucksstark"},
    "Calmada": {en:"Calm",fr:"Calme",pt:"Calmo",it:"Calmo",de:"Ruhig"},
    "Velocidad": {en:"Speed",fr:"Vitesse",pt:"Velocidade",it:"Velocità",de:"Geschwindigkeit"},
    "Ritmo predeterminado": {en:"Default pace",fr:"Rythme par défaut",pt:"Ritmo padrão",it:"Ritmo predefinito",de:"Standardtempo"},
    "Aplicación": {en:"App",fr:"Application",pt:"Aplicativo",it:"App",de:"App"},
    "Notificaciones": {en:"Notifications",fr:"Notifications",pt:"Notificações",it:"Notifiche",de:"Mitteilungen"},
    "Toca para permitir avisos": {en:"Tap to allow alerts",fr:"Touchez pour autoriser les alertes",pt:"Toque para permitir avisos",it:"Tocca per consentire gli avvisi",de:"Tippen, um Mitteilungen zu erlauben"},
    "Almacenamiento offline": {en:"Offline storage",fr:"Stockage hors ligne",pt:"Armazenamento offline",it:"Archiviazione offline",de:"Offline-Speicher"},
    "Calculando espacio…": {en:"Calculating storage…",fr:"Calcul de l’espace…",pt:"Calculando espaço…",it:"Calcolo dello spazio…",de:"Speicher wird berechnet…"},
    "Acerca de Narrador": {en:"About Narrador",fr:"À propos de Narrador",pt:"Sobre o Narrador",it:"Informazioni su Narrador",de:"Über Narrador"},
    "Convierte PDFs en experiencias de audio y lectura": {en:"Turns PDFs into audio and reading experiences",fr:"Transforme les PDF en expériences audio et de lecture",pt:"Transforma PDFs em experiências de áudio e leitura",it:"Trasforma i PDF in esperienze audio e di lettura",de:"Verwandelt PDFs in Audio- und Leseerlebnisse"},
    "Biblioteca": {en:"Library",fr:"Bibliothèque",pt:"Biblioteca",it:"Libreria",de:"Bibliothek"},
    "Inicio": {en:"Home",fr:"Accueil",pt:"Início",it:"Home",de:"Start"},
    "PREPARANDO TU LIBRO": {en:"PREPARING YOUR BOOK",fr:"PRÉPARATION DE VOTRE LIVRE",pt:"PREPARANDO SEU LIVRO",it:"PREPARAZIONE DEL LIBRO",de:"DEIN BUCH WIRD VORBEREITET"},
    "Analizando el libro…": {en:"Analyzing the book…",fr:"Analyse du livre…",pt:"Analisando o livro…",it:"Analisi del libro…",de:"Buch wird analysiert…"},
    "Abriendo el PDF.": {en:"Opening the PDF.",fr:"Ouverture du PDF.",pt:"Abrindo o PDF.",it:"Apertura del PDF.",de:"PDF wird geöffnet."},
    "Combinando índice, estructura y formato del PDF.": {en:"Combining table of contents, structure, and PDF formatting.",fr:"Combinaison de l’index, de la structure et du format du PDF.",pt:"Combinando índice, estrutura e formatação do PDF.",it:"Combinazione di indice, struttura e formato PDF.",de:"Inhaltsverzeichnis, Struktur und PDF-Format werden kombiniert."},
    "LIBRO": {en:"BOOK",fr:"LIVRE",pt:"LIVRO",it:"LIBRO",de:"BUCH"},
    "Libro": {en:"Book",fr:"Livre",pt:"Livro",it:"Libro",de:"Buch"},
    "Autor no especificado": {en:"Author not specified",fr:"Auteur non spécifié",pt:"Autor não especificado",it:"Autore non specificato",de:"Autor nicht angegeben"},
    "Cambiar portada": {en:"Change cover",fr:"Changer la couverture",pt:"Alterar capa",it:"Cambia copertina",de:"Cover ändern"},
    "Abrir para leer": {en:"Open to read",fr:"Ouvrir pour lire",pt:"Abrir para ler",it:"Apri per leggere",de:"Zum Lesen öffnen"},
    "NARRACIÓN": {en:"NARRATION",fr:"NARRATION",pt:"NARRAÇÃO",it:"NARRAZIONE",de:"ERZÄHLUNG"},
    "Elige cómo quieres escucharlo": {en:"Choose how you want to listen",fr:"Choisissez comment vous souhaitez l’écouter",pt:"Escolha como quer ouvir",it:"Scegli come vuoi ascoltarlo",de:"Wähle, wie du es hören möchtest"},
    "La voz y el progreso se guardan en este dispositivo.": {en:"Voice and progress are saved on this device.",fr:"La voix et la progression sont enregistrées sur cet appareil.",pt:"A voz e o progresso são salvos neste dispositivo.",it:"Voce e avanzamento vengono salvati su questo dispositivo.",de:"Stimme und Fortschritt werden auf diesem Gerät gespeichert."},
    "Motor de voz": {en:"Voice engine",fr:"Moteur vocal",pt:"Mecanismo de voz",it:"Motore vocale",de:"Sprachengine"},
    "iPhone · instantáneo": {en:"iPhone · instant",fr:"iPhone · instantané",pt:"iPhone · instantâneo",it:"iPhone · istantaneo",de:"iPhone · sofort"},
    "IA · más natural": {en:"AI · more natural",fr:"IA · plus naturelle",pt:"IA · mais natural",it:"IA · più naturale",de:"KI · natürlicher"},
    "Voz": {en:"Voice",fr:"Voix",pt:"Voz",it:"Voce",de:"Stimme"},
    "Narración con IA": {en:"AI narration",fr:"Narration IA",pt:"Narração com IA",it:"Narrazione IA",de:"KI-Erzählung"},
    "Estilo": {en:"Style",fr:"Style",pt:"Estilo",it:"Stile",de:"Stil"},
    "Escuchar muestra": {en:"Play sample",fr:"Écouter un extrait",pt:"Ouvir amostra",it:"Ascolta esempio",de:"Hörprobe"},
    "Capítulos": {en:"Chapters",fr:"Chapitres",pt:"Capítulos",it:"Capitoli",de:"Kapitel"},
    "Volver": {en:"Back",fr:"Retour",pt:"Voltar",it:"Indietro",de:"Zurück"},
    "Narrador está leyendo para ti": {en:"Narrador is reading for you",fr:"Narrador lit pour vous",pt:"Narrador está lendo para você",it:"Narrador sta leggendo per te",de:"Narrador liest für dich"},
    "Elegir voz": {en:"Choose voice",fr:"Choisir la voix",pt:"Escolher voz",it:"Scegli voce",de:"Stimme wählen"},
    "salto rápido": {en:"quick skip",fr:"saut rapide",pt:"salto rápido",it:"salto rapido",de:"Schnellsprung"},
    "Marcador": {en:"Bookmark",fr:"Signet",pt:"Marcador",it:"Segnalibro",de:"Lesezeichen"},
    "Marcadores": {en:"Bookmarks",fr:"Signets",pt:"Marcadores",it:"Segnalibri",de:"Lesezeichen"},
    "Dormir": {en:"Sleep",fr:"Sommeil",pt:"Dormir",it:"Timer",de:"Schlafen"},
    "Temporizador": {en:"Sleep timer",fr:"Minuteur de sommeil",pt:"Temporizador",it:"Timer di spegnimento",de:"Schlaftimer"},
    "Al terminar este capítulo": {en:"At the end of this chapter",fr:"À la fin de ce chapitre",pt:"Ao terminar este capítulo",it:"Alla fine di questo capitolo",de:"Am Ende dieses Kapitels"},
    "Cancelar temporizador": {en:"Cancel timer",fr:"Annuler le minuteur",pt:"Cancelar temporizador",it:"Annulla timer",de:"Timer abbrechen"},
    "Capítulo actual": {en:"Current chapter",fr:"Chapitre actuel",pt:"Capítulo atual",it:"Capitolo attuale",de:"Aktuelles Kapitel"},
    "Ir a este capítulo": {en:"Go to this chapter",fr:"Aller à ce chapitre",pt:"Ir para este capítulo",it:"Vai a questo capitolo",de:"Zu diesem Kapitel"},
    "Todavía no tienes marcadores en este libro.": {en:"You don’t have any bookmarks in this book yet.",fr:"Vous n’avez pas encore de signets dans ce livre.",pt:"Você ainda não tem marcadores neste livro.",it:"Non hai ancora segnalibri in questo libro.",de:"Du hast in diesem Buch noch keine Lesezeichen."},
    "Cuenta": {en:"Account",fr:"Compte",pt:"Conta",it:"Account",de:"Konto"},
    "Perfil local beta": {en:"Local profile beta",fr:"Profil local bêta",pt:"Perfil local beta",it:"Profilo locale beta",de:"Lokales Profil Beta"},
    "Cerrar sesión": {en:"Sign out",fr:"Se déconnecter",pt:"Sair",it:"Esci",de:"Abmelden"},
    "Tu biblioteca. Tu perfil.": {en:"Your library. Your profile.",fr:"Votre bibliothèque. Votre profil.",pt:"Sua biblioteca. Seu perfil.",it:"La tua libreria. Il tuo profilo.",de:"Deine Bibliothek. Dein Profil."},
    "Iniciar sesión": {en:"Sign in",fr:"Se connecter",pt:"Entrar",it:"Accedi",de:"Anmelden"},
    "Crear cuenta": {en:"Create account",fr:"Créer un compte",pt:"Criar conta",it:"Crea account",de:"Konto erstellen"},
    "Usuario": {en:"Username",fr:"Nom d’utilisateur",pt:"Usuário",it:"Nome utente",de:"Benutzername"},
    "Contraseña": {en:"Password",fr:"Mot de passe",pt:"Senha",it:"Password",de:"Passwort"},
    "Entrar a Narrador": {en:"Sign in to Narrador",fr:"Se connecter à Narrador",pt:"Entrar no Narrador",it:"Accedi a Narrador",de:"Bei Narrador anmelden"},
    "Nombre": {en:"Name",fr:"Nom",pt:"Nome",it:"Nome",de:"Name"},
    "Tu nombre": {en:"Your name",fr:"Votre nom",pt:"Seu nome",it:"Il tuo nome",de:"Dein Name"},
    "Mínimo 6 caracteres": {en:"At least 6 characters",fr:"6 caractères minimum",pt:"Mínimo de 6 caracteres",it:"Minimo 6 caratteri",de:"Mindestens 6 Zeichen"},
    "Confirmar contraseña": {en:"Confirm password",fr:"Confirmer le mot de passe",pt:"Confirmar senha",it:"Conferma password",de:"Passwort bestätigen"},
    "Repite la contraseña": {en:"Repeat the password",fr:"Répétez le mot de passe",pt:"Repita a senha",it:"Ripeti la password",de:"Passwort wiederholen"},
    "Crear mi cuenta": {en:"Create my account",fr:"Créer mon compte",pt:"Criar minha conta",it:"Crea il mio account",de:"Mein Konto erstellen"},
    "Beta de perfiles: la cuenta y sus libros se guardan de forma privada en este dispositivo. La sincronización entre dispositivos llegará con la nube.": {en:"Profile beta: your account and books are stored privately on this device. Cross-device sync will arrive with cloud accounts.",fr:"Bêta des profils : votre compte et vos livres sont stockés en privé sur cet appareil. La synchronisation entre appareils arrivera avec le cloud.",pt:"Beta de perfis: sua conta e seus livros ficam armazenados de forma privada neste dispositivo. A sincronização entre dispositivos chegará com a nuvem.",it:"Beta profili: account e libri sono archiviati privatamente su questo dispositivo. La sincronizzazione tra dispositivi arriverà con il cloud.",de:"Profil-Beta: Konto und Bücher werden privat auf diesem Gerät gespeichert. Geräteübergreifende Synchronisierung folgt mit der Cloud."},
    "Entrando…": {en:"Signing in…",fr:"Connexion…",pt:"Entrando…",it:"Accesso…",de:"Anmeldung…"},
    "Creando perfil…": {en:"Creating profile…",fr:"Création du profil…",pt:"Criando perfil…",it:"Creazione profilo…",de:"Profil wird erstellt…"},
    "Cuenta creada. Abriendo Narrador…": {en:"Account created. Opening Narrador…",fr:"Compte créé. Ouverture de Narrador…",pt:"Conta criada. Abrindo o Narrador…",it:"Account creato. Apertura di Narrador…",de:"Konto erstellt. Narrador wird geöffnet…"},
    "Listo. Abriendo tu biblioteca…": {en:"Ready. Opening your library…",fr:"Prêt. Ouverture de votre bibliothèque…",pt:"Pronto. Abrindo sua biblioteca…",it:"Fatto. Apertura della tua libreria…",de:"Fertig. Deine Bibliothek wird geöffnet…"},
    "Preparando tu biblioteca…": {en:"Preparing your library…",fr:"Préparation de votre bibliothèque…",pt:"Preparando sua biblioteca…",it:"Preparazione della libreria…",de:"Deine Bibliothek wird vorbereitet…"},
    "Cargando voces del iPhone…": {en:"Loading iPhone voices…",fr:"Chargement des voix iPhone…",pt:"Carregando vozes do iPhone…",it:"Caricamento voci iPhone…",de:"iPhone-Stimmen werden geladen…"},
    "Terminando de preparar Narrador…": {en:"Finishing Narrador setup…",fr:"Finalisation de Narrador…",pt:"Finalizando a preparação do Narrador…",it:"Completamento della preparazione di Narrador…",de:"Narrador wird fertig vorbereitet…"},
    "Listo": {en:"Ready",fr:"Prêt",pt:"Pronto",it:"Pronto",de:"Bereit"},
    "Audiolibros inteligentes": {en:"Smart audiobooks",fr:"Livres audio intelligents",pt:"Audiolivros inteligentes",it:"Audiolibri intelligenti",de:"Intelligente Hörbücher"},
    "Audiolibro IA": {en:"AI audiobook",fr:"Livre audio IA",pt:"Audiolivro IA",it:"Audiolibro IA",de:"KI-Hörbuch"},
    "Crear audiolibro con IA": {en:"Create AI audiobook",fr:"Créer un livre audio IA",pt:"Criar audiolivro com IA",it:"Crea audiolibro IA",de:"KI-Hörbuch erstellen"},
    "Preparando tu audiolibro": {en:"Preparing your audiobook",fr:"Préparation de votre livre audio",pt:"Preparando seu audiolivro",it:"Preparazione dell’audiolibro",de:"Dein Hörbuch wird vorbereitet"},
    "Tu audiolibro está listo": {en:"Your audiobook is ready",fr:"Votre livre audio est prêt",pt:"Seu audiolivro está pronto",it:"Il tuo audiolibro è pronto",de:"Dein Hörbuch ist bereit"},
    "Reproducir audiolibro": {en:"Play audiobook",fr:"Lire le livre audio",pt:"Reproduzir audiolivro",it:"Riproduci audiolibro",de:"Hörbuch abspielen"},
    "Continuar audiolibro": {en:"Continue audiobook",fr:"Continuer le livre audio",pt:"Continuar audiolivro",it:"Continua audiolibro",de:"Hörbuch fortsetzen"},
    "Continuar generación": {en:"Continue generation",fr:"Continuer la génération",pt:"Continuar geração",it:"Continua generazione",de:"Generierung fortsetzen"},
    "Generando…": {en:"Generating…",fr:"Génération…",pt:"Gerando…",it:"Generazione…",de:"Wird generiert…"},
    "Centro de audiolibros IA": {en:"AI audiobook center",fr:"Centre des livres audio IA",pt:"Central de audiolivros IA",it:"Centro audiolibri IA",de:"KI-Hörbuch-Center"},
    "Almacenamiento": {en:"Storage",fr:"Stockage",pt:"Armazenamento",it:"Archiviazione",de:"Speicher"},
    "Borrar audio IA": {en:"Delete AI audio",fr:"Supprimer l’audio IA",pt:"Excluir áudio de IA",it:"Elimina audio IA",de:"KI-Audio löschen"},
    "Borrar todos los audios IA": {en:"Delete all AI audio",fr:"Supprimer tous les audios IA",pt:"Excluir todos os áudios de IA",it:"Elimina tutti gli audio IA",de:"Alle KI-Audios löschen"},
    "Disponible sin conexión": {en:"Available offline",fr:"Disponible hors ligne",pt:"Disponível offline",it:"Disponibile offline",de:"Offline verfügbar"},
    "Revisa tu libro": {en:"Review your book",fr:"Vérifiez votre livre",pt:"Revise seu livro",it:"Controlla il libro",de:"Buch prüfen"},
    "Título": {en:"Title",fr:"Titre",pt:"Título",it:"Titolo",de:"Titel"},
    "Autor": {en:"Author",fr:"Auteur",pt:"Autor",it:"Autore",de:"Autor"},
    "Añadir a mi biblioteca": {en:"Add to my library",fr:"Ajouter à ma bibliothèque",pt:"Adicionar à minha biblioteca",it:"Aggiungi alla mia libreria",de:"Zu meiner Bibliothek hinzufügen"},
    "Cancelar": {en:"Cancel",fr:"Annuler",pt:"Cancelar",it:"Annulla",de:"Abbrechen"}
  };

  const LANG_NAMES = {
    es:{es:"Español",en:"Spanish",fr:"Espagnol",pt:"Espanhol",it:"Spagnolo",de:"Spanisch"},
    en:{es:"Inglés",en:"English",fr:"Anglais",pt:"Inglês",it:"Inglese",de:"Englisch"},
    fr:{es:"Francés",en:"French",fr:"Français",pt:"Francês",it:"Francese",de:"Französisch"},
    pt:{es:"Portugués",en:"Portuguese",fr:"Portugais",pt:"Português",it:"Portoghese",de:"Portugiesisch"},
    it:{es:"Italiano",en:"Italian",fr:"Italien",pt:"Italiano",it:"Italiano",de:"Italienisch"},
    de:{es:"Alemán",en:"German",fr:"Allemand",pt:"Alemão",it:"Tedesco",de:"Deutsch"}
  };

  function t(source) {
    if (lang === SOURCE) return source;
    return P[source]?.[lang] || source;
  }

  function trDynamic(value) {
    const s = String(value || "");
    if (!s.trim() || lang === SOURCE) return s;
    const direct = P[s]?.[lang];
    if (direct) return direct;

    let m;
    if ((m = s.match(/^Autor no especificado\s*·\s*(.+)$/))) return `${t("Autor no especificado")} · ${m[1]}`;
    if ((m = s.match(/^Capítulo\s+(\d+)\s+de\s+(\d+)$/i))) {
      const pre = {en:"Chapter",fr:"Chapitre",pt:"Capítulo",it:"Capitolo",de:"Kapitel"}[lang];
      const of = {en:"of",fr:"sur",pt:"de",it:"di",de:"von"}[lang];
      return `${pre} ${m[1]} ${of} ${m[2]}`;
    }
    if ((m = s.match(/^Capítulo\s+(\d+)$/i))) return `${{en:"Chapter",fr:"Chapitre",pt:"Capítulo",it:"Capitolo",de:"Kapitel"}[lang]} ${m[1]}`;
    if ((m = s.match(/^(\d+)\s+páginas\s*·\s*(\d+)\s+capítulos$/i))) {
      const pages={en:"pages",fr:"pages",pt:"páginas",it:"pagine",de:"Seiten"}[lang], chapters={en:"chapters",fr:"chapitres",pt:"capítulos",it:"capitoli",de:"Kapitel"}[lang];
      return `${m[1]} ${pages} · ${m[2]} ${chapters}`;
    }
    if ((m = s.match(/^(\d+)\s+capítulos$/i))) return `${m[1]} ${{en:"chapters",fr:"chapitres",pt:"capítulos",it:"capitoli",de:"Kapitel"}[lang]}`;
    if ((m = s.match(/^Listo\s*·\s*(\d+)\s+capítulos detectados\.?$/i))) {
      const detected={en:"chapters detected",fr:"chapitres détectés",pt:"capítulos detectados",it:"capitoli rilevati",de:"Kapitel erkannt"}[lang];
      return `${t("Listo")} · ${m[1]} ${detected}`;
    }
    if ((m = s.match(/^Leyendo página\s+(\d+)\s+de\s+(\d+)$/i))) {
      return {en:`Reading page ${m[1]} of ${m[2]}`,fr:`Lecture de la page ${m[1]} sur ${m[2]}`,pt:`Lendo página ${m[1]} de ${m[2]}`,it:`Lettura pagina ${m[1]} di ${m[2]}`,de:`Seite ${m[1]} von ${m[2]} wird gelesen`}[lang];
    }
    if ((m = s.match(/^Hola,\s*(.+)$/))) return `${{en:"Hi",fr:"Bonjour",pt:"Olá",it:"Ciao",de:"Hallo"}[lang]}, ${m[1]}`;
    if ((m = s.match(/^Guardado\s+(.+)$/))) return `${{en:"Saved",fr:"Enregistré",pt:"Salvo",it:"Salvato",de:"Gespeichert"}[lang]} ${m[1]}`;
    if ((m = s.match(/^Preparando\s*·\s*(\d+)%$/i))) return `${{en:"Preparing",fr:"Préparation",pt:"Preparando",it:"Preparazione",de:"Vorbereitung"}[lang]} · ${m[1]}%`;
    if ((m = s.match(/^Generando\s+(\d+)%$/i))) return `${{en:"Generating",fr:"Génération",pt:"Gerando",it:"Generazione",de:"Generierung"}[lang]} ${m[1]}%`;
    if ((m = s.match(/^Tu audiolibro “(.+)” está listo\.?$/))) return `${t("Tu audiolibro está listo")}: “${m[1]}”.`;
    return s;
  }

  const SKIP = "#readerContent,#currentText,#bookTitle,#playerBook,#playerChapter,.v18PlayerTitle,.homeBookTitle,.bookRow h4,.historyMeta h4,.chapterRow h4,.daily56Item strong,.import56TitleValue";

  function translateNode(node) {
    if (!node || lang === SOURCE) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return;
      const original = node.nodeValue;
      const leading = original.match(/^\s*/)?.[0] || "";
      const trailing = original.match(/\s*$/)?.[0] || "";
      const core = original.trim();
      if (!core) return;
      const next = trDynamic(core);
      if (next !== core) node.nodeValue = leading + next + trailing;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (!el.closest(SKIP)) {
      for (const attr of ["placeholder", "aria-label", "title"]) {
        if (!el.hasAttribute(attr)) continue;
        const v = el.getAttribute(attr);
        const next = trDynamic(v);
        if (next !== v) el.setAttribute(attr, next);
      }
    }
    for (const child of [...el.childNodes]) translateNode(child);
  }

  function localeLabel() {
    return LANG_NAMES[lang]?.[lang] || locale.raw;
  }

  function installSettingsRow() {
    const settings = $("#settingsView");
    if (!settings || $("#narradorLocaleRow58")) return;
    const groups = [...settings.querySelectorAll(".settingGroupLabel")];
    const appLabel = groups.find(x => /^(Aplicación|App|Application|Aplicativo)$/i.test(x.textContent.trim()));
    const stack = appLabel?.nextElementSibling;
    if (!stack?.classList?.contains("settingsStack")) return;
    const row = document.createElement("div");
    row.id = "narradorLocaleRow58";
    row.className = "settingRow";
    const labels = {
      es:["Idioma de la app","Sigue automáticamente el idioma del iPhone","Automático"],
      en:["App language","Automatically follows your iPhone language","Automatic"],
      fr:["Langue de l’app","Suit automatiquement la langue de votre iPhone","Automatique"],
      pt:["Idioma do app","Segue automaticamente o idioma do iPhone","Automático"],
      it:["Lingua dell’app","Segue automaticamente la lingua dell’iPhone","Automatico"],
      de:["App-Sprache","Folgt automatisch der Sprache deines iPhones","Automatisch"]
    }[lang];
    row.innerHTML = `<div class="settingIcon">文</div><div class="settingText"><strong>${labels[0]}</strong><span>${labels[1]}</span></div><div class="settingAction" style="font-size:12px;font-weight:850;text-align:right;max-width:110px">${labels[2]} · ${localeLabel()}</div>`;
    stack.insertBefore(row, stack.firstChild);
  }

  let scheduled = false;
  function translateAll() {
    scheduled = false;
    if (lang !== SOURCE) translateNode(document.body);
    installSettingsRow();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(translateAll);
  }

  function init() {
    translateAll();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["placeholder","aria-label","title"] });
    window.addEventListener("pageshow", schedule);
    window.addEventListener("narrador:user-ready", schedule);
    window.addEventListener("narrador:boot-ready", schedule);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  }

  window.addEventListener("languagechange", () => {
    const next = deviceLocale();
    if (next.base !== lang) location.reload();
  });

  window.__narradorLocale58 = {
    language: lang,
    deviceLanguage: locale.raw,
    supported: [...SUPPORTED],
    translate: t,
    refresh: schedule,
  };
  window.dispatchEvent(new CustomEvent("narrador:locale-ready", { detail: window.__narradorLocale58 }));

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
