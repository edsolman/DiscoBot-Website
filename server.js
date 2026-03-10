const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const i18next = require("i18next");
const i18nextMiddleware = require("i18next-http-middleware");
const i18nextFsBackend = require("i18next-fs-backend");
const MongoStore = require("connect-mongo");
const axios = require("axios");
const Stripe = require("stripe");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const { MongoClient, Long, ObjectId } = require("mongodb");
require("dotenv").config();

const {
  PORT = "3000",
  HOST,
  SESSION_SECRET,
  MONGODB_URI,
  SUPPORT_EMAIL,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_BOT_TOKEN,
  DISCORD_BOT_USER_ID,
  DISCORD_BOT_OWNER_ID,
} = process.env;

function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

const NODE_ENV = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";
const SERVER_HOST = String(HOST || process.env.SERVER_HOST || "0.0.0.0").trim() || "0.0.0.0";
const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY, IS_PRODUCTION);
const SESSION_COOKIE_SECURE = parseBooleanEnv(process.env.SESSION_COOKIE_SECURE, IS_PRODUCTION);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || process.env.WEBSITE_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const LOCAL_FALLBACK_HOST = SERVER_HOST === "0.0.0.0" ? "localhost" : SERVER_HOST;
const WEBSITE_BASE_URL = String(PUBLIC_BASE_URL || `http://${LOCAL_FALLBACK_HOST}:${PORT}`).replace(/\/$/, "");

const requiredVars = [
  "SESSION_SECRET",
  "MONGODB_URI",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "DISCORD_BOT_TOKEN",
  "DISCORD_BOT_USER_ID",
  "DISCORD_BOT_OWNER_ID",
];

for (const key of requiredVars) {
  if (!process.env[key] || process.env[key].trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const DISCORD_API_BASE = "https://discord.com/api/v10";
const OAUTH_SCOPES = ["identify", "guilds"];
const ADMINISTRATOR_BIT = 0x8n;
const SUPPORT_EMAIL_ADDRESS = String(SUPPORT_EMAIL || "").trim();
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || "").trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5").trim();
const SINGLE_CREDIT_UNIT_AMOUNT_CENTS = 49;
const BOT_OWNER_DISCORD_ID = String(DISCORD_BOT_OWNER_ID || "").trim();

const DEFAULT_CREDIT_PACKS = [
  { id: "single", credits: 1, unitAmountCents: 49, costUnitCents: 0, name: "Single" },
  { id: "starter", credits: 5, unitAmountCents: 199, costUnitCents: 0, name: "Starter" },
  { id: "creator", credits: 10, unitAmountCents: 349, costUnitCents: 0, name: "Creator" },
  { id: "creator_plus", credits: 20, unitAmountCents: 649, costUnitCents: 0, name: "Creator Plus" },
  { id: "pro", credits: 50, unitAmountCents: 1499, costUnitCents: 0, name: "Pro" },
];

const DEFAULT_SUBSCRIPTION_PLANS = [
  { id: "single_monthly", creditsPerMonth: 1, unitAmountCents: 39, costUnitCents: 0, name: "Single Monthly" },
  { id: "starter_monthly", creditsPerMonth: 5, unitAmountCents: 149, costUnitCents: 0, name: "Starter Monthly" },
  { id: "creator_monthly", creditsPerMonth: 10, unitAmountCents: 299, costUnitCents: 0, name: "Creator Monthly" },
  { id: "creator_plus_monthly", creditsPerMonth: 20, unitAmountCents: 549, costUnitCents: 0, name: "Creator Plus Monthly" },
  { id: "pro_monthly", creditsPerMonth: 50, unitAmountCents: 1299, costUnitCents: 0, name: "Pro Monthly" },
];

const DEFAULT_TRANSLATION_FREE_CHARACTER_LIMIT = 10000;
const DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS = [
  { id: "translation_starter_monthly", charactersPerMonth: 50000, unitAmountCents: 499, costUnitCents: 0, name: "Starter Translation" },
  { id: "translation_growth_monthly", charactersPerMonth: 150000, unitAmountCents: 1199, costUnitCents: 0, name: "Growth Translation" },
  { id: "translation_scale_monthly", charactersPerMonth: 500000, unitAmountCents: 2999, costUnitCents: 0, name: "Scale Translation" },
];

const DEFAULT_MODERATION_CHANNEL_DESCRIPTION =
  "Welcome to the DiscoBot Admin Moderation channel. This channel is only visible to administrators and will " +
  "flag up any potentially offensive, rude or otherwise unwanted messages posted by users. You will be able " +
  "to approve or reject and remove them. A log will be kept of how many moderated comments are made per user, " +
  "and how many of these were approved/rejected, to make it easy to see if you have any specific users " +
  "regularly posting offensive content. You will also have the opportunity to directly kick/ban a user from " +
  "the guild if required and it will send them a direct message informing them why they were kicked/banned.";

const DEFAULT_GAMIFICATION_CHANNEL_DESCRIPTION =
  "Track server engagement with XP, levels, and reputation. Top members are shown automatically in the leaderboard.";

const DEFAULT_AI_CHANNEL_TOPIC =
  "Generate AI images by right-clicking a message and selecting 'Apps > Generate AI Image'. " +
  "Use text-only for new images, or include text + an attached image to generate from that image.";

const OWNER_SETTINGS_DOC_ID = "global_owner_settings";
const SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "nl", "ja", "ko", "zh", "ru"];
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_LABELS = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ru: "Русский",
};

const DEFAULT_OWNER_SETTINGS = {
  website: {
    base_url: WEBSITE_BASE_URL,
  },
  channels: {
    gamification: {
      category_name: "DiscoBot",
      leaderboard_channel_name: "leaderboard",
      channel_description: DEFAULT_GAMIFICATION_CHANNEL_DESCRIPTION,
    },
    moderation: {
      category_name: "DiscoBot-Admin",
      channel_name: "admin-moderation",
      channel_description: DEFAULT_MODERATION_CHANNEL_DESCRIPTION,
    },
    ai_image: {
      category_name: "DiscoBot",
      channel_name: "ai-image-generation",
      channel_topic: DEFAULT_AI_CHANNEL_TOPIC,
    },
  },
  pricing: {
    credit_packs: DEFAULT_CREDIT_PACKS,
    subscription_plans: DEFAULT_SUBSCRIPTION_PLANS,
    guild_credit_packs: DEFAULT_CREDIT_PACKS,
    guild_subscription_plans: DEFAULT_SUBSCRIPTION_PLANS,
    translation_free_character_limit: DEFAULT_TRANSLATION_FREE_CHARACTER_LIMIT,
    translation_subscription_plans_guild: DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS,
    translation_subscription_plans_personal: DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS,
  },
};

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const mongoClient = new MongoClient(MONGODB_URI, {
  maxPoolSize: 20,
  minPoolSize: 1,
  connectTimeoutMS: 15000,
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 120000,
});
const mongoClientPromise = mongoClient.connect();
let db;
let guildsCollection;
let userDataCollection;
let aiImageCreditPurchasesCollection;
let aiImageCreditSubscriptionsCollection;
let aiImageUserCreditsCollection;
let aiImageWebGenerationsCollection;
let ownerSettingsCollection;
let aiImageDiscountCodesCollection;
let aiImageDiscountCodeUsagesCollection;
let websiteErrorLogsCollection;
let scheduledMessagesCollection;
let translationCharacterSubscriptionsCollection;
let translationCharacterPurchasesCollection;
let translationCharacterUserUsageCollection;
let ownerSettingsCache = JSON.parse(JSON.stringify(DEFAULT_OWNER_SETTINGS));

const app = express();
if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const aiImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const isImage = String(file?.mimetype || "").startsWith("image/");
    callback(null, isImage);
  },
});

i18next
  .use(i18nextFsBackend)
  .init({
    backend: {
      loadPath: path.join(__dirname, "locales/{{lng}}/{{ns}}.json"),
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    preload: SUPPORTED_LANGUAGES,
    ns: ["common"],
    defaultNS: "common",
    load: "languageOnly",
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
  })
  .catch((error) => {
    console.error("[ERROR] i18n initialization failed:", error?.message || error);
  });

app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Stripe webhook is not configured");
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook signature verification failed: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await fulfillStripeCheckoutSession(event.data.object);
    } else if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      await fulfillStripeSubscriptionInvoice(event.data.object);
    } else if (event.type === "customer.subscription.updated") {
      const subscriptionObj = event?.data?.object || {};
      const subscriptionId = String(subscriptionObj.id || "").trim();
      if (subscriptionId) {
        const statusPayload = {
          status: String(subscriptionObj.status || "active").trim().toLowerCase(),
          cancel_at_period_end: Boolean(subscriptionObj.cancel_at_period_end),
          current_period_end: subscriptionObj.current_period_end
            ? new Date(Number(subscriptionObj.current_period_end) * 1000)
            : null,
          canceled_at: subscriptionObj.canceled_at
            ? new Date(Number(subscriptionObj.canceled_at) * 1000)
            : null,
          updated_at: new Date(),
        };

        await aiImageCreditSubscriptionsCollection.updateOne(
          { stripe_subscription_id: subscriptionId },
          {
            $set: statusPayload,
          }
        );

        await translationCharacterSubscriptionsCollection.updateOne(
          { stripe_subscription_id: subscriptionId },
          {
            $set: statusPayload,
          }
        );

        const translationSub = await translationCharacterSubscriptionsCollection.findOne(
          { stripe_subscription_id: subscriptionId },
          { projection: { guild_id: 1, purchase_scope: 1 } }
        );
        if (
          translationSub?.guild_id &&
          (!translationSub?.purchase_scope || String(translationSub.purchase_scope) === "translation_guild")
        ) {
          await recomputeGuildTranslationCharacterAllowance(String(translationSub.guild_id));
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscriptionObj = event?.data?.object || {};
      const subscriptionId = String(subscriptionObj.id || "").trim();
      if (subscriptionId) {
        const statusPayload = {
          status: "canceled",
          cancel_at_period_end: true,
          current_period_end: subscriptionObj.current_period_end
            ? new Date(Number(subscriptionObj.current_period_end) * 1000)
            : null,
          canceled_at: subscriptionObj.canceled_at
            ? new Date(Number(subscriptionObj.canceled_at) * 1000)
            : new Date(),
          updated_at: new Date(),
        };

        await aiImageCreditSubscriptionsCollection.updateOne(
          { stripe_subscription_id: subscriptionId },
          {
            $set: statusPayload,
          }
        );

        await translationCharacterSubscriptionsCollection.updateOne(
          { stripe_subscription_id: subscriptionId },
          {
            $set: statusPayload,
          }
        );

        const translationSub = await translationCharacterSubscriptionsCollection.findOne(
          { stripe_subscription_id: subscriptionId },
          { projection: { guild_id: 1, purchase_scope: 1 } }
        );
        if (
          translationSub?.guild_id &&
          (!translationSub?.purchase_scope || String(translationSub.purchase_scope) === "translation_guild")
        ) {
          await recomputeGuildTranslationCharacterAllowance(String(translationSub.guild_id));
        }
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[ERROR] Stripe webhook processing failed", {
      type: event.type,
      message: error?.message,
    });
    return res.status(500).send("Webhook processing failed");
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "DiscoBot-App")));
app.use(express.static(path.join(__dirname, "public")));

const sessionStore = MongoStore.create({
  clientPromise: mongoClientPromise,
  dbName: "discobot_website",
  collectionName: "sessions",
  ttl: 60 * 60 * 24 * 7,
  touchAfter: 60 * 60,
});

sessionStore.on("error", (error) => {
  console.error("[ERROR] Session store operation failed:", error?.message || error);
});

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: SESSION_COOKIE_SECURE,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(i18nextMiddleware.handle(i18next));

function normalizeLanguage(rawLanguage) {
  const language = String(rawLanguage || "").trim().toLowerCase();
  if (!language) {
    return null;
  }

  if (SUPPORTED_LANGUAGES.includes(language)) {
    return language;
  }

  const baseLanguage = language.split("-")[0];
  if (SUPPORTED_LANGUAGES.includes(baseLanguage)) {
    return baseLanguage;
  }

  return null;
}

function resolvePreferredLanguage(req) {
  const fromQuery = normalizeLanguage(req.query?.lang);
  if (fromQuery) {
    return fromQuery;
  }

  const fromSession = normalizeLanguage(req.session?.preferredLanguage);
  if (fromSession) {
    return fromSession;
  }

  const accepted = req.acceptsLanguages?.(SUPPORTED_LANGUAGES);
  if (Array.isArray(accepted)) {
    for (const language of accepted) {
      const normalized = normalizeLanguage(language);
      if (normalized) {
        return normalized;
      }
    }
  }

  return normalizeLanguage(accepted) || DEFAULT_LANGUAGE;
}

app.use((req, res, next) => {
  const preferredLanguage = resolvePreferredLanguage(req);
  const isOwnerRoute = String(req.path || "").startsWith("/owner");
  const effectiveLanguage = isOwnerRoute ? "en" : preferredLanguage;

  if (req.session && req.session.preferredLanguage !== preferredLanguage) {
    req.session.preferredLanguage = preferredLanguage;
  }

  if (req.i18n && req.language !== effectiveLanguage) {
    req.i18n.changeLanguage(effectiveLanguage);
  }

  res.locals.currentUser = req.session.user || null;
  res.locals.pagePath = req.path;
  res.locals.t = req.t ? req.t.bind(req) : ((key) => key);
  res.locals.currentLanguage = effectiveLanguage;
  res.locals.supportedLanguages = SUPPORTED_LANGUAGES;
  res.locals.languageLabels = LANGUAGE_LABELS;
  res.locals.supportEmail = SUPPORT_EMAIL_ADDRESS;
  res.locals.isOwner = Boolean(
    req.session.user && BOT_OWNER_DISCORD_ID && String(req.session.user.id) === BOT_OWNER_DISCORD_ID
  );
  next();
});

function queueWebsiteErrorLog(req, res, renderedLocals) {
  if (!websiteErrorLogsCollection) {
    return;
  }

  const statusCode = Number.parseInt(String(res.statusCode || 500), 10) || 500;
  if (statusCode < 400) {
    return;
  }

  const title = String(renderedLocals?.title || "").trim();
  const message = String(renderedLocals?.message || "").trim();
  const errorId = String(renderedLocals?.errorId || crypto.randomUUID()).trim();
  const rawMessage = `${title} ${message}`;
  const errorType = /ETIMEDOUT|MongoServerSelectionError|server selection|database connection/i.test(rawMessage)
    ? "mongo_timeout"
    : statusCode >= 500
      ? "server_error"
      : "client_error";

  const user = req.session?.user || {};
  const logDoc = {
    error_id: errorId,
    http_status: statusCode,
    error_type: errorType,
    title,
    message,
    method: String(req.method || "GET"),
    path: String(req.originalUrl || req.path || ""),
    user_id: user?.id ? String(user.id) : null,
    username: String(user?.globalName || user?.username || "").trim() || null,
    session_id: String(req.sessionID || "").trim() || null,
    language: String(res.locals?.currentLanguage || "").trim() || null,
    user_agent: String(req.headers?.["user-agent"] || "").trim() || null,
    ip_address: String(req.ip || "").trim() || null,
    created_at: new Date(),
  };

  websiteErrorLogsCollection.insertOne(logDoc).catch((insertError) => {
    console.error("[WARN] Failed to persist website error log:", insertError?.message || insertError);
  });
}

app.use((req, res, next) => {
  const originalRender = res.render.bind(res);

  res.render = (view, locals, callback) => {
    const normalizedLocals =
      typeof locals === "function" || locals === undefined || locals === null
        ? {}
        : locals;
    const normalizedCallback = typeof locals === "function" ? locals : callback;

    if (String(view || "") === "error" && !res.locals.__websiteErrorLogged) {
      res.locals.__websiteErrorLogged = true;
      queueWebsiteErrorLog(req, res, normalizedLocals);
    }

    return originalRender(view, locals, normalizedCallback);
  };

  return next();
});

function snowflakeToLong(id) {
  return Long.fromString(String(id));
}

function guildIconUrl(guild) {
  if (!guild.icon) {
    return null;
  }
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

function defaultGamificationLevels() {
  return [
    { level: 0, name: "Newcomer", interactions_required: 0 },
    { level: 1, name: "Explorer", interactions_required: 10 },
    { level: 2, name: "Regular", interactions_required: 30 },
    { level: 3, name: "Veteran", interactions_required: 75 },
    { level: 4, name: "Elite", interactions_required: 150 },
  ];
}

function sanitizeLevels(rawLevels) {
  if (!Array.isArray(rawLevels) || rawLevels.length === 0) {
    return defaultGamificationLevels();
  }

  const levels = [];
  for (const row of rawLevels) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const level = Number.parseInt(String(row.level), 10);
    const interactionsRequired = Number.parseInt(String(row.interactions_required), 10);
    const name = String(row.name || row.level_name || "").trim();

    if (!Number.isFinite(level) || !Number.isFinite(interactionsRequired) || name.length === 0) {
      continue;
    }

    levels.push({
      level,
      name,
      interactions_required: Math.max(interactionsRequired, 0),
    });
  }

  if (levels.length === 0) {
    return defaultGamificationLevels();
  }

  levels.sort((a, b) => a.interactions_required - b.interactions_required);
  return levels;
}

function resolveLevelForXp(levels, xpValue) {
  const safeLevels = sanitizeLevels(levels);
  const xp = Math.max(Number.parseInt(String(xpValue || "0"), 10) || 0, 0);

  let selectedLevel = 0;
  let selectedName = "Newcomer";
  for (const row of safeLevels) {
    const required = Math.max(Number.parseInt(String(row.interactions_required || 0), 10) || 0, 0);
    if (xp >= required) {
      selectedLevel = Number.parseInt(String(row.level || selectedLevel), 10) || selectedLevel;
      selectedName = String(row.name || selectedName);
    } else {
      break;
    }
  }

  return {
    level: selectedLevel,
    levelName: selectedName,
  };
}

function parseSignedDelta(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(Math.min(parsed, 100000), -100000);
}

function sanitizeModerationCustomTerms(rawTerms) {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) {
    return [];
  }

  const normalizedTerms = [];
  const seen = new Set();

  for (const rawTerm of rawTerms) {
    const term = String(rawTerm || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!term || term.length < 2 || term.length > 64) {
      continue;
    }

    if (seen.has(term)) {
      continue;
    }

    seen.add(term);
    normalizedTerms.push(term);
  }

  normalizedTerms.sort((a, b) => a.localeCompare(b));
  return normalizedTerms;
}

function normalizeChannelSlug(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = raw
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeCategoryName(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 64);
  return normalized || fallback;
}

function normalizeDescription(value, fallback, maxLength = 1024) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
  return normalized || fallback;
}

