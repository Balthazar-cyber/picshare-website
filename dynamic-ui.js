(() => {
  const style = document.createElement("style");
  style.textContent = `
    .dynamic-section{margin:20px 0}
    .dynamic-title{font-size:19px;font-weight:800;margin:0 0 14px}
    .moments-row{display:flex;gap:13px;overflow-x:auto;padding:5px 2px 15px}
    .moment{flex:0 0 85px;text-align:center;cursor:pointer}
    .moment-ring{width:72px;height:72px;border-radius:50%;padding:3px;margin:auto;background:linear-gradient(135deg,#20b8a4,#7962e8,#ff9d54)}
    .moment-ring img,.moment-ring span{width:100%;height:100%;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:#e3f8f4;font-weight:800}
    .moment-name{display:block;font-size:11px;margin-top:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .explore-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
    .explore-tile{aspect-ratio:1/1;overflow:hidden;border-radius:10px;background:#e8edf2;cursor:pointer}
    .explore-tile img{width:100%;height:100%;object-fit:cover;transition:transform .25s}
    .explore-tile:hover img{transform:scale(1.06)}
    .dynamic-nav{display:none}
    .floating-create{position:fixed;right:22px;bottom:25px;width:58px;height:58px;border:0;border-radius:50%;background:#20b8a4;color:#101b2d;font-size:30px;font-weight:700;box-shadow:0 8px 25px #0003;z-index:150}
    .theme-toggle{border:1px solid #ffffff40;background:#1d3045;color:white;border-radius:10px;padding:10px 12px;font-size:12px}
    body.dark-mode{background:#0c1420;color:#edf3f7}
    body.dark-mode .card,body.dark-mode .post,body.dark-mode .composer,body.dark-mode .auth-card,body.dark-mode .notification-panel{background:#172437;color:#edf3f7;border-color:#2b3b50}
    body.dark-mode input,body.dark-mode textarea{background:#101c2c;color:white;border-color:#34445a}
    body.dark-mode .comment-item,body.dark-mode .like-button{background:#22344a;color:white;border-color:#34445a}
    body.dark-mode .post-caption,body.dark-mode .post-author,body.dark-mode label{color:#edf3f7}
    body.dark-mode .notification-item{border-color:#34445a}
    @media(max-width:600px){
      .dynamic-nav{display:flex;position:fixed;bottom:0;left:0;right:0;height:65px;background:#101b2d;z-index:140;justify-content:space-around;align-items:center;padding-bottom:env(safe-area-inset-bottom);box-shadow:0 -4px 18px #0002}
      .dynamic-nav button{border:0;background:none;color:#c5d0dc;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:3px}
      .dynamic-nav button span{font-size:20px}
      body{padding-bottom:75px}
      .floating-create{bottom:82px}
      .explore-grid{gap:3px}
    }
  `;
  document.head.appendChild(style);

  const appArea = document.getElementById("appArea");
  const feed = document.getElementById("feed");
  if (!appArea || !feed) return;

  const moments = document.createElement("section");
  moments.className = "dynamic-section";
  moments.innerHTML = `
    <h2 class="dynamic-title">✨ Community Moments</h2>
    <div class="moments-row" id="dynamicMoments"></div>
  `;

  const explore = document.createElement("section");
  explore.className = "dynamic-section";
  explore.id = "dynamicExplore";
  explore.innerHTML = `
    <h2 class="dynamic-title">Discover photos</h2>
    <div class="explore-grid" id="dynamicExploreGrid"></div>
  `;

  const welcome = appArea.querySelector(".welcome-strip");
  if (welcome) welcome.after(moments);
  const feedHeading = appArea.querySelector(".feed-heading");
  if (feedHeading) feedHeading.after(explore);

  const nav = document.createElement("nav");
  nav.className = "dynamic-nav";
  nav.innerHTML = `
    <button data-go="home"><span>⌂</span>Home</button>
    <button data-go="explore"><span>▦</span>Explore</button>
    <button data-go="notifications"><span>♧</span>Alerts</button>
    <button data-go="profileCard"><span>◉</span>Profile</button>
  `;
  document.body.appendChild(nav);

  const create = document.createElement("button");
  create.className = "floating-create";
  create.type = "button";
  create.textContent = "+";
  create.setAttribute("aria-label", "Create a post");
  document.body.appendChild(create);

  const theme = document.createElement("button");
  theme.className = "theme-toggle";
  theme.type = "button";
  theme.textContent = "☾ Theme";
  document.querySelector(".topbar")?.appendChild(theme);

  theme.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    theme.textContent = document.body.classList.contains("dark-mode")
      ? "☀ Light"
      : "☾ Theme";
  });

  create.addEventListener("click", () => {
    document.getElementById("caption")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    document.getElementById("caption")?.focus();
  });

  nav.addEventListener("click", event => {
    const button = event.target.closest("button[data-go]");
    if (!button) return;
    const destination = button.dataset.go;

    if (destination === "home") {
      welcome?.scrollIntoView({ behavior: "smooth" });
    } else if (destination === "explore") {
      explore.scrollIntoView({ behavior: "smooth" });
    } else if (destination === "notifications") {
      document.getElementById("notificationBtn")?.click();
    } else {
      document.getElementById("profileCard")?.scrollIntoView({
        behavior: "smooth"
      });
    }
  });

  function refreshDynamicSections() {
    const posts = [...feed.querySelectorAll(".post")];
    const momentBox = document.getElementById("dynamicMoments");
    const exploreBox = document.getElementById("dynamicExploreGrid");
    if (!momentBox || !exploreBox) return;

    const people = new Map();

    posts.forEach(post => {
      const name = post.querySelector(".post-author")?.textContent.trim() || "Member";
      const avatar = post.querySelector(".mini-avatar");
      if (!people.has(name)) {
        people.set(name, avatar?.tagName === "IMG" ? avatar.src : "");
      }
    });

    momentBox.innerHTML = [...people.entries()].slice(0, 15).map(([name, photo]) => `
      <div class="moment" title="${escapeText(name)}">
        <div class="moment-ring">
          ${photo
            ? `<img src="${escapeText(photo)}" alt="">`
            : `<span>${escapeText(name.charAt(0).toUpperCase())}</span>`}
        </div>
        <span class="moment-name">${escapeText(name)}</span>
      </div>
    `).join("");

    const photos = posts.map(post => post.querySelector(".post-image"))
      .filter(Boolean);

    exploreBox.innerHTML = photos.map((photo, index) => `
      <div class="explore-tile" data-photo-index="${index}">
        <img src="${escapeText(photo.src)}" alt="Community photo" loading="lazy">
      </div>
    `).join("");

    exploreBox.querySelectorAll(".explore-tile").forEach(tile => {
      tile.addEventListener("click", () => {
        const index = Number(tile.dataset.photoIndex);
        photos[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    if (!people.size) {
      momentBox.innerHTML = '<p class="muted">Community moments will appear here.</p>';
    }
    if (!photos.length) {
      exploreBox.innerHTML = '<p class="muted">Photos shared by the community will appear here.</p>';
    }
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  new MutationObserver(refreshDynamicSections).observe(feed, {
    childList: true,
    subtree: true
  });

  const authObserver = new MutationObserver(() => {
    const signedIn = !appArea.hidden;
    nav.style.display = signedIn ? "" : "none";
    create.style.display = signedIn ? "" : "none";
    if (signedIn) refreshDynamicSections();
  });

  authObserver.observe(appArea, {
    attributes: true,
    attributeFilter: ["hidden"]
  });

  nav.style.display = appArea.hidden ? "none" : "";
  create.style.display = appArea.hidden ? "none" : "";
  refreshDynamicSections();
})();
