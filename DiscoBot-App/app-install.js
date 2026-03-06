(() => {
  let hasTriggeredVersionReload = false;
  const i18n = (window && typeof window === "object" && window.discoI18n) || {};
  const text = {
    pwaUpdateAvailable: i18n.pwaUpdateAvailable || "Update available",
    pwaUpdateText: i18n.pwaUpdateText || "A newer DiscoBot version is ready.",
    pwaRefreshNow: i18n.pwaRefreshNow || "Refresh now",
    pwaIosInstallHint: i18n.pwaIosInstallHint || "On iPhone/iPad: tap Share, then Add to Home Screen.",
    pwaUnavailableHint: i18n.pwaUnavailableHint || "App install is not available in this browser yet.",
  };

  const renderUpdateToast = (onRefresh) => {
    if (document.getElementById("pwaUpdateToast")) {
      return;
    }

    const toast = document.createElement("div");
    toast.id = "pwaUpdateToast";
    toast.className = "pwa-update-toast";
    toast.innerHTML = [
      `<div class="pwa-update-title">${text.pwaUpdateAvailable}</div>`,
      `<div class="pwa-update-text">${text.pwaUpdateText}</div>`,
      `<button type="button" class="btn btn-primary pwa-update-btn">${text.pwaRefreshNow}</button>`,
    ].join("");

    const button = toast.querySelector(".pwa-update-btn");
    if (button) {
      button.addEventListener("click", () => {
        onRefresh();
      });
    }

    document.body.appendChild(toast);
  };

  const watchServiceWorkerUpdates = (registration) => {
    const promptForWaitingWorker = () => {
      if (!registration.waiting) {
        return;
      }

      renderUpdateToast(() => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      });
    };

    if (registration.waiting) {
      promptForWaitingWorker();
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) {
        return;
      }

      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          promptForWaitingWorker();
        }
      });
    });
  };

  const navToggleButton = document.getElementById("navToggleButton");
  const siteNavLinks = document.getElementById("siteNavLinks");
  const mobileBreakpointPx = 768;

  if (navToggleButton && siteNavLinks) {
    const closeNavMenu = () => {
      siteNavLinks.classList.remove("is-open");
      navToggleButton.setAttribute("aria-expanded", "false");
    };

    const openNavMenu = () => {
      siteNavLinks.classList.add("is-open");
      navToggleButton.setAttribute("aria-expanded", "true");
    };

    navToggleButton.addEventListener("click", () => {
      const isOpen = siteNavLinks.classList.contains("is-open");
      if (isOpen) {
        closeNavMenu();
      } else {
        openNavMenu();
      }
    });

    siteNavLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        closeNavMenu();
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > mobileBreakpointPx) {
        closeNavMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if (window.innerWidth > mobileBreakpointPx) {
        return;
      }

      const clickTarget = event.target;
      if (!(clickTarget instanceof Element)) {
        return;
      }

      if (!siteNavLinks.contains(clickTarget) && !navToggleButton.contains(clickTarget)) {
        closeNavMenu();
      }
    });
  }

  const detailMenus = Array.from(document.querySelectorAll("details.lang-menu, details.user-menu, details.owner-menu"));
  if (detailMenus.length > 0) {
    detailMenus.forEach((menu) => {
      const menuLinks = menu.querySelectorAll("a, button");
      menuLinks.forEach((link) => {
        link.addEventListener("click", () => {
          menu.removeAttribute("open");
        });
      });
    });

    document.addEventListener("click", (event) => {
      const clickTarget = event.target;
      if (!(clickTarget instanceof Element)) {
        return;
      }

      detailMenus.forEach((menu) => {
        if (!menu.contains(clickTarget)) {
          menu.removeAttribute("open");
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      detailMenus.forEach((menu) => {
        menu.removeAttribute("open");
      });
    });
  }

  const installButton = document.getElementById("installAppButton");
  const installHint = document.getElementById("installAppHint");
  let deferredInstallPrompt = null;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasTriggeredVersionReload) {
        return;
      }
      hasTriggeredVersionReload = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          watchServiceWorkerUpdates(registration);
        })
        .catch(() => {
        });
    });
  }

  const showButton = () => {
    if (installButton) {
      installButton.hidden = false;
    }
  };

  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showButton();
  });

  if (isIos && !isStandalone) {
    showButton();
  }

  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        try {
          await deferredInstallPrompt.userChoice;
        } catch {
        }
        deferredInstallPrompt = null;
        installButton.hidden = true;
        return;
      }

      if (isIos && !isStandalone && installHint) {
        installHint.hidden = false;
        installHint.textContent = text.pwaIosInstallHint;
        return;
      }

      if (installHint) {
        installHint.hidden = false;
        installHint.textContent = text.pwaUnavailableHint;
      }
    });
  }

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (installButton) {
      installButton.hidden = true;
    }
    if (installHint) {
      installHint.hidden = true;
      installHint.textContent = "";
    }
  });
})();
