import type { TranslationMessages } from "./en";

export const ptMessages: TranslationMessages = {
    common: {
        appName: "Music Data Base",
        save: "Salvar",
        cancel: "Cancelar",
        close: "Fechar",
        delete: "Excluir",
        edit: "Editar",
        search: "Pesquisar",
        filter: "Filtrar",
        sort: "Ordenar",
        loading: "Carregando...",
        working: "Processando...",
        refresh: "Atualizar",
        upload: "Enviar",
        logout: "Sair",
        profile: "Perfil",
        settings: "Configurações",
        notifications: "Notificações",
        yes: "Sim",
        no: "Não",
        back: "Voltar",
        next: "Próximo",
        submit: "Enviar",
        retry: "Tentar novamente",
        clear: "Limpar",
        viewAll: "Ver tudo",
        noResults: "Nenhum resultado encontrado",
        language: "Idioma",
        languageChanged: "Idioma alterado para {language}"
    },
    nav: {
        home: "Início",
        marketplace: "Mercado",
        sales: "Vendas",
        licenseHistory: "Histórico de licenças",
        trending: "Em alta",
        beats: "Beats",
        artists: "Artistas",
        videos: "Vídeos",
        library: "Biblioteca",
        liked: "Curtidas",
        following: "Seguindo",
        recentlyPlayed: "Tocados recentemente",
        queue: "Fila",
        playlists: "Listas de reprodução",
        profile: "Perfil",
        artistDashboard: "Painel do artista",
        producerDashboard: "Painel do produtor",
        platformControlCenter: "Centro de controle da plataforma",
        artistProfile: "Perfil do artista",
        producerProfile: "Perfil do produtor",
        mainNavigation: "Navegação principal"
    },
    auth: {
        createAccount: "Crie sua conta",
        loginTitle: "Entre no Music Data Base",
        signupSubtitle: "Sua biblioteca, curtidas, playlists e músicas recentes ficam com sua conta Supabase.",
        foundingSignupSubtitle: "O cadastro beta fundador exige um código de convite de uso único do Music Data Base.",
        name: "Nome",
        namePlaceholder: "Seu nome",
        inviteCode: "Código de convite",
        inviteCodePlaceholder: "Convite fundador de uso único",
        email: "E-mail",
        emailPlaceholder: "voce@exemplo.com",
        password: "Senha",
        passwordPlaceholder: "Pelo menos 6 caracteres",
        signUp: "Cadastrar",
        login: "Entrar",
        switchToLogin: "Já tem conta? Entrar",
        switchToSignup: "Precisa de uma conta? Cadastrar",
        signOut: "Sair",
        approvalPending: "Aprovação pendente",
        inviteRequired: "Convite necessário",
        accessNotApproved: "Acesso não aprovado",
        assignedRole: "Função atribuída: {role}",
        signedInAs: "Conectado como {name}",
        openingLibrary: "Abrindo sua biblioteca...",
        loadingLibrary: "Carregando sua biblioteca musical..."
    },
    home: {
        title: "Início",
        welcome: "Bem-vindo de volta",
        discover: "Descubra música e vídeos",
        defaultSubtitle: "Explore música e mantenha seus favoritos por perto.",
        tabs: {
            trending: "Em alta",
            newReleases: "Novos lançamentos",
            beats: "Beats",
            artists: "Artistas",
            producers: "Produtores",
            hipHop: "Hip Hop",
            rnb: "R&B",
            trap: "Trap",
            dancehall: "Dancehall",
            afrobeat: "Afrobeat"
        }
    },
    marketplace: {
        title: "Mercado",
        browse: "Explorar listagens do mercado",
        fullTitle: "Mercado musical",
        pageSubtitle: "Explore lojas de artistas, lojas de produtores, lançamentos, charts e filtros."
    },
    trending: {
        title: "Em alta",
        subtitle: "Faixas e vídeos populares agora",
        pageSubtitle: "Faixas e vídeos populares agora"
    },
    beats: {
        title: "Beats",
        subtitle: "Explore beats de produtores",
        pageSubtitle: "Explore beats de produtores"
    },
    artists: {
        title: "Artistas",
        subtitle: "Descubra artistas na plataforma",
        pageSubtitle: "Explore perfis de artistas, músicas, vídeos e siga criadores."
    },
    search: {
        title: "Pesquisar",
        placeholder: "Pesquisar músicas, vídeos, artistas...",
        extendedPlaceholder: "Pesquisar músicas, vídeos, álbuns, artistas...",
        suggestions: "Sugestões",
        popularSearches: "Pesquisas populares",
        resultsTitle: "Resultados da pesquisa",
        videoSearchTitle: "Pesquisa de vídeos",
        resultsSubtitle: "Músicas, vídeos, álbuns, artistas e produtores correspondentes à sua pesquisa."
    },
    following: {
        title: "Seguindo",
        empty: "Você ainda não segue nenhum artista.",
        pageSubtitle: "Novas músicas e vídeos de artistas que você segue."
    },
    favorites: {
        title: "Favoritos",
        empty: "Nenhum favorito ainda.",
        pageSubtitle: "Músicas, vídeos e artistas que você curtiu."
    },
    library: {
        title: "Biblioteca",
        empty: "Sua biblioteca está vazia.",
        pageSubtitle: "Músicas, vídeos e álbuns na sua biblioteca."
    },
    recentlyPlayed: {
        title: "Tocados recentemente",
        empty: "Nada tocado recentemente.",
        pageSubtitle: "Cada reprodução é salva aqui, incluindo repetições."
    },
    queue: {
        title: "Fila",
        empty: "Sua fila está vazia.",
        nowPlaying: "Tocando agora",
        pageSubtitle: "Músicas e vídeos na fila para o player.",
        clearQueue: "Limpar fila",
        mediaQueued: "{count} mídias na fila",
        remove: "Remover",
        resetDisabled: "Redefinir desativado"
    },
    playlists: {
        title: "Listas de reprodução",
        empty: "Nenhuma playlist ainda.",
        create: "Criar playlist",
        pageSubtitle: "Crie playlists, adicione músicas, defina capas e reproduza do início ao fim."
    },
    albums: {
        title: "Álbuns",
        empty: "Nenhum álbum ainda."
    },
    profile: {
        title: "Perfil",
        accountSettings: "Configurações da conta",
        preferredLanguage: "Idioma preferido",
        role: "Função",
        stats: "Estatísticas do perfil",
        pageSubtitle: "Sua conta e status de sincronização da música salva.",
        userProfile: "Perfil do usuário"
    },
    settings: {
        title: "Configurações",
        languageDescription: "Escolha seu idioma de exibição. Conteúdo criado por usuários permanece no idioma original."
    },
    notifications: {
        title: "Notificações",
        empty: "Nenhuma notificação ainda."
    },
    player: {
        play: "Reproduzir",
        pause: "Pausar",
        previous: "Anterior",
        next: "Próximo",
        shuffle: "Aleatório",
        repeat: "Repetir",
        volume: "Volume do som",
        mute: "Silenciar",
        unmute: "Ativar som",
        shuffleOn: "Aleatório ativado",
        shuffleOff: "Aleatório desativado",
        repeatMode: "Repetir {mode}",
        playbackProgress: "Progresso da reprodução",
        queueCount: "Fila {count}"
    },
    video: {
        title: "Vídeos",
        play: "Reproduzir vídeo",
        pause: "Pausar vídeo",
        fullscreen: "Tela cheia",
        pageSubtitle: "Envie, assista, pesquise e remova vídeos sem misturá-los com músicas."
    },
    upload: {
        title: "Enviar",
        uploadSong: "Enviar música",
        uploadVideo: "Enviar vídeo",
        uploadAlbum: "Enviar álbum",
        lockedMessage: "Os envios estão temporariamente desativados enquanto o Music Data Base está em construção."
    },
    artistDashboard: {
        title: "Painel do artista",
        subtitle: "Gerencie sua presença artística e lançamentos",
        pageSubtitle: "Gerencie perfis de artista, músicas enviadas e análises de criador."
    },
    producerDashboard: {
        title: "Painel do produtor",
        subtitle: "Gerencie beats, vendas e licenças",
        pageSubtitle: "Gerencie beats, licenças, créditos, leases, downloads e pagamentos."
    },
    platformControlCenter: {
        title: "Centro de controle da plataforma",
        subtitle: "Monitore a saúde da plataforma, onboarding fundador e operações do proprietário.",
        ownerOnly: "Somente proprietário",
        refreshDashboard: "Atualizar painel",
        pageSubtitle: "Monitore falhas de upload, arquivos de mídia, limpeza e backups.",
        refreshing: "Atualizando...",
        platformOverview: "Visão geral da plataforma",
        systemHealth: "Saúde do sistema",
        recentActivity: "Atividade recente",
        noRecentActivity: "Nenhuma atividade recente.",
        lastRefreshed: "Última atualização: {time}",
        notLoadedYet: "Ainda não carregado"
    },
    foundingOnboarding: {
        title: "Controles de onboarding fundador",
        subtitle: "Revise membros pendentes e gerencie convites"
    },
    testAccountCleanup: {
        title: "Centro de limpeza de contas de teste",
        subtitle: "Revisão e exclusão segura de contas de teste descartáveis, somente proprietário",
        refreshReviewList: "Atualizar lista de revisão",
        dryRun: "Visualização de limpeza simulada",
        deleteSelected: "Excluir conta de teste selecionada",
        dependencyPreview: "Prévia de dependências",
        safeToDelete: "A limpeza parece segura para esta conta.",
        blocked: "A limpeza está bloqueada para esta conta."
    },
    dialogs: {
        confirm: "Confirmar",
        areYouSure: "Tem certeza?",
        cannotUndo: "Esta ação não pode ser desfeita."
    },
    errors: {
        generic: "Algo deu errado. Tente novamente.",
        network: "Erro de rede. Verifique sua conexão e tente novamente.",
        unauthorized: "Você precisa entrar para continuar.",
        forbidden: "Você não tem permissão para realizar esta ação.",
        notFound: "O item solicitado não foi encontrado.",
        sessionExpired: "Sua sessão expirou. Entre novamente."
    },
    emptyStates: {
        noSongs: "Nenhuma música disponível ainda.",
        noVideos: "Nenhum vídeo disponível ainda.",
        noItems: "Nada aqui ainda."
    },
    mobile: {
        navigation: "Navegação móvel",
        openMenu: "Abrir menu",
        closeMenu: "Fechar menu"
    },
    languageSelector: {
        title: "Selecionar idioma",
        searchPlaceholder: "Pesquisar idiomas...",
        currentLanguage: "Idioma atual: {language}",
        noMatches: "Nenhum idioma corresponde à sua pesquisa."
    },
    formatting: {
        currencyLabel: "Preço"
    },
    header: {
        gridView: "Visualização em grade",
        listView: "Visualização em lista",
        cardViewMode: "Modo de visualização de cartões",
        artistShort: "Artista",
        producerShort: "Produtor",
        ownerAccessRequired: "É necessário acesso de administrador proprietário para os controles da plataforma."
    },
    stats: {
        ariaLabel: "Estatísticas musicais",
        tracks: "Faixas",
        library: "Biblioteca",
        videos: "Vídeos",
        plays: "Reproduções"
    },
    sales: {
        title: "Vendas",
        pageSubtitle: "Carrinho, histórico de compras e cofre de downloads."
    },
    licenseHistory: {
        title: "Histórico de licenças",
        pageSubtitle: "Revise licenças de beats geradas e baixe PDFs de licença."
    },
    artistProfile: {
        pageSubtitle: "Músicas, álbuns, playlists e estatísticas do artista."
    },
    producerProfile: {
        pageSubtitle: "Créditos de produtor, licenças de beats e produções."
    }
};