function normalizeWebsiteBaseUrl(value, fallback) {
  const raw = String(value || "").trim();
  const fallbackUrl = String(fallback || WEBSITE_BASE_URL).trim() || WEBSITE_BASE_URL;
  if (!raw) {
    return fallbackUrl;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return fallbackUrl;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fallbackUrl;
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizePricingId(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function ensureUniquePricingRows(rows, fallbackRows, type) {
  const seen = new Set();
  const result = [];

  rows.forEach((row, index) => {
    const fallback = fallbackRows[index] || fallbackRows[fallbackRows.length - 1] || fallbackRows[0];
    if (!fallback) {
      return;
    }

    const id = normalizePricingId(row.id, fallback.id);
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);

    const name = normalizeDescription(row.name, fallback.name, 64);
    const unitAmountCents = toPositiveInt(row.unitAmountCents, fallback.unitAmountCents);
    const fallbackCost = toNonNegativeInt(fallback.costUnitCents, 0);
    const costUnitCents = toNonNegativeInt(row.costUnitCents, fallbackCost);

    if (type === "pack") {
      const credits = toPositiveInt(row.credits, fallback.credits);
      result.push({ id, name, credits, unitAmountCents, costUnitCents });
      return;
    }

    if (type === "translation_plan") {
      const charactersPerMonth = toPositiveInt(row.charactersPerMonth, fallback.charactersPerMonth);
      result.push({ id, name, charactersPerMonth, unitAmountCents, costUnitCents });
      return;
    }

    const creditsPerMonth = toPositiveInt(row.creditsPerMonth, fallback.creditsPerMonth);
    result.push({ id, name, creditsPerMonth, unitAmountCents, costUnitCents });
  });

  return result.length > 0 ? result : fallbackRows;
}

function sanitizeOwnerSettings(rawSettings) {
  const raw = rawSettings && typeof rawSettings === "object" ? rawSettings : {};

  const defaultWebsite = DEFAULT_OWNER_SETTINGS.website;
  const rawWebsite = raw.website && typeof raw.website === "object" ? raw.website : {};

  const defaultGamification = DEFAULT_OWNER_SETTINGS.channels.gamification;
  const defaultModeration = DEFAULT_OWNER_SETTINGS.channels.moderation;
  const defaultAiImage = DEFAULT_OWNER_SETTINGS.channels.ai_image;

  const rawChannels = raw.channels && typeof raw.channels === "object" ? raw.channels : {};
  const rawGamification = rawChannels.gamification && typeof rawChannels.gamification === "object"
    ? rawChannels.gamification
    : {};
  const rawModeration = rawChannels.moderation && typeof rawChannels.moderation === "object"
    ? rawChannels.moderation
    : {};
  const rawAiImage = rawChannels.ai_image && typeof rawChannels.ai_image === "object"
    ? rawChannels.ai_image
    : {};

  const rawPricing = raw.pricing && typeof raw.pricing === "object" ? raw.pricing : {};
  const packRows = Array.isArray(rawPricing.credit_packs) ? rawPricing.credit_packs : DEFAULT_CREDIT_PACKS;
  const planRows = Array.isArray(rawPricing.subscription_plans)
    ? rawPricing.subscription_plans
    : DEFAULT_SUBSCRIPTION_PLANS;
  const guildPackRows = Array.isArray(rawPricing.guild_credit_packs)
    ? rawPricing.guild_credit_packs
    : packRows;
  const guildPlanRows = Array.isArray(rawPricing.guild_subscription_plans)
    ? rawPricing.guild_subscription_plans
    : planRows;
  const translationGuildPlanRows = Array.isArray(rawPricing.translation_subscription_plans_guild)
    ? rawPricing.translation_subscription_plans_guild
    : Array.isArray(rawPricing.translation_subscription_plans)
      ? rawPricing.translation_subscription_plans
    : DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS;
  const translationPersonalPlanRows = Array.isArray(rawPricing.translation_subscription_plans_personal)
    ? rawPricing.translation_subscription_plans_personal
    : translationGuildPlanRows;
  const translationFreeLimit = toPositiveInt(
    rawPricing.translation_free_character_limit,
    DEFAULT_TRANSLATION_FREE_CHARACTER_LIMIT
  );

  const sanitizedGuildTranslationPlans = ensureUniquePricingRows(
    translationGuildPlanRows,
    DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS,
    "translation_plan"
  );

  const sanitizedPersonalTranslationPlans = ensureUniquePricingRows(
    translationPersonalPlanRows,
    sanitizedGuildTranslationPlans,
    "translation_plan"
  );

  return {
    website: {
      base_url: normalizeWebsiteBaseUrl(rawWebsite.base_url, defaultWebsite.base_url),
    },
    channels: {
      gamification: {
        category_name: normalizeCategoryName(rawGamification.category_name, defaultGamification.category_name),
        leaderboard_channel_name: normalizeChannelSlug(
          rawGamification.leaderboard_channel_name,
          defaultGamification.leaderboard_channel_name
        ),
        channel_description: normalizeDescription(
          rawGamification.channel_description,
          defaultGamification.channel_description,
          1024
        ),
      },
      moderation: {
        category_name: normalizeCategoryName(rawModeration.category_name, defaultModeration.category_name),
        channel_name: normalizeChannelSlug(rawModeration.channel_name, defaultModeration.channel_name),
        channel_description: normalizeDescription(
          rawModeration.channel_description,
          defaultModeration.channel_description,
          1024
        ),
      },
      ai_image: {
        category_name: normalizeCategoryName(rawAiImage.category_name, defaultAiImage.category_name),
        channel_name: normalizeChannelSlug(rawAiImage.channel_name, defaultAiImage.channel_name),
        channel_topic: normalizeDescription(rawAiImage.channel_topic, defaultAiImage.channel_topic, 1024),
      },
    },
    pricing: {
      credit_packs: ensureUniquePricingRows(packRows, DEFAULT_CREDIT_PACKS, "pack"),
      subscription_plans: ensureUniquePricingRows(planRows, DEFAULT_SUBSCRIPTION_PLANS, "plan"),
      guild_credit_packs: ensureUniquePricingRows(guildPackRows, DEFAULT_CREDIT_PACKS, "pack"),
      guild_subscription_plans: ensureUniquePricingRows(guildPlanRows, DEFAULT_SUBSCRIPTION_PLANS, "plan"),
      translation_free_character_limit: translationFreeLimit,
      translation_subscription_plans_guild: sanitizedGuildTranslationPlans,
      translation_subscription_plans_personal: sanitizedPersonalTranslationPlans,
    },
  };
}

function getOwnerSettings() {
  return ownerSettingsCache;
}

function getCreditPacks() {
  return getOwnerSettings().pricing.credit_packs;
}

function getSubscriptionPlans() {
  return getOwnerSettings().pricing.subscription_plans;
}

function getGuildCreditPacks() {
  const pricing = getOwnerSettings().pricing || {};
  const rows = Array.isArray(pricing.guild_credit_packs) ? pricing.guild_credit_packs : null;
  if (rows && rows.length > 0) {
    return rows;
  }
  return getCreditPacks();
}

function getGuildSubscriptionPlans() {
  const pricing = getOwnerSettings().pricing || {};
  const rows = Array.isArray(pricing.guild_subscription_plans) ? pricing.guild_subscription_plans : null;
  if (rows && rows.length > 0) {
    return rows;
  }
  return getSubscriptionPlans();
}

function getTranslationFreeCharacterLimit() {
  return Math.max(toSafeInt(getOwnerSettings().pricing.translation_free_character_limit), 1);
}

function getGuildTranslationSubscriptionPlans() {
  const pricing = getOwnerSettings().pricing || {};
  const guildPlans = Array.isArray(pricing.translation_subscription_plans_guild)
    ? pricing.translation_subscription_plans_guild
    : Array.isArray(pricing.translation_subscription_plans)
      ? pricing.translation_subscription_plans
      : DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS;

  if (!guildPlans.length) {
    return DEFAULT_TRANSLATION_SUBSCRIPTION_PLANS;
  }

  return guildPlans;
}

function getPersonalTranslationSubscriptionPlans() {
  const pricing = getOwnerSettings().pricing || {};
  const personalPlans = Array.isArray(pricing.translation_subscription_plans_personal)
    ? pricing.translation_subscription_plans_personal
    : null;

  if (personalPlans && personalPlans.length) {
    return personalPlans;
  }

  return getGuildTranslationSubscriptionPlans();
}

async function refreshOwnerSettingsCache() {
  if (!ownerSettingsCollection) {
    ownerSettingsCache = sanitizeOwnerSettings({});
    return ownerSettingsCache;
  }

  const raw = await ownerSettingsCollection.findOne({ _id: OWNER_SETTINGS_DOC_ID });
  ownerSettingsCache = sanitizeOwnerSettings(raw || {});
  return ownerSettingsCache;
}

function sanitizeModerationTerm(rawTerm) {
  const normalized = String(rawTerm || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized.length < 2 || normalized.length > 64) {
    return null;
  }
  return normalized;
}

function hasAdminPermission(guild) {
  if (guild.owner) {
    return true;
  }

  try {
    const permissionsBigInt = BigInt(guild.permissions || "0");
    return (permissionsBigInt & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT;
  } catch {
    return false;
  }
}

function normalizeCreditPackId(packIdRaw) {
  const packId = String(packIdRaw || "").trim().toLowerCase();
  return getCreditPacks().find((pack) => pack.id === packId) || null;
}

function normalizeSubscriptionPlanId(planIdRaw) {
  const planId = String(planIdRaw || "").trim().toLowerCase();
  const matchedNewPlan = getSubscriptionPlans().find((plan) => plan.id === planId);
  if (matchedNewPlan) {
    return matchedNewPlan;
  }

  if (planId === "starter_monthly") {
    return { id: "starter_monthly", creditsPerMonth: 40, unitAmountCents: 1499, name: "Starter Monthly" };
  }
  if (planId === "creator_monthly") {
    return { id: "creator_monthly", creditsPerMonth: 120, unitAmountCents: 3999, name: "Creator Monthly" };
  }
  if (planId === "pro_monthly") {
    return { id: "pro_monthly", creditsPerMonth: 320, unitAmountCents: 8999, name: "Pro Monthly" };
  }

  return null;
}

function normalizeGuildCreditPackId(packIdRaw) {
  const packId = String(packIdRaw || "").trim().toLowerCase();
  return getGuildCreditPacks().find((pack) => pack.id === packId) || null;
}

function normalizeGuildSubscriptionPlanId(planIdRaw) {
  const planId = String(planIdRaw || "").trim().toLowerCase();
  return getGuildSubscriptionPlans().find((plan) => plan.id === planId) || null;
}

function normalizeTranslationSubscriptionPlanId(planIdRaw, purchaseScope = "translation_guild") {
  const planId = String(planIdRaw || "").trim().toLowerCase();
  const normalizedScope = String(purchaseScope || "translation_guild").trim().toLowerCase();
  const plans = normalizedScope === "translation_user_personal"
    ? getPersonalTranslationSubscriptionPlans()
    : getGuildTranslationSubscriptionPlans();
  const matched = plans.find((plan) => plan.id === planId);
  if (matched) {
    return matched;
  }

  return null;
}

function computeSavingsPercent(credits, unitAmountCents) {
  const baseline = Number(credits || 0) * SINGLE_CREDIT_UNIT_AMOUNT_CENTS;
  if (!Number.isFinite(baseline) || baseline <= 0) {
    return 0;
  }
  const savingsRatio = 1 - Number(unitAmountCents || 0) / baseline;
  return Math.max(Math.round(savingsRatio * 100), 0);
}

function buildCreditPackOptions(options = {}) {
  const mostPopularPackIds = options?.mostPopularPackIds instanceof Set
    ? options.mostPopularPackIds
    : new Set();
  const purchaseCountByPackId = options?.purchaseCountByPackId instanceof Map
    ? options.purchaseCountByPackId
    : new Map();

  return getCreditPacks().map((pack) => ({
    ...pack,
    savingsPercent: computeSavingsPercent(pack.credits, pack.unitAmountCents),
    isMostPopular: mostPopularPackIds.has(pack.id),
    purchaseCount: Number.parseInt(String(purchaseCountByPackId.get(pack.id) || 0), 10) || 0,
  }));
}

async function getCreditPackPopularityData() {
  if (!aiImageCreditPurchasesCollection) {
    return {
      mostPopularPackIds: new Set(),
      purchaseCountByPackId: new Map(),
    };
  }

  const configuredPackIds = getCreditPacks().map((pack) => pack.id);
  if (!configuredPackIds.length) {
    return {
      mostPopularPackIds: new Set(),
      purchaseCountByPackId: new Map(),
    };
  }

  const aggregated = await aiImageCreditPurchasesCollection
    .aggregate([
      {
        $match: {
          pack_id: { $in: configuredPackIds },
        },
      },
      {
        $group: {
          _id: "$pack_id",
          purchaseCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const topCount = aggregated.reduce((maxCount, row) => {
    const count = Number.parseInt(String(row?.purchaseCount || 0), 10) || 0;
    return Math.max(maxCount, count);
  }, 0);

  const purchaseCountByPackId = new Map(
    aggregated
      .map((row) => [String(row?._id || "").trim(), Number.parseInt(String(row?.purchaseCount || 0), 10) || 0])
      .filter((entry) => Boolean(entry[0]))
  );

  if (topCount <= 0) {
    return {
      mostPopularPackIds: new Set(),
      purchaseCountByPackId,
    };
  }

  return {
    mostPopularPackIds: new Set(
      aggregated
        .filter((row) => (Number.parseInt(String(row?.purchaseCount || 0), 10) || 0) === topCount)
        .map((row) => String(row._id || "").trim())
        .filter(Boolean)
    ),
    purchaseCountByPackId,
  };
}

function buildSubscriptionPlanOptions() {
  return getSubscriptionPlans().map((plan) => ({
    ...plan,
    savingsPercent: computeSavingsPercent(plan.creditsPerMonth, plan.unitAmountCents),
  }));
}

function isStripeConfigured() {
  return Boolean(stripe && STRIPE_WEBHOOK_SECRET);
}

function buildCreditPurchaseMetadata({
  user,
  username,
  packId,
  subscriptionPlanId = "",
  purchaseScope = "ai_user_personal",
  guildId = "",
  guildName = "",
  discountCode = "",
  discountCents = 0,
}) {
  const normalizedScope = String(purchaseScope || "ai_user_personal").trim().toLowerCase();
  return {
    purchase_scope: normalizedScope,
    pack_id: String(packId || ""),
    subscription_plan_id: String(subscriptionPlanId || ""),
    discount_code: String(discountCode || ""),
    discount_cents: String(Math.max(Number.parseInt(String(discountCents || "0"), 10) || 0, 0)),
    guild_id: String(guildId || ""),
    guild_name: String(guildName || ""),
    user_id: String(user.id),
    username: String(username),
  };
}

function normalizeGuildAiCreditPolicy(rawPolicy) {
  const raw = rawPolicy && typeof rawPolicy === "object" ? rawPolicy : {};
  const defaultMonthlyCreditsPerMember = Math.max(
    toNonNegativeInt(raw.default_monthly_credits_per_member, 0),
    0
  );

  const seenUserIds = new Set();
  const memberOverrides = (Array.isArray(raw.member_overrides) ? raw.member_overrides : [])
    .map((row) => {
      const userId = String(row?.user_id || "").trim();
      if (!/^\d{5,25}$/.test(userId) || seenUserIds.has(userId)) {
        return null;
      }
      seenUserIds.add(userId);

      const username = String(row?.username || "").trim().slice(0, 64) || userId;
      const monthlyCredits = Math.max(toNonNegativeInt(row?.monthly_credits_per_month, 0), 0);
      return {
        user_id: userId,
        username,
        monthly_credits_per_month: monthlyCredits,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));

  return {
    default_monthly_credits_per_member: defaultMonthlyCreditsPerMember,
    member_overrides: memberOverrides,
  };
}

async function searchGuildMembersForAdmin(guildId, queryText, limit = 10) {
  const query = String(queryText || "").trim();
  if (!query) {
    return [];
  }

  const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/members/search`, {
    params: {
      query,
      limit: Math.min(Math.max(Number.parseInt(String(limit || 10), 10) || 10, 1), 25),
    },
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    timeout: 10000,
  });

  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows
    .map((row) => {
      const user = row?.user || {};
      const userId = String(user.id || "").trim();
      if (!/^\d{5,25}$/.test(userId)) {
        return null;
      }

      const username = String(
        row?.nick || user.global_name || user.username || userId
      ).trim().slice(0, 64);

      return {
        user_id: userId,
        username: username || userId,
      };
    })
    .filter(Boolean);
}

function buildTranslationSubscriptionMetadata({
  user,
  username,
  purchaseScope = "translation_guild",
  guildId = "",
  guildName = "",
  translationPlanId,
  discountCode = "",
  discountCents = 0,
}) {
  const normalizedScope = String(purchaseScope || "translation_guild").trim().toLowerCase();

  return {
    purchase_scope: normalizedScope,
    translation_plan_id: String(translationPlanId || ""),
    discount_code: String(discountCode || ""),
    discount_cents: String(Math.max(Number.parseInt(String(discountCents || "0"), 10) || 0, 0)),
    guild_id: String(guildId || ""),
    guild_name: String(guildName || ""),
    user_id: String(user.id),
    username: String(username),
  };
}

async function getUserMonthlyTranslationCharacterUsage(userId) {
  const { year, month } = getCurrentUtcYearMonth();
  const userIdAsNumber = Number.parseInt(String(userId), 10);
  const userIdCandidates = [snowflakeToLong(userId), String(userId)];
  if (Number.isFinite(userIdAsNumber)) {
    userIdCandidates.push(userIdAsNumber);
  }

  const usageDoc = await translationCharacterUserUsageCollection.findOne(
    {
      user_id: { $in: userIdCandidates },
      year,
      month,
    },
    {
      projection: {
        translation_character_count: 1,
      },
    }
  );

  return Math.max(toSafeInt(usageDoc?.translation_character_count), 0);
}

async function getUserTranslationCharacterAllowance(userId) {
  const userIdAsNumber = Number.parseInt(String(userId), 10);
  const userIdCandidates = [snowflakeToLong(userId), String(userId)];
  if (Number.isFinite(userIdAsNumber)) {
    userIdCandidates.push(userIdAsNumber);
  }

  const activeStatuses = Array.from(getActiveSubscriptionStatusSet());
  const rows = await translationCharacterSubscriptionsCollection
    .find(
      {
        purchase_scope: "translation_user_personal",
        user_id: { $in: userIdCandidates },
        status: { $in: activeStatuses },
      },
      {
        projection: {
          characters_per_month: 1,
        },
      }
    )
    .toArray();

  return rows.reduce((total, row) => total + Math.max(toSafeInt(row.characters_per_month), 0), 0);
}

async function getDisplayActivePersonalTranslationSubscriptions(userId) {
  const userIdAsNumber = Number.parseInt(String(userId), 10);
  const userIdCandidates = [snowflakeToLong(userId), String(userId)];
  if (Number.isFinite(userIdAsNumber)) {
    userIdCandidates.push(userIdAsNumber);
  }

  return translationCharacterSubscriptionsCollection
    .find(
      {
        purchase_scope: "translation_user_personal",
        user_id: { $in: userIdCandidates },
        status: { $in: Array.from(getActiveSubscriptionStatusSet()) },
      },
      {
        projection: {
          stripe_subscription_id: 1,
          plan_id: 1,
          characters_per_month: 1,
          status: 1,
          cancel_at_period_end: 1,
          current_period_end: 1,
          canceled_at: 1,
          updated_at: 1,
        },
      }
    )
    .sort({ updated_at: -1 })
    .limit(20)
    .toArray();
}

function toSafeInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    const numeric = value.toNumber();
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  }

  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCurrentUtcYearMonth() {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  };
}

function getActiveSubscriptionStatusSet() {
  return new Set(["active", "trialing", "past_due", "unpaid"]);
}

async function getGuildMonthlyTranslationCharacterUsage(guildId) {
  const { year, month } = getCurrentUtcYearMonth();
  const guildIdAsNumber = Number.parseInt(String(guildId), 10);
  const guildIdCandidates = [snowflakeToLong(guildId), String(guildId)];
  if (Number.isFinite(guildIdAsNumber)) {
    guildIdCandidates.push(guildIdAsNumber);
  }

  const usageDoc = await db.collection("guild_data").findOne(
    {
      guild_id: { $in: guildIdCandidates },
      year,
      month,
    },
    {
      projection: {
        translation_character_count: 1,
      },
    }
  );

  return Math.max(toSafeInt(usageDoc?.translation_character_count), 0);
}

async function getGuildMonthlyAiImageUsage(guildId) {
  const { year, month } = getCurrentUtcYearMonth();
  const guildIdAsNumber = Number.parseInt(String(guildId), 10);
  const guildIdCandidates = [snowflakeToLong(guildId), String(guildId)];
  if (Number.isFinite(guildIdAsNumber)) {
    guildIdCandidates.push(guildIdAsNumber);
  }

  const usageDoc = await db.collection("guild_data").findOne(
    {
      guild_id: { $in: guildIdCandidates },
      year,
      month,
    },
    {
      projection: {
        ai_image_gen_count: 1,
      },
    }
  );

  return Math.max(toSafeInt(usageDoc?.ai_image_gen_count), 0);
}

async function recomputeGuildTranslationCharacterAllowance(guildId) {
  const guildIdAsNumber = Number.parseInt(String(guildId), 10);
  const guildIdCandidates = [snowflakeToLong(guildId), String(guildId)];
  if (Number.isFinite(guildIdAsNumber)) {
    guildIdCandidates.push(guildIdAsNumber);
  }

  const activeStatuses = Array.from(getActiveSubscriptionStatusSet());
  const rows = await translationCharacterSubscriptionsCollection
    .find(
      {
        $or: [
          { purchase_scope: { $exists: false } },
          { purchase_scope: "translation_guild" },
          { purchase_scope: "" },
          { purchase_scope: null },
        ],
        guild_id: { $in: guildIdCandidates },
        status: { $in: activeStatuses },
      },
      {
        projection: {
          characters_per_month: 1,
        },
      }
    )
    .toArray();

  const freeLimit = getTranslationFreeCharacterLimit();
  const purchasedExtra = rows.reduce((total, row) => total + Math.max(toSafeInt(row.characters_per_month), 0), 0);
  const nextAllowance = freeLimit + purchasedExtra;

  const filterCandidates = [snowflakeToLong(guildId), String(guildId)];
  if (Number.isFinite(guildIdAsNumber)) {
    filterCandidates.push(guildIdAsNumber);
  }

  await guildsCollection.updateOne(
    { guild_id: { $in: filterCandidates } },
    {
      $set: {
        guild_id: snowflakeToLong(guildId),
        translationcharacterallowance: nextAllowance,
        updated_at: new Date(),
      },
      $setOnInsert: {
        created_at: new Date(),
        sku: "Free",
        translationallowance: 500,
        aiimagegenallowance: 50,
      },
    },
    { upsert: true }
  );

  return nextAllowance;
}

async function migrateLegacyUserCreditsToGlobalWallet(userId, username = "Unknown") {
  const userSnowflake = snowflakeToLong(userId);
  const now = new Date();

  const [walletDoc, legacyRows] = await Promise.all([
    aiImageUserCreditsCollection.findOne(
      { user_id: userSnowflake },
      {
        projection: {
          ai_image_credits_balance: 1,
          ai_image_credits_purchased_total: 1,
          ai_image_credits_used_total: 1,
          migrated_legacy_wallet_at: 1,
        },
      }
    ),
    userDataCollection
      .find(
        {
          $or: [{ user_id: userSnowflake }, { user_id: String(userId) }],
        },
        {
          projection: {
            username: 1,
            ai_image_credits_balance: 1,
            ai_image_credits_purchased_total: 1,
            ai_image_credits_used_total: 1,
          },
        }
      )
      .toArray(),
  ]);

  if (walletDoc?.migrated_legacy_wallet_at) {
    return;
  }

  const legacyTotals = legacyRows.reduce(
    (acc, row) => {
      acc.balance += Math.max(toSafeInt(row?.ai_image_credits_balance), 0);
      acc.purchased += Math.max(toSafeInt(row?.ai_image_credits_purchased_total), 0);
      acc.used += Math.max(toSafeInt(row?.ai_image_credits_used_total), 0);
      return acc;
    },
    { balance: 0, purchased: 0, used: 0 }
  );

  if (legacyTotals.balance === 0 && legacyTotals.purchased === 0 && legacyTotals.used === 0) {
    if (walletDoc) {
      await aiImageUserCreditsCollection.updateOne(
        { user_id: userSnowflake },
        {
          $set: {
            migrated_legacy_wallet_at: now,
            updated_at: now,
          },
        }
      );
    }
    return;
  }

  const resolvedUsername =
    String(
      legacyRows.find((row) => String(row?.username || "").trim() !== "")?.username ||
        username ||
        "Unknown"
    ).trim() || "Unknown";

  if (!walletDoc) {
    await aiImageUserCreditsCollection.updateOne(
      { user_id: userSnowflake },
      {
        $setOnInsert: {
          user_id: userSnowflake,
          username: resolvedUsername,
          ai_image_credits_balance: legacyTotals.balance,
          ai_image_credits_purchased_total: legacyTotals.purchased,
          ai_image_credits_used_total: legacyTotals.used,
          migrated_legacy_wallet_at: now,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true }
    );
    return;
  }

  await aiImageUserCreditsCollection.updateOne(
    { user_id: userSnowflake },
    {
      $set: {
        username: resolvedUsername,
        migrated_legacy_wallet_at: now,
        updated_at: now,
      },
      $inc: {
        ai_image_credits_balance: legacyTotals.balance,
        ai_image_credits_purchased_total: legacyTotals.purchased,
        ai_image_credits_used_total: legacyTotals.used,
      },
    }
  );
}

async function reconcileUserSubscriptionStatuses(userId) {
  if (!stripe) {
    return;
  }

  const userSnowflake = snowflakeToLong(userId);
  const localActiveSubs = await aiImageCreditSubscriptionsCollection
    .find(
      {
        user_id: userSnowflake,
        status: { $in: ["active", "trialing", "past_due", "unpaid"] },
      },
      {
        projection: {
          stripe_subscription_id: 1,
          status: 1,
          cancel_at_period_end: 1,
          current_period_end: 1,
        },
      }
    )
    .toArray();

  for (const row of localActiveSubs) {
    const subscriptionId = String(row?.stripe_subscription_id || "").trim();
    if (!subscriptionId) {
      continue;
    }

    let liveStatus = "";
    let cancelAtPeriodEnd = false;
    let canceledAtDate = null;
    let currentPeriodEndDate = null;
    try {
      const remoteSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      liveStatus = String(remoteSubscription?.status || "").trim().toLowerCase();
      cancelAtPeriodEnd = Boolean(remoteSubscription?.cancel_at_period_end);
      canceledAtDate = remoteSubscription?.canceled_at
        ? new Date(Number(remoteSubscription.canceled_at) * 1000)
        : null;
      currentPeriodEndDate = remoteSubscription?.current_period_end
        ? new Date(Number(remoteSubscription.current_period_end) * 1000)
        : null;
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.raw?.statusCode || 0);
      if (statusCode === 404) {
        liveStatus = "canceled";
      } else {
        continue;
      }
    }

    const storedStatus = String(row?.status || "").trim().toLowerCase();
    const storedCancelAtPeriodEnd = Boolean(row?.cancel_at_period_end);
    const storedCurrentPeriodEndMs = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0;
    const liveCurrentPeriodEndMs = currentPeriodEndDate ? currentPeriodEndDate.getTime() : 0;

    if (
      !liveStatus ||
      (liveStatus === storedStatus &&
        storedCancelAtPeriodEnd === cancelAtPeriodEnd &&
        storedCurrentPeriodEndMs === liveCurrentPeriodEndMs)
    ) {
      continue;
    }

    await aiImageCreditSubscriptionsCollection.updateOne(
      { stripe_subscription_id: subscriptionId },
      {
        $set: {
          status: liveStatus,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: currentPeriodEndDate,
          canceled_at: canceledAtDate,
          updated_at: new Date(),
        },
      }
    );
  }
}

async function reconcilePersonalTranslationSubscriptionStatuses(userId) {
  if (!stripe) {
    return;
  }

  const userSnowflake = snowflakeToLong(userId);
  const localActiveSubs = await translationCharacterSubscriptionsCollection
    .find(
      {
        purchase_scope: "translation_user_personal",
        user_id: userSnowflake,
        status: { $in: ["active", "trialing", "past_due", "unpaid"] },
      },
      {
        projection: {
          stripe_subscription_id: 1,
          status: 1,
          cancel_at_period_end: 1,
          current_period_end: 1,
        },
      }
    )
    .toArray();

  for (const row of localActiveSubs) {
    const subscriptionId = String(row?.stripe_subscription_id || "").trim();
    if (!subscriptionId) {
      continue;
    }

    let liveStatus = "";
    let cancelAtPeriodEnd = false;
    let canceledAtDate = null;
    let currentPeriodEndDate = null;
    try {
      const remoteSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      liveStatus = String(remoteSubscription?.status || "").trim().toLowerCase();
      cancelAtPeriodEnd = Boolean(remoteSubscription?.cancel_at_period_end);
      canceledAtDate = remoteSubscription?.canceled_at
        ? new Date(Number(remoteSubscription.canceled_at) * 1000)
        : null;
      currentPeriodEndDate = remoteSubscription?.current_period_end
        ? new Date(Number(remoteSubscription.current_period_end) * 1000)
        : null;
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.raw?.statusCode || 0);
      if (statusCode === 404) {
        liveStatus = "canceled";
      } else {
        continue;
      }
    }

    const storedStatus = String(row?.status || "").trim().toLowerCase();
    const storedCancelAtPeriodEnd = Boolean(row?.cancel_at_period_end);
    const storedCurrentPeriodEndMs = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0;
    const liveCurrentPeriodEndMs = currentPeriodEndDate ? currentPeriodEndDate.getTime() : 0;

    if (
      !liveStatus ||
      (liveStatus === storedStatus &&
        storedCancelAtPeriodEnd === cancelAtPeriodEnd &&
        storedCurrentPeriodEndMs === liveCurrentPeriodEndMs)
    ) {
      continue;
    }

    await translationCharacterSubscriptionsCollection.updateOne(
      { stripe_subscription_id: subscriptionId },
      {
        $set: {
          status: liveStatus,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: currentPeriodEndDate,
          canceled_at: canceledAtDate,
          updated_at: new Date(),
        },
      }
    );
  }
}

async function getDisplayActiveSubscriptions(userId) {
  const userSnowflake = snowflakeToLong(userId);
  const activeStatuses = new Set(["active", "trialing", "past_due", "unpaid"]);
  const now = new Date();

  function isScheduledCancelStillActive(rowLike) {
    const cancelAtPeriodEnd = Boolean(rowLike?.cancel_at_period_end);
    const periodEnd = rowLike?.current_period_end ? new Date(rowLike.current_period_end) : null;
    if (!cancelAtPeriodEnd || !periodEnd) {
      return false;
    }
    return periodEnd.getTime() > now.getTime();
  }

  const rows = await aiImageCreditSubscriptionsCollection
    .find(
      {
        user_id: userSnowflake,
      },
      {
        projection: {
          stripe_subscription_id: 1,
          stripe_customer_id: 1,
          plan_id: 1,
          credits_per_month: 1,
          status: 1,
          cancel_at_period_end: 1,
          current_period_end: 1,
          canceled_at: 1,
          created_at: 1,
          updated_at: 1,
        },
      }
    )
    .sort({ created_at: -1 })
    .limit(50)
    .toArray();

  if (!stripe) {
    return rows.filter((row) => {
      const status = String(row?.status || "").trim().toLowerCase();
      return activeStatuses.has(status) || isScheduledCancelStillActive(row);
    });
  }

  const visible = [];
  for (const row of rows) {
    const subscriptionId = String(row?.stripe_subscription_id || "").trim();
    if (!subscriptionId) {
      continue;
    }

    let liveStatus = String(row?.status || "").trim().toLowerCase();
    let cancelAtPeriodEnd = false;
    let verifiedFromStripe = false;
    let currentPeriodEndDate = row?.current_period_end ? new Date(row.current_period_end) : null;
    let canceledAtDate = row?.canceled_at ? new Date(row.canceled_at) : null;
    try {
      const remoteSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      verifiedFromStripe = true;
      liveStatus = String(remoteSubscription?.status || liveStatus).trim().toLowerCase();
      cancelAtPeriodEnd = Boolean(remoteSubscription?.cancel_at_period_end);
      currentPeriodEndDate = remoteSubscription?.current_period_end
        ? new Date(Number(remoteSubscription.current_period_end) * 1000)
        : null;
      canceledAtDate = remoteSubscription?.canceled_at ? new Date(Number(remoteSubscription.canceled_at) * 1000) : null;

      const remoteCustomerId = String(remoteSubscription?.customer || "").trim();

      await aiImageCreditSubscriptionsCollection.updateOne(
        { stripe_subscription_id: subscriptionId },
        {
          $set: {
            status: liveStatus,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_end: currentPeriodEndDate,
            stripe_customer_id: remoteCustomerId || String(row?.stripe_customer_id || "").trim(),
            canceled_at: canceledAtDate || null,
            updated_at: new Date(),
          },
        }
      );
    } catch (error) {
      const statusCode = Number(error?.statusCode || error?.raw?.statusCode || 0);
      if (statusCode === 404) {
        verifiedFromStripe = true;
        liveStatus = "canceled";
        await aiImageCreditSubscriptionsCollection.updateOne(
          { stripe_subscription_id: subscriptionId },
          {
            $set: {
              status: "canceled",
              cancel_at_period_end: true,
              canceled_at: new Date(),
              updated_at: new Date(),
            },
          }
        );
      }
    }

    const candidateRow = {
      ...row,
      status: liveStatus,
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_end: currentPeriodEndDate,
      canceled_at: canceledAtDate,
    };

    const shouldDisplay =
      (verifiedFromStripe && activeStatuses.has(liveStatus)) || isScheduledCancelStillActive(candidateRow);

    if (shouldDisplay) {
      visible.push({
        ...candidateRow,
      });
    }
  }

  return visible;
}

async function fulfillStripeCheckoutSession(checkoutSession) {
  if (!checkoutSession) {
    return 0;
  }

  async function grantUserCredits({
    userId,
    username,
    credits,
    packId,
    paymentType,
    stripeSessionId = "",
    stripeInvoiceId = "",
    stripeSubscriptionId = "",
    amountTotalCents = 0,
    currency = "usd",
    discountCode = "",
    discountCents = 0,
  }) {
    const userSnowflake = snowflakeToLong(userId);
    const now = new Date();

    let idempotencyFilter;
    if (stripeInvoiceId) {
      idempotencyFilter = { stripe_invoice_id: stripeInvoiceId };
    } else if (stripeSessionId) {
      idempotencyFilter = { stripe_session_id: stripeSessionId };
    } else {
      throw new Error("Missing idempotency key for Stripe credit grant");
    }

    const idempotencyResult = await aiImageCreditPurchasesCollection.updateOne(
      idempotencyFilter,
      {
        $setOnInsert: {
          stripe_session_id: stripeSessionId || undefined,
          stripe_invoice_id: stripeInvoiceId || undefined,
          stripe_subscription_id: stripeSubscriptionId || undefined,
          user_id: userSnowflake,
          username,
          credits,
          pack_id: packId,
          payment_provider: "stripe",
          payment_status: "completed",
          payment_type: paymentType,
          amount_total_cents: amountTotalCents,
          currency,
          discount_code: String(discountCode || ""),
          discount_cents: Math.max(Number.parseInt(String(discountCents || "0"), 10) || 0, 0),
          created_at: now,
        },
      },
      { upsert: true }
    );

    if (idempotencyResult.upsertedCount === 0) {
      return 0;
    }

    await aiImageUserCreditsCollection.updateOne(
      {
        user_id: userSnowflake,
      },
      {
        $set: {
          user_id: userSnowflake,
          username,
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
        $inc: {
          ai_image_credits_balance: credits,
          ai_image_credits_purchased_total: credits,
        },
      },
      { upsert: true }
    );

    const normalizedDiscountCode = normalizeDiscountCode(discountCode);
    if (normalizedDiscountCode) {
      await aiImageDiscountCodesCollection.updateOne(
        { code: normalizedDiscountCode },
        {
          $inc: {
            uses_count: 1,
          },
          $set: {
            updated_at: now,
          },
        }
      );

      await aiImageDiscountCodeUsagesCollection.insertOne({
        code: normalizedDiscountCode,
        user_id: userSnowflake,
        username,
        pack_id: packId,
        payment_type: paymentType,
        amount_total_cents: amountTotalCents,
        discount_cents: Math.max(Number.parseInt(String(discountCents || "0"), 10) || 0, 0),
        stripe_session_id: stripeSessionId || undefined,
        stripe_invoice_id: stripeInvoiceId || undefined,
        stripe_subscription_id: stripeSubscriptionId || undefined,
        used_at: now,
      });
    }

    return Math.max(Number.parseInt(String(credits || "0"), 10) || 0, 0);
  }

  async function incrementGuildAiAllowanceCredits({ guildId, guildName, userId, credits, now = new Date() }) {
    const safeCredits = Math.max(Number.parseInt(String(credits || "0"), 10) || 0, 0);
    if (!guildId || !userId || safeCredits <= 0) {
      return;
    }

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guildName,
          updated_at: now,
        },
        $inc: {
          aiimagegenallowance: safeCredits,
        },
        $setOnInsert: {
          created_at: now,
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          installer_user_id: userId,
        },
      },
      { upsert: true }
    );
  }

  async function upsertAiGuildCreditPurchase({
    idempotencyFilter,
    stripeSessionId = "",
    stripeInvoiceId = "",
    stripeSubscriptionId = "",
    guildId,
    guildName,
    userId,
    username,
    credits,
    packId,
    paymentType,
    amountTotalCents,
    currency,
    discountCode,
    discountCents,
    now = new Date(),
  }) {
    return aiImageCreditPurchasesCollection.updateOne(
      idempotencyFilter,
      {
        $setOnInsert: {
          stripe_session_id: stripeSessionId || undefined,
          stripe_invoice_id: stripeInvoiceId || undefined,
          stripe_subscription_id: stripeSubscriptionId || undefined,
          purchase_scope: "ai_guild",
          guild_id: snowflakeToLong(guildId),
          guild_name: guildName,
          user_id: snowflakeToLong(userId),
          username,
          credits,
          pack_id: packId,
          payment_provider: "stripe",
          payment_status: "completed",
          payment_type: paymentType,
          amount_total_cents: Number(amountTotalCents || 0),
          currency: String(currency || "usd"),
          discount_code: String(discountCode || ""),
          discount_cents: Math.max(Number.parseInt(String(discountCents || "0"), 10) || 0, 0),
          created_at: now,
        },
      },
      { upsert: true }
    );
  }

  if (checkoutSession.mode === "subscription") {
    const metadata = checkoutSession.metadata || {};
    if (String(metadata.purchase_scope || "").trim().toLowerCase() === "ai_guild") {
      const stripeSubscriptionId = String(checkoutSession.subscription || "").trim();
      const guildId = String(metadata.guild_id || "").trim();
      const guildName = String(metadata.guild_name || "").trim() || "Unknown Guild";
      const userId = String(metadata.user_id || "").trim();
      const username = String(metadata.username || "Unknown").trim() || "Unknown";
      const plan = normalizeGuildSubscriptionPlanId(metadata.subscription_plan_id);
      const discountCode = normalizeDiscountCode(metadata.discount_code);
      const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);

      if (!stripeSubscriptionId || !guildId || !userId || !plan) {
        return 0;
      }

      const now = new Date();

      await aiImageCreditSubscriptionsCollection.updateOne(
        { stripe_subscription_id: stripeSubscriptionId },
        {
          $set: {
            stripe_subscription_id: stripeSubscriptionId,
            stripe_customer_id: String(checkoutSession.customer || ""),
            purchase_scope: "ai_guild",
            guild_id: snowflakeToLong(guildId),
            guild_name: guildName,
            user_id: snowflakeToLong(userId),
            username,
            plan_id: plan.id,
            credits_per_month: plan.creditsPerMonth,
            status: "active",
            cancel_at_period_end: false,
            current_period_end: checkoutSession.expires_at
              ? new Date(Number(checkoutSession.expires_at) * 1000)
              : null,
            updated_at: now,
          },
          $setOnInsert: {
            created_at: now,
          },
        },
        { upsert: true }
      );

      const purchaseResult = await upsertAiGuildCreditPurchase({
        idempotencyFilter: { stripe_session_id: String(checkoutSession.id || "") },
        stripeSessionId: String(checkoutSession.id || ""),
        stripeInvoiceId: String(checkoutSession.invoice || ""),
        stripeSubscriptionId,
        guildId,
        guildName,
        userId,
        username,
        credits: plan.creditsPerMonth,
        packId: plan.id,
        paymentType: "subscription_initial",
        amountTotalCents: Number(checkoutSession.amount_total || 0),
        currency: String(checkoutSession.currency || "usd"),
        discountCode,
        discountCents,
        now,
      });

      if (purchaseResult.upsertedCount > 0 && checkoutSession.payment_status === "paid") {
        await incrementGuildAiAllowanceCredits({
          guildId,
          guildName,
          userId,
          credits: plan.creditsPerMonth,
          now,
        });
      }

      return 0;
    }

    if (String(metadata.purchase_scope || "").trim().toLowerCase() === "translation_guild") {
      const stripeSubscriptionId = String(checkoutSession.subscription || "").trim();
      const guildId = String(metadata.guild_id || "").trim();
      const guildName = String(metadata.guild_name || "").trim() || "Unknown Guild";
      const userId = String(metadata.user_id || "").trim();
      const username = String(metadata.username || "Unknown").trim() || "Unknown";
      const plan = normalizeTranslationSubscriptionPlanId(metadata.translation_plan_id, "translation_guild");
      const discountCode = normalizeDiscountCode(metadata.discount_code);
      const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);
      if (!stripeSubscriptionId || !guildId || !userId || !plan) {
        return 0;
      }

      await translationCharacterSubscriptionsCollection.updateOne(
        { stripe_subscription_id: stripeSubscriptionId },
        {
          $set: {
            stripe_subscription_id: stripeSubscriptionId,
            stripe_customer_id: String(checkoutSession.customer || ""),
            guild_id: snowflakeToLong(guildId),
            guild_name: guildName,
            user_id: snowflakeToLong(userId),
            username,
            plan_id: plan.id,
            characters_per_month: plan.charactersPerMonth,
            status: "active",
            cancel_at_period_end: false,
            current_period_end: checkoutSession.expires_at
              ? new Date(Number(checkoutSession.expires_at) * 1000)
              : null,
            updated_at: new Date(),
          },
          $setOnInsert: {
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      const now = new Date();
      await translationCharacterPurchasesCollection.updateOne(
        { stripe_session_id: String(checkoutSession.id || "") },
        {
          $setOnInsert: {
            stripe_session_id: String(checkoutSession.id || "") || undefined,
            stripe_invoice_id: String(checkoutSession.invoice || "") || undefined,
            stripe_subscription_id: stripeSubscriptionId,
            guild_id: snowflakeToLong(guildId),
            guild_name: guildName,
            user_id: snowflakeToLong(userId),
            username,
            plan_id: plan.id,
            characters_per_month: plan.charactersPerMonth,
            payment_provider: "stripe",
            payment_status: "completed",
            payment_type: "subscription_initial",
            amount_total_cents: Number(checkoutSession.amount_total || 0),
            currency: String(checkoutSession.currency || "usd"),
            discount_code: String(discountCode || ""),
            discount_cents: discountCents,
            created_at: now,
          },
        },
        { upsert: true }
      );

      await recomputeGuildTranslationCharacterAllowance(guildId);
      return 0;
    }

    if (String(metadata.purchase_scope || "").trim().toLowerCase() === "translation_user_personal") {
      const stripeSubscriptionId = String(checkoutSession.subscription || "").trim();
      const userId = String(metadata.user_id || "").trim();
      const username = String(metadata.username || "Unknown").trim() || "Unknown";
      const plan = normalizeTranslationSubscriptionPlanId(metadata.translation_plan_id, "translation_user_personal");
      const discountCode = normalizeDiscountCode(metadata.discount_code);
      const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);

      if (!stripeSubscriptionId || !userId || !plan) {
        return 0;
      }

      const now = new Date();

      await translationCharacterSubscriptionsCollection.updateOne(
        { stripe_subscription_id: stripeSubscriptionId },
        {
          $set: {
            stripe_subscription_id: stripeSubscriptionId,
            stripe_customer_id: String(checkoutSession.customer || ""),
            purchase_scope: "translation_user_personal",
            user_id: snowflakeToLong(userId),
            username,
            plan_id: plan.id,
            characters_per_month: plan.charactersPerMonth,
            status: "active",
            cancel_at_period_end: false,
            current_period_end: checkoutSession.expires_at
              ? new Date(Number(checkoutSession.expires_at) * 1000)
              : null,
            updated_at: now,
          },
          $setOnInsert: {
            created_at: now,
          },
        },
        { upsert: true }
      );

      await translationCharacterPurchasesCollection.updateOne(
        { stripe_session_id: String(checkoutSession.id || "") },
        {
          $setOnInsert: {
            stripe_session_id: String(checkoutSession.id || "") || undefined,
            stripe_invoice_id: String(checkoutSession.invoice || "") || undefined,
            stripe_subscription_id: stripeSubscriptionId,
            purchase_scope: "translation_user_personal",
            user_id: snowflakeToLong(userId),
            username,
            plan_id: plan.id,
            characters_per_month: plan.charactersPerMonth,
            payment_provider: "stripe",
            payment_status: "completed",
            payment_type: "subscription_initial",
            amount_total_cents: Number(checkoutSession.amount_total || 0),
            currency: String(checkoutSession.currency || "usd"),
            discount_code: String(discountCode || ""),
            discount_cents: discountCents,
            created_at: now,
          },
        },
        { upsert: true }
      );

      return 0;
    }

    const stripeSubscriptionId = String(checkoutSession.subscription || "").trim();
    if (!stripeSubscriptionId) {
      return 0;
    }

    const plan = normalizeSubscriptionPlanId(metadata.subscription_plan_id);
    const userId = String(metadata.user_id || "").trim();
    const username = String(metadata.username || "Unknown").trim() || "Unknown";
    if (!plan) {
      return 0;
    }

    if (!userId) {
      return 0;
    }

    await aiImageCreditSubscriptionsCollection.updateOne(
      { stripe_subscription_id: stripeSubscriptionId },
      {
        $set: {
          stripe_subscription_id: stripeSubscriptionId,
          stripe_customer_id: String(checkoutSession.customer || ""),
          user_id: snowflakeToLong(userId),
          username,
          plan_id: plan.id,
          credits_per_month: plan.creditsPerMonth,
          status: "active",
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
        },
      },
      { upsert: true }
    );

    if (checkoutSession.payment_status === "paid") {
      return await grantUserCredits({
        userId,
        username,
        credits: plan.creditsPerMonth,
        packId: plan.id,
        paymentType: "subscription_initial",
        stripeSessionId: String(checkoutSession.id || ""),
        stripeInvoiceId: String(checkoutSession.invoice || ""),
        stripeSubscriptionId,
        amountTotalCents: Number(checkoutSession.amount_total || 0),
        currency: String(checkoutSession.currency || "usd"),
      });
    }

    return 0;
  }

  if (checkoutSession.mode !== "payment") {
    return 0;
  }

  if (checkoutSession.payment_status !== "paid") {
    return 0;
  }

  const sessionId = String(checkoutSession.id || "").trim();
  if (!sessionId) {
    throw new Error("Stripe session ID is missing");
  }

  const metadata = checkoutSession.metadata || {};
  if (String(metadata.purchase_scope || "").trim().toLowerCase() === "ai_guild") {
    const pack = normalizeGuildCreditPackId(metadata.pack_id);
    const guildId = String(metadata.guild_id || "").trim();
    const guildName = String(metadata.guild_name || "").trim() || "Unknown Guild";
    const userId = String(metadata.user_id || "").trim();
    const username = String(metadata.username || "Unknown").trim() || "Unknown";

    if (!pack || !guildId || !userId) {
      throw new Error("Invalid guild AI checkout metadata");
    }

    const discountCode = normalizeDiscountCode(metadata.discount_code);
    const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);
    const expectedAmount = Math.max(pack.unitAmountCents - discountCents, 1);
    const paidAmount = Number(checkoutSession.amount_total || 0);
    if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
      throw new Error("Paid amount does not match expected guild credit pack amount");
    }

    const now = new Date();
    const purchaseResult = await upsertAiGuildCreditPurchase({
      idempotencyFilter: { stripe_session_id: sessionId },
      stripeSessionId: sessionId,
      guildId,
      guildName,
      userId,
      username,
      credits: pack.credits,
      packId: pack.id,
      paymentType: "one_time",
      amountTotalCents: paidAmount,
      currency: String(checkoutSession.currency || "usd"),
      discountCode,
      discountCents,
      now,
    });

    if (purchaseResult.upsertedCount > 0) {
      await incrementGuildAiAllowanceCredits({
        guildId,
        guildName,
        userId,
        credits: pack.credits,
        now,
      });
    }

    return 0;
  }

  const pack = normalizeCreditPackId(metadata.pack_id);
  if (!pack) {
    throw new Error("Invalid or missing pack_id metadata");
  }

  const userId = String(metadata.user_id || "").trim();
  const username = String(metadata.username || "Unknown").trim() || "Unknown";

  if (!userId) {
    throw new Error("Missing user_id in Stripe checkout metadata");
  }

  const discountCode = normalizeDiscountCode(metadata.discount_code);
  const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);
  const expectedAmount = Math.max(pack.unitAmountCents - discountCents, 1);
  const paidAmount = Number(checkoutSession.amount_total || 0);
  if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
    throw new Error("Paid amount does not match expected credit pack amount");
  }

  return await grantUserCredits({
    userId,
    username,
    credits: pack.credits,
    packId: pack.id,
    paymentType: "one_time",
    stripeSessionId: sessionId,
    amountTotalCents: paidAmount,
    currency: String(checkoutSession.currency || "usd"),
    discountCode,
    discountCents,
  });
}

async function fulfillStripeSubscriptionInvoice(invoice) {
  if (!invoice) {
    return 0;
  }

  const invoiceMarkedPaid = invoice.paid === true || String(invoice.status || "") === "paid";
  if (!invoiceMarkedPaid) {
    return 0;
  }

  const invoiceId = String(invoice.id || "").trim();
  const stripeSubscriptionId = String(invoice.subscription || "").trim();
  if (!invoiceId || !stripeSubscriptionId || !stripe) {
    return 0;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const metadata = subscription?.metadata || {};
  const purchaseScope = String(metadata.purchase_scope || "").trim().toLowerCase();

  if (purchaseScope === "ai_guild") {
    let plan = normalizeGuildSubscriptionPlanId(metadata.subscription_plan_id);
    let guildId = String(metadata.guild_id || "").trim();
    let guildName = String(metadata.guild_name || "").trim() || "Unknown Guild";
    let userId = String(metadata.user_id || "").trim();
    let username = String(metadata.username || "Unknown").trim() || "Unknown";
    const discountCode = normalizeDiscountCode(metadata.discount_code);
    const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);

    if (!plan || !guildId || !userId) {
      const existingSub = await aiImageCreditSubscriptionsCollection.findOne(
        { stripe_subscription_id: stripeSubscriptionId },
        {
          projection: {
            plan_id: 1,
            guild_id: 1,
            guild_name: 1,
            user_id: 1,
            username: 1,
          },
        }
      );

      if (existingSub) {
        plan = plan || normalizeGuildSubscriptionPlanId(existingSub.plan_id);
        guildId = guildId || String(existingSub.guild_id || "");
        guildName = guildName === "Unknown Guild" ? String(existingSub.guild_name || guildName) : guildName;
        userId = userId || String(existingSub.user_id || "");
        username = username === "Unknown" ? String(existingSub.username || username) : username;
      }
    }

    if (!plan || !guildId || !userId) {
      return 0;
    }

    const now = new Date();

    const recurringIdempotencyResult = await upsertAiGuildCreditPurchase({
      idempotencyFilter: { stripe_invoice_id: invoiceId },
      stripeInvoiceId: invoiceId,
      stripeSubscriptionId,
      guildId,
      guildName,
      userId,
      username,
      credits: plan.creditsPerMonth,
      packId: plan.id,
      paymentType: "subscription_cycle",
      amountTotalCents: Number(invoice.amount_paid || 0),
      currency: String(invoice.currency || "usd"),
      discountCode,
      discountCents,
      now,
    });

    await aiImageCreditSubscriptionsCollection.updateOne(
      { stripe_subscription_id: stripeSubscriptionId },
      {
        $set: {
          stripe_customer_id: String(invoice.customer || ""),
          purchase_scope: "ai_guild",
          guild_id: snowflakeToLong(guildId),
          guild_name: guildName,
          user_id: snowflakeToLong(userId),
          username,
          plan_id: plan.id,
          credits_per_month: plan.creditsPerMonth,
          status: String(subscription.status || "active"),
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
      },
      { upsert: true }
    );

    if (recurringIdempotencyResult.upsertedCount > 0) {
      await incrementGuildAiAllowanceCredits({
        guildId,
        guildName,
        userId,
        credits: plan.creditsPerMonth,
        now,
      });
    }

    return 0;
  }

  if (purchaseScope === "translation_user_personal") {
    let plan = normalizeTranslationSubscriptionPlanId(metadata.translation_plan_id, "translation_user_personal");
    let userId = String(metadata.user_id || "").trim();
    let username = String(metadata.username || "Unknown").trim() || "Unknown";
    const discountCode = normalizeDiscountCode(metadata.discount_code);
    const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);

    if (!plan || !userId) {
      const existingSub = await translationCharacterSubscriptionsCollection.findOne(
        { stripe_subscription_id: stripeSubscriptionId },
        {
          projection: {
            plan_id: 1,
            user_id: 1,
            username: 1,
          },
        }
      );

      if (existingSub) {
        plan = plan || normalizeTranslationSubscriptionPlanId(existingSub.plan_id, "translation_user_personal");
        userId = userId || String(existingSub.user_id || "");
        username = username === "Unknown" ? String(existingSub.username || username) : username;
      }
    }

    if (!plan || !userId) {
      return 0;
    }

    const now = new Date();

    await translationCharacterPurchasesCollection.updateOne(
      { stripe_invoice_id: invoiceId },
      {
        $setOnInsert: {
          stripe_invoice_id: invoiceId,
          stripe_subscription_id: stripeSubscriptionId,
          purchase_scope: "translation_user_personal",
          user_id: snowflakeToLong(userId),
          username,
          plan_id: plan.id,
          characters_per_month: plan.charactersPerMonth,
          payment_provider: "stripe",
          payment_status: "completed",
          payment_type: "subscription_cycle",
          amount_total_cents: Number(invoice.amount_paid || 0),
          currency: String(invoice.currency || "usd"),
          discount_code: String(discountCode || ""),
          discount_cents: discountCents,
          created_at: now,
        },
      },
      { upsert: true }
    );

    await translationCharacterSubscriptionsCollection.updateOne(
      { stripe_subscription_id: stripeSubscriptionId },
      {
        $set: {
          stripe_customer_id: String(invoice.customer || ""),
          purchase_scope: "translation_user_personal",
          user_id: snowflakeToLong(userId),
          username,
          plan_id: plan.id,
          characters_per_month: plan.charactersPerMonth,
          status: String(subscription.status || "active"),
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
      },
      { upsert: true }
    );

    return 0;
  }

  if (purchaseScope === "translation_guild" || (!purchaseScope && String(metadata.guild_id || "").trim())) {
    let plan = normalizeTranslationSubscriptionPlanId(metadata.translation_plan_id, "translation_guild");
    let guildId = String(metadata.guild_id || "").trim();
    let guildName = String(metadata.guild_name || "").trim() || "Unknown Guild";
    let userId = String(metadata.user_id || "").trim();
    let username = String(metadata.username || "Unknown").trim() || "Unknown";
    const discountCode = normalizeDiscountCode(metadata.discount_code);
    const discountCents = Math.max(Number.parseInt(String(metadata.discount_cents || "0"), 10) || 0, 0);

    if (!plan || !guildId || !userId) {
      const existingSub = await translationCharacterSubscriptionsCollection.findOne(
        { stripe_subscription_id: stripeSubscriptionId },
        {
          projection: {
            plan_id: 1,
            guild_id: 1,
            guild_name: 1,
            user_id: 1,
            username: 1,
          },
        }
      );

      if (existingSub) {
        plan = plan || normalizeTranslationSubscriptionPlanId(existingSub.plan_id, "translation_guild");
        guildId = guildId || String(existingSub.guild_id || "");
        guildName = guildName === "Unknown Guild" ? String(existingSub.guild_name || guildName) : guildName;
        userId = userId || String(existingSub.user_id || "");
        username = username === "Unknown" ? String(existingSub.username || username) : username;
      }
    }

    if (!plan || !guildId || !userId) {
      return 0;
    }

    const now = new Date();

    await translationCharacterPurchasesCollection.updateOne(
      { stripe_invoice_id: invoiceId },
      {
        $setOnInsert: {
          stripe_invoice_id: invoiceId,
          stripe_subscription_id: stripeSubscriptionId,
          guild_id: snowflakeToLong(guildId),
          guild_name: guildName,
          user_id: snowflakeToLong(userId),
          username,
          plan_id: plan.id,
          characters_per_month: plan.charactersPerMonth,
          payment_provider: "stripe",
          payment_status: "completed",
          payment_type: "subscription_cycle",
          amount_total_cents: Number(invoice.amount_paid || 0),
          currency: String(invoice.currency || "usd"),
          discount_code: String(discountCode || ""),
          discount_cents: discountCents,
          created_at: now,
        },
      },
      { upsert: true }
    );

    await translationCharacterSubscriptionsCollection.updateOne(
      { stripe_subscription_id: stripeSubscriptionId },
      {
        $set: {
          stripe_customer_id: String(invoice.customer || ""),
          purchase_scope: "translation_guild",
          guild_id: snowflakeToLong(guildId),
          guild_name: guildName,
          user_id: snowflakeToLong(userId),
          username,
          plan_id: plan.id,
          characters_per_month: plan.charactersPerMonth,
          status: String(subscription.status || "active"),
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
      },
      { upsert: true }
    );

    await recomputeGuildTranslationCharacterAllowance(guildId);
    return 0;
  }

  let plan = normalizeSubscriptionPlanId(metadata.subscription_plan_id);
  let userId = String(metadata.user_id || "").trim();
  let username = String(metadata.username || "Unknown").trim() || "Unknown";

  if (!plan || !userId) {
    const existingSub = await aiImageCreditSubscriptionsCollection.findOne(
      { stripe_subscription_id: stripeSubscriptionId },
      {
        projection: {
          plan_id: 1,
          user_id: 1,
          username: 1,
        },
      }
    );

    if (existingSub) {
      plan = plan || normalizeSubscriptionPlanId(existingSub.plan_id);
      userId = userId || String(existingSub.user_id || "");
      username = username === "Unknown" ? String(existingSub.username || username) : username;
    }
  }

  if (!plan || !userId) {
    throw new Error("Unable to resolve subscription metadata for recurring credit grant");
  }

  const now = new Date();

  const recurringIdempotencyResult = await aiImageCreditPurchasesCollection.updateOne(
    { stripe_invoice_id: invoiceId },
    {
      $setOnInsert: {
        stripe_invoice_id: invoiceId,
        stripe_subscription_id: stripeSubscriptionId,
        user_id: snowflakeToLong(userId),
        username,
        credits: plan.creditsPerMonth,
        pack_id: plan.id,
        payment_provider: "stripe",
        payment_status: "completed",
        payment_type: "subscription_cycle",
        amount_total_cents: Number(invoice.amount_paid || 0),
        currency: String(invoice.currency || "usd"),
        created_at: now,
      },
    },
    { upsert: true }
  );

  if (recurringIdempotencyResult.upsertedCount === 0) {
    return 0;
  }

  await aiImageUserCreditsCollection.updateOne(
    {
      user_id: snowflakeToLong(userId),
    },
    {
      $set: {
        user_id: snowflakeToLong(userId),
        username,
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
      $inc: {
        ai_image_credits_balance: plan.creditsPerMonth,
        ai_image_credits_purchased_total: plan.creditsPerMonth,
      },
    },
    { upsert: true }
  );

  await aiImageCreditSubscriptionsCollection.updateOne(
    { stripe_subscription_id: stripeSubscriptionId },
    {
      $set: {
        stripe_customer_id: String(invoice.customer || ""),
        user_id: snowflakeToLong(userId),
        username,
        plan_id: plan.id,
        credits_per_month: plan.creditsPerMonth,
        status: String(subscription.status || "active"),
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true }
  );

  return plan.creditsPerMonth;
}

async function getUserAiImageCreditsSummary(userId) {
  const doc = await aiImageUserCreditsCollection.findOne(
    {
      user_id: snowflakeToLong(userId),
    },
    {
      projection: {
        ai_image_credits_balance: 1,
        ai_image_credits_purchased_total: 1,
        ai_image_credits_used_total: 1,
      },
    }
  );

  return {
    balance: Math.max(toSafeInt(doc?.ai_image_credits_balance), 0),
    purchasedTotal: Math.max(toSafeInt(doc?.ai_image_credits_purchased_total), 0),
    usedTotal: Math.max(toSafeInt(doc?.ai_image_credits_used_total), 0),
  };
}

function sanitizeWebImagePrompt(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (normalized.length < 3) {
    return "";
  }
  return normalized.slice(0, 1500);
}

async function consumeUserAiImageCredit(userId, username) {
  const now = new Date();
  const result = await aiImageUserCreditsCollection.findOneAndUpdate(
    {
      user_id: snowflakeToLong(userId),
      ai_image_credits_balance: { $gte: 1 },
    },
    {
      $set: {
        username: String(username || "Unknown").trim() || "Unknown",
        updated_at: now,
      },
      $inc: {
        ai_image_credits_balance: -1,
        ai_image_credits_used_total: 1,
      },
    },
    {
      returnDocument: "after",
      projection: {
        ai_image_credits_balance: 1,
      },
    }
  );

  if (!result) {
    return { consumed: false, balanceAfter: 0 };
  }

  return {
    consumed: true,
    balanceAfter: Math.max(toSafeInt(result.ai_image_credits_balance), 0),
  };
}

async function refundUserAiImageCredit(userId, username) {
  const now = new Date();
  await aiImageUserCreditsCollection.updateOne(
    {
      user_id: snowflakeToLong(userId),
    },
    {
      $set: {
        username: String(username || "Unknown").trim() || "Unknown",
        updated_at: now,
      },
      $inc: {
        ai_image_credits_balance: 1,
        ai_image_credits_used_total: -1,
      },
    }
  );
}

async function generateWebsiteAiImage(prompt) {
  if (!openai) {
    throw new Error("OpenAI is not configured");
  }

  const response = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: "1024x1024",
  });

  const imageB64 = response?.data?.[0]?.b64_json;
  if (!imageB64) {
    throw new Error("OpenAI did not return image data");
  }

  return Buffer.from(imageB64, "base64");
}

async function generateWebsiteAiImageFromImage({ prompt, imageBuffer, filename, mimeType }) {
  if (!openai) {
    throw new Error("OpenAI is not configured");
  }

  const safeFilename = String(filename || "input.png").trim() || "input.png";
  const imageFile = await toFile(imageBuffer, safeFilename, { type: String(mimeType || "image/png") });

  const response = await openai.images.edit({
    model: OPENAI_IMAGE_MODEL,
    image: imageFile,
    prompt,
    size: "1024x1024",
  });

  const imageB64 = response?.data?.[0]?.b64_json;
  if (!imageB64) {
    throw new Error("OpenAI did not return image data");
  }

  return Buffer.from(imageB64, "base64");
}

async function getUserRecentWebGenerations(userId, limit = 10) {
  const rows = await aiImageWebGenerationsCollection
    .find(
      {
        user_id: snowflakeToLong(userId),
      },
      {
        projection: {
          prompt: 1,
          mode: 1,
          model: 1,
          source: 1,
          created_at: 1,
        },
      }
    )
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  return rows.map((row) => ({
    id: String(row?._id || ""),
    prompt: String(row?.prompt || ""),
    mode: String(row?.mode || "text"),
    model: String(row?.model || OPENAI_IMAGE_MODEL),
    source: String(row?.source || "website").trim().toLowerCase(),
    createdAt: row?.created_at || null,
  }));
}

async function exchangeDiscordCodeForToken(code) {
  const payload = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
  });

  const response = await axios.post(`${DISCORD_API_BASE}/oauth2/token`, payload.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });

  return response.data;
}

async function discordUserRequest(accessToken, endpoint) {
  const response = await axios.get(`${DISCORD_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });

  return response.data;
}

async function isBotInstalledInGuild(guildId) {
  try {
    await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/members/${DISCORD_BOT_USER_ID}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      timeout: 10000,
    });
    return true;
  } catch (error) {
    if (error.response && (error.response.status === 404 || error.response.status === 403)) {
      return false;
    }

    throw error;
  }
}

async function buildGuildAccessModel(accessToken, userId) {
  const guildDocs = await guildsCollection
    .find(
      {},
      {
        projection: {
          guild_id: 1,
          guild_name: 1,
          installer_user_id: 1,
          gamification_levels: 1,
          moderation_custom_terms: 1,
        },
      }
    )
    .toArray();

  let userGuilds = [];
  let usingGuildApiFallback = false;
  try {
    userGuilds = await discordUserRequest(accessToken, "/users/@me/guilds");
  } catch (error) {
    const status = Number.parseInt(String(error?.response?.status || "0"), 10);
    const isTemporaryFailure = status === 429 || status >= 500 || status === 0;

    if (!isTemporaryFailure) {
      throw error;
    }

    usingGuildApiFallback = true;
    console.error("[WARN] Discord guild list unavailable, using installer fallback", {
      userId: String(userId || ""),
      status,
      message: error?.message,
    });
  }

  const guildDocById = new Map();
  for (const doc of guildDocs) {
    if (doc.guild_id === undefined || doc.guild_id === null) {
      continue;
    }
    guildDocById.set(String(doc.guild_id), doc);
  }

  if (usingGuildApiFallback || !Array.isArray(userGuilds) || userGuilds.length === 0) {
    const fallbackGuilds = guildDocs
      .map((doc) => {
        const guildId = String(doc?.guild_id || "").trim();
        if (!/^\d+$/.test(guildId)) {
          return null;
        }

        const installerUserId = doc && doc.installer_user_id ? String(doc.installer_user_id) : null;
        const isInstaller = installerUserId === String(userId);

        return {
          id: guildId,
          name: String(doc?.guild_name || `Guild ${guildId}`).trim() || `Guild ${guildId}`,
          iconUrl: null,
          isAdmin: false,
          isInstaller,
          canManage: isInstaller,
          levels: sanitizeLevels(doc ? doc.gamification_levels : null),
          customModerationTerms: sanitizeModerationCustomTerms(doc ? doc.moderation_custom_terms : null),
        };
      })
      .filter((row) => row && row.canManage)
      .sort((a, b) => a.name.localeCompare(b.name));

    return fallbackGuilds;
  }

  const guildsWithInstallCheck = await Promise.all(
    userGuilds.map(async (guild) => {
      const stored = guildDocById.get(String(guild.id));

      let installed = false;
      try {
        installed = await isBotInstalledInGuild(guild.id);
      } catch (error) {
        console.error("[WARN] Failed to verify bot install status for guild", {
          guildId: String(guild.id || ""),
          status: error?.response?.status,
          message: error?.message,
        });

        installed = Boolean(stored);
      }

      if (!installed) {
        return null;
      }

      const installerUserId = stored && stored.installer_user_id ? String(stored.installer_user_id) : null;
      const isInstaller = installerUserId === String(userId);
      const isAdmin = hasAdminPermission(guild);

      return {
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl(guild),
        isAdmin,
        isInstaller,
        canManage: isAdmin || isInstaller,
        levels: sanitizeLevels(stored ? stored.gamification_levels : null),
        customModerationTerms: sanitizeModerationCustomTerms(stored ? stored.moderation_custom_terms : null),
      };
    })
  );

  return guildsWithInstallCheck
    .filter(Boolean)
    .sort((a, b) => {
      if (a.canManage !== b.canManage) {
        return a.canManage ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

function requireAuth(req, res, next) {
  if (!req.session.user || !req.session.discord || !req.session.discord.accessToken) {
    return res.redirect("/auth/discord");
  }

  return next();
}

function requireOwner(req, res, next) {
  if (!req.session.user || String(req.session.user.id) !== BOT_OWNER_DISCORD_ID) {
    return res.status(403).render("error", {
      title: "Access Denied",
      message: "This page is only available to the bot owner.",
    });
  }

  return next();
}

function normalizeListFromBody(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }
  if (rawValue === undefined || rawValue === null) {
    return [];
  }
  return [rawValue];
}

function parsePackRowsFromBody(body, fieldPrefix = "pack") {
  const ids = normalizeListFromBody(body[`${fieldPrefix}_id`]);
  const names = normalizeListFromBody(body[`${fieldPrefix}_name`]);
  const credits = normalizeListFromBody(body[`${fieldPrefix}_credits`]);
  const prices = normalizeListFromBody(body[`${fieldPrefix}_price_cents`]);
  const costs = normalizeListFromBody(body[`${fieldPrefix}_cost_cents`]);
  const rowCount = Math.max(ids.length, names.length, credits.length, prices.length, costs.length);

  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    rows.push({
      id: ids[index],
      name: names[index],
      credits: credits[index],
      unitAmountCents: prices[index],
      costUnitCents: costs[index],
    });
  }

  return rows;
}

function parsePlanRowsFromBody(body, fieldPrefix = "plan") {
  const ids = normalizeListFromBody(body[`${fieldPrefix}_id`]);
  const names = normalizeListFromBody(body[`${fieldPrefix}_name`]);
  const credits = normalizeListFromBody(body[`${fieldPrefix}_credits_per_month`]);
  const prices = normalizeListFromBody(body[`${fieldPrefix}_price_cents`]);
  const costs = normalizeListFromBody(body[`${fieldPrefix}_cost_cents`]);
  const rowCount = Math.max(ids.length, names.length, credits.length, prices.length, costs.length);

  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    rows.push({
      id: ids[index],
      name: names[index],
      creditsPerMonth: credits[index],
      unitAmountCents: prices[index],
      costUnitCents: costs[index],
    });
  }

  return rows;
}

function parseTranslationPlanRowsFromBody(body, fieldPrefix = "translation_plan") {
  const ids = normalizeListFromBody(body[`${fieldPrefix}_id`]);
  const names = normalizeListFromBody(body[`${fieldPrefix}_name`]);
  const characters = normalizeListFromBody(body[`${fieldPrefix}_characters_per_month`]);
  const prices = normalizeListFromBody(body[`${fieldPrefix}_price_cents`]);
  const costs = normalizeListFromBody(body[`${fieldPrefix}_cost_cents`]);
  const rowCount = Math.max(ids.length, names.length, characters.length, prices.length, costs.length);

  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    rows.push({
      id: ids[index],
      name: names[index],
      charactersPerMonth: characters[index],
      unitAmountCents: prices[index],
      costUnitCents: costs[index],
    });
  }

  return rows;
}

function escapeRegex(rawValue) {
  return String(rawValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date;
}

function parseBooleanToggle(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.some((entry) => parseBooleanToggle(entry));
  }

  const value = String(rawValue || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function formatDateInput(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function normalizeOwnerPurchaseFilters(query = {}) {
  const allowedPaymentTypes = new Set(["all", "one_time", "subscription_initial", "subscription_cycle"]);
  const paymentTypeRaw = String(query.payment_type || "all").trim().toLowerCase();
  const paymentType = allowedPaymentTypes.has(paymentTypeRaw) ? paymentTypeRaw : "all";

  const optionIdRaw = String(query.option_id || "all").trim().toLowerCase();
  const optionId = optionIdRaw.length > 0 ? optionIdRaw : "all";

  const fromDate = parseDateInput(query.from_date);
  const toDate = parseDateInput(query.to_date);
  const userQuery = String(query.user_query || "").trim();

  const limitParsed = Number.parseInt(String(query.limit || "200"), 10);
  const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 20), 500) : 200;

  return {
    paymentType,
    optionId,
    fromDate,
    toDate,
    userQuery,
    limit,
  };
}

function buildOwnerPurchaseMongoQuery(filters) {
  const query = {};

  if (filters.paymentType !== "all") {
    query.payment_type = filters.paymentType;
  }

  if (filters.optionId !== "all") {
    query.pack_id = filters.optionId;
  }

  const createdAtQuery = {};
  if (filters.fromDate) {
    createdAtQuery.$gte = new Date(filters.fromDate);
  }
  if (filters.toDate) {
    const toDateInclusive = new Date(filters.toDate);
    toDateInclusive.setUTCHours(23, 59, 59, 999);
    createdAtQuery.$lte = toDateInclusive;
  }
  if (Object.keys(createdAtQuery).length > 0) {
    query.created_at = createdAtQuery;
  }

  if (filters.userQuery) {
    const escaped = escapeRegex(filters.userQuery);
    const usernameMatch = { username: { $regex: escaped, $options: "i" } };
    const userOr = [usernameMatch];

    if (/^\d+$/.test(filters.userQuery)) {
      userOr.push({ user_id: snowflakeToLong(filters.userQuery) });
      userOr.push({ user_id: filters.userQuery });
    }

    query.$or = userOr;
  }

  return query;
}

function buildOwnerPurchaseOptionCatalog() {
  const rows = [];

  getCreditPacks().forEach((pack) => {
    rows.push({
      id: pack.id,
      label: `${pack.name} (${pack.credits} credits one-time)`,
      type: "one_time",
      costUnitCents: Math.max(toSafeInt(pack.costUnitCents), 0),
    });
  });

  getSubscriptionPlans().forEach((plan) => {
    rows.push({
      id: plan.id,
      label: `${plan.name} (${plan.creditsPerMonth} credits/month)`,
      type: "subscription",
      costUnitCents: Math.max(toSafeInt(plan.costUnitCents), 0),
    });
  });

  return rows;
}

function buildOwnerPurchaseExportQueryString(filters) {
  const params = new URLSearchParams();

  if (filters.paymentType && filters.paymentType !== "all") {
    params.set("payment_type", filters.paymentType);
  }
  if (filters.optionId && filters.optionId !== "all") {
    params.set("option_id", filters.optionId);
  }
  if (filters.fromDate) {
    params.set("from_date", formatDateInput(filters.fromDate));
  }
  if (filters.toDate) {
    params.set("to_date", formatDateInput(filters.toDate));
  }
  if (filters.userQuery) {
    params.set("user_query", filters.userQuery);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }

  return params.toString();
}

function normalizeOwnerTranslationPurchaseFilters(query = {}) {
  const allowedPaymentTypes = new Set(["all", "subscription_initial", "subscription_cycle"]);
  const paymentTypeRaw = String(query.payment_type || "all").trim().toLowerCase();
  const paymentType = allowedPaymentTypes.has(paymentTypeRaw) ? paymentTypeRaw : "all";

  const optionIdRaw = String(query.option_id || "all").trim().toLowerCase();
  const optionId = optionIdRaw.length > 0 ? optionIdRaw : "all";

  const fromDate = parseDateInput(query.from_date);
  const toDate = parseDateInput(query.to_date);
  const userQuery = String(query.user_query || "").trim();
  const guildQuery = String(query.guild_query || "").trim();

  const limitParsed = Number.parseInt(String(query.limit || "200"), 10);
  const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 20), 500) : 200;

  return {
    paymentType,
    optionId,
    fromDate,
    toDate,
    userQuery,
    guildQuery,
    limit,
  };
}

function buildOwnerTranslationPurchaseMongoQuery(filters) {
  const query = {};

  if (filters.paymentType !== "all") {
    query.payment_type = filters.paymentType;
  }

  if (filters.optionId !== "all") {
    query.plan_id = filters.optionId;
  }

  const createdAtQuery = {};
  if (filters.fromDate) {
    createdAtQuery.$gte = new Date(filters.fromDate);
  }
  if (filters.toDate) {
    const toDateInclusive = new Date(filters.toDate);
    toDateInclusive.setUTCHours(23, 59, 59, 999);
    createdAtQuery.$lte = toDateInclusive;
  }
  if (Object.keys(createdAtQuery).length > 0) {
    query.created_at = createdAtQuery;
  }

  const andClauses = [];

  if (filters.userQuery) {
    const escaped = escapeRegex(filters.userQuery);
    const userOr = [{ username: { $regex: escaped, $options: "i" } }];
    if (/^\d+$/.test(filters.userQuery)) {
      userOr.push({ user_id: snowflakeToLong(filters.userQuery) });
      userOr.push({ user_id: filters.userQuery });
    }
    andClauses.push({ $or: userOr });
  }

  if (filters.guildQuery) {
    const escaped = escapeRegex(filters.guildQuery);
    const guildOr = [{ guild_name: { $regex: escaped, $options: "i" } }];
    if (/^\d+$/.test(filters.guildQuery)) {
      guildOr.push({ guild_id: snowflakeToLong(filters.guildQuery) });
      guildOr.push({ guild_id: filters.guildQuery });
    }
    andClauses.push({ $or: guildOr });
  }

  if (andClauses.length === 1) {
    query.$and = andClauses;
  } else if (andClauses.length > 1) {
    query.$and = andClauses;
  }

  return query;
}

function buildOwnerTranslationPlanCatalog() {
  return getGuildTranslationSubscriptionPlans().map((plan) => ({
    id: plan.id,
    label: `${plan.name} (${Number(plan.charactersPerMonth || 0).toLocaleString()} characters/month)`,
    costUnitCents: Math.max(toSafeInt(plan.costUnitCents), 0),
  }));
}

function buildOwnerTranslationPurchaseExportQueryString(filters) {
  const params = new URLSearchParams();

  if (filters.paymentType && filters.paymentType !== "all") {
    params.set("payment_type", filters.paymentType);
  }
  if (filters.optionId && filters.optionId !== "all") {
    params.set("option_id", filters.optionId);
  }
  if (filters.fromDate) {
    params.set("from_date", formatDateInput(filters.fromDate));
  }
  if (filters.toDate) {
    params.set("to_date", formatDateInput(filters.toDate));
  }
  if (filters.userQuery) {
    params.set("user_query", filters.userQuery);
  }
  if (filters.guildQuery) {
    params.set("guild_query", filters.guildQuery);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }

  return params.toString();
}

function normalizeOwnerWebsiteErrorFilters(query = {}) {
  const allowedStatusGroups = new Set(["all", "4xx", "5xx"]);
  const allowedTypes = new Set(["all", "mongo_timeout", "server_error", "client_error"]);

  const statusGroupRaw = String(query.status_group || "all").trim().toLowerCase();
  const statusGroup = allowedStatusGroups.has(statusGroupRaw) ? statusGroupRaw : "all";

  const typeRaw = String(query.error_type || "all").trim().toLowerCase();
  const errorType = allowedTypes.has(typeRaw) ? typeRaw : "all";

  const fromDate = parseDateInput(query.from_date);
  const toDate = parseDateInput(query.to_date);
  const pathQuery = String(query.path_query || "").trim();
  const userQuery = String(query.user_query || "").trim();

  const limitParsed = Number.parseInt(String(query.limit || "200"), 10);
  const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 20), 500) : 200;

  return {
    statusGroup,
    errorType,
    fromDate,
    toDate,
    pathQuery,
    userQuery,
    limit,
  };
}

function buildOwnerWebsiteErrorMongoQuery(filters) {
  const query = {};

  if (filters.statusGroup === "4xx") {
    query.http_status = { $gte: 400, $lt: 500 };
  } else if (filters.statusGroup === "5xx") {
    query.http_status = { $gte: 500, $lt: 600 };
  }

  if (filters.errorType !== "all") {
    query.error_type = filters.errorType;
  }

  const createdAtQuery = {};
  if (filters.fromDate) {
    createdAtQuery.$gte = new Date(filters.fromDate);
  }
  if (filters.toDate) {
    const toDateInclusive = new Date(filters.toDate);
    toDateInclusive.setUTCHours(23, 59, 59, 999);
    createdAtQuery.$lte = toDateInclusive;
  }
  if (Object.keys(createdAtQuery).length > 0) {
    query.created_at = createdAtQuery;
  }

  const andClauses = [];

  if (filters.pathQuery) {
    const escaped = escapeRegex(filters.pathQuery);
    andClauses.push({
      $or: [
        { path: { $regex: escaped, $options: "i" } },
        { title: { $regex: escaped, $options: "i" } },
        { message: { $regex: escaped, $options: "i" } },
        { error_id: { $regex: escaped, $options: "i" } },
      ],
    });
  }

  if (filters.userQuery) {
    const escaped = escapeRegex(filters.userQuery);
    const userOr = [{ username: { $regex: escaped, $options: "i" } }];
    if (/^\d+$/.test(filters.userQuery)) {
      userOr.push({ user_id: filters.userQuery });
    }
    andClauses.push({ $or: userOr });
  }

  if (andClauses.length > 0) {
    query.$and = andClauses;
  }

  return query;
}

function buildOwnerWebsiteErrorExportQueryString(filters) {
  const params = new URLSearchParams();

  if (filters.statusGroup && filters.statusGroup !== "all") {
    params.set("status_group", filters.statusGroup);
  }
  if (filters.errorType && filters.errorType !== "all") {
    params.set("error_type", filters.errorType);
  }
  if (filters.fromDate) {
    params.set("from_date", formatDateInput(filters.fromDate));
  }
  if (filters.toDate) {
    params.set("to_date", formatDateInput(filters.toDate));
  }
  if (filters.pathQuery) {
    params.set("path_query", filters.pathQuery);
  }
  if (filters.userQuery) {
    params.set("user_query", filters.userQuery);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }

  return params.toString();
}

async function fetchGuildTextChannels(guildId) {
  const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    timeout: 10000,
  });

  const channels = Array.isArray(response.data) ? response.data : [];
  return channels
    .filter((channel) => Number(channel?.type) === 0)
    .map((channel) => ({
      id: String(channel.id),
      name: String(channel.name || "unknown"),
      position: Number(channel.position || 0),
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

async function fetchGuildChannels(guildId) {
  const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    timeout: 10000,
  });

  return Array.isArray(response.data) ? response.data : [];
}

async function deleteDiscordChannel(channelId) {
  await axios.delete(`${DISCORD_API_BASE}/channels/${channelId}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    timeout: 10000,
  });
}

function normalizeGuildFeatures(rawFeatures) {
  const raw = rawFeatures && typeof rawFeatures === "object" ? rawFeatures : {};
  return {
    moderation: { enabled: raw.moderation?.enabled !== false },
    gamification: { enabled: raw.gamification?.enabled !== false },
    ai_image: { enabled: raw.ai_image?.enabled !== false },
    translation: { enabled: raw.translation?.enabled !== false },
    scheduled_messages: { enabled: raw.scheduled_messages?.enabled !== false },
  };
}

function buildGuildFeatureControls(features, t) {
  const safeFeatures = normalizeGuildFeatures(features);
  const ownerChannels = getOwnerSettings().channels;
  const translate = typeof t === "function" ? t : (key, options = {}) => options.defaultValue || key;

  return [
    {
      key: "moderation",
      label: translate("home.features.smartModeration.title", { defaultValue: "Moderation" }),
      description: translate("home.features.smartModeration.description", {
        defaultValue: "Admin moderation workflows and moderation summary.",
      }),
      enabled: safeFeatures.moderation.enabled,
      cleanupSupported: true,
      cleanupLabel: `Also remove associated channel #${ownerChannels.moderation.channel_name}`,
      cleanupChannelName: ownerChannels.moderation.channel_name,
    },
    {
      key: "gamification",
      label: translate("home.features.gamification.title", { defaultValue: "Gamification" }),
      description: translate("home.features.gamification.description", {
        defaultValue: "Levels, XP, and leaderboard features.",
      }),
      enabled: safeFeatures.gamification.enabled,
      cleanupSupported: true,
      cleanupLabel: `Also remove associated channel #${ownerChannels.gamification.leaderboard_channel_name}`,
      cleanupChannelName: ownerChannels.gamification.leaderboard_channel_name,
    },
    {
      key: "ai_image",
      label: translate("home.features.aiImageGeneration.title", { defaultValue: "AI Image" }),
      description: translate("home.features.aiImageGeneration.description", {
        defaultValue: "AI image generation channel and related feature controls.",
      }),
      enabled: safeFeatures.ai_image.enabled,
      cleanupSupported: true,
      cleanupLabel: `Also remove associated channel #${ownerChannels.ai_image.channel_name}`,
      cleanupChannelName: ownerChannels.ai_image.channel_name,
    },
    {
      key: "translation",
      label: translate("home.features.globalCommunication.title", { defaultValue: "Translation" }),
      description: translate("home.features.globalCommunication.description", {
        defaultValue: "Translation usage and subscription controls.",
      }),
      enabled: safeFeatures.translation.enabled,
      cleanupSupported: false,
      cleanupLabel: "",
      cleanupChannelName: "",
    },
    {
      key: "scheduled_messages",
      label: translate("home.features.scheduledMessaging.title", { defaultValue: "Scheduled Messages" }),
      description: translate("home.features.scheduledMessaging.description", {
        defaultValue: "Scheduled message creation and management.",
      }),
      enabled: safeFeatures.scheduled_messages.enabled,
      cleanupSupported: false,
      cleanupLabel: "",
      cleanupChannelName: "",
    },
  ];
}

function normalizeChannelName(rawValue) {
  return String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function cleanupFeatureChannels(guildId, featureKey) {
  const ownerChannels = getOwnerSettings().channels;
  const cleanupPlan = {
    moderation: {
      channelNames: [ownerChannels.moderation.channel_name],
    },
    gamification: {
      channelNames: [ownerChannels.gamification.leaderboard_channel_name],
    },
    ai_image: {
      channelNames: [ownerChannels.ai_image.channel_name],
    },
  };

  const plan = cleanupPlan[featureKey];
  if (!plan) {
    return {
      attempted: false,
      deletedChannels: 0,
      failedDeletes: 0,
    };
  }

  const channels = await fetchGuildChannels(guildId);
  const targetChannelNames = new Set(
    (plan.channelNames || [])
      .map((entry) => normalizeChannelName(entry))
      .filter(Boolean)
  );

  const channelsToDelete = channels.filter((channel) => {
    const channelType = Number(channel?.type);
    if (channelType !== 0 && channelType !== 5) {
      return false;
    }

    const normalizedName = normalizeChannelName(channel?.name);
    if (!targetChannelNames.has(normalizedName)) {
      return false;
    }
    return true;
  });

  const deletedChannelIds = new Set();
  let failedDeletes = 0;

  for (const channel of channelsToDelete) {
    try {
      await deleteDiscordChannel(String(channel.id));
      deletedChannelIds.add(String(channel.id));
    } catch {
      failedDeletes += 1;
    }
  }

  return {
    attempted: true,
    deletedChannels: deletedChannelIds.size,
    failedDeletes,
  };
}

const SCHEDULE_TIMEZONE_NAMES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/St_Johns",
  "America/Sao_Paulo",
  "Atlantic/South_Georgia",
  "Atlantic/Cape_Verde",
  "UTC",
  "Europe/Dublin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Bucharest",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Tehran",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Australia/Brisbane",
  "Pacific/Guam",
  "Pacific/Auckland",
  "Pacific/Fiji",
];

function formatUtcOffset(minutes) {
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  const sign = safeMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(safeMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function getUtcOffsetMinutesForTimeZone(timeZone, referenceDate = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(referenceDate);
    const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value || "";

    if (offsetPart === "GMT" || offsetPart === "UTC") {
      return 0;
    }

    const match = offsetPart.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (!match) {
      return 0;
    }

    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number.parseInt(match[2], 10);
    const minutes = Number.parseInt(match[3] || "0", 10);
    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

const SCHEDULE_TIMEZONE_OPTIONS = SCHEDULE_TIMEZONE_NAMES.filter((timeZone) => isValidIanaTimeZone(timeZone))
  .map((timeZone) => ({
    name: timeZone,
    offsetMinutes: getUtcOffsetMinutesForTimeZone(timeZone),
  }))
  .sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) {
      return a.offsetMinutes - b.offsetMinutes;
    }
    return a.name.localeCompare(b.name);
  })
  .map((entry) => ({
    name: entry.name,
    label: `(UTC${formatUtcOffset(entry.offsetMinutes)}) ${entry.name}`,
  }));

function isValidIanaTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getDatePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number.parseInt(partMap.year || "0", 10),
    month: Number.parseInt(partMap.month || "0", 10),
    day: Number.parseInt(partMap.day || "0", 10),
    hour: Number.parseInt(partMap.hour || "0", 10),
    minute: Number.parseInt(partMap.minute || "0", 10),
  };
}

