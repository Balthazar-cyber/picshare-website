/* ==========================================
   PICSHARE 2.0 — DYNAMIC EFFECTS
   Premium Visual Experience
========================================== */

(() => {
  "use strict";

  if (window.__picshareDynamicEffectsLoaded) return;

  window.__picshareDynamicEffectsLoaded = true;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ==========================================
     PREMIUM ANIMATIONS
  ========================================== */

  const style = document.createElement("style");

  style.textContent = `

    html {
      scroll-behavior: smooth;
    }

    /* PAGE REVEAL */

    .ps-reveal {
      opacity: 0;
      transform: translateY(20px);
      transition:
        opacity .65s ease,
        transform .65s ease;
    }

    .ps-reveal.ps-visible {
      opacity: 1;
      transform: translateY(0);
    }


    /* POST ENTRANCE */

    .ps-item-enter {
      animation: ps-item-enter .5s ease both;
    }

    @keyframes ps-item-enter {

      from {
        opacity: 0;
        transform: translateY(18px) scale(.98);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

    }


    /* STORY RINGS */

    .story-ring {
      background: conic-gradient(
        #20b8a4,
        #62d6c5,
        #8b72f4,
        #ffad66,
        #20b8a4
      ) !important;

      animation:
        ps-ring-glow 3s ease-in-out infinite,
        ps-ring-turn 8s linear infinite;

      box-shadow:
        0 0 0 3px rgba(32,184,164,.08),
        0 5px 18px rgba(32,184,164,.2);

      transition:
        transform .25s ease,
        box-shadow .25s ease;
    }

    @keyframes ps-ring-turn {
      to {
        filter: hue-rotate(360deg);
      }
    }

    @keyframes ps-ring-glow {

      0%,100% {
        box-shadow: 0 0 8px rgba(32,184,164,.2);
      }

      50% {
        box-shadow: 0 0 19px rgba(32,184,164,.4);
      }

    }

    .story-person:hover .story-ring {
      transform: scale(1.07);
    }

    .story-person:active .story-ring {
      transform: scale(.94);
    }


    /* STORY VIEWER */

    .story-viewer:not([hidden]) {
      animation: ps-fade-in .25s ease both;
    }

    .story-viewer-card {
      animation: ps-story-open .3s ease both;
    }

    @keyframes ps-story-open {

      from {
        opacity: 0;
        transform: scale(.96);
      }

      to {
        opacity: 1;
        transform: scale(1);
      }

    }


    /* STORY PROGRESS */

    .story-progress-fill {
      background: linear-gradient(
        90deg,
        #20b8a4,
        #ffffff
      );
      border-radius: 20px;
    }


    /* BUTTON INTERACTIONS */

    button,
    .primary-btn,
    .secondary-btn {
      -webkit-tap-highlight-color: transparent;
      transition:
        transform .18s ease,
        box-shadow .18s ease,
        opacity .18s ease;
    }

    button:active {
      transform: scale(.96);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: .55;
    }

    .primary-btn:hover,
    .secondary-btn:hover {
      box-shadow: 0 5px 16px rgba(16,27,45,.12);
    }


    /* LIKE ANIMATION */

    .ps-like-pop {
      animation: ps-like-pop .35s ease;
    }

    @keyframes ps-like-pop {

      0% {
        transform: scale(1);
      }

      45% {
        transform: scale(1.3);
      }

      100% {
        transform: scale(1);
      }

    }


    /* NAVIGATION */

    .dynamic-nav {
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .dynamic-nav button {
      position: relative;
      transition:
        color .2s ease,
        transform .2s ease;
    }

    .dynamic-nav button:hover {
      transform: translateY(-3px);
    }

    .dynamic-nav button.ps-nav-active {
      color: #20b8a4;
    }

    .dynamic-nav button.ps-nav-active::after {
      content: "";
      position: absolute;
      bottom: -5px;
      left: 25%;
      width: 50%;
      height: 3px;
      background: #20b8a4;
      border-radius: 10px;
    }


    /* FLOATING CREATE BUTTON */

    .floating-create {
      animation: ps-float 3s ease-in-out infinite;
      box-shadow:
        0 7px 25px rgba(32,184,164,.25);
    }

    @keyframes ps-float {

      0%,100% {
        transform: translateY(0);
      }

      50% {
        transform: translateY(-6px);
      }

    }


    /* NOTIFICATIONS */

    .notification-panel:not([hidden]) {
      animation: ps-notification-open .22s ease both;
      transform-origin: top right;
    }

    @keyframes ps-notification-open {

      from {
        opacity: 0;
        transform: translateY(-8px) scale(.97);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

    }

    .notification-count {
      animation: ps-count-pop .3s ease;
    }

    @keyframes ps-count-pop {

      0% {
        transform: scale(.5);
      }

      70% {
        transform: scale(1.2);
      }

      100% {
        transform: scale(1);
      }

    }


    /* PROFILE CARDS */

    .profile-card,
    .edit-profile-card,
    .about-card {
      transition:
        transform .25s ease,
        box-shadow .25s ease;
    }

    .profile-card:hover,
    .about-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgba(16,27,45,.07);
    }


    /* IMAGE EFFECTS */

    .post img,
    .post-card img,
    .explore-item img,
    .photo-card img {
      transition: transform .4s ease;
    }

    .post img:hover,
    .post-card img:hover,
    .explore-item img:hover,
    .photo-card img:hover {
      transform: scale(1.015);
    }


    /* LOADING EFFECT */

    .ps-loading {
      position: relative;
      overflow: hidden;
      background: #e8eeef;
    }

    .ps-loading::after {
      content: "";
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,.55),
        transparent
      );
      animation: ps-shimmer 1.5s infinite;
    }

    @keyframes ps-shimmer {
      to {
        transform: translateX(100%);
      }
    }


    /* GENERAL FADE */

    @keyframes ps-fade-in {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }


    /* MOBILE */

    @media(max-width:600px) {

      .ps-reveal {
        transform: translateY(12px);
      }

      .story-ring {
        animation: ps-ring-glow 3s ease-in-out infinite;
      }

      .floating-create {
        animation: none;
      }

      .profile-card:hover,
      .about-card:hover {
        transform: none;
      }

    }


    /* ACCESSIBILITY */

    @media(prefers-reduced-motion:reduce) {

      *,
      *::before,
      *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
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


  /* ==========================================
     PAGE REVEALS
  ========================================== */

  const revealSelectors = [

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

    revealObserver = new IntersectionObserver(
      entries => {

        entries.forEach(entry => {

          if (entry.isIntersecting) {

            entry.target.classList.add("ps-visible");

            revealObserver.unobserve(entry.target);

          }

        });

      },
      {
        threshold: .08
      }
    );

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

    revealSelectors.forEach(selector => {

      document.querySelectorAll(selector).forEach(
        revealElement
      );

    });

  }


  /* ==========================================
     ANIMATE NEW POSTS AND STORIES
  ========================================== */

  function animateItems(container) {

    if (!container) return;

    const items = container.querySelectorAll(
      ".post, .post-card, .explore-item, .photo-card, .story-person"
    );

    items.forEach(item => {

      if (item.dataset.psAnimated === "1") return;

      item.dataset.psAnimated = "1";

      if (!reduceMotion) {

        item.classList.add("ps-item-enter");

      }

    });

  }


  /* ==========================================
     LIKE BUTTON EFFECTS
  ========================================== */

  document.addEventListener("click", event => {

    const button = event.target.closest(
      ".like-btn, .like-button, .post-like-btn, [data-action='like']"
    );

    if (!button) return;

    if (reduceMotion) return;

    button.classList.remove("ps-like-pop");

    void button.offsetWidth;

    button.classList.add("ps-like-pop");

    setTimeout(() => {

      button.classList.remove("ps-like-pop");

    },400);

  });


  /* ==========================================
     ACTIVE NAVIGATION
  ========================================== */

  function setupNavigation() {

    const nav = document.getElementById("dynamicNav");

    if (!nav) return;

    nav.addEventListener("click", event => {

      const button = event.target.closest(
        "button[data-go]"
      );

      if (!button) return;

      const target = document.getElementById(
        button.dataset.go
      );

      if (!target) return;

      event.preventDefault();

      target.scrollIntoView({

        behavior: reduceMotion ? "auto" : "smooth",

        block: "start"

      });

      nav.querySelectorAll("button").forEach(item => {

        item.classList.toggle(
          "ps-nav-active",
          item === button
        );

      });

    });

  }


  /* ==========================================
     FLOATING CREATE BUTTON
  ========================================== */

  function setupCreateButton() {

    const button = document.getElementById(
      "dynamicCreateBtn"
    );

    const composer = document.getElementById(
      "composerSection"
    );

    const caption = document.getElementById(
      "caption"
    );

    if (!button || !composer) return;

    button.addEventListener("click", () => {

      composer.scrollIntoView({

        behavior: reduceMotion ? "auto" : "smooth",

        block: "center"

      });

      if (caption) {

        setTimeout(
          () => caption.focus(),
          reduceMotion ? 0 : 350
        );

      }

    });

  }


  /* ==========================================
     LIVE CONTENT ANIMATIONS
  ========================================== */

  function setupLiveAnimations() {

    const containers = [

      document.getElementById("feed"),

      document.getElementById("dynamicExploreGrid"),

      document.getElementById("dynamicMoments")

    ].filter(Boolean);


    containers.forEach(container => {

      animateItems(container);

      if (!("MutationObserver" in window)) return;

      const observer = new MutationObserver(() => {

        animateItems(container);

      });

      observer.observe(container, {

        childList: true,

        subtree: true

      });

    });

  }


  /* ==========================================
     CREATE BUTTON VISIBILITY
  ========================================== */

  function setupFloatingVisibility() {

    const button = document.getElementById(
      "dynamicCreateBtn"
    );

    const appArea = document.getElementById(
      "appArea"
    );

    if (!button || !appArea) return;

    const observer = new MutationObserver(() => {

      button.hidden = appArea.hidden;

    });

    observer.observe(appArea, {

      attributes: true,

      attributeFilter: ["hidden"]

    });

    button.hidden = appArea.hidden;

  }


  /* ==========================================
     INITIALIZE
  ========================================== */

  function start() {

    applyReveals();

    setupNavigation();

    setupCreateButton();

    setupLiveAnimations();

    setupFloatingVisibility();


    const appArea = document.getElementById(
      "appArea"
    );

    if (appArea && "MutationObserver" in window) {

      const observer = new MutationObserver(
        applyReveals
      );

      observer.observe(appArea, {

        attributes: true,

        attributeFilter: ["hidden","class"]

      });

    }

    console.log(
      "PicShare 2.0 Dynamic Effects loaded successfully."
    );

  }


  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once:true }
    );

  } else {

    start();

  }

})();
