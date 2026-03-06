const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'locales');

const localized = {
  es: {
    navOwnerWebsiteErrors: 'Errores del sitio web',
    error: {
      title: 'Algo salió mal',
      generic: 'Ocurrió un error inesperado al procesar tu solicitud.',
      mongoTimeout: 'Se produjo un problema temporal de conexión con la base de datos. Actualiza e inténtalo de nuevo en un momento.',
      reference: 'ID de referencia',
      reportIssue: 'Informar al propietario del bot',
      reportSubject: 'Informe de error del sitio web de DiscoBot',
      reportIntro: 'Describe lo que ocurrió:',
      reportPage: 'Página',
      reportTime: 'Hora (UTC)',
      reportMessage: 'Mensaje'
    },
    errors: {
      websiteErrorsErrorTitle: 'Error de la página de errores del sitio web',
      websiteErrorsErrorMessage: 'No se pudieron cargar los registros de errores del sitio web.'
    },
    ownerWebsiteErrors: {
      title: 'Errores del sitio web (Propietario)',
      subtitle: 'Revisa y filtra los errores del sitio web que encontraron los usuarios.',
      filtersSubtitle: 'Filtra por estado, tipo de error, rango de fechas, ruta y usuario.',
      statusGroup: 'Grupo de estado',
      allStatuses: 'Todos',
      errorType: 'Tipo de error',
      allTypes: 'Todos',
      fromDate: 'Desde',
      toDate: 'Hasta',
      pathOrMessage: 'Ruta, mensaje o ID de referencia',
      userQuery: 'Nombre de usuario o ID de usuario',
      resultLimit: 'Límite de resultados',
      summaryTitle: 'Resumen',
      summarySubtitle: 'Resumen de los resultados filtrados actuales.',
      totalMatching: 'Total coincidente',
      mongoTimeouts: 'Tiempos de espera de Mongo',
      recentTitle: 'Errores recientes del sitio web',
      recentSubtitle: 'Páginas de error más recientes mostradas a usuarios.',
      empty: 'No se encontraron errores del sitio web para estos filtros.',
      unknownUser: 'Usuario desconocido',
        testGenericErrorButton: 'Generar error genérico de prueba'
    }
  },
  de: {
    navOwnerWebsiteErrors: 'Website-Fehler',
    error: {
      title: 'Etwas ist schiefgelaufen',
      generic: 'Beim Verarbeiten deiner Anfrage ist ein unerwarteter Fehler aufgetreten.',
      mongoTimeout: 'Es ist ein temporäres Datenbank-Verbindungsproblem aufgetreten. Bitte aktualisiere die Seite und versuche es gleich erneut.',
      reference: 'Referenz-ID',
      reportIssue: 'An Bot-Eigentümer melden',
      reportSubject: 'DiscoBot-Website Fehlerbericht',
      reportIntro: 'Bitte beschreibe, was passiert ist:',
      reportPage: 'Seite',
      reportTime: 'Zeit (UTC)',
      reportMessage: 'Nachricht'
    },
    errors: {
      websiteErrorsErrorTitle: 'Fehler auf der Website-Fehlerseite',
      websiteErrorsErrorMessage: 'Website-Fehlerprotokolle konnten nicht geladen werden.'
    },
    ownerWebsiteErrors: {
      title: 'Website-Fehler (Owner)',
      subtitle: 'Prüfe und filtere Website-Fehler, die Nutzer gesehen haben.',
      filtersSubtitle: 'Nach Status, Fehlertyp, Zeitraum, Route und Nutzer filtern.',
      statusGroup: 'Statusgruppe',
      allStatuses: 'Alle',
      errorType: 'Fehlertyp',
      allTypes: 'Alle',
      fromDate: 'Von Datum',
      toDate: 'Bis Datum',
      pathOrMessage: 'Pfad, Nachricht oder Referenz-ID',
      userQuery: 'Benutzername oder Benutzer-ID',
      resultLimit: 'Ergebnislimit',
      summaryTitle: 'Zusammenfassung',
      summarySubtitle: 'Übersicht der aktuell gefilterten Ergebnisse.',
      totalMatching: 'Treffer gesamt',
      mongoTimeouts: 'Mongo-Timeouts',
      recentTitle: 'Letzte Website-Fehler',
      recentSubtitle: 'Neueste den Nutzern angezeigte Fehlerseiten.',
      empty: 'Für diese Filter wurden keine Website-Fehler gefunden.',
      unknownUser: 'Unbekannter Benutzer',
        testGenericErrorButton: 'Allgemeinen Testfehler erzeugen'
    }
  },
  fr: {
    navOwnerWebsiteErrors: 'Erreurs du site',
    error: {
      title: 'Une erreur est survenue',
      generic: 'Une erreur inattendue est survenue lors du traitement de votre demande.',
      mongoTimeout: 'Un problème temporaire de connexion à la base de données est survenu. Veuillez actualiser puis réessayer dans un instant.',
      reference: 'ID de référence',
      reportIssue: 'Signaler au propriétaire du bot',
      reportSubject: 'Rapport d’erreur du site DiscoBot',
      reportIntro: 'Veuillez décrire ce qui s’est passé :',
      reportPage: 'Page',
      reportTime: 'Heure (UTC)',
      reportMessage: 'Message'
    },
    errors: {
      websiteErrorsErrorTitle: 'Erreur de la page des erreurs du site',
      websiteErrorsErrorMessage: 'Impossible de charger les journaux d’erreurs du site.'
    },
    ownerWebsiteErrors: {
      title: 'Erreurs du site (Owner)',
      subtitle: 'Consultez et filtrez les erreurs du site rencontrées par les utilisateurs.',
      filtersSubtitle: 'Filtrer par statut, type d’erreur, période, route et utilisateur.',
      statusGroup: 'Groupe de statut',
      allStatuses: 'Tous',
      errorType: 'Type d’erreur',
      allTypes: 'Tous',
      fromDate: 'Date de début',
      toDate: 'Date de fin',
      pathOrMessage: 'Route, message ou ID de référence',
      userQuery: 'Nom d’utilisateur ou ID utilisateur',
      resultLimit: 'Limite de résultats',
      summaryTitle: 'Résumé',
      summarySubtitle: 'Vue d’ensemble des résultats actuellement filtrés.',
      totalMatching: 'Total correspondant',
      mongoTimeouts: 'Timeouts Mongo',
      recentTitle: 'Erreurs récentes du site',
      recentSubtitle: 'Dernières pages d’erreur affichées aux utilisateurs.',
      empty: 'Aucune erreur du site trouvée pour ces filtres.',
      unknownUser: 'Utilisateur inconnu',
        testGenericErrorButton: 'Générer une erreur de test générique'
    }
  },
  it: {
    navOwnerWebsiteErrors: 'Errori sito web',
    error: {
      title: 'Qualcosa è andato storto',
      generic: 'Si è verificato un errore imprevisto durante l’elaborazione della richiesta.',
      mongoTimeout: 'Si è verificato un problema temporaneo di connessione al database. Aggiorna la pagina e riprova tra poco.',
      reference: 'ID di riferimento',
      reportIssue: 'Segnala al proprietario del bot',
      reportSubject: 'Segnalazione errore sito DiscoBot',
      reportIntro: 'Descrivi cosa è successo:',
      reportPage: 'Pagina',
      reportTime: 'Ora (UTC)',
      reportMessage: 'Messaggio'
    },
    errors: {
      websiteErrorsErrorTitle: 'Errore pagina errori sito web',
      websiteErrorsErrorMessage: 'Impossibile caricare i log errori del sito web.'
    },
    ownerWebsiteErrors: {
      title: 'Errori sito web (Owner)',
      subtitle: 'Controlla e filtra gli errori del sito riscontrati dagli utenti.',
      filtersSubtitle: 'Filtra per stato, tipo di errore, intervallo date, rotta e utente.',
      statusGroup: 'Gruppo stato',
      allStatuses: 'Tutti',
      errorType: 'Tipo di errore',
      allTypes: 'Tutti',
      fromDate: 'Data inizio',
      toDate: 'Data fine',
      pathOrMessage: 'Percorso, messaggio o ID riferimento',
      userQuery: 'Username o ID utente',
      resultLimit: 'Limite risultati',
      summaryTitle: 'Riepilogo',
      summarySubtitle: 'Panoramica dei risultati filtrati correnti.',
      totalMatching: 'Totale corrispondenze',
      mongoTimeouts: 'Timeout Mongo',
      recentTitle: 'Errori recenti del sito',
      recentSubtitle: 'Pagine di errore più recenti mostrate agli utenti.',
      empty: 'Nessun errore del sito trovato per questi filtri.',
      unknownUser: 'Utente sconosciuto',
        testGenericErrorButton: 'Genera errore generico di test'
    }
  },
  nl: {
    navOwnerWebsiteErrors: 'Websitefouten',
    error: {
      title: 'Er is iets misgegaan',
      generic: 'Er is een onverwachte fout opgetreden bij het verwerken van je verzoek.',
      mongoTimeout: 'Er trad een tijdelijk probleem op met de databaseverbinding. Vernieuw de pagina en probeer het zo opnieuw.',
      reference: 'Referentie-ID',
      reportIssue: 'Meld aan boteigenaar',
      reportSubject: 'DiscoBot-website foutrapport',
      reportIntro: 'Beschrijf wat er is gebeurd:',
      reportPage: 'Pagina',
      reportTime: 'Tijd (UTC)',
      reportMessage: 'Bericht'
    },
    errors: {
      websiteErrorsErrorTitle: 'Fout op websitefoutenpagina',
      websiteErrorsErrorMessage: 'Kon websitefoutlogboeken niet laden.'
    },
    ownerWebsiteErrors: {
      title: 'Websitefouten (Owner)',
      subtitle: 'Bekijk en filter websitefouten die gebruikers hebben gezien.',
      filtersSubtitle: 'Filter op status, fouttype, datumbereik, route en gebruiker.',
      statusGroup: 'Statusgroep',
      allStatuses: 'Alle',
      errorType: 'Fouttype',
      allTypes: 'Alle',
      fromDate: 'Vanaf datum',
      toDate: 'Tot datum',
      pathOrMessage: 'Pad, bericht of referentie-ID',
      userQuery: 'Gebruikersnaam of gebruikers-ID',
      resultLimit: 'Resultaatlimiet',
      summaryTitle: 'Samenvatting',
      summarySubtitle: 'Overzicht van de momenteel gefilterde resultaten.',
      totalMatching: 'Totaal overeenkomend',
      mongoTimeouts: 'Mongo-time-outs',
      recentTitle: 'Recente websitefouten',
      recentSubtitle: 'Nieuwste foutpagina’s die aan gebruikers zijn getoond.',
      empty: 'Geen websitefouten gevonden voor deze filters.',
      unknownUser: 'Onbekende gebruiker',
        testGenericErrorButton: 'Genereer algemene testfout'
    }
  },
  pt: {
    navOwnerWebsiteErrors: 'Erros do site',
    error: {
      title: 'Algo deu errado',
      generic: 'Ocorreu um erro inesperado ao processar sua solicitação.',
      mongoTimeout: 'Ocorreu um problema temporário de conexão com o banco de dados. Atualize e tente novamente em instantes.',
      reference: 'ID de referência',
      reportIssue: 'Reportar ao proprietário do bot',
      reportSubject: 'Relatório de erro do site DiscoBot',
      reportIntro: 'Descreva o que aconteceu:',
      reportPage: 'Página',
      reportTime: 'Hora (UTC)',
      reportMessage: 'Mensagem'
    },
    errors: {
      websiteErrorsErrorTitle: 'Erro na página de erros do site',
      websiteErrorsErrorMessage: 'Não foi possível carregar os logs de erro do site.'
    },
    ownerWebsiteErrors: {
      title: 'Erros do site (Owner)',
      subtitle: 'Revise e filtre os erros do site encontrados pelos usuários.',
      filtersSubtitle: 'Filtre por status, tipo de erro, intervalo de datas, rota e usuário.',
      statusGroup: 'Grupo de status',
      allStatuses: 'Todos',
      errorType: 'Tipo de erro',
      allTypes: 'Todos',
      fromDate: 'Data inicial',
      toDate: 'Data final',
      pathOrMessage: 'Rota, mensagem ou ID de referência',
      userQuery: 'Nome de usuário ou ID do usuário',
      resultLimit: 'Limite de resultados',
      summaryTitle: 'Resumo',
      summarySubtitle: 'Visão geral dos resultados filtrados atuais.',
      totalMatching: 'Total correspondente',
      mongoTimeouts: 'Timeouts do Mongo',
      recentTitle: 'Erros recentes do site',
      recentSubtitle: 'Páginas de erro mais recentes mostradas aos usuários.',
      empty: 'Nenhum erro de site encontrado para este filtro.',
      unknownUser: 'Usuário desconhecido',
        testGenericErrorButton: 'Gerar erro genérico de teste'
    }
  },
  ja: {
    navOwnerWebsiteErrors: 'Webサイトエラー',
    error: {
      title: '問題が発生しました',
      generic: 'リクエスト処理中に予期しないエラーが発生しました。',
      mongoTimeout: '一時的なデータベース接続エラーが発生しました。ページを更新して、少し待ってから再試行してください。',
      reference: '参照ID',
      reportIssue: 'Botオーナーに報告',
      reportSubject: 'DiscoBot Webサイト エラーレポート',
      reportIntro: '発生した内容を記載してください:',
      reportPage: 'ページ',
      reportTime: '時刻 (UTC)',
      reportMessage: 'メッセージ'
    },
    errors: {
      websiteErrorsErrorTitle: 'Webサイトエラーページのエラー',
      websiteErrorsErrorMessage: 'Webサイトのエラーログを読み込めませんでした。'
    },
    ownerWebsiteErrors: {
      title: 'Webサイトエラー (Owner)',
      subtitle: 'ユーザーが遭遇したWebサイトエラーを確認・フィルタできます。',
      filtersSubtitle: 'ステータス、エラー種別、日付範囲、ルート、ユーザーで絞り込みます。',
      statusGroup: 'ステータス区分',
      allStatuses: 'すべて',
      errorType: 'エラー種別',
      allTypes: 'すべて',
      fromDate: '開始日',
      toDate: '終了日',
      pathOrMessage: 'パス、メッセージ、または参照ID',
      userQuery: 'ユーザー名またはユーザーID',
      resultLimit: '表示件数',
      summaryTitle: '概要',
      summarySubtitle: '現在の絞り込み結果のサマリーです。',
      totalMatching: '一致件数',
      mongoTimeouts: 'Mongoタイムアウト',
      recentTitle: '最近のWebサイトエラー',
      recentSubtitle: 'ユーザーに表示された最新のエラーページ。',
      empty: 'この条件でWebサイトエラーは見つかりませんでした。',
      unknownUser: '不明なユーザー',
        testGenericErrorButton: '汎用テストエラーを生成'
    }
  },
  ko: {
    navOwnerWebsiteErrors: '웹사이트 오류',
    error: {
      title: '문제가 발생했습니다',
      generic: '요청을 처리하는 중 예상치 못한 오류가 발생했습니다.',
      mongoTimeout: '일시적인 데이터베이스 연결 문제가 발생했습니다. 새로고침 후 잠시 뒤 다시 시도해 주세요.',
      reference: '참조 ID',
      reportIssue: '봇 소유자에게 신고',
      reportSubject: 'DiscoBot 웹사이트 오류 보고',
      reportIntro: '무슨 일이 있었는지 설명해 주세요:',
      reportPage: '페이지',
      reportTime: '시간 (UTC)',
      reportMessage: '메시지'
    },
    errors: {
      websiteErrorsErrorTitle: '웹사이트 오류 페이지 오류',
      websiteErrorsErrorMessage: '웹사이트 오류 로그를 불러오지 못했습니다.'
    },
    ownerWebsiteErrors: {
      title: '웹사이트 오류 (Owner)',
      subtitle: '사용자가 겪은 웹사이트 오류를 확인하고 필터링합니다.',
      filtersSubtitle: '상태, 오류 유형, 날짜 범위, 경로, 사용자로 필터링합니다.',
      statusGroup: '상태 그룹',
      allStatuses: '전체',
      errorType: '오류 유형',
      allTypes: '전체',
      fromDate: '시작 날짜',
      toDate: '종료 날짜',
      pathOrMessage: '경로, 메시지 또는 참조 ID',
      userQuery: '사용자명 또는 사용자 ID',
      resultLimit: '결과 제한',
      summaryTitle: '요약',
      summarySubtitle: '현재 필터 결과 요약입니다.',
      totalMatching: '총 일치',
      mongoTimeouts: 'Mongo 타임아웃',
      recentTitle: '최근 웹사이트 오류',
      recentSubtitle: '사용자에게 표시된 최신 오류 페이지입니다.',
      empty: '이 필터에 해당하는 웹사이트 오류가 없습니다.',
      unknownUser: '알 수 없는 사용자',
        testGenericErrorButton: '일반 테스트 오류 생성'
    }
  },
  zh: {
    navOwnerWebsiteErrors: '网站错误',
    error: {
      title: '发生错误',
      generic: '处理你的请求时发生了意外错误。',
      mongoTimeout: '发生了临时数据库连接问题。请刷新页面并稍后重试。',
      reference: '参考 ID',
      reportIssue: '报告给机器人所有者',
      reportSubject: 'DiscoBot 网站错误报告',
      reportIntro: '请描述发生了什么：',
      reportPage: '页面',
      reportTime: '时间 (UTC)',
      reportMessage: '消息'
    },
    errors: {
      websiteErrorsErrorTitle: '网站错误页面错误',
      websiteErrorsErrorMessage: '无法加载网站错误日志。'
    },
    ownerWebsiteErrors: {
      title: '网站错误（Owner）',
      subtitle: '查看并筛选用户遇到的网站错误。',
      filtersSubtitle: '按状态、错误类型、日期范围、路由和用户筛选。',
      statusGroup: '状态分组',
      allStatuses: '全部',
      errorType: '错误类型',
      allTypes: '全部',
      fromDate: '开始日期',
      toDate: '结束日期',
      pathOrMessage: '路径、消息或参考 ID',
      userQuery: '用户名或用户 ID',
      resultLimit: '结果数量',
      summaryTitle: '摘要',
      summarySubtitle: '当前筛选结果概览。',
      totalMatching: '匹配总数',
      mongoTimeouts: 'Mongo 超时',
      recentTitle: '最近的网站错误',
      recentSubtitle: '最近向用户显示的错误页面。',
      empty: '当前筛选条件下没有找到网站错误。',
      unknownUser: '未知用户',
        testGenericErrorButton: '生成通用测试错误'
    }
  },
  ru: {
    navOwnerWebsiteErrors: 'Ошибки сайта',
    error: {
      title: 'Что-то пошло не так',
      generic: 'Произошла непредвиденная ошибка при обработке вашего запроса.',
      mongoTimeout: 'Возникла временная проблема подключения к базе данных. Обновите страницу и попробуйте снова через минуту.',
      reference: 'ID ссылки',
      reportIssue: 'Сообщить владельцу бота',
      reportSubject: 'Отчёт об ошибке сайта DiscoBot',
      reportIntro: 'Опишите, что произошло:',
      reportPage: 'Страница',
      reportTime: 'Время (UTC)',
      reportMessage: 'Сообщение'
    },
    errors: {
      websiteErrorsErrorTitle: 'Ошибка страницы ошибок сайта',
      websiteErrorsErrorMessage: 'Не удалось загрузить журналы ошибок сайта.'
    },
    ownerWebsiteErrors: {
      title: 'Ошибки сайта (Owner)',
      subtitle: 'Просматривайте и фильтруйте ошибки сайта, с которыми столкнулись пользователи.',
      filtersSubtitle: 'Фильтр по статусу, типу ошибки, диапазону дат, маршруту и пользователю.',
      statusGroup: 'Группа статуса',
      allStatuses: 'Все',
      errorType: 'Тип ошибки',
      allTypes: 'Все',
      fromDate: 'Дата с',
      toDate: 'Дата по',
      pathOrMessage: 'Путь, сообщение или ID ссылки',
      userQuery: 'Имя пользователя или ID пользователя',
      resultLimit: 'Лимит результатов',
      summaryTitle: 'Сводка',
      summarySubtitle: 'Снимок текущих отфильтрованных результатов.',
      totalMatching: 'Всего совпадений',
      mongoTimeouts: 'Таймауты Mongo',
      recentTitle: 'Последние ошибки сайта',
      recentSubtitle: 'Последние страницы ошибок, показанные пользователям.',
      empty: 'Для этих фильтров ошибки сайта не найдены.',
      unknownUser: 'Неизвестный пользователь',
        testGenericErrorButton: 'Сгенерировать общую тестовую ошибку'
    }
  }
};