function parseDateTimeLocalParts(rawValue) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
    hour: Number.parseInt(match[4], 10),
    minute: Number.parseInt(match[5], 10),
  };
}

function parseDateLocalParts(rawValue) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
}

function parseTimeLocalParts(rawValue) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    hour: Number.parseInt(match[1], 10),
    minute: Number.parseInt(match[2], 10),
  };
}

function formatDateText(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatTimeText(parts) {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function toDateInputInTimeZone(dateValue, timeZone) {
  if (!dateValue || !isValidIanaTimeZone(timeZone)) {
    return "";
  }
  const parts = getDatePartsInTimeZone(new Date(dateValue), timeZone);
  return formatDateText(parts);
}

function toTimeInputInTimeZone(dateValue, timeZone) {
  if (!dateValue || !isValidIanaTimeZone(timeZone)) {
    return "";
  }
  const parts = getDatePartsInTimeZone(new Date(dateValue), timeZone);
  return formatTimeText(parts);
}

const WEEKDAY_TOKENS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function normalizeWeeklyDaysInput(rawValue) {
  const rawList = Array.isArray(rawValue) ? rawValue : [rawValue];
  const set = new Set();

  rawList.forEach((value) => {
    const token = String(value || "").trim().toLowerCase();
    if (WEEKDAY_TOKENS.includes(token)) {
      set.add(token);
    }
  });

  return WEEKDAY_TOKENS.filter((token) => set.has(token));
}

function compareDateText(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function addDaysToDateText(dateText, days) {
  const parsed = parseDateLocalParts(dateText);
  if (!parsed) {
    return "";
  }
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + Number.parseInt(String(days || 0), 10));
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayTokenForDateText(dateText) {
  const parsed = parseDateLocalParts(dateText);
  if (!parsed) {
    return "";
  }
  const utcDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return WEEKDAY_TOKENS[utcDay] || "";
}

function combineDateAndTimeToDateTimeLocal(dateText, timeText) {
  const parsedDate = parseDateLocalParts(dateText);
  const parsedTime = parseTimeLocalParts(timeText);
  if (!parsedDate || !parsedTime) {
    return "";
  }

  return `${formatDateText(parsedDate)}T${formatTimeText(parsedTime)}`;
}

function computeRecurringNextRunUtc({ recurrence, timezoneName, startDateText, sendTimeText, weeklyDays, endDateText }) {
  if (recurrence !== "daily" && recurrence !== "weekly") {
    return null;
  }

  const startDate = parseDateLocalParts(startDateText) ? startDateText : "";
  const sendTime = parseTimeLocalParts(sendTimeText) ? sendTimeText : "";
  if (!startDate || !sendTime || !isValidIanaTimeZone(timezoneName)) {
    return null;
  }

  const now = new Date();
  const nowLocalParts = getDatePartsInTimeZone(now, timezoneName);
  const todayText = formatDateText(nowLocalParts);
  let candidateDate = compareDateText(startDate, todayText) > 0 ? startDate : todayText;

  const maxLookaheadDays = 3700;
  const weeklyDaySet = new Set(Array.isArray(weeklyDays) ? weeklyDays : []);

  for (let offset = 0; offset <= maxLookaheadDays; offset += 1) {
    if (offset > 0) {
      candidateDate = addDaysToDateText(candidateDate, 1);
    }

    if (endDateText && compareDateText(candidateDate, endDateText) > 0) {
      return null;
    }

    if (recurrence === "weekly") {
      const dayToken = getWeekdayTokenForDateText(candidateDate);
      if (!weeklyDaySet.has(dayToken)) {
        continue;
      }
    }

    const candidateLocal = combineDateAndTimeToDateTimeLocal(candidateDate, sendTime);
    const candidateUtc = convertDateTimeLocalInTimeZoneToUtc(candidateLocal, timezoneName);
    if (!candidateUtc) {
      continue;
    }

    if (candidateUtc.getTime() > now.getTime()) {
      return candidateUtc;
    }
  }

  return null;
}

function convertDateTimeLocalInTimeZoneToUtc(rawValue, timeZone) {
  const target = parseDateTimeLocalParts(rawValue);
  if (!target || !isValidIanaTimeZone(timeZone)) {
    return null;
  }

  let guessUtcMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const localAtGuess = getDatePartsInTimeZone(new Date(guessUtcMs), timeZone);
    const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);
    const localAtGuessAsUtc = Date.UTC(
      localAtGuess.year,
      localAtGuess.month - 1,
      localAtGuess.day,
      localAtGuess.hour,
      localAtGuess.minute,
      0,
      0
    );

    const diffMs = targetAsUtc - localAtGuessAsUtc;
    if (diffMs === 0) {
      break;
    }
    guessUtcMs += diffMs;
  }

  const finalLocal = getDatePartsInTimeZone(new Date(guessUtcMs), timeZone);
  const matches =
    finalLocal.year === target.year
    && finalLocal.month === target.month
    && finalLocal.day === target.day
    && finalLocal.hour === target.hour
    && finalLocal.minute === target.minute;

  if (!matches) {
    return null;
  }

  return new Date(guessUtcMs);
}

function parseUtcDateTimeLocalInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const utcDate = new Date(`${value}:00.000Z`);
  if (!Number.isFinite(utcDate.getTime())) {
    return null;
  }
  return utcDate;
}

