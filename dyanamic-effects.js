/* PicShare Dynamic Display Effects */
(() => {
  "use strict";

  if (window.__picshareDynamicEffectsLoaded) return;
  window.__picshareDynamicEffectsLoaded = true;

  const style = document.createElement("style");
  style.textContent = `
    html { scroll-behavior: smooth; }

    .ps-reveal {
      opacity: 0;
      transform: translateY(18px);
      transition: opacity 650ms ease, transform 650ms ease;
    }

    .ps-reveal.ps-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .ps-item-enter {
      animation: ps-item-enter 460ms ease both;
    }

    @keyframes ps-item-enter {
      from { opacity: 0; transform: translateY(14px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .story-ring {
      background: conic-gradient(
        #20b8a4, #62d6c5, #8b72f4, #ffad66, #20b8a4
      );
      animation: ps-ring-turn 7s linear infinite;
    }

    @keyframes ps-ring-turn {
      to { filter: hue-rotate(360deg); }
    }

    .story-person {
      transition: transform 180ms ease;
    }

    .story-person:active {
      transform: scale(.95);
    }

    .dynamic-nav button,
    .floating-create,
    #addStoryBtn {
      transition: transform 180ms ease;
    }

    .dynamic-nav button:active,
    .floating-create:active,
    #addStoryBtn:active {
      transform: scale(.96);
    }

    .floating-create {
      animation: ps-float 3s ease-in-out infinite;
    }

    @keyframes ps-float {
      0%, 100% { translate: 0 0; }
      50% { translate: 0 -5px; }
    }

    .story-viewer:not([hidden]) {
      animation: ps-fade 220ms ease both;
    }

    @keyframes ps-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }

      .ps-reveal {
        opacity: 1;
        transform: none;
      }
    }
  `;

  document.head.appendChild(style);

  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const selectors = [
    "#homeSection",
    "#momentsSection",
    "#composerSection",
    "#exploreSection",
    "#feedSection",
    "#feed",
    "#profileCard",
    "#editProfileCard",
    ".about-card"
  ];

  let revealObserver = null;

  if ("IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("ps-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
  }

  function revealElement(element) {
    if (element.classList.contains("ps-reveal")) return;

    element.classList.add("ps-reveal");

    if (reduceMotion || !revealObserver) {
      element.classList.add("ps-visible");
    } else {
      revealObserver.observe(element);
    }
  }

  function applyReveals() {
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(revealElement);
    });
  }

  function animateItems(container) {
    if (!container) return;

    container.querySelectorAll(
      ".post, .post-card, .explore-item, .photo-card, .story-person"
    ).forEach(item => {
      if (item.dataset.psAnimated === "1") return;

      item.dataset.psAnimated = "1";

      if (!reduceMotion) {
        item.classList.add("ps-item-enter");
      }
    });
  }

  function setupNavigation() {
    const nav = document.getElementById("dynamicNav");
    if (!nav) return;

    nav.addEventListener("click", event => {
      const button = event.target.closest("button[data-go]");
      if (!button) return;

      const target = document.getElementById(button.dataset.go);

      if (target) {
        event.preventDefault();

        target.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start"
        });
      }
    });
  }

  function setupCreateButton() {
    const button = document.getElementById("dynamicCreateBtn");
    const composer = document.getElementById("composerSection");
    const caption = document.getElementById("caption");

    if (!button || !composer) return;

    button.addEventListener("click", () => {
      composer.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center"
      });

      if (caption) {
        setTimeout(() => caption.focus(), reduceMotion ? 0 : 350);
      }
    });
  }

  function setupLiveAnimations() {
    const containers = [
      document.getElementById("feed"),
      document.getElementById("dynamicExploreGrid"),
      document.getElementById("dynamicMoments")
    ].filter(Boolean);

    containers.forEach(container => {
      animateItems(container);

      if ("MutationObserver" in window) {
        const observer = new MutationObserver(() => {
          animateItems(container);
        });

        observer.observe(container, {
          childList: true,
          subtree: true
        });
      }
    });
  }

  function start() {
    applyReveals();
    setupNavigation();
    setupCreateButton();
    setupLiveAnimations();

    const appArea = document.getElementById("appArea");

    if (appArea && "MutationObserver" in window) {
      const observer = new MutationObserver(applyReveals);

      observer.observe(appArea, {
        attributes: true,
        attributeFilter: ["hidden", "class"]
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
