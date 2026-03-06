const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'locales');

const localized = {
  es: {
    title: 'Generar imagen IA en el sitio web',
    subtitle: 'Usa tus créditos personales de IA directamente en el sitio web, sin necesitar un canal de Discord.',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Ejemplo: Una ciudad retrofuturista al atardecer, luces neón, iluminación cinematográfica',
    button: 'Generar imagen (1 crédito)',
    sourceImageLabel: 'Imagen de origen',
    editPromptLabel: 'Prompt de edición',
    editPromptPlaceholder: 'Ejemplo: Convierte esto en una pintura de acuarela con tonos cálidos de atardecer',
    editButton: 'Editar imagen (1 crédito)',
    modeText: 'Texto a imagen',
    modeEdit: 'Edición de imagen',
    success: 'Imagen IA generada correctamente. Se usó 1 crédito.',
    noCredits: 'No tienes suficientes créditos de IA para generar una imagen.',
    invalidPrompt: 'Introduce un prompt válido antes de generar.',
    invalidImage: 'Sube una imagen de origen válida para el modo edición.',
    unavailable: 'La generación de imágenes en la web no está disponible ahora mismo. Inténtalo de nuevo más tarde.',
    failed: 'La generación de imagen falló. Tu crédito fue reembolsado.',
    download: 'Descargar'
  },
  de: {
    title: 'KI-Bild auf der Website generieren',
    subtitle: 'Nutze deine persönlichen KI-Guthaben direkt auf der Website, ohne einen Discord-Serverkanal zu benötigen.',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Beispiel: Eine retrofuturistische Skyline bei Sonnenuntergang, Neonlichter, cineastische Beleuchtung',
    button: 'Bild generieren (1 Guthaben)',
    sourceImageLabel: 'Quellbild',
    editPromptLabel: 'Bearbeitungs-Prompt',
    editPromptPlaceholder: 'Beispiel: Verwandle das in ein Aquarell mit warmen Sonnenuntergangstönen',
    editButton: 'Bild bearbeiten (1 Guthaben)',
    modeText: 'Text-zu-Bild',
    modeEdit: 'Bildbearbeitung',
    success: 'KI-Bild erfolgreich generiert. 1 Guthaben wurde verwendet.',
    noCredits: 'Du hast nicht genügend KI-Guthaben, um ein Bild zu generieren.',
    invalidPrompt: 'Bitte gib vor dem Generieren einen gültigen Prompt ein.',
    invalidImage: 'Bitte lade für den Bearbeitungsmodus ein gültiges Quellbild hoch.',
    unavailable: 'Web-Bildgenerierung ist derzeit nicht verfügbar. Bitte versuche es später erneut.',
    failed: 'Die Bildgenerierung ist fehlgeschlagen. Dein Guthaben wurde erstattet.',
    download: 'Herunterladen'
  },
  fr: {
    title: 'Générer une image IA sur le site web',
    subtitle: 'Utilisez vos crédits IA personnels directement sur le site, sans canal Discord.',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Exemple : Une skyline rétrofuturiste au coucher du soleil, néons, éclairage cinématographique',
    button: 'Générer l’image (1 crédit)',
    sourceImageLabel: 'Image source',
    editPromptLabel: 'Prompt d’édition',
    editPromptPlaceholder: 'Exemple : Transforme ceci en aquarelle avec des tons chauds de coucher de soleil',
    editButton: 'Éditer l’image (1 crédit)',
    modeText: 'Texte vers image',
    modeEdit: 'Édition d’image',
    success: 'Image IA générée avec succès. 1 crédit a été utilisé.',
    noCredits: 'Vous n’avez pas assez de crédits IA pour générer une image.',
    invalidPrompt: 'Veuillez saisir un prompt valide avant de générer.',
    invalidImage: 'Veuillez téléverser une image source valide pour le mode édition.',
    unavailable: 'La génération d’images web n’est pas disponible pour le moment. Réessayez plus tard.',
    failed: 'La génération d’image a échoué. Votre crédit a été remboursé.',
    download: 'Télécharger'
  },
  it: {
    title: 'Genera immagine AI dal sito web',
    subtitle: 'Usa i tuoi crediti AI personali direttamente dal sito, senza un canale Discord.',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Esempio: Uno skyline retro-futuristico al tramonto, luci al neon, illuminazione cinematografica',
    button: 'Genera immagine (1 credito)',
    sourceImageLabel: 'Immagine sorgente',
    editPromptLabel: 'Prompt di modifica',
    editPromptPlaceholder: 'Esempio: Trasforma questa immagine in un acquerello con toni caldi del tramonto',
    editButton: 'Modifica immagine (1 credito)',
    modeText: 'Testo in immagine',
    modeEdit: 'Modifica immagine',
    success: 'Immagine AI generata con successo. È stato usato 1 credito.',
    noCredits: 'Non hai abbastanza crediti AI per generare un’immagine.',
    invalidPrompt: 'Inserisci un prompt valido prima di generare.',
    invalidImage: 'Carica un’immagine sorgente valida per la modalità modifica.',
    unavailable: 'La generazione immagini dal web non è disponibile al momento. Riprova più tardi.',
    failed: 'La generazione dell’immagine è fallita. Il tuo credito è stato rimborsato.',
    download: 'Scarica'
  },
  nl: {
    title: 'AI-afbeelding genereren op de website',
    subtitle: 'Gebruik je persoonlijke AI-credits direct op de website, zonder Discord-kanaal.',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Voorbeeld: Een retrofuturistische skyline bij zonsondergang, neonlichten, filmische belichting',
    button: 'Afbeelding genereren (1 credit)',
    sourceImageLabel: 'Bronafbeelding',
    editPromptLabel: 'Bewerkingsprompt',
    editPromptPlaceholder: 'Voorbeeld: Verander dit in een aquarel met warme zonsondergangstinten',
    editButton: 'Afbeelding bewerken (1 credit)',
    modeText: 'Tekst-naar-afbeelding',
    modeEdit: 'Afbeelding bewerken',
    success: 'AI-afbeelding succesvol gegenereerd. 1 credit is gebruikt.',
    noCredits: 'Je hebt niet genoeg AI-credits om een afbeelding te genereren.',
    invalidPrompt: 'Voer een geldige prompt in voordat je genereert.',
    invalidImage: 'Upload een geldige bronafbeelding voor de bewerkmodus.',
    unavailable: 'Webafbeeldingsgeneratie is momenteel niet beschikbaar. Probeer later opnieuw.',
    failed: 'Afbeeldingsgeneratie mislukt. Je credit is teruggestort.',
    download: 'Downloaden'
  },
  pt: {
    title: 'Gerar imagem de IA no site',
    subtitle: 'Use seus créditos pessoais de IA diretamente no site, sem precisar de um canal no Discord.',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Exemplo: Um horizonte retrofuturista ao pôr do sol, luzes neon, iluminação cinematográfica',
    button: 'Gerar imagem (1 crédito)',
    sourceImageLabel: 'Imagem de origem',
    editPromptLabel: 'Prompt de edição',
    editPromptPlaceholder: 'Exemplo: Transforme isto em uma aquarela com tons quentes de pôr do sol',
    editButton: 'Editar imagem (1 crédito)',
    modeText: 'Texto para imagem',
    modeEdit: 'Edição de imagem',
    success: 'Imagem de IA gerada com sucesso. 1 crédito foi usado.',
    noCredits: 'Você não tem créditos de IA suficientes para gerar uma imagem.',
    invalidPrompt: 'Informe um prompt válido antes de gerar.',
    invalidImage: 'Envie uma imagem de origem válida para o modo de edição.',
    unavailable: 'A geração de imagens pelo site não está disponível no momento. Tente novamente mais tarde.',
    failed: 'A geração da imagem falhou. Seu crédito foi reembolsado.',
    download: 'Baixar'
  },
  ja: {
    title: 'WebサイトでAI画像を生成',
    subtitle: 'Discordのギルドチャンネルがなくても、個人のAIクレジットをWebサイトで直接使えます。',
    promptLabel: 'プロンプト',
    promptPlaceholder: '例: 夕焼けのレトロフューチャー都市、ネオン、シネマティック照明',
    button: '画像を生成 (1クレジット)',
    sourceImageLabel: '元画像',
    editPromptLabel: '編集プロンプト',
    editPromptPlaceholder: '例: これを暖色の夕景アクアレル風に変換して',
    editButton: '画像を編集 (1クレジット)',
    modeText: 'テキストから画像',
    modeEdit: '画像編集',
    success: 'AI画像を生成しました。1クレジット使用しました。',
    noCredits: '画像生成に必要なAIクレジットが不足しています。',
    invalidPrompt: '生成前に有効なプロンプトを入力してください。',
    invalidImage: '編集モードでは有効な元画像をアップロードしてください。',
    unavailable: '現在Web画像生成は利用できません。しばらくしてから再試行してください。',
    failed: '画像生成に失敗しました。クレジットは返却されました。',
    download: 'ダウンロード'
  },
  ko: {
    title: '웹사이트에서 AI 이미지 생성',
    subtitle: 'Discord 길드 채널 없이도 웹사이트에서 개인 AI 크레딧을 바로 사용할 수 있습니다.',
    promptLabel: '프롬프트',
    promptPlaceholder: '예시: 석양의 레트로 퓨처 도시 스카이라인, 네온 조명, 시네마틱 라이팅',
    button: '이미지 생성 (1크레딧)',
    sourceImageLabel: '원본 이미지',
    editPromptLabel: '편집 프롬프트',
    editPromptPlaceholder: '예시: 따뜻한 석양 톤의 수채화 스타일로 바꿔줘',
    editButton: '이미지 편집 (1크레딧)',
    modeText: '텍스트-이미지',
    modeEdit: '이미지 편집',
    success: 'AI 이미지가 생성되었습니다. 1크레딧이 사용되었습니다.',
    noCredits: '이미지를 생성할 AI 크레딧이 부족합니다.',
    invalidPrompt: '생성 전에 유효한 프롬프트를 입력해 주세요.',
    invalidImage: '편집 모드에서는 유효한 원본 이미지를 업로드해 주세요.',
    unavailable: '현재 웹 이미지 생성 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    failed: '이미지 생성에 실패했습니다. 크레딧이 환불되었습니다.',
    download: '다운로드'
  },
  zh: {
    title: '在网站上生成 AI 图片',
    subtitle: '无需 Discord 服务器频道，也可直接在网站使用你的个人 AI 积分。',
    promptLabel: '提示词',
    promptPlaceholder: '示例：日落时分的复古未来城市天际线、霓虹灯、电影级打光',
    button: '生成图片（1 积分）',
    sourceImageLabel: '源图片',
    editPromptLabel: '编辑提示词',
    editPromptPlaceholder: '示例：把这张图变成暖色夕阳调的水彩画风格',
    editButton: '编辑图片（1 积分）',
    modeText: '文生图',
    modeEdit: '图片编辑',
    success: 'AI 图片生成成功。已使用 1 积分。',
    noCredits: '你的 AI 积分不足，无法生成图片。',
    invalidPrompt: '请先输入有效提示词再生成。',
    invalidImage: '编辑模式请上传有效的源图片。',
    unavailable: '网页图片生成功能当前不可用，请稍后重试。',
    failed: '图片生成失败。你的积分已退回。',
    download: '下载'
  },
  ru: {
    title: 'Генерация AI-изображения на сайте',
    subtitle: 'Используйте личные AI-кредиты прямо на сайте без Discord-канала сервера.',
    promptLabel: 'Промпт',
    promptPlaceholder: 'Пример: Ретрофутуристический городской пейзаж на закате, неон, кинематографичный свет',
    button: 'Сгенерировать изображение (1 кредит)',
    sourceImageLabel: 'Исходное изображение',
    editPromptLabel: 'Промпт для редактирования',
    editPromptPlaceholder: 'Пример: Преврати это в акварель с тёплыми закатными тонами',
    editButton: 'Редактировать изображение (1 кредит)',
    modeText: 'Текст в изображение',
    modeEdit: 'Редактирование изображения',
    success: 'AI-изображение успешно создано. Использован 1 кредит.',
    noCredits: 'Недостаточно AI-кредитов для генерации изображения.',
    invalidPrompt: 'Введите корректный промпт перед генерацией.',
    invalidImage: 'Для режима редактирования загрузите корректное исходное изображение.',
    unavailable: 'Веб-генерация изображений сейчас недоступна. Попробуйте позже.',
    failed: 'Не удалось сгенерировать изображение. Кредит был возвращён.',
    download: 'Скачать'
  }
};

for (const [lang, values] of Object.entries(localized)) {
  const filePath = path.join(baseDir, lang, 'common.json');
  const content = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(content);

  if (!json.credits || typeof json.credits !== 'object') {
    json.credits = {};
  }
  if (!json.credits.generate || typeof json.credits.generate !== 'object') {
    json.credits.generate = {};
  }

  for (const [key, value] of Object.entries(values)) {
    json.credits.generate[key] = value;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  console.log(`updated ${lang}`);
}