function toUtcDateTimeLocalInput(dateValue) {
  if (!dateValue) {
    return "";
  }
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
}

function toDateTimeLocalInputInTimeZone(dateValue, timeZone) {
  if (!dateValue || !isValidIanaTimeZone(timeZone)) {
    return "";
  }

  const parts = getDatePartsInTimeZone(new Date(dateValue), timeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function normalizeScheduleRecurrence(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "daily" || value === "weekly" || value === "once") {
    return value;
  }
  return null;
}

function formatScheduleLocalTimeTextFromDateTimeLocal(rawValue) {
  const parts = parseDateTimeLocalParts(rawValue);
  if (!parts) {
    return "";
  }
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function buildSchedulePayloadFromRequest(body = {}) {
  const recurrence = normalizeScheduleRecurrence(body.recurrence);
  const timezoneNameRaw = String(body.custom_timezone_name || body.timezone_name || "UTC").trim();
  const timezoneName = timezoneNameRaw || "UTC";
  const endDateText = String(body.end_date || "").trim();
  const hasEndDate = Boolean(endDateText);

  if (!recurrence || !isValidIanaTimeZone(timezoneName)) {
    return { valid: false };
  }

  if (hasEndDate && !parseDateLocalParts(endDateText)) {
    return { valid: false };
  }

  if (recurrence === "once") {
    const onceRunAtLocal = String(body.once_run_at || body.first_run_at || "").trim();
    const nextRunAt = convertDateTimeLocalInTimeZoneToUtc(onceRunAtLocal, timezoneName);
    if (!nextRunAt) {
      return { valid: false };
    }

    const localParts = parseDateTimeLocalParts(onceRunAtLocal);
    if (!localParts) {
      return { valid: false };
    }

    const startDateText = formatDateText(localParts);
    const sendTimeText = formatTimeText(localParts);

    if (hasEndDate && compareDateText(startDateText, endDateText) > 0) {
      return { valid: false };
    }

    return {
      valid: true,
      recurrence,
      timezoneName,
      nextRunAt,
      localTimeText: formatScheduleLocalTimeTextFromDateTimeLocal(onceRunAtLocal),
      startDateText,
      sendTimeText,
      weeklyDays: [],
      endDateText: hasEndDate ? endDateText : "",
      onceRunAtLocal,
    };
  }

  const startDateText = String(body.start_date || "").trim();
  const sendTimeText = String(body.send_time || "").trim();
  if (!parseDateLocalParts(startDateText) || !parseTimeLocalParts(sendTimeText)) {
    return { valid: false };
  }

  if (hasEndDate && compareDateText(startDateText, endDateText) > 0) {
    return { valid: false };
  }

  const weeklyDays = recurrence === "weekly" ? normalizeWeeklyDaysInput(body.weekly_days) : [];
  if (recurrence === "weekly" && weeklyDays.length === 0) {
    return { valid: false };
  }

  const nextRunAt = computeRecurringNextRunUtc({
    recurrence,
    timezoneName,
    startDateText,
    sendTimeText,
    weeklyDays,
    endDateText: hasEndDate ? endDateText : "",
  });

  if (!nextRunAt) {
    return {
      valid: true,
      recurrence,
      timezoneName,
      nextRunAt: null,
      localTimeText: `${startDateText} ${sendTimeText}`,
      startDateText,
      sendTimeText,
      weeklyDays,
      endDateText: hasEndDate ? endDateText : "",
      onceRunAtLocal: "",
    };
  }

  return {
    valid: true,
    recurrence,
    timezoneName,
    nextRunAt,
    localTimeText: `${startDateText} ${sendTimeText}`,
    startDateText,
    sendTimeText,
    weeklyDays,
    endDateText: hasEndDate ? endDateText : "",
    onceRunAtLocal: "",
  };
}

function normalizeDiscountCode(rawValue) {
  return String(rawValue || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function parseNullablePositiveInt(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeOwnerDiscountFilters(query = {}) {
  const codeQuery = String(query.code_query || "").trim();
  const activeRaw = String(query.active || "all").trim().toLowerCase();
  const active = activeRaw === "true" || activeRaw === "false" ? activeRaw : "all";
  const appliesToRaw = String(query.applies_to || "all").trim().toLowerCase();
  const appliesTo = appliesToRaw === "one_time" || appliesToRaw === "subscription" || appliesToRaw === "both"
    ? appliesToRaw
    : "all";
  return { codeQuery, active, appliesTo };
}

function buildDiscountCodeMongoQuery(filters) {
  const query = {};
  if (filters.active === "true") {
    query.is_active = true;
  } else if (filters.active === "false") {
    query.is_active = false;
  }

  if (filters.codeQuery) {
    query.code = { $regex: `^${escapeRegex(filters.codeQuery.toUpperCase())}` };
  }

  if (filters.appliesTo && filters.appliesTo !== "all") {
    query.applies_to = filters.appliesTo;
  }

  return query;
}

function buildDiscountCodePreview(discountType, discountValue, amountCents, maxDiscountCents = null) {
  const amount = Math.max(Number.parseInt(String(amountCents || "0"), 10) || 0, 0);
  const value = Math.max(Number.parseInt(String(discountValue || "0"), 10) || 0, 0);
  const maxDiscount = Number.parseInt(String(maxDiscountCents || "0"), 10);
  if (!amount || !value) {
    return { discountCents: 0, finalAmountCents: amount };
  }

  let discountCents = 0;
  if (discountType === "percent") {
    discountCents = Math.floor((amount * value) / 100);
    if (Number.isFinite(maxDiscount) && maxDiscount > 0) {
      discountCents = Math.min(discountCents, maxDiscount);
    }
  } else {
    discountCents = value;
  }

  discountCents = Math.max(Math.min(discountCents, amount - 1), 0);
  return {
    discountCents,
    finalAmountCents: Math.max(amount - discountCents, 1),
  };
}

function toCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsvLine(values) {
  return values.map((value) => toCsvCell(value)).join(",");
}

async function resolveCheckoutDiscount({
  codeRaw,
  userId,
  packAmountCents,
  userGuildIds = [],
  purchaseType = "one_time",
}) {
  const normalizedCode = normalizeDiscountCode(codeRaw);
  if (!normalizedCode) {
    return { ok: true, code: "", discountCents: 0, finalAmountCents: packAmountCents };
  }

  const codeDoc = await aiImageDiscountCodesCollection.findOne({ code: normalizedCode });
  if (!codeDoc) {
    return { ok: false, reason: "invalid" };
  }

  if (!Boolean(codeDoc.is_active)) {
    return { ok: false, reason: "inactive" };
  }

  const now = new Date();
  if (codeDoc.expires_at && new Date(codeDoc.expires_at).getTime() < now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  const restrictedUserId = String(codeDoc.restricted_user_id || "").trim();
  if (restrictedUserId && restrictedUserId !== String(userId)) {
    return { ok: false, reason: "restricted" };
  }

  const restrictedGuildId = String(codeDoc.restricted_guild_id || "").trim();
  if (restrictedGuildId && !userGuildIds.includes(restrictedGuildId)) {
    return { ok: false, reason: "restricted_guild" };
  }

  const appliesTo = String(codeDoc.applies_to || "both").trim().toLowerCase();
  const normalizedPurchaseType = String(purchaseType || "one_time").trim().toLowerCase();
  if (
    (appliesTo === "one_time" && normalizedPurchaseType !== "one_time")
    || (appliesTo === "subscription" && normalizedPurchaseType !== "subscription")
  ) {
    return { ok: false, reason: "purchase_type" };
  }

  const maxUses = Number.parseInt(String(codeDoc.max_uses || "0"), 10);
  const usesCount = Number.parseInt(String(codeDoc.uses_count || "0"), 10);
  if (Number.isFinite(maxUses) && maxUses > 0 && Number.isFinite(usesCount) && usesCount >= maxUses) {
    return { ok: false, reason: "maxed" };
  }

  const minSpendCents = Math.max(Number.parseInt(String(codeDoc.min_spend_cents || "0"), 10) || 0, 0);
  if (packAmountCents < minSpendCents) {
    return { ok: false, reason: "min_spend" };
  }

  const discountType = String(codeDoc.discount_type || "").trim().toLowerCase();
  const discountValue = Number.parseInt(String(codeDoc.discount_value || "0"), 10);
  const maxDiscountCents = parseNullablePositiveInt(codeDoc.max_discount_cents);

  if ((discountType !== "fixed_cents" && discountType !== "percent") || !Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, reason: "invalid" };
  }

  const preview = buildDiscountCodePreview(discountType, discountValue, packAmountCents, maxDiscountCents);
  if (preview.discountCents <= 0) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    code: normalizedCode,
    discountCents: preview.discountCents,
    finalAmountCents: preview.finalAmountCents,
  };
}

function normalizeLevelsFromRequest(body) {
  const levelValues = Array.isArray(body.level) ? body.level : [body.level];
  const nameValues = Array.isArray(body.level_name) ? body.level_name : [body.level_name];
  const interactionsValues = Array.isArray(body.interactions_required)
    ? body.interactions_required
    : [body.interactions_required];

  const rowCount = Math.max(levelValues.length, nameValues.length, interactionsValues.length);
  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const levelRaw = levelValues[index];
    const nameRaw = nameValues[index];
    const interactionsRaw = interactionsValues[index];

    if (levelRaw === undefined && nameRaw === undefined && interactionsRaw === undefined) {
      continue;
    }

    const level = Number.parseInt(String(levelRaw || ""), 10);
    const name = String(nameRaw || "").trim();
    const interactionsRequired = Number.parseInt(String(interactionsRaw || ""), 10);

    if (!Number.isFinite(level) || !Number.isFinite(interactionsRequired) || name.length === 0) {
      continue;
    }

    rows.push({
      level,
      name,
      interactions_required: Math.max(interactionsRequired, 0),
    });
  }

  if (rows.length === 0) {
    return null;
  }

  const deduped = new Map();
  for (const row of rows) {
    deduped.set(row.level, row);
  }

  const normalized = Array.from(deduped.values()).sort((a, b) => a.interactions_required - b.interactions_required);
  return normalized;
}

function normalizeLevelsFromJsonPayload(rawPayload) {
  let parsed;
  try {
    parsed = JSON.parse(String(rawPayload || "").trim());
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const rows = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const level = Number.parseInt(String(row.level), 10);
    const name = String(row.name || row.level_name || "").trim();
    const interactionsRequired = Number.parseInt(String(row.interactions_required), 10);

    if (!Number.isFinite(level) || !Number.isFinite(interactionsRequired) || name.length === 0) {
      continue;
    }

    rows.push({
      level,
      name,
      interactions_required: Math.max(interactionsRequired, 0),
    });
  }

  if (rows.length === 0) {
    return null;
  }

  const deduped = new Map();
  for (const row of rows) {
    deduped.set(row.level, row);
  }

  return Array.from(deduped.values()).sort((a, b) => a.interactions_required - b.interactions_required);
}

function normalizeBooleanFlag(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value || "").trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes") {
    return true;
  }
  if (text === "false" || text === "0" || text === "no") {
    return false;
  }
  return fallback;
}

function normalizeScheduledMessagesFromImport(rawSchedules) {
  if (!Array.isArray(rawSchedules)) {
    return null;
  }

  const normalized = [];
  for (const row of rawSchedules) {
    if (!row || typeof row !== "object") {
      return null;
    }

    const channelId = String(row.channel_id || "").trim();
    const messageContent = String(row.message_content || "").trim();
    const recurrence = normalizeScheduleRecurrence(row.recurrence);
    const timezoneName = String(row.timezone_name || "UTC").trim() || "UTC";
    const active = normalizeBooleanFlag(row.active, true);

    if (!/^\d+$/.test(channelId) || !messageContent || messageContent.length > 1800 || !recurrence) {
      return null;
    }

    const requestLikeBody = {
      recurrence,
      timezone_name: timezoneName,
      once_run_at: String(row.once_run_at || "").trim(),
      start_date: String(row.start_date || "").trim(),
      send_time: String(row.send_time || "").trim(),
      weekly_days: row.weekly_days,
      end_date: String(row.end_date || "").trim(),
    };

    const schedulePayload = buildSchedulePayloadFromRequest(requestLikeBody);
    if (!schedulePayload.valid) {
      return null;
    }

    if (active && (!schedulePayload.nextRunAt || schedulePayload.nextRunAt.getTime() <= Date.now())) {
      return null;
    }

    normalized.push({
      channel_id: snowflakeToLong(channelId),
      message_content: messageContent,
      recurrence: schedulePayload.recurrence,
      timezone_name: schedulePayload.timezoneName,
      local_time_text: schedulePayload.localTimeText,
      start_date_text: schedulePayload.startDateText,
      send_time_text: schedulePayload.sendTimeText,
      weekly_days: schedulePayload.weeklyDays,
      end_date_text: schedulePayload.endDateText,
      next_run_at: schedulePayload.nextRunAt,
      active,
    });
  }

  return normalized;
}

function buildGuildSettingsExportPayload({ guild, guildFeatures, customModerationTerms, levels, scheduledMessages }) {
  const scheduleRows = Array.isArray(scheduledMessages) ? scheduledMessages : [];

  return {
    version: 1,
    guild_id: String(guild?.id || ""),
    guild_name: String(guild?.name || ""),
    exported_at: new Date().toISOString(),
    guild_features: normalizeGuildFeatures(guildFeatures),
    gamification_levels: sanitizeLevels(levels),
    moderation_custom_terms: sanitizeModerationCustomTerms(customModerationTerms),
    scheduled_messages: scheduleRows.map((row) => {
      const timezoneName = String(row.timezone_name || "UTC");
      const recurrence = normalizeScheduleRecurrence(row.recurrence) || "once";
      const nextRunAt = row.next_run_at || null;
      const onceRunAt = recurrence === "once"
        ? toDateTimeLocalInputInTimeZone(nextRunAt, timezoneName)
        : "";
      const fallbackDate = toDateInputInTimeZone(nextRunAt, timezoneName);
      const fallbackTime = toTimeInputInTimeZone(nextRunAt, timezoneName);

      return {
        channel_id: String(toSafeInt(row.channel_id || row.channel_id_display || 0)),
        message_content: String(row.message_content || ""),
        recurrence,
        timezone_name: timezoneName,
        active: Boolean(row.active),
        once_run_at: onceRunAt,
        start_date: String(row.start_date_text || fallbackDate || ""),
        send_time: String(row.send_time_text || fallbackTime || ""),
        weekly_days: Array.isArray(row.weekly_days) ? normalizeWeeklyDaysInput(row.weekly_days) : [],
        end_date: String(row.end_date_text || ""),
      };
    }),
  };
}

function buildUpsertUpdate(guildId, guildName, installerUserId, levels) {
  const now = new Date();
  return {
    filter: { guild_id: snowflakeToLong(guildId) },
    update: {
      $set: {
        guild_id: snowflakeToLong(guildId),
        guild_name: guildName,
        gamification_levels: levels,
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
        sku: "Free",
        translationallowance: 500,
        translationcharacterallowance: getTranslationFreeCharacterLimit(),
        aiimagegenallowance: 50,
        installer_user_id: installerUserId,
      },
    },
  };
}

app.get("/", (req, res) => {
  res.render("home", { title: req.t("meta.homeTitle") });
});

app.get("/terms", (req, res) => {
  res.render("terms", { title: req.t("meta.termsTitle") });
});

app.get("/privacy", (req, res) => {
  res.render("privacy", { title: req.t("meta.privacyTitle") });
});

app.get("/help", (req, res) => {
  res.render("help", { title: req.t("meta.helpTitle") });
});

app.get("/set-language", (req, res) => {
  const selectedLanguage = normalizeLanguage(req.query.lang) || DEFAULT_LANGUAGE;
  if (req.session) {
    req.session.preferredLanguage = selectedLanguage;
  }

  const requestedRedirect = String(req.query.redirect || "/").trim();
  const safeRedirect = requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
    ? requestedRedirect
    : "/";

  res.redirect(safeRedirect);
});

app.get("/auth/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    prompt: "consent",
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(401).render("error", {
      title: "Login Failed",
      message: `Discord authorization failed: ${error}`,
    });
  }

  if (!code) {
    return res.status(400).render("error", {
      title: "Login Failed",
      message: "Missing Discord authorization code.",
    });
  }

  try {
    const tokenData = await exchangeDiscordCodeForToken(code);
    const userData = await discordUserRequest(tokenData.access_token, "/users/@me");

    req.session.discord = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    req.session.user = {
      id: String(userData.id),
      username: userData.username,
      globalName: userData.global_name,
      avatar: userData.avatar,
    };

    return res.redirect("/my-account");
  } catch (error) {
    const statusCode = error?.response?.status;
    const discordError = error?.response?.data?.error;
    const discordErrorDescription = error?.response?.data?.error_description;

    console.error("[ERROR] Discord OAuth callback failed", {
      statusCode,
      discordError,
      discordErrorDescription,
      message: error?.message,
    });

    let errorMessage = "Could not sign in with Discord. Please try again.";
    if (typeof discordErrorDescription === "string" && discordErrorDescription.trim() !== "") {
      errorMessage = `Discord login failed: ${discordErrorDescription}`;
    } else if (typeof discordError === "string" && discordError.trim() !== "") {
      errorMessage = `Discord login failed: ${discordError}`;
    }

    return res.status(500).render("error", {
      title: req.t("errors.loginFailedTitle", { defaultValue: "Login Failed" }),
      message: errorMessage,
    });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/my-account", requireAuth, async (req, res) => {
  return renderMySubscriptionsPage(req, res);
});

