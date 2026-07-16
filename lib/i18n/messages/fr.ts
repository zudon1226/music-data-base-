import type { LocaleMessageDictionary } from "./en";

export const frMessages: LocaleMessageDictionary = {
    common: {
        appName: "Music Data Base",
        save: "Enregistrer",
        cancel: "Annuler",
        close: "Fermer",
        delete: "Supprimer",
        edit: "Modifier",
        search: "Rechercher",
        filter: "Filtrer",
        sort: "Trier",
        loading: "Chargement...",
        working: "Traitement...",
        refresh: "Actualiser",
        upload: "Téléverser",
        logout: "Déconnexion",
        profile: "Profil",
        settings: "Paramètres",
        notifications: "Alertes",
        yes: "Oui",
        no: "Non",
        back: "Retour",
        next: "Suivant",
        submit: "Envoyer",
        retry: "Réessayer",
        clear: "Effacer",
        viewAll: "Tout voir",
        noResults: "Aucun résultat trouvé",
        language: "Langue",
        languageChanged: "Langue changée en {language}"
    },
    nav: {
        home: "Accueil",
        marketplace: "Place de marché",
        sales: "Ventes",
        licenseHistory: "Historique des licences",
        trending: "Tendances",
        beats: "Beats",
        artists: "Artistes",
        videos: "Vidéos",
        library: "Bibliothèque",
        liked: "Aimés",
        following: "Abonnements",
        recentlyPlayed: "Écoutés récemment",
        queue: "File d'attente",
        playlists: "Listes de lecture",
        profile: "Profil",
        artistDashboard: "Tableau de bord artiste",
        producerDashboard: "Tableau de bord producteur",
        platformControlCenter: "Centre de contrôle de la plateforme",
        artistProfile: "Profil artiste",
        producerProfile: "Profil producteur",
        mainNavigation: "Navigation principale"
    },
    auth: {
        createAccount: "Créez votre compte",
        loginTitle: "Connectez-vous à Music Data Base",
        signupSubtitle: "Votre bibliothèque, vos likes, playlists et titres récents restent liés à votre compte Supabase.",
        foundingSignupSubtitle: "L'inscription bêta fondatrice nécessite un code d'invitation à usage unique de Music Data Base.",
        name: "Nom",
        namePlaceholder: "Votre nom",
        inviteCode: "Code d'invitation",
        inviteCodePlaceholder: "Invitation fondatrice à usage unique",
        email: "E-mail",
        emailPlaceholder: "vous@exemple.com",
        password: "Mot de passe",
        passwordPlaceholder: "Au moins 6 caractères",
        signUp: "S'inscrire",
        login: "Connexion",
        switchToLogin: "Vous avez déjà un compte ? Connexion",
        switchToSignup: "Besoin d'un compte ? S'inscrire",
        signOut: "Se déconnecter",
        approvalPending: "Approbation en attente",
        inviteRequired: "Invitation requise",
        accessNotApproved: "Accès non approuvé",
        assignedRole: "Rôle assigné : {role}",
        signedInAs: "Connecté en tant que {name}",
        openingLibrary: "Ouverture de votre bibliothèque...",
        loadingLibrary: "Chargement de votre bibliothèque musicale..."
    },
    home: {
        title: "Accueil",
        welcome: "Bon retour",
        discover: "Découvrez musique et vidéos",
        defaultSubtitle: "Parcourez la musique et gardez vos favoris à portée de main.",
        tabs: {
            trending: "Tendances",
            newReleases: "Nouvelles sorties",
            beats: "Beats",
            artists: "Artistes",
            producers: "Producteurs",
            hipHop: "Hip Hop",
            rnb: "R&B",
            trap: "Trap",
            dancehall: "Dancehall",
            afrobeat: "Afrobeat"
        }
    },
    marketplace: {
        title: "Place de marché",
        browse: "Parcourir les annonces",
        fullTitle: "Marketplace musicale",
        pageSubtitle: "Parcourez les boutiques d'artistes, de producteurs, les sorties, classements et filtres."
    },
    trending: {
        title: "Tendances",
        subtitle: "Titres et vidéos populaires en ce moment",
        pageSubtitle: "Titres et vidéos populaires en ce moment"
    },
    beats: {
        title: "Beats",
        subtitle: "Explorez les beats des producteurs",
        pageSubtitle: "Explorez les beats des producteurs"
    },
    artists: {
        title: "Artistes",
        subtitle: "Découvrez les artistes de la plateforme",
        pageSubtitle: "Parcourez les profils d'artistes, titres, vidéos et suivez les créateurs."
    },
    search: {
        title: "Recherche",
        placeholder: "Rechercher titres, vidéos, artistes...",
        extendedPlaceholder: "Rechercher titres, vidéos, albums, artistes...",
        suggestions: "Propositions",
        popularSearches: "Recherches populaires",
        resultsTitle: "Résultats de recherche",
        videoSearchTitle: "Recherche vidéo",
        resultsSubtitle: "Titres, vidéos, albums, artistes et producteurs correspondant à votre recherche."
    },
    following: {
        title: "Abonnements",
        empty: "Vous ne suivez encore aucun artiste.",
        pageSubtitle: "Nouveaux titres et vidéos des artistes que vous suivez."
    },
    favorites: {
        title: "Favoris",
        empty: "Aucun favori pour le moment.",
        pageSubtitle: "Titres, vidéos et artistes que vous avez aimés."
    },
    library: {
        title: "Bibliothèque",
        empty: "Votre bibliothèque est vide.",
        pageSubtitle: "Titres, vidéos et albums dans votre bibliothèque."
    },
    recentlyPlayed: {
        title: "Écoutés récemment",
        empty: "Rien écouté récemment.",
        pageSubtitle: "Chaque lecture est enregistrée ici, y compris les répétitions."
    },
    queue: {
        title: "File d'attente",
        empty: "Votre file d'attente est vide.",
        nowPlaying: "En cours de lecture",
        pageSubtitle: "Titres et vidéos en file pour le lecteur.",
        clearQueue: "Vider la file",
        mediaQueued: "{count} éléments en file",
        remove: "Retirer",
        resetDisabled: "Réinitialisation désactivée"
    },
    playlists: {
        title: "Listes de lecture",
        empty: "Aucune playlist pour le moment.",
        create: "Créer une playlist",
        pageSubtitle: "Créez des playlists, ajoutez des titres, définissez des couvertures et lisez-les en continu."
    },
    albums: {
        title: "Albums musicaux",
        empty: "Aucun album pour le moment."
    },
    profile: {
        title: "Profil",
        accountSettings: "Paramètres du compte",
        preferredLanguage: "Langue préférée",
        role: "Rôle",
        stats: "Statistiques du profil",
        pageSubtitle: "Votre compte et l'état de synchronisation de votre musique enregistrée.",
        userProfile: "Profil utilisateur"
    },
    settings: {
        title: "Paramètres",
        languageDescription: "Choisissez votre langue d'affichage. Le contenu créé par les utilisateurs reste dans sa langue d'origine."
    },
    notifications: {
        title: "Alertes",
        empty: "Aucune notification pour le moment."
    },
    player: {
        play: "Lecture",
        pause: "Interruption",
        previous: "Précédent",
        next: "Suivant",
        shuffle: "Aléatoire",
        repeat: "Répéter",
        volume: "Volume sonore",
        mute: "Couper le son",
        unmute: "Activer le son",
        shuffleOn: "Aléatoire activé",
        shuffleOff: "Aléatoire désactivé",
        repeatMode: "Répéter {mode}",
        playbackProgress: "Progression de lecture",
        queueCount: "File {count}"
    },
    video: {
        title: "Vidéos",
        play: "Lire la vidéo",
        pause: "Mettre en pause",
        fullscreen: "Plein écran",
        pageSubtitle: "Téléversez, regardez, recherchez et supprimez des vidéos sans les mélanger aux titres."
    },
    upload: {
        title: "Téléverser",
        uploadSong: "Téléverser un titre",
        uploadVideo: "Téléverser une vidéo",
        uploadAlbum: "Téléverser un album",
        lockedMessage: "Les téléversements sont temporairement désactivés pendant la construction de Music Data Base."
    },
    artistDashboard: {
        title: "Tableau de bord artiste",
        subtitle: "Gérez votre présence artistique et vos sorties",
        pageSubtitle: "Gérez les profils artistes, titres téléversés et analyses créateur."
    },
    producerDashboard: {
        title: "Tableau de bord producteur",
        subtitle: "Gérez beats, ventes et licences",
        pageSubtitle: "Gérez beats, licences, crédits, baux, téléchargements et paiements."
    },
    platformControlCenter: {
        title: "Centre de contrôle de la plateforme",
        subtitle: "Surveillez la santé de la plateforme, l'onboarding fondateur et les opérations propriétaire.",
        ownerOnly: "Propriétaire uniquement",
        refreshDashboard: "Actualiser le tableau de bord",
        pageSubtitle: "Surveillez les échecs de téléversement, fichiers média, nettoyage et sauvegardes.",
        refreshing: "Actualisation...",
        platformOverview: "Aperçu de la plateforme",
        systemHealth: "Santé du système",
        recentActivity: "Activité récente",
        noRecentActivity: "Aucune activité récente.",
        lastRefreshed: "Dernière actualisation : {time}",
        notLoadedYet: "Pas encore chargé"
    },
    foundingOnboarding: {
        title: "Contrôles d'onboarding fondateur",
        subtitle: "Examiner les membres en attente et gérer les invitations"
    },
    testAccountCleanup: {
        title: "Centre de nettoyage des comptes test",
        subtitle: "Révision et suppression sécurisée des comptes test jetables, propriétaire uniquement",
        refreshReviewList: "Actualiser la liste de révision",
        dryRun: "Aperçu de nettoyage à blanc",
        deleteSelected: "Supprimer le compte test sélectionné",
        dependencyPreview: "Aperçu des dépendances",
        safeToDelete: "Le nettoyage semble sûr pour ce compte.",
        blocked: "Le nettoyage est bloqué pour ce compte."
    },
    dialogs: {
        confirm: "Confirmer",
        areYouSure: "Êtes-vous sûr ?",
        cannotUndo: "Cette action est irréversible."
    },
    errors: {
        generic: "Une erreur s'est produite. Veuillez réessayer.",
        network: "Erreur réseau. Vérifiez votre connexion et réessayez.",
        unauthorized: "Vous devez être connecté pour continuer.",
        forbidden: "Vous n'avez pas la permission d'effectuer cette action.",
        notFound: "L'élément demandé est introuvable.",
        sessionExpired: "Votre session a expiré. Veuillez vous reconnecter."
    },
    emptyStates: {
        noSongs: "Aucun titre disponible pour le moment.",
        noVideos: "Aucune vidéo disponible pour le moment.",
        noItems: "Rien ici pour le moment."
    },
    mobile: {
        navigation: "Navigation mobile",
        openMenu: "Ouvrir le menu",
        closeMenu: "Fermer le menu"
    },
    languageSelector: {
        title: "Choisir la langue",
        searchPlaceholder: "Rechercher des langues...",
        currentLanguage: "Langue actuelle : {language}",
        noMatches: "Aucune langue ne correspond à votre recherche."
    },
    formatting: {
        currencyLabel: "Prix"
    },
    header: {
        gridView: "Vue grille",
        listView: "Vue liste",
        cardViewMode: "Mode d'affichage des cartes",
        artistShort: "Artiste",
        producerShort: "Producteur",
        ownerAccessRequired: "L'accès administrateur propriétaire est requis pour les contrôles de la plateforme."
    },
    stats: {
        ariaLabel: "Statistiques musicales",
        tracks: "Titres",
        library: "Bibliothèque",
        videos: "Vidéos",
        plays: "Lectures"
    },
    sales: {
        title: "Ventes",
        pageSubtitle: "Panier, historique d'achats et coffre de téléchargements."
    },
    licenseHistory: {
        title: "Historique des licences",
        pageSubtitle: "Consultez les licences de beats générées et téléchargez les PDF."
    },
    artistProfile: {
        pageSubtitle: "Titres, albums, playlists et statistiques de l'artiste."
    },
    producerProfile: {
        pageSubtitle: "Crédits producteur, licences de beats et productions."
    }
};
