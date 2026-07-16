import type { TranslationMessages } from "./en";

export const esMessages: TranslationMessages = {
    common: {
        appName: "Music Data Base",
        save: "Guardar",
        cancel: "Cancelar",
        close: "Cerrar",
        delete: "Eliminar",
        edit: "Editar",
        search: "Buscar",
        filter: "Filtrar",
        sort: "Ordenar",
        loading: "Cargando...",
        working: "Trabajando...",
        refresh: "Actualizar",
        upload: "Subir",
        logout: "Cerrar sesión",
        profile: "Perfil",
        settings: "Configuración",
        notifications: "Notificaciones",
        yes: "Sí",
        no: "No",
        back: "Atrás",
        next: "Siguiente",
        submit: "Enviar",
        retry: "Reintentar",
        clear: "Limpiar",
        viewAll: "Ver todo",
        noResults: "No se encontraron resultados",
        language: "Idioma",
        languageChanged: "Idioma cambiado a {language}"
    },
    nav: {
        home: "Inicio",
        marketplace: "Mercado",
        sales: "Ventas",
        licenseHistory: "Historial de licencias",
        trending: "Tendencias",
        beats: "Beats",
        artists: "Artistas",
        videos: "Videos",
        library: "Biblioteca",
        liked: "Me gusta",
        following: "Siguiendo",
        recentlyPlayed: "Reproducido recientemente",
        queue: "Cola",
        playlists: "Listas de reproducción",
        profile: "Perfil",
        artistDashboard: "Panel de artista",
        producerDashboard: "Panel de productor",
        platformControlCenter: "Centro de control de la plataforma",
        artistProfile: "Perfil de artista",
        producerProfile: "Perfil de productor",
        mainNavigation: "Navegación principal"
    },
    auth: {
        createAccount: "Crea tu cuenta",
        loginTitle: "Inicia sesión en Music Data Base",
        signupSubtitle: "Tu biblioteca, me gusta, listas y canciones recientes permanecen con tu cuenta de Supabase.",
        foundingSignupSubtitle: "El registro beta fundador requiere un código de invitación de un solo uso de Music Data Base.",
        name: "Nombre",
        namePlaceholder: "Tu nombre",
        inviteCode: "Código de invitación",
        inviteCodePlaceholder: "Invitación fundadora de un solo uso",
        email: "Correo electrónico",
        emailPlaceholder: "tu@ejemplo.com",
        password: "Contraseña",
        passwordPlaceholder: "Al menos 6 caracteres",
        signUp: "Registrarse",
        login: "Iniciar sesión",
        switchToLogin: "¿Ya tienes cuenta? Inicia sesión",
        switchToSignup: "¿Necesitas una cuenta? Regístrate",
        signOut: "Cerrar sesión",
        approvalPending: "Aprobación pendiente",
        inviteRequired: "Se requiere invitación",
        accessNotApproved: "Acceso no aprobado",
        assignedRole: "Rol asignado: {role}",
        signedInAs: "Conectado como {name}",
        openingLibrary: "Abriendo tu biblioteca...",
        loadingLibrary: "Cargando tu biblioteca musical..."
    },
    home: {
        title: "Inicio",
        welcome: "Bienvenido de nuevo",
        discover: "Descubre música y videos",
        defaultSubtitle: "Explora música y mantén tus favoritos cerca.",
        tabs: {
            trending: "Tendencias",
            newReleases: "Nuevos lanzamientos",
            beats: "Beats",
            artists: "Artistas",
            producers: "Productores",
            hipHop: "Hip Hop",
            rnb: "R&B",
            trap: "Trap",
            dancehall: "Dancehall",
            afrobeat: "Afrobeat"
        }
    },
    marketplace: {
        title: "Mercado",
        browse: "Explorar listados del mercado",
        fullTitle: "Mercado musical",
        pageSubtitle: "Explora tiendas de artistas, tiendas de productores, lanzamientos, listas y filtros del mercado."
    },
    trending: {
        title: "Tendencias",
        subtitle: "Pistas y videos populares ahora",
        pageSubtitle: "Pistas y videos populares ahora mismo"
    },
    beats: {
        title: "Beats",
        subtitle: "Explora beats de productores",
        pageSubtitle: "Explora beats de productores"
    },
    artists: {
        title: "Artistas",
        subtitle: "Descubre artistas en la plataforma",
        pageSubtitle: "Explora perfiles de artistas, canciones, videos y sigue a creadores."
    },
    search: {
        title: "Buscar",
        placeholder: "Buscar canciones, videos, artistas...",
        extendedPlaceholder: "Buscar canciones, videos, álbumes, artistas...",
        suggestions: "Sugerencias",
        popularSearches: "Búsquedas populares",
        resultsTitle: "Resultados de búsqueda",
        videoSearchTitle: "Búsqueda de videos",
        resultsSubtitle: "Canciones, videos, álbumes, artistas y productores que coinciden con tu búsqueda."
    },
    following: {
        title: "Siguiendo",
        empty: "Aún no sigues a ningún artista.",
        pageSubtitle: "Nuevas canciones y videos de artistas que sigues."
    },
    favorites: {
        title: "Favoritos",
        empty: "Aún no hay favoritos.",
        pageSubtitle: "Canciones, videos y artistas que te gustaron."
    },
    library: {
        title: "Biblioteca",
        empty: "Tu biblioteca está vacía.",
        pageSubtitle: "Canciones, videos y álbumes en tu biblioteca."
    },
    recentlyPlayed: {
        title: "Reproducido recientemente",
        empty: "Nada reproducido recientemente.",
        pageSubtitle: "Cada reproducción se guarda aquí, incluidas las repetidas."
    },
    queue: {
        title: "Cola",
        empty: "Tu cola está vacía.",
        nowPlaying: "Reproduciendo ahora",
        pageSubtitle: "Canciones y videos en cola para el reproductor.",
        clearQueue: "Limpiar cola",
        mediaQueued: "{count} elementos en cola",
        remove: "Eliminar",
        resetDisabled: "Restablecer deshabilitado"
    },
    playlists: {
        title: "Listas de reproducción",
        empty: "Aún no hay listas.",
        create: "Crear lista",
        pageSubtitle: "Crea listas, añade canciones, define portadas y reprodúcelas de principio a fin."
    },
    albums: {
        title: "Álbumes",
        empty: "Aún no hay álbumes."
    },
    profile: {
        title: "Perfil",
        accountSettings: "Configuración de cuenta",
        preferredLanguage: "Idioma preferido",
        role: "Rol",
        stats: "Estadísticas del perfil",
        pageSubtitle: "Tu cuenta y estado de sincronización de música guardada.",
        userProfile: "Perfil de usuario"
    },
    settings: {
        title: "Configuración",
        languageDescription: "Elige tu idioma de visualización. El contenido creado por usuarios permanece en su idioma original."
    },
    notifications: {
        title: "Notificaciones",
        empty: "Aún no hay notificaciones."
    },
    player: {
        play: "Reproducir",
        pause: "Pausar",
        previous: "Anterior",
        next: "Siguiente",
        shuffle: "Aleatorio",
        repeat: "Repetir",
        volume: "Volumen",
        mute: "Silenciar",
        unmute: "Activar sonido",
        shuffleOn: "Aleatorio activado",
        shuffleOff: "Aleatorio desactivado",
        repeatMode: "Repetir {mode}",
        playbackProgress: "Progreso de reproducción",
        queueCount: "Cola {count}"
    },
    video: {
        title: "Videos",
        play: "Reproducir video",
        pause: "Pausar video",
        fullscreen: "Pantalla completa",
        pageSubtitle: "Sube, mira, busca y elimina videos sin mezclarlos con canciones."
    },
    upload: {
        title: "Subir",
        uploadSong: "Subir canción",
        uploadVideo: "Subir video",
        uploadAlbum: "Subir álbum",
        lockedMessage: "Las subidas están temporalmente deshabilitadas mientras Music Data Base está en construcción."
    },
    artistDashboard: {
        title: "Panel de artista",
        subtitle: "Administra tu presencia artística y lanzamientos",
        pageSubtitle: "Administra perfiles de artista, canciones subidas y analíticas de creador."
    },
    producerDashboard: {
        title: "Panel de productor",
        subtitle: "Administra beats, ventas y licencias",
        pageSubtitle: "Administra beats, licencias, créditos, arrendamientos, descargas y pagos."
    },
    platformControlCenter: {
        title: "Centro de control de la plataforma",
        subtitle: "Supervisa la salud de la plataforma, la incorporación fundadora y las operaciones del propietario.",
        ownerOnly: "Solo propietario",
        refreshDashboard: "Actualizar panel",
        pageSubtitle: "Supervisa fallos de subida, archivos multimedia, limpieza y copias de seguridad.",
        refreshing: "Actualizando...",
        platformOverview: "Resumen de la plataforma",
        systemHealth: "Salud del sistema",
        recentActivity: "Actividad reciente",
        noRecentActivity: "Sin actividad reciente.",
        lastRefreshed: "Última actualización: {time}",
        notLoadedYet: "Aún no cargado"
    },
    foundingOnboarding: {
        title: "Controles de incorporación fundadora",
        subtitle: "Revisa miembros pendientes y administra invitaciones"
    },
    testAccountCleanup: {
        title: "Centro de limpieza de cuentas de prueba",
        subtitle: "Revisión y eliminación segura de cuentas de prueba desechables, solo propietario",
        refreshReviewList: "Actualizar lista de revisión",
        dryRun: "Vista previa de limpieza en seco",
        deleteSelected: "Eliminar cuenta de prueba seleccionada",
        dependencyPreview: "Vista previa de dependencias",
        safeToDelete: "La limpieza parece segura para esta cuenta.",
        blocked: "La limpieza está bloqueada para esta cuenta."
    },
    dialogs: {
        confirm: "Confirmar",
        areYouSure: "¿Estás seguro?",
        cannotUndo: "Esta acción no se puede deshacer."
    },
    errors: {
        generic: "Algo salió mal. Inténtalo de nuevo.",
        network: "Error de red. Comprueba tu conexión e inténtalo de nuevo.",
        unauthorized: "Debes iniciar sesión para continuar.",
        forbidden: "No tienes permiso para realizar esta acción.",
        notFound: "No se encontró el elemento solicitado.",
        sessionExpired: "Tu sesión expiró. Inicia sesión de nuevo."
    },
    emptyStates: {
        noSongs: "Aún no hay canciones disponibles.",
        noVideos: "Aún no hay videos disponibles.",
        noItems: "Aún no hay nada aquí."
    },
    mobile: {
        navigation: "Navegación móvil",
        openMenu: "Abrir menú",
        closeMenu: "Cerrar menú"
    },
    languageSelector: {
        title: "Seleccionar idioma",
        searchPlaceholder: "Buscar idiomas...",
        currentLanguage: "Idioma actual: {language}",
        noMatches: "Ningún idioma coincide con tu búsqueda."
    },
    formatting: {
        currencyLabel: "Precio"
    },
    header: {
        gridView: "Vista de cuadrícula",
        listView: "Vista de lista",
        cardViewMode: "Modo de vista de tarjetas",
        artistShort: "Artista",
        producerShort: "Productor",
        ownerAccessRequired: "Se requiere acceso de administrador propietario para los controles de la plataforma."
    },
    stats: {
        ariaLabel: "Estadísticas musicales",
        tracks: "Pistas",
        library: "Biblioteca",
        videos: "Videos",
        plays: "Reproducciones"
    },
    sales: {
        title: "Ventas",
        pageSubtitle: "Carrito de compras, historial de compras y bóveda de descargas."
    },
    licenseHistory: {
        title: "Historial de licencias",
        pageSubtitle: "Revisa licencias de beats generadas y descarga PDFs de licencia."
    },
    artistProfile: {
        pageSubtitle: "Canciones, álbumes, listas y estadísticas del artista."
    },
    producerProfile: {
        pageSubtitle: "Créditos de productor, licencias de beats y producciones."
    }
};