app.get("/dashboard", requireAuth, (req, res) => {
  const params = new URLSearchParams(req.query || {}).toString();
  return res.redirect(`/my-account${params ? `?${params}` : ""}`);
});

async function renderMySubscriptionsPage(req, res) {
  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const creditPackPopularity = await getCreditPackPopularityData();

    await migrateLegacyUserCreditsToGlobalWallet(req.session.user.id, username);
    await Promise.all([
      reconcileUserSubscriptionStatuses(req.session.user.id),
      reconcilePersonalTranslationSubscriptionStatuses(req.session.user.id),
    ]);

    const [summary, purchases, subscriptions, personalTranslationSubscriptions, translationPurchases, personalTranslationUsage, personalTranslationAllowance] = await Promise.all([
      getUserAiImageCreditsSummary(req.session.user.id),
      aiImageCreditPurchasesCollection
        .find(
          {
            user_id: snowflakeToLong(req.session.user.id),
          },
          {
            projection: {
              credits: 1,
              pack_id: 1,
              payment_type: 1,
              amount_total_cents: 1,
              currency: 1,
              discount_code: 1,
              discount_cents: 1,
              stripe_subscription_id: 1,
              created_at: 1,
            },
          }
        )
        .sort({ created_at: -1 })
        .limit(40)
        .toArray(),
      getDisplayActiveSubscriptions(req.session.user.id),
      getDisplayActivePersonalTranslationSubscriptions(req.session.user.id),
      translationCharacterPurchasesCollection
        .find(
          {
            purchase_scope: "translation_user_personal",
            user_id: snowflakeToLong(req.session.user.id),
          },
          {
            projection: {
              plan_id: 1,
              characters_per_month: 1,
              payment_type: 1,
              amount_total_cents: 1,
              currency: 1,
              discount_code: 1,
              discount_cents: 1,
              stripe_subscription_id: 1,
              created_at: 1,
            },
          }
        )
        .sort({ created_at: -1 })
        .limit(40)
        .toArray(),
      getUserMonthlyTranslationCharacterUsage(req.session.user.id),
      getUserTranslationCharacterAllowance(req.session.user.id),
    ]);

    return res.render("dashboard", {
      title: req.t("dashboard.title", { defaultValue: "Dashboard" }),
      guilds,
      summary,
      purchases,
      subscriptions,
      personalTranslationSubscriptions,
      translationPurchases,
      personalTranslationSummary: {
        monthlyUsage: Math.max(toSafeInt(personalTranslationUsage), 0),
        allowance: Math.max(toSafeInt(personalTranslationAllowance), 0),
        remaining: Math.max(toSafeInt(personalTranslationAllowance) - toSafeInt(personalTranslationUsage), 0),
      },
      purchased: req.query.purchased === "1",
      checkoutSuccess: req.query.checkout === "success",
      checkoutCanceled: req.query.checkout === "canceled",
      subscribedSuccess: req.query.subscription === "success",
      translationSubscribedSuccess: req.query.translation_subscription === "success",
      translationSubscriptionCanceled: req.query.translation_subscription === "canceled",
      translationSubscriptionStatus: String(req.query.translationSub || "").trim().toLowerCase(),
      backfillStatus: String(req.query.backfill || "").trim().toLowerCase(),
      backfillCredits: Math.max(Number.parseInt(String(req.query.backfill_credits || "0"), 10) || 0, 0),
      discountStatus: String(req.query.discount || "").trim().toLowerCase(),
      stripeConfigured: isStripeConfigured(),
      creditPackOptions: buildCreditPackOptions({
        mostPopularPackIds: creditPackPopularity.mostPopularPackIds,
        purchaseCountByPackId: creditPackPopularity.purchaseCountByPackId,
      }),
      subscriptionPlanOptions: buildSubscriptionPlanOptions(),
      translationSubscriptionPlanOptions: getPersonalTranslationSubscriptionPlans(),
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: req.t("errors.dashboardErrorTitle", { defaultValue: "Dashboard Error" }),
      message: req.t("errors.dashboardErrorMessage", { defaultValue: "Could not load your dashboard data." }),
    });
  }
}

app.get("/subscriptions", requireAuth, (req, res) => {
  const params = new URLSearchParams(req.query || {}).toString();
  return res.redirect(`/my-account${params ? `?${params}` : ""}`);
});

app.get("/credits", requireAuth, (req, res) => {
  const params = new URLSearchParams(req.query || {}).toString();
  return res.redirect(`/my-account${params ? `?${params}` : ""}`);
});

app.get("/ai-image-generation", requireAuth, async (req, res) => {
  try {
    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");

    await migrateLegacyUserCreditsToGlobalWallet(req.session.user.id, username);

    const [summary, recentWebGenerations] = await Promise.all([
      getUserAiImageCreditsSummary(req.session.user.id),
      getUserRecentWebGenerations(req.session.user.id, 10),
    ]);

    return res.render("ai-image-generation", {
      title: req.t("credits.generate.title", { defaultValue: "Generate AI Image on Website" }),
      summary,
      generationStatus: String(req.query.generate || "").trim().toLowerCase(),
      recentWebGenerations,
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: req.t("errors.creditsErrorTitle", { defaultValue: "Credits Error" }),
      message: req.t("errors.creditsErrorMessage", { defaultValue: "Could not load AI image credits." }),
    });
  }
});

app.post(["/credits/generate-image", "/ai-image-generation/generate-image"], requireAuth, aiImageUpload.single("source_image"), async (req, res) => {
  const prefersJson = String(req.get("x-discobot-ajax") || "").trim() === "1";
  const respondGenerationStatus = (status, extra = {}) => {
    if (prefersJson) {
      const code = status === "success" ? 200 : 400;
      return res.status(code).json({ ok: status === "success", status, ...extra });
    }
    return res.redirect(`/ai-image-generation?generate=${status}`);
  };

  try {
    if (!openai) {
      return respondGenerationStatus("unavailable");
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const prompt = sanitizeWebImagePrompt(req.body.prompt);
    const generationMode = String(req.body.generation_mode || "text").trim().toLowerCase() === "edit"
      ? "edit"
      : "text";

    // Website generation is intentionally personal-only (no guild context selection on this flow).
    // Ignore any guild-related values that may be posted by a client.
    const ignoredGuildContext = {
      guildId: String(req.body.guild_id || "").trim(),
      purchaseScope: String(req.body.purchase_scope || "").trim().toLowerCase(),
    };
    void ignoredGuildContext;

    if (!prompt) {
      return respondGenerationStatus("invalid_prompt");
    }

    if (generationMode === "edit" && !req.file) {
      return respondGenerationStatus("invalid_image");
    }

    await migrateLegacyUserCreditsToGlobalWallet(req.session.user.id, username);

    const creditConsumeResult = await consumeUserAiImageCredit(req.session.user.id, username);
    if (!creditConsumeResult.consumed) {
      return respondGenerationStatus("no_credits");
    }

    let generatedImageBuffer;
    try {
      if (generationMode === "edit") {
        generatedImageBuffer = await generateWebsiteAiImageFromImage({
          prompt,
          imageBuffer: req.file.buffer,
          filename: req.file.originalname || "input.png",
          mimeType: req.file.mimetype || "image/png",
        });
      } else {
        generatedImageBuffer = await generateWebsiteAiImage(prompt);
      }
    } catch (error) {
      await refundUserAiImageCredit(req.session.user.id, username);
      return respondGenerationStatus("failed");
    }

    const createdAt = new Date();
    const insertResult = await aiImageWebGenerationsCollection.insertOne({
      user_id: snowflakeToLong(req.session.user.id),
      username,
      prompt,
      mode: generationMode,
      source_filename: generationMode === "edit" ? String(req.file?.originalname || "") : "",
      model: OPENAI_IMAGE_MODEL,
      image_mime_type: "image/png",
      image_data: generatedImageBuffer,
      created_at: createdAt,
    });

    return respondGenerationStatus("success", {
      entry: {
        id: String(insertResult.insertedId || ""),
        prompt,
        mode: generationMode,
        model: OPENAI_IMAGE_MODEL,
        source: "website",
        createdAt: createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (prefersJson) {
      return res.status(500).json({ ok: false, status: "failed" });
    }
    return res.redirect("/ai-image-generation?generate=failed");
  }
});

app.get("/credits/generated/:imageId", requireAuth, async (req, res) => {
  try {
    const imageId = String(req.params.imageId || "").trim();
    if (!ObjectId.isValid(imageId)) {
      return res.status(404).send("Not found");
    }

    const row = await aiImageWebGenerationsCollection.findOne(
      {
        _id: new ObjectId(imageId),
        user_id: snowflakeToLong(req.session.user.id),
      },
      {
        projection: {
          image_data: 1,
          image_mime_type: 1,
        },
      }
    );

    if (!row?.image_data) {
      return res.status(404).send("Not found");
    }

    res.setHeader("Content-Type", String(row.image_mime_type || "image/png"));
    res.setHeader("Cache-Control", "private, max-age=300");
    if (String(req.query.download || "") === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="discobot-generated-${imageId}.png"`);
    }
    return res.send(row.image_data.buffer ? Buffer.from(row.image_data.buffer) : row.image_data);
  } catch {
    return res.status(404).send("Not found");
  }
});

app.post("/credits/subscription/manage", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Billing Portal Unavailable",
        message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const stripeSubscriptionIdFromRequest = String(req.body.stripe_subscription_id || "").trim();
    const subscriptionFilter = {
      user_id: snowflakeToLong(req.session.user.id),
      status: { $in: ["active", "trialing", "past_due", "unpaid"] },
    };

    if (stripeSubscriptionIdFromRequest) {
      subscriptionFilter.stripe_subscription_id = stripeSubscriptionIdFromRequest;
    }

    const subscriptionRecord = await aiImageCreditSubscriptionsCollection.findOne(subscriptionFilter, {
      projection: {
        stripe_subscription_id: 1,
        stripe_customer_id: 1,
      },
      sort: { updated_at: -1 },
    });

    if (!subscriptionRecord || !subscriptionRecord.stripe_subscription_id) {
      return res.status(404).render("error", {
        title: "No Active Subscription",
        message: "No matching active Stripe subscription was found for your account.",
      });
    }

    let stripeCustomerId = String(subscriptionRecord.stripe_customer_id || "").trim();
    if (!stripeCustomerId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(String(subscriptionRecord.stripe_subscription_id));
      stripeCustomerId = String(stripeSubscription?.customer || "").trim();

      if (!stripeCustomerId) {
        return res.status(500).render("error", {
          title: "Billing Portal Error",
          message: "Could not resolve Stripe customer for this subscription.",
        });
      }

      await aiImageCreditSubscriptionsCollection.updateOne(
        { stripe_subscription_id: String(subscriptionRecord.stripe_subscription_id) },
        {
          $set: {
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date(),
          },
        }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${WEBSITE_BASE_URL}/my-account`,
    });

    return res.redirect(303, portalSession.url);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Billing Portal Error",
      message: "Could not open Stripe Billing Portal. Please try again.",
    });
  }
});

app.post("/credits/subscription/backfill", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Backfill Unavailable",
        message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const userId = String(req.session.user.id || "").trim();
    if (!userId) {
      return res.redirect(`/my-account?backfill=already_applied&backfill_credits=0`);
    }

    const [aiSubscriptionRecords, translationSubscriptionRecords] = await Promise.all([
      aiImageCreditSubscriptionsCollection
        .find(
          {
            user_id: snowflakeToLong(userId),
          },
          {
            projection: {
              stripe_subscription_id: 1,
            },
          }
        )
        .toArray(),
      translationCharacterSubscriptionsCollection
        .find(
          {
            purchase_scope: "translation_user_personal",
            user_id: snowflakeToLong(userId),
          },
          {
            projection: {
              stripe_subscription_id: 1,
            },
          }
        )
        .toArray(),
    ]);

    const stripeSubscriptionIds = Array.from(
      new Set(
        [...(aiSubscriptionRecords || []), ...(translationSubscriptionRecords || [])]
          .map((row) => String(row?.stripe_subscription_id || "").trim())
          .filter(Boolean)
      )
    );

    let creditedAmount = 0;
    const processedInvoiceIds = new Set();

    for (const stripeSubscriptionId of stripeSubscriptionIds) {
      let invoiceList;
      try {
        invoiceList = await stripe.invoices.list({
          subscription: stripeSubscriptionId,
          limit: 25,
        });
      } catch (error) {
        console.error("[WARN] Backfill invoice listing failed", {
          stripeSubscriptionId,
          userId,
          message: error?.message,
        });
        continue;
      }

      const paidInvoices = (invoiceList.data || []).filter(
        (invoice) => invoice && (invoice.paid === true || String(invoice.status || "") === "paid")
      );

      for (const invoice of paidInvoices) {
        const invoiceId = String(invoice?.id || "").trim();
        if (!invoiceId || processedInvoiceIds.has(invoiceId)) {
          continue;
        }
        processedInvoiceIds.add(invoiceId);
        try {
          creditedAmount += await fulfillStripeSubscriptionInvoice(invoice);
        } catch (error) {
          console.error("[WARN] Backfill invoice fulfillment failed", {
            stripeSubscriptionId,
            invoiceId,
            userId,
            message: error?.message,
          });
        }
      }
    }

    let nextCursor = "";
    let hasMore = true;
    let safetyPageCounter = 0;
    while (hasMore && safetyPageCounter < 5) {
      const sessionList = await stripe.checkout.sessions.list({
        limit: 100,
        ...(nextCursor ? { starting_after: nextCursor } : {}),
      });

      const sessions = Array.isArray(sessionList?.data) ? sessionList.data : [];
      for (const session of sessions) {
        if (!session) {
          continue;
        }

        const mode = String(session.mode || "").trim().toLowerCase();
        const isPaidPayment = mode === "payment" && String(session.payment_status || "") === "paid";
        const isSubscriptionCheckout = mode === "subscription";
        if (!isPaidPayment && !isSubscriptionCheckout) {
          continue;
        }

        const sessionUserId = String(session.metadata?.user_id || "").trim();
        if (!sessionUserId || sessionUserId !== userId) {
          continue;
        }

        try {
          creditedAmount += await fulfillStripeCheckoutSession(session);
        } catch (error) {
          console.error("[WARN] Backfill checkout fulfillment failed", {
            sessionId: String(session.id || ""),
            mode,
            userId,
            message: error?.message,
          });
        }
      }

      hasMore = Boolean(sessionList?.has_more);
      nextCursor = sessions.length ? String(sessions[sessions.length - 1].id || "") : "";
      if (!nextCursor) {
        break;
      }
      safetyPageCounter += 1;
    }

    return res.redirect(
      `/my-account?backfill=${creditedAmount > 0 ? "granted" : "already_applied"}&backfill_credits=${creditedAmount}`
    );
  } catch (error) {
    return res.status(500).render("error", {
      title: "Backfill Error",
      message: "Could not process purchase backfill. Please try again.",
    });
  }
});

app.post("/credits/checkout", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Checkout Unavailable",
        message: "Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const pack = normalizeCreditPackId(req.body.pack_id);
    if (!pack) {
      return res.status(400).render("error", {
        title: "Purchase Failed",
        message: "Invalid credit pack selected.",
      });
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const userGuildIds = guilds.map((guild) => String(guild.id || "").trim()).filter(Boolean);
    const discountResolution = await resolveCheckoutDiscount({
      codeRaw: req.body.discount_code,
      userId: req.session.user.id,
      packAmountCents: pack.unitAmountCents,
      userGuildIds,
      purchaseType: "one_time",
    });

    if (!discountResolution.ok) {
      return res.redirect(`/my-account?discount=${discountResolution.reason}`);
    }

    const metadata = buildCreditPurchaseMetadata({
      user: req.session.user,
      username,
      packId: pack.id,
      purchaseScope: "ai_user_personal",
      discountCode: discountResolution.code,
      discountCents: discountResolution.discountCents,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${WEBSITE_BASE_URL}/my-account?checkout=success`,
      cancel_url: `${WEBSITE_BASE_URL}/my-account?checkout=canceled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: discountResolution.finalAmountCents,
            product_data: {
              name: `${pack.name} AI Image Credits`,
              description: discountResolution.discountCents > 0
                ? `${pack.credits} personal credits across all your DiscoBot guilds · Discount code ${discountResolution.code}`
                : `${pack.credits} personal credits usable across all your DiscoBot guilds`,
            },
          },
        },
      ],
      metadata,
    });

    return res.redirect(303, checkoutSession.url);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Purchase Failed",
      message: "Could not create Stripe checkout session. Please try again.",
    });
  }
});

app.post("/credits/subscribe", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Subscription Unavailable",
        message: "Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const plan = normalizeSubscriptionPlanId(req.body.plan_id);
    if (!plan) {
      return res.status(400).render("error", {
        title: "Subscription Failed",
        message: "Invalid monthly subscription plan selected.",
      });
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const userGuildIds = guilds.map((guild) => String(guild.id || "").trim()).filter(Boolean);
    const discountResolution = await resolveCheckoutDiscount({
      codeRaw: req.body.discount_code,
      userId: req.session.user.id,
      packAmountCents: plan.unitAmountCents,
      userGuildIds,
      purchaseType: "subscription",
    });

    if (!discountResolution.ok) {
      return res.redirect(`/my-account?discount=${discountResolution.reason}`);
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const metadata = buildCreditPurchaseMetadata({
      user: req.session.user,
      username,
      packId: "",
      subscriptionPlanId: plan.id,
      purchaseScope: "ai_user_personal",
      discountCode: discountResolution.code,
      discountCents: discountResolution.discountCents,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      success_url: `${WEBSITE_BASE_URL}/my-account?subscription=success`,
      cancel_url: `${WEBSITE_BASE_URL}/my-account?checkout=canceled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            unit_amount: discountResolution.finalAmountCents,
            product_data: {
              name: `${plan.name} AI Image Credits Subscription`,
              description: discountResolution.discountCents > 0
                ? `${plan.creditsPerMonth} personal credits/month usable across all your DiscoBot guilds · Discount code ${discountResolution.code}`
                : `${plan.creditsPerMonth} personal credits/month usable across all your DiscoBot guilds`,
            },
          },
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
    });

    return res.redirect(303, checkoutSession.url);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Subscription Failed",
      message: "Could not create Stripe subscription checkout session. Please try again.",
    });
  }
});

app.post("/subscriptions/translation/subscribe", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Subscription Unavailable",
        message: "Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const plan = normalizeTranslationSubscriptionPlanId(req.body.translation_plan_id, "translation_user_personal");
    if (!plan) {
      return res.redirect("/my-account?translationSub=invalid_plan");
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const userGuildIds = guilds.map((guild) => String(guild.id || "").trim()).filter(Boolean);
    const discountResolution = await resolveCheckoutDiscount({
      codeRaw: req.body.discount_code,
      userId: req.session.user.id,
      packAmountCents: plan.unitAmountCents,
      userGuildIds,
      purchaseType: "subscription",
    });

    if (!discountResolution.ok) {
      return res.redirect(`/my-account?discount=${discountResolution.reason}`);
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const metadata = buildTranslationSubscriptionMetadata({
      user: req.session.user,
      username,
      purchaseScope: "translation_user_personal",
      translationPlanId: plan.id,
      discountCode: discountResolution.code,
      discountCents: discountResolution.discountCents,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      success_url: `${WEBSITE_BASE_URL}/my-account?translation_subscription=success`,
      cancel_url: `${WEBSITE_BASE_URL}/my-account?translation_subscription=canceled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            unit_amount: discountResolution.finalAmountCents,
            product_data: {
              name: `${plan.name} Personal Translation Subscription`,
              description: discountResolution.discountCents > 0
                ? `${plan.charactersPerMonth.toLocaleString()} personal translation characters/month usable across all your DiscoBot guilds · Discount code ${discountResolution.code}`
                : `${plan.charactersPerMonth.toLocaleString()} personal translation characters/month usable across all your DiscoBot guilds`,
            },
          },
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
    });

    return res.redirect(303, checkoutSession.url);
  } catch {
    return res.redirect("/my-account?translationSub=error");
  }
});

app.post("/subscriptions/translation/subscription/manage", requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Billing Portal Unavailable",
        message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const stripeSubscriptionIdFromRequest = String(req.body.stripe_subscription_id || "").trim();
    const userId = snowflakeToLong(req.session.user.id);
    const subscriptionFilter = {
      purchase_scope: "translation_user_personal",
      user_id: userId,
      status: { $in: Array.from(getActiveSubscriptionStatusSet()) },
    };

    if (stripeSubscriptionIdFromRequest) {
      subscriptionFilter.stripe_subscription_id = stripeSubscriptionIdFromRequest;
    }

    const subscriptionRecord = await translationCharacterSubscriptionsCollection.findOne(subscriptionFilter, {
      projection: {
        stripe_subscription_id: 1,
        stripe_customer_id: 1,
      },
      sort: { updated_at: -1 },
    });

    if (!subscriptionRecord || !subscriptionRecord.stripe_subscription_id) {
      return res.redirect("/my-account?translationSub=no_subscription");
    }

    let stripeCustomerId = String(subscriptionRecord.stripe_customer_id || "").trim();
    if (!stripeCustomerId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(String(subscriptionRecord.stripe_subscription_id));
      stripeCustomerId = String(stripeSubscription?.customer || "").trim();
      if (!stripeCustomerId) {
        return res.redirect("/my-account?translationSub=error");
      }

      await translationCharacterSubscriptionsCollection.updateOne(
        { stripe_subscription_id: String(subscriptionRecord.stripe_subscription_id) },
        {
          $set: {
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date(),
          },
        }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${WEBSITE_BASE_URL}/my-account`,
    });

    return res.redirect(303, portalSession.url);
  } catch {
    return res.redirect("/my-account?translationSub=error");
  }
});

app.post("/dashboard/:guildId/translation/subscribe", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Subscription Unavailable",
        message: "Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to purchase translation subscriptions for this guild.",
      });
    }

    const plan = normalizeTranslationSubscriptionPlanId(req.body.translation_plan_id, "translation_guild");
    if (!plan) {
      return res.redirect(`/dashboard/${guildId}?translationSub=invalid_plan`);
    }

    const userGuildIds = guilds.map((row) => String(row.id || "").trim()).filter(Boolean);
    const discountResolution = await resolveCheckoutDiscount({
      codeRaw: req.body.discount_code,
      userId: req.session.user.id,
      packAmountCents: plan.unitAmountCents,
      userGuildIds,
      purchaseType: "subscription",
    });

    if (!discountResolution.ok) {
      return res.redirect(`/my-account?discount=${discountResolution.reason}`);
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const metadata = buildTranslationSubscriptionMetadata({
      user: req.session.user,
      username,
      guildId,
      guildName: guild.name,
      translationPlanId: plan.id,
      discountCode: discountResolution.code,
      discountCents: discountResolution.discountCents,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      success_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}?translationSub=success`,
      cancel_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}?translationSub=canceled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            unit_amount: discountResolution.finalAmountCents,
            product_data: {
              name: `${plan.name} Translation Subscription`,
              description: discountResolution.discountCents > 0
                ? `${plan.charactersPerMonth.toLocaleString()} additional translation characters/month for ${guild.name} · Discount code ${discountResolution.code}`
                : `${plan.charactersPerMonth.toLocaleString()} additional translation characters/month for ${guild.name}`,
            },
          },
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
    });

    return res.redirect(303, checkoutSession.url);
  } catch {
    return res.redirect(`/dashboard/${guildId}?translationSub=error`);
  }
});

