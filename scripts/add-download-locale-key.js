const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'locales');

const translations = {
  es: 'Descargar',
  de: 'Herunterladen',
  fr: 'Télécharger',
  it: 'Scarica',
  nl: 'Downloaden',
  pt: 'Baixar',
  ja: 'ダウンロード',
  ko: '다운로드',
  zh: '下载',
  ru: 'Скачать',
};

for (const [lang, label] of Object.entries(translations)) {
  const filePath = path.join(baseDir, lang, 'common.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);

  if (!json.credits) json.credits = {};
  if (!json.credits.generate || typeof json.credits.generate !== 'object') {
    json.credits.generate = {};
  }

  json.credits.generate.download = label;
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  console.log(`updated ${lang}`);
}