const extraOwnerWebsiteErrorKeys = {
  es: {
    typeMongoTimeout: 'Tiempo de espera de Mongo',
    typeServerError: 'Error del servidor',
    typeClientError: 'Error del cliente',
    pathPlaceholder: 'p. ej. /credits o ETIMEDOUT',
    userPlaceholder: 'p. ej. 1093318149732044870 o nombre de usuario'
  },
  de: {
    typeMongoTimeout: 'Mongo-Timeout',
    typeServerError: 'Serverfehler',
    typeClientError: 'Clientfehler',
    pathPlaceholder: 'z. B. /credits oder ETIMEDOUT',
    userPlaceholder: 'z. B. 1093318149732044870 oder Benutzername'
  },
  fr: {
    typeMongoTimeout: 'Timeout Mongo',
    typeServerError: 'Erreur serveur',
    typeClientError: 'Erreur client',
    pathPlaceholder: 'ex. : /credits ou ETIMEDOUT',
    userPlaceholder: 'ex. : 1093318149732044870 ou nom d’utilisateur'
  },
  it: {
    typeMongoTimeout: 'Timeout Mongo',
    typeServerError: 'Errore server',
    typeClientError: 'Errore client',
    pathPlaceholder: 'es. /credits o ETIMEDOUT',
    userPlaceholder: 'es. 1093318149732044870 o nome utente'
  },
  nl: {
    typeMongoTimeout: 'Mongo-time-out',
    typeServerError: 'Serverfout',
    typeClientError: 'Clientfout',
    pathPlaceholder: 'bijv. /credits of ETIMEDOUT',
    userPlaceholder: 'bijv. 1093318149732044870 of gebruikersnaam'
  },
  pt: {
    typeMongoTimeout: 'Timeout do Mongo',
    typeServerError: 'Erro de servidor',
    typeClientError: 'Erro de cliente',
    pathPlaceholder: 'ex.: /credits ou ETIMEDOUT',
    userPlaceholder: 'ex.: 1093318149732044870 ou nome de usuário'
  },
  ja: {
    typeMongoTimeout: 'Mongoタイムアウト',
    typeServerError: 'サーバーエラー',
    typeClientError: 'クライアントエラー',
    pathPlaceholder: '例: /credits または ETIMEDOUT',
    userPlaceholder: '例: 1093318149732044870 またはユーザー名'
  },
  ko: {
    typeMongoTimeout: 'Mongo 타임아웃',
    typeServerError: '서버 오류',
    typeClientError: '클라이언트 오류',
    pathPlaceholder: '예: /credits 또는 ETIMEDOUT',
    userPlaceholder: '예: 1093318149732044870 또는 사용자명'
  },
  zh: {
    typeMongoTimeout: 'Mongo 超时',
    typeServerError: '服务器错误',
    typeClientError: '客户端错误',
    pathPlaceholder: '例如：/credits 或 ETIMEDOUT',
    userPlaceholder: '例如：1093318149732044870 或用户名'
  },
  ru: {
    typeMongoTimeout: 'Таймаут Mongo',
    typeServerError: 'Ошибка сервера',
    typeClientError: 'Ошибка клиента',
    pathPlaceholder: 'напр. /credits или ETIMEDOUT',
    userPlaceholder: 'напр. 1093318149732044870 или имя пользователя'
  }
};

for (const [lang, values] of Object.entries(localized)) {
  const filePath = path.join(baseDir, lang, 'common.json');
  const content = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(content);

  json.nav = json.nav || {};
  json.nav.ownerWebsiteErrors = values.navOwnerWebsiteErrors;

  json.error = json.error || {};
  Object.assign(json.error, values.error);

  json.errors = json.errors || {};
  Object.assign(json.errors, values.errors);

  json.ownerWebsiteErrors = json.ownerWebsiteErrors || {};
  Object.assign(json.ownerWebsiteErrors, values.ownerWebsiteErrors);
  Object.assign(json.ownerWebsiteErrors, extraOwnerWebsiteErrorKeys[lang] || {});

  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  console.log(`updated ${lang}`);
}