app.post("/dashboard/:guildId/translation/subscription/manage", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Billing Portal Unavailable",
        message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to manage translation subscriptions for this guild.",
      });
    }

    const stripeSubscriptionIdFromRequest = String(req.body.stripe_subscription_id || "").trim();
    const subscriptionFilter = {
      $or: [
        { purchase_scope: { $exists: false } },
        { purchase_scope: "translation_guild" },
        { purchase_scope: "" },
        { purchase_scope: null },
      ],
      guild_id: snowflakeToLong(guildId),
      status: { $in: Array.from(getActiveSubscriptionStatusSet()) },
    };
    if (stripeSubscriptionIdFromRequest) {
      subscriptionFilter.stripe_subscription_id = stripeSubscriptionIdFromRequest;
    }

    const subscriptionRecord = await translationCharacterSubscriptionsCollection.findOne(subscriptionFilter, {
      projection: {
        stripe_subscription_id: 1,
        stripe_customer_id: 1,
      },
      sort: { updated_at: -1 },
    });

    if (!subscriptionRecord || !subscriptionRecord.stripe_subscription_id) {
      return res.redirect(`/dashboard/${guildId}?translationSub=no_subscription`);
    }

    let stripeCustomerId = String(subscriptionRecord.stripe_customer_id || "").trim();
    if (!stripeCustomerId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(String(subscriptionRecord.stripe_subscription_id));
      stripeCustomerId = String(stripeSubscription?.customer || "").trim();
      if (!stripeCustomerId) {
        return res.redirect(`/dashboard/${guildId}?translationSub=error`);
      }

      await translationCharacterSubscriptionsCollection.updateOne(
        { stripe_subscription_id: String(subscriptionRecord.stripe_subscription_id) },
        {
          $set: {
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date(),
          },
        }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}`,
    });

    return res.redirect(303, portalSession.url);
  } catch {
    return res.redirect(`/dashboard/${guildId}?translationSub=error`);
  }
});

app.post("/dashboard/:guildId/ai-credits/checkout", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Checkout Unavailable",
        message: "Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to buy AI credits for this guild.",
      });
    }

    const pack = normalizeGuildCreditPackId(req.body.pack_id);
    if (!pack) {
      return res.redirect(`/dashboard/${guildId}?aiCredits=invalid_pack`);
    }

    const userGuildIds = guilds.map((row) => String(row.id || "").trim()).filter(Boolean);
    const discountResolution = await resolveCheckoutDiscount({
      codeRaw: req.body.discount_code,
      userId: req.session.user.id,
      packAmountCents: pack.unitAmountCents,
      userGuildIds,
      purchaseType: "one_time",
    });

    if (!discountResolution.ok) {
      return res.redirect(`/my-account?discount=${discountResolution.reason}`);
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const metadata = buildCreditPurchaseMetadata({
      user: req.session.user,
      username,
      packId: pack.id,
      purchaseScope: "ai_guild",
      guildId,
      guildName: guild.name,
      discountCode: discountResolution.code,
      discountCents: discountResolution.discountCents,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}?aiCredits=success`,
      cancel_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}?aiCredits=canceled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: discountResolution.finalAmountCents,
            product_data: {
              name: `${pack.name} Guild AI Credits`,
              description: discountResolution.discountCents > 0
                ? `${pack.credits} guild AI credits for ${guild.name} · Discount code ${discountResolution.code}`
                : `${pack.credits} guild AI credits for ${guild.name}`,
            },
          },
        },
      ],
      metadata,
    });

    return res.redirect(303, checkoutSession.url);
  } catch {
    return res.redirect(`/dashboard/${guildId}?aiCredits=error`);
  }
});

app.post("/dashboard/:guildId/ai-credits/subscribe", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Subscription Unavailable",
        message: "Stripe checkout is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to buy AI subscriptions for this guild.",
      });
    }

    const plan = normalizeGuildSubscriptionPlanId(req.body.plan_id);
    if (!plan) {
      return res.redirect(`/dashboard/${guildId}?aiSub=invalid_plan`);
    }

    const userGuildIds = guilds.map((row) => String(row.id || "").trim()).filter(Boolean);
    const discountResolution = await resolveCheckoutDiscount({
      codeRaw: req.body.discount_code,
      userId: req.session.user.id,
      packAmountCents: plan.unitAmountCents,
      userGuildIds,
      purchaseType: "subscription",
    });

    if (!discountResolution.ok) {
      return res.redirect(`/my-account?discount=${discountResolution.reason}`);
    }

    const username = String(req.session.user.globalName || req.session.user.username || "Unknown");
    const metadata = buildCreditPurchaseMetadata({
      user: req.session.user,
      username,
      subscriptionPlanId: plan.id,
      purchaseScope: "ai_guild",
      guildId,
      guildName: guild.name,
      discountCode: discountResolution.code,
      discountCents: discountResolution.discountCents,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      success_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}?aiSub=success`,
      cancel_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}?aiSub=canceled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            unit_amount: discountResolution.finalAmountCents,
            product_data: {
              name: `${plan.name} Guild AI Credits Subscription`,
              description: discountResolution.discountCents > 0
                ? `${plan.creditsPerMonth} guild AI credits/month for ${guild.name} · Discount code ${discountResolution.code}`
                : `${plan.creditsPerMonth} guild AI credits/month for ${guild.name}`,
            },
          },
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
    });

    return res.redirect(303, checkoutSession.url);
  } catch {
    return res.redirect(`/dashboard/${guildId}?aiSub=error`);
  }
});

app.post("/dashboard/:guildId/ai-credits/subscription/manage", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    if (!stripe) {
      return res.status(503).render("error", {
        title: "Billing Portal Unavailable",
        message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY first.",
      });
    }

    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to manage AI subscriptions for this guild.",
      });
    }

    const stripeSubscriptionIdFromRequest = String(req.body.stripe_subscription_id || "").trim();
    const subscriptionFilter = {
      purchase_scope: "ai_guild",
      guild_id: snowflakeToLong(guildId),
      status: { $in: Array.from(getActiveSubscriptionStatusSet()) },
    };
    if (stripeSubscriptionIdFromRequest) {
      subscriptionFilter.stripe_subscription_id = stripeSubscriptionIdFromRequest;
    }

    const subscriptionRecord = await aiImageCreditSubscriptionsCollection.findOne(subscriptionFilter, {
      projection: {
        stripe_subscription_id: 1,
        stripe_customer_id: 1,
      },
      sort: { updated_at: -1 },
    });

    if (!subscriptionRecord || !subscriptionRecord.stripe_subscription_id) {
      return res.redirect(`/dashboard/${guildId}?aiSub=no_subscription`);
    }

    let stripeCustomerId = String(subscriptionRecord.stripe_customer_id || "").trim();
    if (!stripeCustomerId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(String(subscriptionRecord.stripe_subscription_id));
      stripeCustomerId = String(stripeSubscription?.customer || "").trim();
      if (!stripeCustomerId) {
        return res.redirect(`/dashboard/${guildId}?aiSub=error`);
      }

      await aiImageCreditSubscriptionsCollection.updateOne(
        { stripe_subscription_id: String(subscriptionRecord.stripe_subscription_id) },
        {
          $set: {
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date(),
          },
        }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${WEBSITE_BASE_URL}/dashboard/${guildId}`,
    });

    return res.redirect(303, portalSession.url);
  } catch {
    return res.redirect(`/dashboard/${guildId}?aiSub=error`);
  }
});

app.post("/dashboard/:guildId/ai-credits/policy/default", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild || !guild.canManage) {
      return res.redirect(`/dashboard/${guildId}?aiPolicy=error`);
    }

    const existing = await guildsCollection.findOne(
      { guild_id: snowflakeToLong(guildId) },
      { projection: { ai_image_credit_policy: 1 } }
    );

    const nextPolicy = normalizeGuildAiCreditPolicy(existing?.ai_image_credit_policy);
    nextPolicy.default_monthly_credits_per_member = Math.max(
      toNonNegativeInt(req.body.default_monthly_credits_per_member, 0),
      0
    );

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guild.name,
          ai_image_credit_policy: nextPolicy,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          aiimagegenallowance: 50,
          installer_user_id: req.session.user.id,
        },
      },
      { upsert: true }
    );

    return res.redirect(`/dashboard/${guildId}?aiPolicy=saved`);
  } catch {
    return res.redirect(`/dashboard/${guildId}?aiPolicy=error`);
  }
});

app.post("/dashboard/:guildId/ai-credits/policy/override/upsert", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild || !guild.canManage) {
      return res.redirect(`/dashboard/${guildId}?aiPolicy=error`);
    }

    const userId = String(req.body.member_user_id || "").trim();
    const username = String(req.body.member_username || "").trim();
    const monthlyCredits = Math.max(toNonNegativeInt(req.body.member_monthly_credits_per_month, 0), 0);

    if (!/^\d{5,25}$/.test(userId)) {
      return res.redirect(`/dashboard/${guildId}?aiPolicy=invalid_member`);
    }

    const existing = await guildsCollection.findOne(
      { guild_id: snowflakeToLong(guildId) },
      { projection: { ai_image_credit_policy: 1 } }
    );

    const nextPolicy = normalizeGuildAiCreditPolicy(existing?.ai_image_credit_policy);
    const nextOverrides = Array.isArray(nextPolicy.member_overrides) ? [...nextPolicy.member_overrides] : [];
    const existingIndex = nextOverrides.findIndex((row) => String(row.user_id) === userId);
    const row = {
      user_id: userId,
      username: username || userId,
      monthly_credits_per_month: monthlyCredits,
    };
    if (existingIndex >= 0) {
      nextOverrides[existingIndex] = row;
    } else {
      nextOverrides.push(row);
    }
    nextPolicy.member_overrides = normalizeGuildAiCreditPolicy({
      default_monthly_credits_per_member: nextPolicy.default_monthly_credits_per_member,
      member_overrides: nextOverrides,
    }).member_overrides;

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guild.name,
          ai_image_credit_policy: nextPolicy,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          aiimagegenallowance: 50,
          installer_user_id: req.session.user.id,
        },
      },
      { upsert: true }
    );

    return res.redirect(`/dashboard/${guildId}?aiPolicy=saved`);
  } catch {
    return res.redirect(`/dashboard/${guildId}?aiPolicy=error`);
  }
});

app.post("/dashboard/:guildId/ai-credits/policy/override/remove", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild || !guild.canManage) {
      return res.redirect(`/dashboard/${guildId}?aiPolicy=error`);
    }

    const userId = String(req.body.member_user_id || "").trim();
    if (!/^\d{5,25}$/.test(userId)) {
      return res.redirect(`/dashboard/${guildId}?aiPolicy=invalid_member`);
    }

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $pull: {
          "ai_image_credit_policy.member_overrides": {
            user_id: userId,
          },
        },
        $set: {
          updated_at: new Date(),
        },
      }
    );

    return res.redirect(`/dashboard/${guildId}?aiPolicy=saved`);
  } catch {
    return res.redirect(`/dashboard/${guildId}?aiPolicy=error`);
  }
});

app.get("/dashboard/:guildId/members/search", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);
    if (!guild || !guild.canManage) {
      return res.status(403).json({ ok: false, message: "Access denied." });
    }

    const query = String(req.query.q || "").trim();
    if (!query || query.length < 2) {
      return res.json({ ok: true, members: [] });
    }

    const members = await searchGuildMembersForAdmin(guildId, query, 10);
    return res.json({ ok: true, members });
  } catch {
    return res.status(500).json({ ok: false, message: "Could not search guild members." });
  }
});

app.get("/owner/settings", requireAuth, requireOwner, async (req, res) => {
  try {
    const [settings, metadataDoc, creditPackPopularity] = await Promise.all([
      refreshOwnerSettingsCache(),
      ownerSettingsCollection.findOne(
        { _id: OWNER_SETTINGS_DOC_ID },
        {
          projection: {
            updated_at: 1,
            updated_by_user_id: 1,
            updated_by_username: 1,
            created_at: 1,
          },
        }
      ),
      getCreditPackPopularityData(),
    ]);

    const updatedByUserId = String(metadataDoc?.updated_by_user_id || "").trim();
    const updatedByUsername = String(metadataDoc?.updated_by_username || "").trim();
    const currentDisplayName = String(req.session.user?.globalName || req.session.user?.username || "").trim();

    let updatedByDisplay = "Unknown";
    if (updatedByUsername) {
      updatedByDisplay = updatedByUserId ? `${updatedByUsername} (${updatedByUserId})` : updatedByUsername;
    } else if (updatedByUserId && updatedByUserId === String(req.session.user?.id || "")) {
      updatedByDisplay = currentDisplayName || `You (${updatedByUserId})`;
    } else if (updatedByUserId) {
      updatedByDisplay = updatedByUserId;
    }

    return res.render("owner-settings", {
      title: req.t("ownerSettings.title", { defaultValue: "Owner Settings" }),
      settings,
      settingsMeta: {
        updatedAt: metadataDoc?.updated_at || null,
        updatedByUserId,
        updatedByDisplay,
        createdAt: metadataDoc?.created_at || null,
      },
      mostPopularCreditPackIds: Array.from(creditPackPopularity.mostPopularPackIds),
      creditPackPurchaseCounts: Object.fromEntries(creditPackPopularity.purchaseCountByPackId.entries()),
      saved: req.query.saved === "1",
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: req.t("errors.settingsErrorTitle", { defaultValue: "Settings Error" }),
      message: req.t("errors.settingsErrorMessage", { defaultValue: "Could not load owner settings." }),
    });
  }
});

app.post("/owner/settings", requireAuth, requireOwner, async (req, res) => {
  try {
    const updaterDisplayName = String(req.session.user.globalName || req.session.user.username || "Unknown").trim() || "Unknown";

    const nextSettings = sanitizeOwnerSettings({
      website: {
        base_url: req.body.website_base_url,
      },
      channels: {
        gamification: {
          category_name: req.body.gamification_category_name,
          leaderboard_channel_name: req.body.gamification_leaderboard_channel_name,
          channel_description: req.body.gamification_channel_description,
        },
        moderation: {
          category_name: req.body.moderation_category_name,
          channel_name: req.body.moderation_channel_name,
          channel_description: req.body.moderation_channel_description,
        },
        ai_image: {
          category_name: req.body.ai_image_category_name,
          channel_name: req.body.ai_image_channel_name,
          channel_topic: req.body.ai_image_channel_topic,
        },
      },
      pricing: {
        credit_packs: parsePackRowsFromBody(req.body),
        subscription_plans: parsePlanRowsFromBody(req.body),
        guild_credit_packs: parsePackRowsFromBody(req.body, "guild_pack"),
        guild_subscription_plans: parsePlanRowsFromBody(req.body, "guild_plan"),
        translation_free_character_limit: req.body.translation_free_character_limit,
        translation_subscription_plans_guild: parseTranslationPlanRowsFromBody(req.body, "translation_plan_guild"),
        translation_subscription_plans_personal: parseTranslationPlanRowsFromBody(req.body, "translation_plan_personal"),
      },
    });

    await ownerSettingsCollection.updateOne(
      { _id: OWNER_SETTINGS_DOC_ID },
      {
        $set: {
          ...nextSettings,
          updated_at: new Date(),
          updated_by_user_id: String(req.session.user.id),
          updated_by_username: updaterDisplayName,
        },
        $setOnInsert: {
          created_at: new Date(),
        },
      },
      { upsert: true }
    );

    ownerSettingsCache = nextSettings;

    const freeLimit = getTranslationFreeCharacterLimit();
    await guildsCollection.updateMany(
      {},
      {
        $set: {
          translationcharacterallowance: freeLimit,
          updated_at: new Date(),
        },
      }
    );

    const activeStatuses = Array.from(getActiveSubscriptionStatusSet());
    const groupedActiveSubs = await translationCharacterSubscriptionsCollection
      .aggregate([
        {
          $match: {
            $or: [
              { purchase_scope: { $exists: false } },
              { purchase_scope: "translation_guild" },
              { purchase_scope: "" },
              { purchase_scope: null },
            ],
            status: { $in: activeStatuses },
          },
        },
        {
          $group: {
            _id: "$guild_id",
            total_characters_per_month: { $sum: "$characters_per_month" },
          },
        },
      ])
      .toArray();

    for (const row of groupedActiveSubs) {
      if (!row || row._id === undefined || row._id === null) {
        continue;
      }
      const guildIdValue = String(row._id);
      await guildsCollection.updateOne(
        {
          guild_id: {
            $in: [snowflakeToLong(guildIdValue), guildIdValue, toSafeInt(guildIdValue)],
          },
        },
        {
          $set: {
            translationcharacterallowance: freeLimit + Math.max(toSafeInt(row.total_characters_per_month), 0),
            updated_at: new Date(),
          },
        }
      );
    }

    return res.redirect("/owner/settings?saved=1");
  } catch (error) {
    return res.status(500).render("error", {
      title: "Save Failed",
      message: "Could not save owner settings.",
    });
  }
});

app.get("/owner/purchases", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerPurchaseFilters(req.query);
    const mongoQuery = buildOwnerPurchaseMongoQuery(filters);

    const [purchases, totalsRows, popularityRows, paymentTypeRows] = await Promise.all([
      aiImageCreditPurchasesCollection
        .find(
          mongoQuery,
          {
            projection: {
              user_id: 1,
              username: 1,
              pack_id: 1,
              payment_type: 1,
              credits: 1,
              amount_total_cents: 1,
              currency: 1,
              created_at: 1,
            },
          }
        )
        .sort({ created_at: -1 })
        .limit(filters.limit)
        .toArray(),
      aiImageCreditPurchasesCollection
        .aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: null,
              sales_count: { $sum: 1 },
              total_credits: { $sum: { $ifNull: ["$credits", 0] } },
              total_revenue_cents: { $sum: { $ifNull: ["$amount_total_cents", 0] } },
            },
          },
        ])
        .toArray(),
      aiImageCreditPurchasesCollection
        .aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: "$pack_id",
              sales_count: { $sum: 1 },
              total_credits: { $sum: { $ifNull: ["$credits", 0] } },
              total_revenue_cents: { $sum: { $ifNull: ["$amount_total_cents", 0] } },
              payment_types: { $addToSet: "$payment_type" },
            },
          },
          { $sort: { sales_count: -1, total_revenue_cents: -1 } },
        ])
        .toArray(),
      aiImageCreditPurchasesCollection
        .aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: "$payment_type",
              sales_count: { $sum: 1 },
              total_revenue_cents: { $sum: { $ifNull: ["$amount_total_cents", 0] } },
            },
          },
          { $sort: { sales_count: -1 } },
        ])
        .toArray(),
    ]);

    const totalsBase = totalsRows[0] || {
      sales_count: 0,
      total_credits: 0,
      total_revenue_cents: 0,
    };

    const optionCatalogRows = buildOwnerPurchaseOptionCatalog();
    const optionCatalog = new Map(optionCatalogRows.map((row) => [row.id, row]));

    popularityRows.forEach((row) => {
      const optionId = String(row._id || "").trim();
      if (!optionId || optionCatalog.has(optionId)) {
        return;
      }
      optionCatalog.set(optionId, {
        id: optionId,
        label: `${optionId} (legacy/unknown)`,
        type: "unknown",
        costUnitCents: 0,
      });
    });

    const popularityById = new Map(
      popularityRows.map((row) => [String(row._id || "").trim(), row])
    );

    const optionPopularity = Array.from(optionCatalog.values())
      .map((option) => {
        const metrics = popularityById.get(option.id);
        const salesCount = Number(metrics?.sales_count || 0);
        const totalRevenueCents = Number(metrics?.total_revenue_cents || 0);
        const totalCostCents = salesCount * Math.max(toSafeInt(option.costUnitCents), 0);
        return {
          id: option.id,
          label: option.label,
          type: option.type,
          salesCount,
          totalCredits: Number(metrics?.total_credits || 0),
          totalRevenueCents,
          totalCostCents,
          totalProfitCents: totalRevenueCents - totalCostCents,
          paymentTypes: Array.isArray(metrics?.payment_types) ? metrics.payment_types : [],
        };
      })
      .sort((a, b) => b.salesCount - a.salesCount || b.totalRevenueCents - a.totalRevenueCents);

    const paymentTypeSummary = paymentTypeRows.map((row) => {
      const paymentType = String(row._id || "unknown");
      const salesCount = Number(row.sales_count || 0);
      const totalRevenueCents = Number(row.total_revenue_cents || 0);
      const totalCostCents = optionPopularity
        .filter((option) => option.paymentTypes.includes(paymentType))
        .reduce((sum, option) => sum + Number(option.totalCostCents || 0), 0);

      return {
        paymentType,
        salesCount,
        totalRevenueCents,
        totalCostCents,
        totalProfitCents: totalRevenueCents - totalCostCents,
      };
    });

    const totals = {
      ...totalsBase,
      total_cost_cents: optionPopularity.reduce((sum, row) => sum + Number(row.totalCostCents || 0), 0),
    };
    totals.total_profit_cents = Number(totals.total_revenue_cents || 0) - Number(totals.total_cost_cents || 0);

    const purchaseRows = purchases.map((row) => ({
      ...row,
      user_id_display: String(row.user_id || ""),
    }));

    return res.render("owner-purchases", {
      title: req.t("ownerPurchases.title", { defaultValue: "Owner Purchases" }),
      totals,
      filters,
      optionCatalogRows: optionCatalogRows.sort((a, b) => a.label.localeCompare(b.label)),
      optionPopularity,
      paymentTypeSummary,
      purchases: purchaseRows,
      exportQueryString: buildOwnerPurchaseExportQueryString(filters),
      formatDateInput,
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: req.t("errors.purchasesErrorTitle", { defaultValue: "Purchases Error" }),
      message: req.t("errors.purchasesErrorMessage", { defaultValue: "Could not load owner purchase analytics." }),
    });
  }
});

app.get("/owner/purchases/export.csv", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerPurchaseFilters(req.query);
    const mongoQuery = buildOwnerPurchaseMongoQuery(filters);

    const purchases = await aiImageCreditPurchasesCollection
      .find(
        mongoQuery,
        {
          projection: {
            user_id: 1,
            username: 1,
            pack_id: 1,
            payment_type: 1,
            credits: 1,
            amount_total_cents: 1,
            currency: 1,
            discount_code: 1,
            discount_cents: 1,
            stripe_session_id: 1,
            stripe_invoice_id: 1,
            stripe_subscription_id: 1,
            created_at: 1,
          },
        }
      )
      .sort({ created_at: -1 })
      .limit(filters.limit)
      .toArray();

    const rows = [
      [
        "user_id",
        "username",
        "pack_id",
        "payment_type",
        "credits",
        "amount_total_cents",
        "currency",
        "amount_usd",
        "discount_code",
        "discount_cents",
        "stripe_session_id",
        "stripe_invoice_id",
        "stripe_subscription_id",
        "created_at",
      ].join(","),
    ];

    purchases.forEach((row) => {
      const amountCents = Math.max(toSafeInt(row.amount_total_cents), 0);
      const values = [
        String(row.user_id || ""),
        String(row.username || ""),
        String(row.pack_id || ""),
        String(row.payment_type || ""),
        String(Math.max(toSafeInt(row.credits), 0)),
        String(amountCents),
        String(row.currency || "usd"),
        (amountCents / 100).toFixed(2),
        String(row.discount_code || ""),
        String(Math.max(toSafeInt(row.discount_cents), 0)),
        String(row.stripe_session_id || ""),
        String(row.stripe_invoice_id || ""),
        String(row.stripe_subscription_id || ""),
        row.created_at ? new Date(row.created_at).toISOString() : "",
      ];

      rows.push(values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `discobot-ai-purchases-${timestamp}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(rows.join("\n"));
  } catch {
    return res.status(500).render("error", {
      title: "Export Failed",
      message: "Could not export purchases CSV.",
    });
  }
});

app.get("/owner/translation-purchases", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerTranslationPurchaseFilters(req.query);
    const mongoQuery = buildOwnerTranslationPurchaseMongoQuery(filters);

    const [purchases, totalsRows, popularityRows, paymentTypeRows] = await Promise.all([
      translationCharacterPurchasesCollection
        .find(
          mongoQuery,
          {
            projection: {
              guild_id: 1,
              guild_name: 1,
              user_id: 1,
              username: 1,
              plan_id: 1,
              payment_type: 1,
              characters_per_month: 1,
              amount_total_cents: 1,
              currency: 1,
              created_at: 1,
            },
          }
        )
        .sort({ created_at: -1 })
        .limit(filters.limit)
        .toArray(),
      translationCharacterPurchasesCollection
        .aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: null,
              sales_count: { $sum: 1 },
              total_characters: { $sum: { $ifNull: ["$characters_per_month", 0] } },
              total_revenue_cents: { $sum: { $ifNull: ["$amount_total_cents", 0] } },
            },
          },
        ])
        .toArray(),
      translationCharacterPurchasesCollection
        .aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: "$plan_id",
              sales_count: { $sum: 1 },
              total_characters: { $sum: { $ifNull: ["$characters_per_month", 0] } },
              total_revenue_cents: { $sum: { $ifNull: ["$amount_total_cents", 0] } },
              payment_types: { $addToSet: "$payment_type" },
            },
          },
          { $sort: { sales_count: -1, total_revenue_cents: -1 } },
        ])
        .toArray(),
      translationCharacterPurchasesCollection
        .aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: "$payment_type",
              sales_count: { $sum: 1 },
              total_revenue_cents: { $sum: { $ifNull: ["$amount_total_cents", 0] } },
            },
          },
          { $sort: { sales_count: -1 } },
        ])
        .toArray(),
    ]);

    const totalsBase = totalsRows[0] || {
      sales_count: 0,
      total_characters: 0,
      total_revenue_cents: 0,
    };

    const planCatalogRows = buildOwnerTranslationPlanCatalog();
    const planCatalog = new Map(planCatalogRows.map((row) => [row.id, row]));

    popularityRows.forEach((row) => {
      const planId = String(row._id || "").trim();
      if (!planId || planCatalog.has(planId)) {
        return;
      }
      planCatalog.set(planId, {
        id: planId,
        label: `${planId} (legacy/unknown)`,
        costUnitCents: 0,
      });
    });

    const popularityById = new Map(popularityRows.map((row) => [String(row._id || "").trim(), row]));

    const planPopularity = Array.from(planCatalog.values())
      .map((plan) => {
        const metrics = popularityById.get(plan.id);
        const salesCount = Number(metrics?.sales_count || 0);
        const totalRevenueCents = Number(metrics?.total_revenue_cents || 0);
        const totalCostCents = salesCount * Math.max(toSafeInt(plan.costUnitCents), 0);
        return {
          id: plan.id,
          label: plan.label,
          salesCount,
          totalCharacters: Number(metrics?.total_characters || 0),
          totalRevenueCents,
          totalCostCents,
          totalProfitCents: totalRevenueCents - totalCostCents,
          paymentTypes: Array.isArray(metrics?.payment_types) ? metrics.payment_types : [],
        };
      })
      .sort((a, b) => b.salesCount - a.salesCount || b.totalRevenueCents - a.totalRevenueCents);

    const paymentTypeSummary = paymentTypeRows.map((row) => {
      const paymentType = String(row._id || "unknown");
      const salesCount = Number(row.sales_count || 0);
      const totalRevenueCents = Number(row.total_revenue_cents || 0);
      const totalCostCents = planPopularity
        .filter((plan) => plan.paymentTypes.includes(paymentType))
        .reduce((sum, plan) => sum + Number(plan.totalCostCents || 0), 0);

      return {
        paymentType,
        salesCount,
        totalRevenueCents,
        totalCostCents,
        totalProfitCents: totalRevenueCents - totalCostCents,
      };
    });

    const totals = {
      ...totalsBase,
      total_cost_cents: planPopularity.reduce((sum, row) => sum + Number(row.totalCostCents || 0), 0),
    };
    totals.total_profit_cents = Number(totals.total_revenue_cents || 0) - Number(totals.total_cost_cents || 0);

    const purchaseRows = purchases.map((row) => ({
      ...row,
      user_id_display: String(row.user_id || ""),
      guild_id_display: String(row.guild_id || ""),
    }));

    return res.render("owner-translation-purchases", {
      title: req.t("ownerTranslationPurchases.title", { defaultValue: "Owner Translation Purchases" }),
      totals,
      filters,
      planCatalogRows: planCatalogRows.sort((a, b) => a.label.localeCompare(b.label)),
      planPopularity,
      paymentTypeSummary,
      purchases: purchaseRows,
      exportQueryString: buildOwnerTranslationPurchaseExportQueryString(filters),
      formatDateInput,
    });
  } catch {
    return res.status(500).render("error", {
      title: req.t("errors.translationPurchasesErrorTitle", { defaultValue: "Translation Purchases Error" }),
      message: req.t("errors.translationPurchasesErrorMessage", { defaultValue: "Could not load translation purchase analytics." }),
    });
  }
});

app.get("/owner/translation-purchases/export.csv", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerTranslationPurchaseFilters(req.query);
    const mongoQuery = buildOwnerTranslationPurchaseMongoQuery(filters);

    const purchases = await translationCharacterPurchasesCollection
      .find(
        mongoQuery,
        {
          projection: {
            guild_id: 1,
            guild_name: 1,
            user_id: 1,
            username: 1,
            plan_id: 1,
            payment_type: 1,
            characters_per_month: 1,
            amount_total_cents: 1,
            currency: 1,
            stripe_session_id: 1,
            stripe_invoice_id: 1,
            stripe_subscription_id: 1,
            created_at: 1,
          },
        }
      )
      .sort({ created_at: -1 })
      .limit(filters.limit)
      .toArray();

    const rows = [
      [
        "guild_id",
        "guild_name",
        "user_id",
        "username",
        "plan_id",
        "payment_type",
        "characters_per_month",
        "amount_total_cents",
        "currency",
        "amount_usd",
        "stripe_session_id",
        "stripe_invoice_id",
        "stripe_subscription_id",
        "created_at",
      ].join(","),
    ];

    purchases.forEach((row) => {
      const amountCents = Math.max(toSafeInt(row.amount_total_cents), 0);
      const values = [
        String(row.guild_id || ""),
        String(row.guild_name || ""),
        String(row.user_id || ""),
        String(row.username || ""),
        String(row.plan_id || ""),
        String(row.payment_type || ""),
        String(Math.max(toSafeInt(row.characters_per_month), 0)),
        String(amountCents),
        String(row.currency || "usd"),
        (amountCents / 100).toFixed(2),
        String(row.stripe_session_id || ""),
        String(row.stripe_invoice_id || ""),
        String(row.stripe_subscription_id || ""),
        row.created_at ? new Date(row.created_at).toISOString() : "",
      ];

      rows.push(values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `discobot-translation-purchases-${timestamp}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(rows.join("\n"));
  } catch {
    return res.status(500).render("error", {
      title: "Export Failed",
      message: "Could not export translation purchases CSV.",
    });
  }
});

app.get("/owner/discounts", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerDiscountFilters(req.query);
    const query = buildDiscountCodeMongoQuery(filters);

    const [discountCodes, usageRows] = await Promise.all([
      aiImageDiscountCodesCollection
        .find(query)
        .sort({ created_at: -1 })
        .toArray(),
      aiImageDiscountCodeUsagesCollection
        .find({}, {
          projection: {
            code: 1,
            user_id: 1,
            username: 1,
            pack_id: 1,
            payment_type: 1,
            amount_total_cents: 1,
            discount_cents: 1,
            used_at: 1,
          },
        })
        .sort({ used_at: -1 })
        .limit(1000)
        .toArray(),
    ]);

    const usageByCode = new Map();
    for (const usage of usageRows) {
      const code = String(usage.code || "").trim();
      if (!code) {
        continue;
      }
      if (!usageByCode.has(code)) {
        usageByCode.set(code, []);
      }
      usageByCode.get(code).push({
        ...usage,
        user_id_display: String(usage.user_id || ""),
      });
    }

    const enrichedCodes = discountCodes.map((codeDoc) => {
      const code = String(codeDoc.code || "");
      const usages = usageByCode.get(code) || [];

      const userMap = new Map();
      usages.forEach((usage) => {
        const key = usage.user_id_display || String(usage.username || "Unknown");
        if (!key) {
          return;
        }

        const current = userMap.get(key) || {
          user_id_display: usage.user_id_display,
          username: usage.username,
          count: 0,
        };

        current.count += 1;
        userMap.set(key, current);
      });

      const users = Array.from(userMap.values()).sort((a, b) => b.count - a.count);

      return {
        ...codeDoc,
        usage_count_actual: usages.length,
        users,
        recent_usages: usages.slice(0, 10),
      };
    });

    return res.render("owner-discounts", {
      title: req.t("ownerDiscounts.title", { defaultValue: "Owner Discount Codes" }),
      discountCodes: enrichedCodes,
      filters,
      createStatus: String(req.query.created || "").trim().toLowerCase(),
      toggleStatus: String(req.query.toggled || "").trim().toLowerCase(),
      errorStatus: String(req.query.error || "").trim().toLowerCase(),
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: req.t("errors.discountCodesErrorTitle", { defaultValue: "Discount Codes Error" }),
      message: req.t("errors.discountCodesErrorMessage", { defaultValue: "Could not load discount code admin page." }),
    });
  }
});

app.post("/owner/discounts", requireAuth, requireOwner, async (req, res) => {
  try {
    const code = normalizeDiscountCode(req.body.code);
    if (!code || code.length < 3) {
      return res.redirect("/owner/discounts?error=invalid_code");
    }

    const discountType = String(req.body.discount_type || "").trim().toLowerCase();
    const discountValue = Number.parseInt(String(req.body.discount_value || "0"), 10);
    if ((discountType !== "fixed_cents" && discountType !== "percent") || !Number.isFinite(discountValue) || discountValue <= 0) {
      return res.redirect("/owner/discounts?error=invalid_discount");
    }

    if (discountType === "percent" && discountValue > 95) {
      return res.redirect("/owner/discounts?error=percent_too_high");
    }

    const maxUses = parseNullablePositiveInt(req.body.max_uses);
    const maxDiscountCentsInput = String(req.body.max_discount_cents || "").trim();
    let maxDiscountCents = null;
    if (maxDiscountCentsInput) {
      const parsedMaxDiscountCents = Number.parseInt(maxDiscountCentsInput, 10);
      if (!Number.isFinite(parsedMaxDiscountCents) || parsedMaxDiscountCents < 0) {
        return res.redirect("/owner/discounts?error=invalid_max_discount");
      }
      maxDiscountCents = parsedMaxDiscountCents > 0 ? parsedMaxDiscountCents : null;
    }
    const minSpendCentsInput = String(req.body.min_spend_cents || "").trim();
    let minSpendCents = 0;
    if (minSpendCentsInput) {
      const parsedMinSpendCents = Number.parseInt(minSpendCentsInput, 10);
      if (!Number.isFinite(parsedMinSpendCents) || parsedMinSpendCents < 0) {
        return res.redirect("/owner/discounts?error=invalid_min_spend");
      }
      minSpendCents = parsedMinSpendCents;
    }
    const restrictedGuildIdRaw = String(req.body.restricted_guild_id || "").trim();
    const restrictedGuildId = /^\d+$/.test(restrictedGuildIdRaw) ? restrictedGuildIdRaw : "";
    if (restrictedGuildIdRaw && !restrictedGuildId) {
      return res.redirect("/owner/discounts?error=invalid_restricted_guild");
    }
    const restrictedUserIdRaw = String(req.body.restricted_user_id || "").trim();
    const restrictedUserId = /^\d+$/.test(restrictedUserIdRaw) ? restrictedUserIdRaw : "";

    const expiresDateRaw = String(req.body.expires_at || "").trim();
    let expiresAt = null;
    if (expiresDateRaw) {
      const parsed = new Date(expiresDateRaw);
      if (!Number.isFinite(parsed.getTime())) {
        return res.redirect("/owner/discounts?error=invalid_expiry");
      }
      expiresAt = parsed;
    }

    const now = new Date();
    const appliesToRaw = String(req.body.applies_to || "both").trim().toLowerCase();
    const appliesTo = appliesToRaw === "one_time" || appliesToRaw === "subscription" || appliesToRaw === "both"
      ? appliesToRaw
      : "both";

    await aiImageDiscountCodesCollection.insertOne({
      code,
      is_active: true,
      applies_to: appliesTo,
      discount_type: discountType,
      discount_value: discountValue,
      max_discount_cents: discountType === "percent" ? maxDiscountCents : null,
      min_spend_cents: minSpendCents,
      max_uses: maxUses,
      uses_count: 0,
      restricted_guild_id: restrictedGuildId || null,
      restricted_user_id: restrictedUserId || null,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
      created_by_user_id: String(req.session.user.id),
      created_by_username: String(req.session.user.globalName || req.session.user.username || "Owner"),
    });

    return res.redirect("/owner/discounts?created=1");
  } catch (error) {
    if (String(error?.code) === "11000") {
      return res.redirect("/owner/discounts?error=duplicate_code");
    }

    return res.redirect("/owner/discounts?error=save_failed");
  }
});

app.post("/owner/discounts/:code/toggle", requireAuth, requireOwner, async (req, res) => {
  try {
    const code = normalizeDiscountCode(req.params.code);
    if (!code) {
      return res.redirect("/owner/discounts?error=invalid_code");
    }

    const codeDoc = await aiImageDiscountCodesCollection.findOne({ code }, { projection: { is_active: 1 } });
    if (!codeDoc) {
      return res.redirect("/owner/discounts?error=not_found");
    }

    await aiImageDiscountCodesCollection.updateOne(
      { code },
      {
        $set: {
          is_active: !Boolean(codeDoc.is_active),
          updated_at: new Date(),
        },
      }
    );

    return res.redirect("/owner/discounts?toggled=1");
  } catch {
    return res.redirect("/owner/discounts?error=toggle_failed");
  }
});

app.get("/owner/discounts/:code/export.csv", requireAuth, requireOwner, async (req, res) => {
  try {
    const code = normalizeDiscountCode(req.params.code);
    if (!code) {
      return res.status(400).render("error", {
        title: "Export Failed",
        message: "Invalid discount code.",
      });
    }

    const usages = await aiImageDiscountCodeUsagesCollection
      .find(
        { code },
        {
          projection: {
            code: 1,
            user_id: 1,
            username: 1,
            pack_id: 1,
            payment_type: 1,
            amount_total_cents: 1,
            discount_cents: 1,
            stripe_session_id: 1,
            stripe_invoice_id: 1,
            stripe_subscription_id: 1,
            used_at: 1,
          },
        }
      )
      .sort({ used_at: -1 })
      .toArray();

    const header = [
      "code",
      "user_id",
      "username",
      "pack_id",
      "payment_type",
      "amount_total_cents",
      "discount_cents",
      "amount_total_usd",
      "discount_usd",
      "stripe_session_id",
      "stripe_invoice_id",
      "stripe_subscription_id",
      "used_at_iso",
    ];

    const lines = [toCsvLine(header)];
    usages.forEach((row) => {
      const amountCents = Number.parseInt(String(row.amount_total_cents || "0"), 10) || 0;
      const discountCents = Number.parseInt(String(row.discount_cents || "0"), 10) || 0;

      lines.push(
        toCsvLine([
          row.code || code,
          String(row.user_id || ""),
          row.username || "",
          row.pack_id || "",
          row.payment_type || "",
          amountCents,
          discountCents,
          (amountCents / 100).toFixed(2),
          (discountCents / 100).toFixed(2),
          row.stripe_session_id || "",
          row.stripe_invoice_id || "",
          row.stripe_subscription_id || "",
          row.used_at ? new Date(row.used_at).toISOString() : "",
        ])
      );
    });

    const safeCode = code.replace(/[^A-Z0-9_-]/g, "");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="discobot-discount-usage-${safeCode || "code"}.csv"`);
    return res.send(lines.join("\n"));
  } catch (error) {
    return res.status(500).render("error", {
      title: "Export Failed",
      message: "Could not export discount usage CSV.",
    });
  }
});

app.get("/owner/website-errors", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerWebsiteErrorFilters(req.query);
    const mongoQuery = buildOwnerWebsiteErrorMongoQuery(filters);

    const [rows, totalCount] = await Promise.all([
      websiteErrorLogsCollection
        .find(mongoQuery)
        .sort({ created_at: -1 })
        .limit(filters.limit)
        .toArray(),
      websiteErrorLogsCollection.countDocuments(mongoQuery),
    ]);

    const summary = rows.reduce(
      (acc, row) => {
        const status = Number.parseInt(String(row?.http_status || "0"), 10) || 0;
        if (status >= 500) {
          acc.serverErrors += 1;
        } else if (status >= 400) {
          acc.clientErrors += 1;
        }

        const type = String(row?.error_type || "").trim();
        if (type === "mongo_timeout") {
          acc.mongoTimeouts += 1;
        }

        return acc;
      },
      { total: rows.length, serverErrors: 0, clientErrors: 0, mongoTimeouts: 0 }
    );

    return res.render("owner-website-errors", {
      title: req.t("ownerWebsiteErrors.title", { defaultValue: "Owner Website Errors" }),
      subtitle: req.t("ownerWebsiteErrors.subtitle", {
        defaultValue: "Review and filter website errors users encountered.",
      }),
      filters,
      totalCount,
      summary,
      rows,
      formatDateInput,
      exportQueryString: buildOwnerWebsiteErrorExportQueryString(filters),
    });
  } catch {
    return res.status(500).render("error", {
      title: req.t("errors.websiteErrorsErrorTitle", { defaultValue: "Website Errors Page Error" }),
      message: req.t("errors.websiteErrorsErrorMessage", {
        defaultValue: "Could not load website error logs.",
      }),
    });
  }
});

app.get("/owner/website-errors/export.csv", requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = normalizeOwnerWebsiteErrorFilters(req.query);
    const mongoQuery = buildOwnerWebsiteErrorMongoQuery(filters);
    const exportLimit = Math.min(Math.max(filters.limit || 200, 20), 5000);

    const rows = await websiteErrorLogsCollection
      .find(mongoQuery)
      .sort({ created_at: -1 })
      .limit(exportLimit)
      .toArray();

    const header = [
      "created_at_iso",
      "error_id",
      "http_status",
      "error_type",
      "title",
      "message",
      "method",
      "path",
      "user_id",
      "username",
      "language",
      "ip_address",
      "session_id",
      "user_agent",
    ];

    const lines = [toCsvLine(header)];
    rows.forEach((row) => {
      lines.push(
        toCsvLine([
          row.created_at ? new Date(row.created_at).toISOString() : "",
          String(row.error_id || ""),
          Number.parseInt(String(row.http_status || 0), 10) || 0,
          String(row.error_type || ""),
          String(row.title || ""),
          String(row.message || ""),
          String(row.method || ""),
          String(row.path || ""),
          String(row.user_id || ""),
          String(row.username || ""),
          String(row.language || ""),
          String(row.ip_address || ""),
          String(row.session_id || ""),
          String(row.user_agent || ""),
        ])
      );
    });

    const nowText = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="discobot-website-errors-${nowText}.csv"`);
    return res.send(lines.join("\n"));
  } catch {
    return res.status(500).render("error", {
      title: "Export Failed",
      message: "Could not export website errors CSV.",
    });
  }
});

app.get("/owner/website-errors/test-error", requireAuth, requireOwner, (req, res, next) => {
  const mode = String(req.query.mode || "mongo").trim().toLowerCase();

  if (mode === "mongo") {
    const simulated = new Error("connect ETIMEDOUT 89.195.226.196:27017");
    simulated.name = "MongoServerSelectionError";
    return next(simulated);
  }

  return next(new Error("Simulated owner-triggered website error"));
});

app.get("/dashboard/:guildId", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You must be an administrator or recorded installer to edit this guild configuration.",
      });
    }

    const guildIdAsNumber = Number.parseInt(guildId, 10);
    const guildIdCandidates = [snowflakeToLong(guildId), guildId];
    if (Number.isFinite(guildIdAsNumber)) {
      guildIdCandidates.push(guildIdAsNumber);
    }

    const [
      scheduledMessageDocs,
      guildTextChannels,
      moderationRowsRaw,
      monthlyTranslationUsageRaw,
      monthlyAiImageUsageRaw,
      translationSubscriptionsRaw,
      aiGuildSubscriptionsRaw,
      guildDocRaw,
    ] = await Promise.all([
      scheduledMessagesCollection
        .find({ guild_id: snowflakeToLong(guildId) })
        .sort({ next_run_at: 1 })
        .limit(100)
        .toArray(),
      fetchGuildTextChannels(guildId).catch(() => []),
      userDataCollection
        .find(
          {
            guild_id: { $in: guildIdCandidates },
          },
          {
            projection: {
              user_id: 1,
              username: 1,
              moderation_flag_count: 1,
              moderation_approved_count: 1,
              moderation_rejected_count: 1,
              moderation_kick_count: 1,
              moderation_ban_count: 1,
            },
          }
        )
        .limit(400)
        .toArray(),
      getGuildMonthlyTranslationCharacterUsage(guildId),
      getGuildMonthlyAiImageUsage(guildId),
      translationCharacterSubscriptionsCollection
        .find(
          {
            guild_id: { $in: guildIdCandidates },
            status: { $in: Array.from(getActiveSubscriptionStatusSet()) },
          },
          {
            projection: {
              stripe_subscription_id: 1,
              plan_id: 1,
              characters_per_month: 1,
              status: 1,
              cancel_at_period_end: 1,
              current_period_end: 1,
              updated_at: 1,
            },
          }
        )
        .sort({ updated_at: -1 })
        .toArray(),
      aiImageCreditSubscriptionsCollection
        .find(
          {
            purchase_scope: "ai_guild",
            guild_id: { $in: guildIdCandidates },
            status: { $in: Array.from(getActiveSubscriptionStatusSet()) },
          },
          {
            projection: {
              stripe_subscription_id: 1,
              plan_id: 1,
              credits_per_month: 1,
              status: 1,
              cancel_at_period_end: 1,
              current_period_end: 1,
              updated_at: 1,
            },
          }
        )
        .sort({ updated_at: -1 })
        .toArray(),
      guildsCollection.findOne(
        { guild_id: snowflakeToLong(guildId) },
        {
          projection: {
            guild_features: 1,
            aiimagegenallowance: 1,
            ai_image_credit_policy: 1,
          },
        }
      ),
    ]);

    const allowance = await recomputeGuildTranslationCharacterAllowance(guildId);
    const monthlyUsage = Math.max(toSafeInt(monthlyTranslationUsageRaw), 0);
    const remainingCharacters = Math.max(allowance - monthlyUsage, 0);

    const translationSubscriptions = (translationSubscriptionsRaw || []).map((row) => ({
      stripeSubscriptionId: String(row.stripe_subscription_id || "").trim(),
      planId: String(row.plan_id || "").trim(),
      status: String(row.status || "active").trim().toLowerCase(),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      currentPeriodEnd: row.current_period_end || null,
      charactersPerMonth: Math.max(toSafeInt(row.characters_per_month), 0),
    }));

    const aiGuildSubscriptions = (aiGuildSubscriptionsRaw || []).map((row) => ({
      stripeSubscriptionId: String(row.stripe_subscription_id || "").trim(),
      planId: String(row.plan_id || "").trim(),
      status: String(row.status || "active").trim().toLowerCase(),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      currentPeriodEnd: row.current_period_end || null,
      creditsPerMonth: Math.max(toSafeInt(row.credits_per_month), 0),
    }));

    const guildAiCreditPolicy = normalizeGuildAiCreditPolicy(guildDocRaw?.ai_image_credit_policy);
    const guildAiCreditsBalance = Math.max(toSafeInt(guildDocRaw?.aiimagegenallowance), 0);
    const guildAiCreditsUsed = Math.max(toSafeInt(monthlyAiImageUsageRaw), 0);
    const guildAiCreditsRemaining = Math.max(guildAiCreditsBalance - guildAiCreditsUsed, 0);

    const scheduledMessages = scheduledMessageDocs.map((row) => {
      const timezoneName = String(row.timezone_name || "UTC");
      const fallbackDate = toDateInputInTimeZone(row.next_run_at, timezoneName);
      const fallbackTime = toTimeInputInTimeZone(row.next_run_at, timezoneName);
      const recurrence = normalizeScheduleRecurrence(row.recurrence) || "once";
      const weeklyDays = normalizeWeeklyDaysInput(row.weekly_days);
      const fallbackWeeklyDay = getWeekdayTokenForDateText(fallbackDate);

      return {
        ...row,
        channel_id_display: String(toSafeInt(row.channel_id)),
        recurrence,
        timezone_name: timezoneName,
        once_run_at_local: toDateTimeLocalInputInTimeZone(row.next_run_at, timezoneName),
        start_date_text: String(row.start_date_text || fallbackDate || ""),
        send_time_text: String(row.send_time_text || fallbackTime || ""),
        weekly_days: weeklyDays.length > 0
          ? weeklyDays
          : (recurrence === "weekly" && fallbackWeeklyDay ? [fallbackWeeklyDay] : []),
        end_date_text: String(row.end_date_text || ""),
      };
    });

    const moderationRows = moderationRowsRaw
      .map((row) => {
        const flagged = Math.max(toSafeInt(row.moderation_flag_count), 0);
        const approved = Math.max(toSafeInt(row.moderation_approved_count), 0);
        const rejected = Math.max(toSafeInt(row.moderation_rejected_count), 0);
        const kicked = Math.max(toSafeInt(row.moderation_kick_count), 0);
        const banned = Math.max(toSafeInt(row.moderation_ban_count), 0);
        const totalActions = flagged + approved + rejected + kicked + banned;

        const userIdDisplay = String(toSafeInt(row.user_id || "0"));
        return {
          userIdDisplay: /^\d+$/.test(userIdDisplay) ? userIdDisplay : "",
          username: String(row.username || "Unknown").trim() || "Unknown",
          moderationFlagCount: flagged,
          moderationApprovedCount: approved,
          moderationRejectedCount: rejected,
          moderationKickCount: kicked,
          moderationBanCount: banned,
          totalActions,
        };
      })
      .filter((row) => row.totalActions > 0)
      .sort((a, b) => b.totalActions - a.totalActions);

    const topModeratedUsers = moderationRows.slice(0, 5);
    const moderationSnapshotTotals = moderationRows.reduce(
      (acc, row) => {
        acc.flagged += row.moderationFlagCount;
        acc.approved += row.moderationApprovedCount;
        acc.rejected += row.moderationRejectedCount;
        acc.kicked += row.moderationKickCount;
        acc.banned += row.moderationBanCount;
        return acc;
      },
      {
        flagged: 0,
        approved: 0,
        rejected: 0,
        kicked: 0,
        banned: 0,
      }
    );

    const guildFeatures = normalizeGuildFeatures(guildDocRaw?.guild_features);
    const settingsExportPayload = buildGuildSettingsExportPayload({
      guild,
      guildFeatures,
      customModerationTerms: guild.customModerationTerms,
      levels: guild.levels,
      scheduledMessages,
    });

    return res.render("guild-config", {
      title: `${guild.name} ${req.t("guildConfig.titleSuffix", { defaultValue: "Configuration" })}`,
      guild,
      levels: guild.levels,
      customModerationTerms: guild.customModerationTerms,
      scheduledMessages,
      guildTextChannels,
      topModeratedUsers,
      moderationSnapshotTotals,
      saved: req.query.saved === "1",
      imported: req.query.imported === "1",
      moderationWordsStatus: String(req.query.words || "").trim().toLowerCase(),
      scheduleStatus: String(req.query.schedule || "").trim().toLowerCase(),
      scheduleTimezoneOptions: SCHEDULE_TIMEZONE_OPTIONS,
      toDateTimeLocalInputInTimeZone,
      translationSummary: {
        freeLimit: getTranslationFreeCharacterLimit(),
        allowance,
        monthlyUsage,
        remainingCharacters,
      },
      translationSubscriptionPlans: getGuildTranslationSubscriptionPlans(),
      translationSubscriptions,
      translationStatus: String(req.query.translationSub || "").trim().toLowerCase(),
      aiGuildSummary: {
        balance: guildAiCreditsBalance,
        used: guildAiCreditsUsed,
        remaining: guildAiCreditsRemaining,
      },
      aiGuildCreditPacks: getGuildCreditPacks(),
      aiGuildSubscriptionPlans: getGuildSubscriptionPlans(),
      aiGuildSubscriptions,
      aiStatus: String(req.query.aiCredits || "").trim().toLowerCase(),
      aiSubStatus: String(req.query.aiSub || "").trim().toLowerCase(),
      aiPolicyStatus: String(req.query.aiPolicy || "").trim().toLowerCase(),
      guildAiCreditPolicy,
      featureControls: buildGuildFeatureControls(guildFeatures, req.t),
      featureStatus: String(req.query.feature || "").trim().toLowerCase(),
      featureKey: String(req.query.feature_key || "").trim().toLowerCase(),
      featureCleanupStatus: String(req.query.feature_cleanup || "").trim().toLowerCase(),
      settingsExportPayload,
    });
  } catch (error) {
    console.error("[ERROR] Failed to load guild configuration", {
      guildId,
      userId: String(req.session?.user?.id || ""),
      message: error?.message,
      status: error?.response?.status,
    });

    return res.status(500).render("error", {
      title: req.t("errors.configurationErrorTitle", { defaultValue: "Configuration Error" }),
      message: req.t("errors.configurationErrorMessage", { defaultValue: "Could not load guild configuration." }),
    });
  }
});

app.get("/dashboard/:guildId/moderation-summary", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);
  const userQuery = String(req.query.user_query || "").trim().toLowerCase();

  const parsedLimit = Number.parseInt(String(req.query.limit || "100"), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 20), 500) : 100;

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to view this guild moderation summary.",
      });
    }

    const guildIdAsNumber = Number.parseInt(guildId, 10);
    const guildIdCandidates = [snowflakeToLong(guildId), guildId];
    if (Number.isFinite(guildIdAsNumber)) {
      guildIdCandidates.push(guildIdAsNumber);
    }

    const moderationRowsRaw = await userDataCollection
      .find(
        {
          guild_id: { $in: guildIdCandidates },
        },
        {
          projection: {
            user_id: 1,
            username: 1,
            moderation_flag_count: 1,
            moderation_approved_count: 1,
            moderation_rejected_count: 1,
            moderation_kick_count: 1,
            moderation_ban_count: 1,
            updated_at: 1,
          },
        }
      )
      .limit(limit)
      .toArray();

    const moderationRows = moderationRowsRaw
      .map((row) => {
        const flagged = Math.max(toSafeInt(row.moderation_flag_count), 0);
        const approved = Math.max(toSafeInt(row.moderation_approved_count), 0);
        const rejected = Math.max(toSafeInt(row.moderation_rejected_count), 0);
        const kicked = Math.max(toSafeInt(row.moderation_kick_count), 0);
        const banned = Math.max(toSafeInt(row.moderation_ban_count), 0);
        const totalActions = flagged + approved + rejected + kicked + banned;

        const userIdDisplay = String(toSafeInt(row.user_id || "0"));
        return {
          userIdDisplay: /^\d+$/.test(userIdDisplay) ? userIdDisplay : "",
          username: String(row.username || "Unknown").trim() || "Unknown",
          moderationFlagCount: flagged,
          moderationApprovedCount: approved,
          moderationRejectedCount: rejected,
          moderationKickCount: kicked,
          moderationBanCount: banned,
          totalActions,
          updatedAt: row.updated_at || null,
        };
      })
      .filter((row) => row.totalActions > 0)
      .filter((row) => {
        if (!userQuery) {
          return true;
        }
        return row.username.toLowerCase().includes(userQuery) || row.userIdDisplay.includes(userQuery);
      })
      .sort((a, b) => {
        if (b.totalActions !== a.totalActions) {
          return b.totalActions - a.totalActions;
        }
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    const totals = moderationRows.reduce(
      (acc, row) => {
        acc.flagged += row.moderationFlagCount;
        acc.approved += row.moderationApprovedCount;
        acc.rejected += row.moderationRejectedCount;
        acc.kicked += row.moderationKickCount;
        acc.banned += row.moderationBanCount;
        return acc;
      },
      {
        flagged: 0,
        approved: 0,
        rejected: 0,
        kicked: 0,
        banned: 0,
      }
    );

    return res.render("moderation-summary", {
      title: `${guild.name} ${req.t("moderationSummary.titleSuffix", { defaultValue: "Moderation Summary" })}`,
      guild,
      moderationRows,
      totals: {
        ...totals,
        moderatedUsers: moderationRows.length,
      },
      filters: {
        userQuery,
        limit,
      },
    });
  } catch {
    return res.status(500).render("error", {
      title: req.t("errors.moderationSummaryErrorTitle", { defaultValue: "Moderation Summary Error" }),
      message: req.t("errors.moderationSummaryErrorMessage", { defaultValue: "Could not load moderation summary for this guild." }),
    });
  }
});

app.get("/dashboard/:guildId/leaderboard", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);
  const userQuery = String(req.query.user_query || "").trim().toLowerCase();
  const sortBy = String(req.query.sort_by || "xp").trim().toLowerCase() === "reputation" ? "reputation" : "xp";

  const parsedLimit = Number.parseInt(String(req.query.limit || "100"), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 20), 500) : 100;

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to view this guild leaderboard.",
      });
    }

    const guildIdAsNumber = Number.parseInt(guildId, 10);
    const guildIdCandidates = [snowflakeToLong(guildId), guildId];
    if (Number.isFinite(guildIdAsNumber)) {
      guildIdCandidates.push(guildIdAsNumber);
    }

    const leaderboardRowsRaw = await userDataCollection
      .find(
        {
          guild_id: { $in: guildIdCandidates },
        },
        {
          projection: {
            user_id: 1,
            username: 1,
            xp: 1,
            reputation: 1,
            level: 1,
            level_name: 1,
            message_count: 1,
            updated_at: 1,
          },
        }
      )
      .limit(limit)
      .toArray();

    const leaderboardRows = leaderboardRowsRaw
      .map((row) => {
        const xp = Math.max(toSafeInt(row.xp), 0);
        const reputation = Math.max(toSafeInt(row.reputation), 0);
        const messageCount = Math.max(toSafeInt(row.message_count), 0);
        const effectiveLevel = resolveLevelForXp(guild.levels, xp);

        const level = Number.isFinite(toSafeInt(row.level)) && toSafeInt(row.level) >= 0
          ? toSafeInt(row.level)
          : effectiveLevel.level;

        const levelName = String(row.level_name || "").trim() || effectiveLevel.levelName;
        const userIdDisplay = String(row.user_id || "").trim();

        return {
          userIdDisplay: /^\d+$/.test(userIdDisplay) ? userIdDisplay : "",
          username: String(row.username || "Unknown").trim() || "Unknown",
          xp,
          reputation,
          level,
          levelName,
          messageCount,
          totalScore: xp + reputation,
          updatedAt: row.updated_at || null,
        };
      })
      .filter((row) => row.xp > 0 || row.reputation > 0 || row.messageCount > 0)
      .filter((row) => {
        if (!userQuery) {
          return true;
        }
        return row.username.toLowerCase().includes(userQuery) || row.userIdDisplay.includes(userQuery);
      })
      .sort((a, b) => {
        if (sortBy === "reputation" && b.reputation !== a.reputation) {
          return b.reputation - a.reputation;
        }
        if (sortBy === "xp" && b.xp !== a.xp) {
          return b.xp - a.xp;
        }
        if (b.totalScore !== a.totalScore) {
          return b.totalScore - a.totalScore;
        }
        return b.messageCount - a.messageCount;
      });

    const totals = leaderboardRows.reduce(
      (acc, row) => {
        acc.totalXp += row.xp;
        acc.totalReputation += row.reputation;
        acc.totalMessages += row.messageCount;
        return acc;
      },
      {
        totalXp: 0,
        totalReputation: 0,
        totalMessages: 0,
      }
    );

    return res.render("guild-leaderboard", {
      title: `${guild.name} ${req.t("guildLeaderboard.titleWord", { defaultValue: "Leaderboard" })}`,
      guild,
      leaderboardRows,
      totals: {
        ...totals,
        activeUsers: leaderboardRows.length,
      },
      filters: {
        userQuery,
        sortBy,
        limit,
      },
      adjustStatus: String(req.query.adjust || "").trim().toLowerCase(),
    });
  } catch {
    return res.status(500).render("error", {
      title: req.t("errors.leaderboardErrorTitle", { defaultValue: "Leaderboard Error" }),
      message: req.t("errors.leaderboardErrorMessage", { defaultValue: "Could not load leaderboard for this guild." }),
    });
  }
});

app.post("/dashboard/:guildId/leaderboard/adjust", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to adjust leaderboard values in this guild.",
      });
    }

    const userId = String(req.body.user_id || "").trim();
    const username = String(req.body.username || "").trim();
    const xpDelta = parseSignedDelta(req.body.xp_delta, 0);
    const reputationDelta = parseSignedDelta(req.body.reputation_delta, 0);

    if (!/^\d{6,22}$/.test(userId) || (xpDelta === 0 && reputationDelta === 0)) {
      return res.redirect(`/dashboard/${guildId}/leaderboard?adjust=invalid`);
    }

    const now = new Date();
    const actorId = String(req.session.user.id || "").trim();
    const actorName = String(req.session.user.globalName || req.session.user.username || "Unknown");

    const guildIdCandidates = [snowflakeToLong(guildId), guildId];
    const userIdCandidates = [snowflakeToLong(userId), userId];
    const guildIdAsNumber = Number.parseInt(guildId, 10);
    const userIdAsNumber = Number.parseInt(userId, 10);
    if (Number.isFinite(guildIdAsNumber)) {
      guildIdCandidates.push(guildIdAsNumber);
    }
    if (Number.isFinite(userIdAsNumber)) {
      userIdCandidates.push(userIdAsNumber);
    }

    await userDataCollection.updateOne(
      {
        guild_id: { $in: guildIdCandidates },
        user_id: { $in: userIdCandidates },
      },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guild.name,
          user_id: snowflakeToLong(userId),
          username: username || userId,
          updated_at: now,
          xp_last_adjusted_by_user_id: actorId,
          xp_last_adjusted_by_username: actorName,
          rep_last_adjusted_by_user_id: actorId,
          rep_last_adjusted_by_username: actorName,
        },
        $setOnInsert: {
          created_at: now,
          message_count: 0,
        },
        $inc: {
          xp: xpDelta,
          reputation: reputationDelta,
        },
      },
      { upsert: true }
    );

    const updatedDoc = await userDataCollection.findOne(
      {
        guild_id: { $in: guildIdCandidates },
        user_id: { $in: userIdCandidates },
      },
      {
        projection: {
          xp: 1,
          reputation: 1,
        },
      }
    );

    const clampedXp = Math.max(toSafeInt(updatedDoc?.xp), 0);
    const clampedReputation = Math.max(toSafeInt(updatedDoc?.reputation), 0);
    const resolvedLevel = resolveLevelForXp(guild.levels, clampedXp);

    await userDataCollection.updateOne(
      {
        guild_id: { $in: guildIdCandidates },
        user_id: { $in: userIdCandidates },
      },
      {
        $set: {
          xp: clampedXp,
          reputation: clampedReputation,
          level: resolvedLevel.level,
          level_name: resolvedLevel.levelName,
          updated_at: now,
        },
      }
    );

    return res.redirect(`/dashboard/${guildId}/leaderboard?adjust=updated`);
  } catch {
    return res.redirect(`/dashboard/${guildId}/leaderboard?adjust=error`);
  }
});

app.post("/dashboard/:guildId/levels", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const normalizedLevels = normalizeLevelsFromRequest(req.body);
    if (!normalizedLevels) {
      return res.status(400).render("error", {
        title: "Invalid Level Data",
        message: "Please provide at least one valid level row (level, name, XP required).",
      });
    }

    const { filter, update } = buildUpsertUpdate(
      guildId,
      guild.name,
      req.session.user.id,
      normalizedLevels
    );

    await guildsCollection.updateOne(
      filter,
      update,
      { upsert: true }
    );

    return res.redirect(`/dashboard/${guildId}?saved=1`);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Save Failed",
      message: "Could not save level configuration. Please try again.",
    });
  }
});

app.get("/dashboard/:guildId/levels/export", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to export this guild configuration.",
      });
    }

    const exportPayload = {
      guild_id: guild.id,
      guild_name: guild.name,
      exported_at: new Date().toISOString(),
      gamification_levels: guild.levels,
    };

    const safeGuildName = guild.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "guild";
    const fileName = `discobot-levels-${safeGuildName}-${guild.id}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(JSON.stringify(exportPayload, null, 2));
  } catch (error) {
    return res.status(500).render("error", {
      title: "Export Failed",
      message: "Could not export level configuration. Please try again.",
    });
  }
});

app.get("/dashboard/:guildId/settings/export", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to export this guild configuration.",
      });
    }

    const [scheduledMessageDocs, guildDocRaw] = await Promise.all([
      scheduledMessagesCollection
        .find({ guild_id: snowflakeToLong(guildId) })
        .sort({ next_run_at: 1 })
        .limit(200)
        .toArray(),
      guildsCollection.findOne(
        { guild_id: snowflakeToLong(guildId) },
        {
          projection: {
            guild_features: 1,
            moderation_custom_terms: 1,
            gamification_levels: 1,
          },
        }
      ),
    ]);

    const exportPayload = buildGuildSettingsExportPayload({
      guild,
      guildFeatures: guildDocRaw?.guild_features,
      customModerationTerms: guildDocRaw?.moderation_custom_terms,
      levels: guildDocRaw?.gamification_levels,
      scheduledMessages: scheduledMessageDocs,
    });

    const safeGuildName = guild.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "guild";
    const fileName = `discobot-settings-${safeGuildName}-${guild.id}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(JSON.stringify(exportPayload, null, 2));
  } catch {
    return res.status(500).render("error", {
      title: "Export Failed",
      message: "Could not export guild settings. Please try again.",
    });
  }
});

app.get("/dashboard/settings/import-template", requireAuth, (req, res) => {
  const templatePayload = {
    version: 1,
    guild_features: {
      moderation: { enabled: true },
      gamification: { enabled: true },
      ai_image: { enabled: true },
      translation: { enabled: true },
      scheduled_messages: { enabled: true },
    },
    gamification_levels: [
      { level: 0, name: "Newcomer", interactions_required: 0 },
      { level: 1, name: "Explorer", interactions_required: 10 },
    ],
    moderation_custom_terms: ["example term"],
    scheduled_messages: [
      {
        channel_id: "123456789012345678",
        message_content: "Hello from DiscoBot!",
        recurrence: "daily",
        timezone_name: "Europe/London",
        active: true,
        start_date: "2026-03-05",
        send_time: "09:00",
        weekly_days: [],
        end_date: "",
      },
    ],
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="discobot-settings-template.json"');
  return res.send(JSON.stringify(templatePayload, null, 2));
});

app.post("/dashboard/:guildId/settings/import", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const rawJson = String(req.body.settings_json || req.body.levels_json || "").trim();
    if (!rawJson) {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "Please paste a valid JSON payload before importing.",
      });
    }

    let jsonPayload;
    try {
      jsonPayload = JSON.parse(rawJson);
    } catch {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "JSON parsing failed. Please verify your payload format.",
      });
    }

    if (!jsonPayload || typeof jsonPayload !== "object" || Array.isArray(jsonPayload)) {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "Settings JSON must be an object.",
      });
    }

    const hasFeatures = Object.prototype.hasOwnProperty.call(jsonPayload, "guild_features");
    const hasLevels = Object.prototype.hasOwnProperty.call(jsonPayload, "gamification_levels");
    const hasModerationTerms = Object.prototype.hasOwnProperty.call(jsonPayload, "moderation_custom_terms");
    const hasSchedules = Object.prototype.hasOwnProperty.call(jsonPayload, "scheduled_messages");

    if (!hasFeatures && !hasLevels && !hasModerationTerms && !hasSchedules) {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "No supported settings keys found. Include one or more of: guild_features, gamification_levels, moderation_custom_terms, scheduled_messages.",
      });
    }

    const setFields = {
      guild_id: snowflakeToLong(guildId),
      guild_name: guild.name,
      updated_at: new Date(),
    };

    if (hasFeatures) {
      setFields.guild_features = normalizeGuildFeatures(jsonPayload.guild_features);
    }

    if (hasLevels) {
      const normalizedLevels = normalizeLevelsFromJsonPayload(JSON.stringify(jsonPayload.gamification_levels));
      if (!normalizedLevels) {
        return res.status(400).render("error", {
          title: "Import Failed",
          message: "The provided gamification_levels array is invalid.",
        });
      }
      setFields.gamification_levels = normalizedLevels;
    }

    if (hasModerationTerms) {
      if (!Array.isArray(jsonPayload.moderation_custom_terms)) {
        return res.status(400).render("error", {
          title: "Import Failed",
          message: "moderation_custom_terms must be an array of words/phrases.",
        });
      }
      setFields.moderation_custom_terms = sanitizeModerationCustomTerms(jsonPayload.moderation_custom_terms);
    }

    let normalizedSchedules = null;
    if (hasSchedules) {
      normalizedSchedules = normalizeScheduledMessagesFromImport(jsonPayload.scheduled_messages);
      if (normalizedSchedules === null) {
        return res.status(400).render("error", {
          title: "Import Failed",
          message: "scheduled_messages contains invalid entries. Please verify channel IDs, recurrence, date/time fields, and timezone names.",
        });
      }
    }

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: setFields,
        $setOnInsert: {
          created_at: new Date(),
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          aiimagegenallowance: 50,
          installer_user_id: req.session.user.id,
        },
      },
      { upsert: true }
    );

    if (hasSchedules) {
      await scheduledMessagesCollection.deleteMany({ guild_id: snowflakeToLong(guildId) });

      if (normalizedSchedules && normalizedSchedules.length > 0) {
        const now = new Date();
        const creatorUsername = String(req.session.user.globalName || req.session.user.username || "Unknown");
        await scheduledMessagesCollection.insertMany(
          normalizedSchedules.map((row) => ({
            schedule_id: crypto.randomUUID(),
            guild_id: snowflakeToLong(guildId),
            guild_name: guild.name,
            channel_id: row.channel_id,
            creator_user_id: snowflakeToLong(req.session.user.id),
            creator_username: creatorUsername,
            message_content: row.message_content,
            recurrence: row.recurrence,
            timezone_name: row.timezone_name,
            local_time_text: row.local_time_text,
            start_date_text: row.start_date_text,
            send_time_text: row.send_time_text,
            weekly_days: row.weekly_days,
            end_date_text: row.end_date_text,
            next_run_at: row.next_run_at,
            active: row.active,
            created_at: now,
            updated_at: now,
            last_run_at: null,
            run_count: 0,
          }))
        );
      }
    }

    return res.redirect(`/dashboard/${guildId}?saved=1&imported=1`);
  } catch {
    return res.status(500).render("error", {
      title: "Import Failed",
      message: "Could not import guild settings. Please try again.",
    });
  }
});

app.post("/dashboard/:guildId/levels/import", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const rawJson = String(req.body.levels_json || "").trim();
    if (!rawJson) {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "Please paste a valid JSON payload before importing.",
      });
    }

    let jsonPayload;
    try {
      jsonPayload = JSON.parse(rawJson);
    } catch {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "JSON parsing failed. Please verify your payload format.",
      });
    }

    const candidateLevels = Array.isArray(jsonPayload)
      ? jsonPayload
      : jsonPayload && Array.isArray(jsonPayload.gamification_levels)
        ? jsonPayload.gamification_levels
        : null;

    const normalizedLevels = normalizeLevelsFromJsonPayload(JSON.stringify(candidateLevels));
    if (!normalizedLevels) {
      return res.status(400).render("error", {
        title: "Import Failed",
        message: "No valid level rows were found in the JSON payload.",
      });
    }

    const { filter, update } = buildUpsertUpdate(
      guildId,
      guild.name,
      req.session.user.id,
      normalizedLevels
    );

    await guildsCollection.updateOne(filter, update, { upsert: true });
    return res.redirect(`/dashboard/${guildId}?saved=1&imported=1`);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Import Failed",
      message: "Could not import level configuration. Please try again.",
    });
  }
});

app.post("/dashboard/:guildId/moderation-words/add", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const term = sanitizeModerationTerm(req.body.word);
    if (!term) {
      return res.redirect(`/dashboard/${guildId}?words=invalid`);
    }

    const result = await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guild.name,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          aiimagegenallowance: 50,
          installer_user_id: req.session.user.id,
        },
        $addToSet: {
          moderation_custom_terms: term,
        },
      },
      { upsert: true }
    );

    const status = result.modifiedCount > 0 || result.upsertedId ? "added" : "exists";
    return res.redirect(`/dashboard/${guildId}?words=${status}`);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Save Failed",
      message: "Could not save custom moderation word. Please try again.",
    });
  }
});

app.post("/dashboard/:guildId/moderation-words/remove", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const term = sanitizeModerationTerm(req.body.word);
    if (!term) {
      return res.redirect(`/dashboard/${guildId}?words=invalid`);
    }

    const result = await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $pull: {
          moderation_custom_terms: term,
        },
        $set: {
          updated_at: new Date(),
        },
      }
    );

    const status = result.modifiedCount > 0 ? "removed" : "missing";
    return res.redirect(`/dashboard/${guildId}?words=${status}`);
  } catch (error) {
    return res.status(500).render("error", {
      title: "Remove Failed",
      message: "Could not remove custom moderation word. Please try again.",
    });
  }
});

app.post("/dashboard/:guildId/features", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();
  const validFeatureKeys = ["moderation", "gamification", "ai_image", "translation", "scheduled_messages"];

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const existingDoc = await guildsCollection.findOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        projection: {
          guild_features: 1,
        },
      }
    );

    const nextFeatures = normalizeGuildFeatures(existingDoc?.guild_features);
    const cleanupStatuses = [];

    for (const featureKey of validFeatureKeys) {
      const enabled = parseBooleanToggle(req.body[`enabled_${featureKey}`]);
      const removeChannels = parseBooleanToggle(req.body[`remove_channels_${featureKey}`]);
      nextFeatures[featureKey] = { enabled };

      if (!enabled && removeChannels) {
        try {
          const cleanupResult = await cleanupFeatureChannels(guildId, featureKey);
          if (!cleanupResult.attempted) {
            cleanupStatuses.push("unsupported");
          } else if (cleanupResult.failedDeletes > 0) {
            cleanupStatuses.push("partial");
          } else if (cleanupResult.deletedChannels > 0) {
            cleanupStatuses.push("removed");
          } else {
            cleanupStatuses.push("none");
          }
        } catch {
          cleanupStatuses.push("failed");
        }
      }
    }

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guild.name,
          guild_features: nextFeatures,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          aiimagegenallowance: 50,
          installer_user_id: req.session.user.id,
        },
      },
      { upsert: true }
    );

    let cleanupStatus = "none";
    if (cleanupStatuses.includes("failed")) {
      cleanupStatus = "failed";
    } else if (cleanupStatuses.includes("partial")) {
      cleanupStatus = "partial";
    } else if (cleanupStatuses.includes("removed")) {
      cleanupStatus = "removed";
    } else if (cleanupStatuses.includes("unsupported")) {
      cleanupStatus = "unsupported";
    }

    return res.redirect(
      `/dashboard/${guildId}?feature=updated&feature_cleanup=${encodeURIComponent(cleanupStatus)}`
    );
  } catch {
    return res.redirect(`/dashboard/${guildId}?feature=error`);
  }
});

app.post("/dashboard/:guildId/features/:featureKey", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId || "").trim();
  const featureKey = String(req.params.featureKey || "").trim().toLowerCase();
  const validFeatureKeys = new Set(["moderation", "gamification", "ai_image", "translation", "scheduled_messages"]);

  if (!validFeatureKeys.has(featureKey)) {
    return res.redirect(`/dashboard/${guildId}?feature=invalid&feature_key=${encodeURIComponent(featureKey)}`);
  }

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const enabled = parseBooleanToggle(req.body.enabled);
    const removeChannels = parseBooleanToggle(req.body.remove_channels);

    const existingDoc = await guildsCollection.findOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        projection: {
          guild_features: 1,
        },
      }
    );

    const nextFeatures = normalizeGuildFeatures(existingDoc?.guild_features);
    nextFeatures[featureKey] = { enabled };

    await guildsCollection.updateOne(
      { guild_id: snowflakeToLong(guildId) },
      {
        $set: {
          guild_id: snowflakeToLong(guildId),
          guild_name: guild.name,
          guild_features: nextFeatures,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
          sku: "Free",
          translationallowance: 500,
          translationcharacterallowance: getTranslationFreeCharacterLimit(),
          aiimagegenallowance: 50,
          installer_user_id: req.session.user.id,
        },
      },
      { upsert: true }
    );

    let cleanupStatus = "none";
    if (!enabled && removeChannels) {
      try {
        const cleanupResult = await cleanupFeatureChannels(guildId, featureKey);
        if (!cleanupResult.attempted) {
          cleanupStatus = "unsupported";
        } else if (cleanupResult.failedDeletes > 0) {
          cleanupStatus = "partial";
        } else if (cleanupResult.deletedChannels > 0) {
          cleanupStatus = "removed";
        } else {
          cleanupStatus = "none";
        }
      } catch {
        cleanupStatus = "failed";
      }
    }

    return res.redirect(
      `/dashboard/${guildId}?feature=updated&feature_key=${encodeURIComponent(featureKey)}&feature_cleanup=${encodeURIComponent(cleanupStatus)}`
    );
  } catch {
    return res.redirect(`/dashboard/${guildId}?feature=error&feature_key=${encodeURIComponent(featureKey)}`);
  }
});

app.post("/dashboard/:guildId/schedules/create", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const channelId = String(req.body.channel_id || "").trim();
    const messageContent = String(req.body.message_content || "").trim();
    const schedulePayload = buildSchedulePayloadFromRequest(req.body);

    if (!/^\d+$/.test(channelId) || !messageContent || messageContent.length > 1800 || !schedulePayload.valid || !schedulePayload.nextRunAt) {
      return res.redirect(`/dashboard/${guildId}?schedule=invalid`);
    }

    if (schedulePayload.nextRunAt.getTime() <= Date.now()) {
      return res.redirect(`/dashboard/${guildId}?schedule=past`);
    }

    const now = new Date();
    await scheduledMessagesCollection.insertOne({
      schedule_id: crypto.randomUUID(),
      guild_id: snowflakeToLong(guildId),
      guild_name: guild.name,
      channel_id: snowflakeToLong(channelId),
      creator_user_id: snowflakeToLong(req.session.user.id),
      creator_username: String(req.session.user.globalName || req.session.user.username || "Unknown"),
      message_content: messageContent,
      recurrence: schedulePayload.recurrence,
      timezone_name: schedulePayload.timezoneName,
      local_time_text: schedulePayload.localTimeText,
      start_date_text: schedulePayload.startDateText,
      send_time_text: schedulePayload.sendTimeText,
      weekly_days: schedulePayload.weeklyDays,
      end_date_text: schedulePayload.endDateText,
      next_run_at: schedulePayload.nextRunAt,
      active: true,
      created_at: now,
      updated_at: now,
      last_run_at: null,
      run_count: 0,
    });

    return res.redirect(`/dashboard/${guildId}?schedule=created`);
  } catch {
    return res.status(500).render("error", {
      title: "Schedule Save Failed",
      message: "Could not create scheduled message. Please try again.",
    });
  }
});

app.post("/dashboard/:guildId/schedules/:scheduleId/update", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);
  const scheduleId = String(req.params.scheduleId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const channelId = String(req.body.channel_id || "").trim();
    const messageContent = String(req.body.message_content || "").trim();
    const active = String(req.body.active || "").trim() === "true";
    const schedulePayload = buildSchedulePayloadFromRequest(req.body);

    if (!scheduleId || !/^\d+$/.test(channelId) || !messageContent || messageContent.length > 1800 || !schedulePayload.valid) {
      return res.redirect(`/dashboard/${guildId}?schedule=invalid`);
    }

    if (active && (!schedulePayload.nextRunAt || schedulePayload.nextRunAt.getTime() <= Date.now())) {
      return res.redirect(`/dashboard/${guildId}?schedule=past`);
    }

    const updateResult = await scheduledMessagesCollection.updateOne(
      {
        guild_id: snowflakeToLong(guildId),
        schedule_id: scheduleId,
      },
      {
        $set: {
          channel_id: snowflakeToLong(channelId),
          message_content: messageContent,
          recurrence: schedulePayload.recurrence,
          timezone_name: schedulePayload.timezoneName,
          local_time_text: schedulePayload.localTimeText,
          start_date_text: schedulePayload.startDateText,
          send_time_text: schedulePayload.sendTimeText,
          weekly_days: schedulePayload.weeklyDays,
          end_date_text: schedulePayload.endDateText,
          next_run_at: schedulePayload.nextRunAt,
          active,
          updated_at: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return res.redirect(`/dashboard/${guildId}?schedule=missing`);
    }

    return res.redirect(`/dashboard/${guildId}?schedule=updated`);
  } catch {
    return res.status(500).render("error", {
      title: "Schedule Update Failed",
      message: "Could not update scheduled message. Please try again.",
    });
  }
});

app.post("/dashboard/:guildId/schedules/:scheduleId/delete", requireAuth, async (req, res) => {
  const guildId = String(req.params.guildId);
  const scheduleId = String(req.params.scheduleId || "").trim();

  try {
    const guilds = await buildGuildAccessModel(req.session.discord.accessToken, req.session.user.id);
    const guild = guilds.find((row) => row.id === guildId);

    if (!guild) {
      return res.status(404).render("error", {
        title: "Guild Not Found",
        message: "That guild is not available or DiscoBot is not installed there.",
      });
    }

    if (!guild.canManage) {
      return res.status(403).render("error", {
        title: "Access Denied",
        message: "You are not allowed to modify this guild configuration.",
      });
    }

    const deleteResult = await scheduledMessagesCollection.deleteOne({
      guild_id: snowflakeToLong(guildId),
      schedule_id: scheduleId,
    });

    if (deleteResult.deletedCount === 0) {
      return res.redirect(`/dashboard/${guildId}?schedule=missing`);
    }

    return res.redirect(`/dashboard/${guildId}?schedule=deleted`);
  } catch {
    return res.status(500).render("error", {
      title: "Schedule Delete Failed",
      message: "Could not delete scheduled message. Please try again.",
    });
  }
});

app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  if (res.headersSent) {
    return next(error);
  }

  const errorId = crypto.randomUUID();
  const errorMessage = String(error?.message || "");
  const isMongoConnectionIssue =
    error?.name === "MongoServerSelectionError" ||
    /ETIMEDOUT|MongoServerSelectionError|server selection/i.test(errorMessage);

  console.error("[ERROR] Unhandled request error", {
    error_id: errorId,
    method: req.method,
    path: req.originalUrl,
    name: error?.name,
    message: errorMessage,
  });

  const title = req.t
    ? req.t("error.title", { defaultValue: "Something Went Wrong" })
    : "Something Went Wrong";

  const message = isMongoConnectionIssue
    ? req.t("error.mongoTimeout", {
        defaultValue:
          "A temporary database connection issue occurred. Please refresh and try again in a moment.",
      })
    : req.t("error.generic", {
        defaultValue: "An unexpected error occurred while processing your request.",
      });

  return res.status(500).render("error", {
    title,
    message,
    errorId,
  });
});

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not Found",
    message: "The page you are looking for does not exist.",
  });
});

async function start() {
  await mongoClientPromise;
  db = mongoClient.db("discordguilds");
  guildsCollection = db.collection("guilds");
  userDataCollection = db.collection("user_data");
  aiImageCreditPurchasesCollection = db.collection("ai_image_credit_purchases");
  aiImageCreditSubscriptionsCollection = db.collection("ai_image_credit_subscriptions");
  aiImageUserCreditsCollection = db.collection("ai_image_user_credits");
  aiImageWebGenerationsCollection = db.collection("ai_image_web_generations");
  ownerSettingsCollection = db.collection("bot_owner_settings");
  aiImageDiscountCodesCollection = db.collection("ai_image_discount_codes");
  aiImageDiscountCodeUsagesCollection = db.collection("ai_image_discount_code_usages");
  websiteErrorLogsCollection = db.collection("website_error_logs");
  scheduledMessagesCollection = db.collection("scheduled_messages");
  translationCharacterSubscriptionsCollection = db.collection("translation_character_subscriptions");
  translationCharacterPurchasesCollection = db.collection("translation_character_purchases");
  translationCharacterUserUsageCollection = db.collection("translation_character_user_usage");

  await aiImageCreditPurchasesCollection.createIndex(
    { guild_id: 1, user_id: 1, created_at: -1 },
    { name: "guild_user_created_desc_idx" }
  );

  await aiImageCreditPurchasesCollection.createIndex(
    { user_id: 1, created_at: -1 },
    { name: "user_created_desc_idx" }
  );

  await aiImageCreditPurchasesCollection.createIndex(
    { stripe_session_id: 1 },
    {
      unique: true,
      sparse: true,
      name: "stripe_session_unique_idx",
    }
  );

  await aiImageCreditPurchasesCollection.createIndex(
    { stripe_invoice_id: 1 },
    {
      unique: true,
      sparse: true,
      name: "stripe_invoice_unique_idx",
    }
  );

  await aiImageCreditSubscriptionsCollection.createIndex(
    { stripe_subscription_id: 1 },
    {
      unique: true,
      name: "stripe_subscription_unique_idx",
    }
  );

  await aiImageCreditSubscriptionsCollection.createIndex(
    { guild_id: 1, user_id: 1, status: 1, updated_at: -1 },
    { name: "guild_user_subscription_status_idx" }
  );

  await aiImageCreditSubscriptionsCollection.createIndex(
    { user_id: 1, status: 1, updated_at: -1 },
    { name: "user_subscription_status_idx" }
  );

  await aiImageUserCreditsCollection.createIndex(
    { user_id: 1 },
    {
      unique: true,
      name: "user_credit_wallet_unique_idx",
    }
  );

  await aiImageWebGenerationsCollection.createIndex(
    { user_id: 1, created_at: -1 },
    { name: "web_generation_user_created_idx" }
  );

  await aiImageDiscountCodesCollection.createIndex(
    { code: 1 },
    {
      unique: true,
      name: "discount_code_unique_idx",
    }
  );

  await aiImageDiscountCodesCollection.createIndex(
    { is_active: 1, expires_at: 1 },
    { name: "discount_active_expiry_idx" }
  );

  await aiImageDiscountCodeUsagesCollection.createIndex(
    { code: 1, used_at: -1 },
    { name: "discount_usage_code_used_at_idx" }
  );

  await aiImageDiscountCodeUsagesCollection.createIndex(
    { user_id: 1, used_at: -1 },
    { name: "discount_usage_user_used_at_idx" }
  );

  await websiteErrorLogsCollection.createIndex(
    { created_at: -1 },
    { name: "website_errors_created_desc_idx" }
  );

  await websiteErrorLogsCollection.createIndex(
    { http_status: 1, error_type: 1, created_at: -1 },
    { name: "website_errors_status_type_created_idx" }
  );

  await websiteErrorLogsCollection.createIndex(
    { user_id: 1, created_at: -1 },
    { name: "website_errors_user_created_idx" }
  );

  await scheduledMessagesCollection.createIndex(
    { guild_id: 1, schedule_id: 1 },
    { unique: true, name: "guild_schedule_unique_idx" }
  );

  await scheduledMessagesCollection.createIndex(
    { active: 1, next_run_at: 1 },
    { name: "active_next_run_idx" }
  );

  await scheduledMessagesCollection.createIndex(
    { guild_id: 1, creator_user_id: 1, next_run_at: 1 },
    { name: "guild_creator_next_run_idx" }
  );

  await translationCharacterSubscriptionsCollection.createIndex(
    { stripe_subscription_id: 1 },
    {
      unique: true,
      name: "translation_subscription_unique_idx",
    }
  );

  await translationCharacterSubscriptionsCollection.createIndex(
    { guild_id: 1, status: 1, updated_at: -1 },
    { name: "translation_guild_subscription_status_idx" }
  );

  await translationCharacterSubscriptionsCollection.createIndex(
    { purchase_scope: 1, user_id: 1, status: 1, updated_at: -1 },
    { name: "translation_scope_user_status_updated_idx" }
  );

  await translationCharacterPurchasesCollection.createIndex(
    { stripe_invoice_id: 1 },
    {
      unique: true,
      sparse: true,
      name: "translation_purchase_invoice_unique_idx",
    }
  );

  await translationCharacterPurchasesCollection.createIndex(
    { stripe_session_id: 1 },
    {
      unique: true,
      sparse: true,
      name: "translation_purchase_session_unique_idx",
    }
  );

  await translationCharacterPurchasesCollection.createIndex(
    { guild_id: 1, created_at: -1 },
    { name: "translation_purchase_guild_created_idx" }
  );

  await translationCharacterUserUsageCollection.createIndex(
    { user_id: 1, year: 1, month: 1 },
    { unique: true, name: "translation_user_month_unique_idx" }
  );

  await translationCharacterUserUsageCollection.createIndex(
    { user_id: 1, created_at: -1 },
    { name: "translation_user_usage_created_idx" }
  );

  await refreshOwnerSettingsCache();

  app.listen(Number(PORT), SERVER_HOST, () => {
    console.log(`[INFO] DiscoBot Website running on ${WEBSITE_BASE_URL} (listening on ${SERVER_HOST}:${PORT})`);
  });
}

start().catch((error) => {
  console.error("[ERROR] Failed to start website:", error);
  process.exit(1);
});
