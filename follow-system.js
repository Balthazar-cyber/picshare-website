
/* ==========================================
   PICSHARE 2.0 — FOLLOW + PROFILE CONNECTIONS
   Firebase SDK 11.6.0
========================================== */

import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  writeBatch,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

let followingIds = new Set();
let followCounts = new Map();
let followingFeed = false;
let followBusy = false;
let feedObserver = null;
let currentProfileUid = null;
let profileSeed = {};
let activeConnectionTab = "followers";

/* ---------- PROFILE / RELATIONSHIP HELPERS ---------- */

async function getOwnProfile() {
  const user = auth.currentUser;
  if (!user) return {};
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? snap.data() : {};
}

async function loadFollowing() {
  const user = auth.currentUser;
  followingIds.clear();
  if (!user) return;

  const snap = await getDocs(
    collection(db, "users", user.uid, "following")
  );
  snap.forEach(item => followingIds.add(item.id));
}

async function getFollowerCount(uid) {
  if (followCounts.has(uid)) return followCounts.get(uid);

  const snap = await getDocs(collection(db, "users", uid, "followers"));
  followCounts.set(uid, snap.size);
  return snap.size;
}

async function getMemberSummary(uid, relationship = {}) {
  let name = relationship.targetName || relationship.name || "";
  let photoURL = relationship.targetPhotoURL || "";

  if (!name || !photoURL) {
    try {
      const posts = await getDocs(query(
        collection(db, "posts"),
        where("uid", "==", uid),
        limit(1)
      ));

      if (!posts.empty) {
        const post = posts.docs[0].data();
        name = name || post.name || "";
        photoURL = photoURL || post.photoURL || "";
      }
    } catch (error) {
      console.warn("Could not load member details:", error);
    }
  }

  return {
    uid,
    name: name || "PicShare member",
    photoURL: photoURL || ""
  };
}

async function getConnectionData(uid) {
  const [followersSnap, followingSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "followers")),
    getDocs(collection(db, "users", uid, "following"))
  ]);

  const followerIds = new Set(followersSnap.docs.map(item => item.id));
  const followingIdSet = new Set(followingSnap.docs.map(item => item.id));
  const friendIds = [...followerIds].filter(id => followingIdSet.has(id));

  return {
    followersSnap,
    followingSnap,
    followerIds,
    followingIdSet,
    friendIds
  };
}

/* ---------- FOLLOW / UNFOLLOW ---------- */

async function toggleFollow(targetUid, button, targetMeta = {}) {
  const user = auth.currentUser;

  if (!user) {
    alert("Please sign in to follow members.");
    return;
  }
  if (!targetUid || user.uid === targetUid) return;
  if (followBusy) return;

  followBusy = true;
  if (button) button.disabled = true;

  try {
    const followingRef = doc(db, "users", user.uid, "following", targetUid);
    const followerRef = doc(db, "users", targetUid, "followers", user.uid);
    const isFollowing = followingIds.has(targetUid);
    const batch = writeBatch(db);

    if (isFollowing) {
      batch.delete(followingRef);
      batch.delete(followerRef);
    } else {
      const ownProfile = await getOwnProfile();
      const relationship = {
        uid: user.uid,
        followedUid: targetUid,
        name: ownProfile.name || user.displayName || "PicShare member",
        photoURL: ownProfile.photoURL || user.photoURL || "",
        targetName: targetMeta.name || "PicShare member",
        targetPhotoURL: targetMeta.photoURL || "",
        createdAt: serverTimestamp()
      };

      batch.set(followingRef, relationship);
      batch.set(followerRef, relationship);
    }

    await batch.commit();

    if (isFollowing) {
      followingIds.delete(targetUid);
    } else {
      followingIds.add(targetUid);

      const ownProfile = await getOwnProfile();
      await addDoc(collection(db, "users", targetUid, "notifications"), {
        actorUid: user.uid,
        actorName: ownProfile.name || user.displayName || "PicShare member",
        type: "follow",
        read: false,
        createdAt: serverTimestamp()
      }).catch(error => console.warn("Follow notification failed:", error));
    }

    followCounts.delete(targetUid);
    followCounts.delete(user.uid);
    await refreshFollowUI();

    if (currentProfileUid) {
      await openProfile(currentProfileUid, profileSeed);
    }
  } catch (error) {
    console.error("Follow action failed:", error);
    alert("Follow action failed: " + error.message);
  } finally {
    followBusy = false;
    if (button) button.disabled = false;
  }
}

async function updateFollowButton(button) {
  const user = auth.currentUser;
  const targetUid = button.dataset.followUid;

  if (!user || !targetUid || targetUid === user.uid) {
    button.hidden = true;
    return;
  }

  const count = await getFollowerCount(targetUid);
  const isFollowing = followingIds.has(targetUid);

  button.textContent = isFollowing ? "Following" : "＋ Follow";
  button.classList.toggle("following-active", isFollowing);

  const countElement = button.parentElement?.querySelector(".ps-follower-count");
  if (countElement) {
    countElement.textContent = `${count} ${count === 1 ? "follower" : "followers"}`;
  }
}

/* ---------- PROFILE VIEWER STYLES ---------- */

function installProfileStyles() {
  if ($("psProfileStyles")) return;

  const style = document.createElement("style");
  style.id = "psProfileStyles";
  style.textContent = `
    .ps-profile-trigger { cursor:pointer; }
    .ps-profile-trigger:hover { text-decoration:underline; }
    .ps-follow-wrap { display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-top:7px; }
    .ps-follow-button { border:1px solid #16b8b0; border-radius:999px; padding:7px 13px; background:#102b3b; color:#fff; font-weight:700; cursor:pointer; }
    .ps-follow-button.following-active { background:transparent; color:inherit; }
    .ps-follow-button:disabled { opacity:.6; cursor:wait; }
    .ps-follower-count { font-size:12px; opacity:.75; }
    .ps-follow-controls { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }
    .ps-feed-tab { border:1px solid #16b8b0; border-radius:999px; padding:8px 14px; background:transparent; color:inherit; cursor:pointer; }
    .ps-feed-tab.active { background:#16b8b0; color:#06202c; font-weight:700; }
    .ps-connection-stats { display:flex; gap:8px; margin:15px 0; }
    .ps-stat-button { flex:1; min-width:0; border:1px solid rgba(128,160,175,.35); border-radius:12px; padding:10px 5px; background:rgba(128,160,175,.08); color:inherit; cursor:pointer; }
    .ps-stat-button strong { display:block; font-size:18px; }
    .ps-stat-button span { display:block; font-size:11px; opacity:.8; }
    .ps-profile-modal { position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.72); }
    .ps-profile-modal[hidden] { display:none; }
    .ps-profile-dialog { width:min(100%,460px); max-height:85vh; overflow:auto; border-radius:18px; padding:18px; background:var(--card,#102b3b); color:var(--text,#fff); box-shadow:0 18px 55px rgba(0,0,0,.4); }
    .ps-profile-top { display:flex; align-items:center; gap:13px; }
    .ps-profile-avatar { width:62px; height:62px; flex:0 0 62px; border-radius:50%; object-fit:cover; background:#16b8b0; display:grid; place-items:center; color:#06202c; font-weight:800; font-size:24px; }
    .ps-profile-name { font-size:19px; font-weight:800; overflow-wrap:anywhere; }
    .ps-profile-close { margin-left:auto; border:0; background:transparent; color:inherit; font-size:25px; cursor:pointer; }
    .ps-connection-tabs { display:flex; gap:6px; margin:14px 0; }
    .ps-connection-tab { flex:1; padding:9px 4px; border:1px solid rgba(128,160,175,.35); border-radius:10px; background:transparent; color:inherit; cursor:pointer; font-size:12px; }
    .ps-connection-tab.active { background:#16b8b0; color:#06202c; font-weight:800; }
    .ps-connection-list { display:grid; gap:8px; }
    .ps-member-item { width:100%; display:flex; align-items:center; gap:10px; padding:9px; border:1px solid rgba(128,160,175,.2); border-radius:12px; background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .ps-member-item img,.ps-member-placeholder { width:40px; height:40px; flex:0 0 40px; border-radius:50%; object-fit:cover; display:grid; place-items:center; background:#16b8b0; color:#06202c; font-weight:800; }
    .ps-member-name { font-weight:700; }
    .ps-list-empty { text-align:center; opacity:.7; padding:22px 8px; }
    .ps-own-connections { margin-top:12px; }
    @media(max-width:380px) {
      .ps-connection-tabs { gap:4px; }
      .ps-connection-tab { font-size:11px; }
    }
  `;
  document.head.appendChild(style);
}


/* ---------- PROFILE VIEWER ---------- */

function ensureProfileModal() {
  if ($("psProfileModal")) return;

  const modal = document.createElement("div");
  modal.id = "psProfileModal";
  modal.className = "ps-profile-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="ps-profile-dialog" role="dialog" aria-modal="true" aria-label="Member profile">
      <div class="ps-profile-top">
        <div id="psModalAvatar" class="ps-profile-avatar">P</div>
        <div style="min-width:0;flex:1">
          <div id="psModalName" class="ps-profile-name">PicShare member</div>
          <div id="psModalFollowWrap"></div>
        </div>
        <button type="button" class="ps-profile-close" id="psProfileClose" aria-label="Close">×</button>
      </div>
      <div id="psModalStats" class="ps-connection-stats"></div>
      <div class="ps-connection-tabs">
        <button type="button" class="ps-connection-tab active" data-connection-tab="followers">Followers</button>
        <button type="button" class="ps-connection-tab" data-connection-tab="following">Following</button>
        <button type="button" class="ps-connection-tab" data-connection-tab="friends">Friends</button>
      </div>
      <div id="psConnectionList" class="ps-connection-list">
        <p class="ps-list-empty">Loading connections...</p>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  $("psProfileClose").addEventListener("click", closeProfile);

  modal.addEventListener("click", event => {
    if (event.target === modal) closeProfile();
  });

  modal.querySelectorAll("[data-connection-tab]").forEach(button => {
    button.addEventListener("click", () => {
      activeConnectionTab = button.dataset.connectionTab;
      modal.querySelectorAll("[data-connection-tab]").forEach(tab =>
        tab.classList.toggle("active", tab === button)
      );
      renderConnectionTab().catch(showConnectionError);
    });
  });

  $("psConnectionList").addEventListener("click", event => {
  const item = event.target.closest("button[data-member-uid]");
  if (!item) return;

  event.stopPropagation();

  const uid = item.dataset.memberUid;
  const name = item.dataset.memberName || "PicShare member";
  const photoURL = item.dataset.memberPhoto || "";

  openProfile(uid, { name, photoURL }).catch(showConnectionError);
});

  $("psModalFollowWrap").addEventListener("click", event => {
    const button = event.target.closest("[data-follow-uid]");
    if (!button) return;
    toggleFollow(button.dataset.followUid, button, profileSeed);
  });
}

function closeProfile() {
  if ($("psProfileModal")) $("psProfileModal").hidden = true;
  currentProfileUid = null;
}

function showConnectionError(error) {
  console.error("Could not load connections:", error);

  if ($("psConnectionList")) {
    $("psConnectionList").innerHTML =
      `<p class="ps-list-empty">Connections could not load. ${safe(error.message)}</p>`;
  }
}

function avatarMarkup(member) {
  if (member.photoURL) {
    return `<img src="${safe(member.photoURL)}" alt="" loading="lazy">`;
  }

  return `<span class="ps-member-placeholder">${safe((member.name || "P").slice(0, 1).toUpperCase())}</span>`;
}

function memberButton(member) {
  return `
    <button type="button" class="ps-member-item"
      data-member-uid="${safe(member.uid)}"
      data-member-name="${safe(member.name)}"
      data-member-photo="${safe(member.photoURL)}">
      ${avatarMarkup(member)}
      <span class="ps-member-name">${safe(member.name)}</span>
    </button>
  `;
}

async function renderConnectionTab() {
  const uid = currentProfileUid;
  if (!uid) return;

  const list = $("psConnectionList");
  list.innerHTML = '<p class="ps-list-empty">Loading...</p>';

  const data = await getConnectionData(uid);
  let members = [];

  if (activeConnectionTab === "followers") {
    members = await Promise.all(data.followersSnap.docs.map(async item => {
      const record = item.data();

      return {
        uid: item.id,
        name: record.name || "PicShare member",
        photoURL: record.photoURL || ""
      };
    }));
  } else if (activeConnectionTab === "following") {
    members = await Promise.all(data.followingSnap.docs.map(item =>
      getMemberSummary(item.id, item.data())
    ));
  } else {
    members = await Promise.all(data.friendIds.map(async friendUid => {
      const followingRecord =
        data.followingSnap.docs.find(item => item.id === friendUid)?.data() || {};

      const followerRecord =
        data.followersSnap.docs.find(item => item.id === friendUid)?.data() || {};

      return getMemberSummary(friendUid, {
        targetName: followingRecord.targetName || followerRecord.name,
        targetPhotoURL: followingRecord.targetPhotoURL || followerRecord.photoURL
      });
    }));
  }

  if (!members.length) {
    list.innerHTML = `<p class="ps-list-empty">No ${activeConnectionTab} yet.</p>`;
    return;
  }

  list.innerHTML = members.map(memberButton).join("");
}

async function openProfile(uid, seed = {}) {
  if (!uid) return;

  installProfileStyles();
  ensureProfileModal();

  currentProfileUid = uid;
  profileSeed = seed || {};
  activeConnectionTab = "followers";

  const modal = $("psProfileModal");
  modal.hidden = false;

  $("psConnectionList").innerHTML =
    '<p class="ps-list-empty">Loading connections...</p>';

  let ownProfile = {};

  if (auth.currentUser?.uid === uid) {
    ownProfile = await getOwnProfile().catch(() => ({}));
  }

  const name = ownProfile.name || seed.name || "PicShare member";
  const photoURL = ownProfile.photoURL || seed.photoURL || "";

  $("psModalName").textContent = name;

  $("psModalAvatar").innerHTML = photoURL
    ? `<img class="ps-profile-avatar" src="${safe(photoURL)}" alt="${safe(name)}">`
    : safe(name.slice(0, 1).toUpperCase());

  const followWrap = $("psModalFollowWrap");

  if (auth.currentUser && auth.currentUser.uid !== uid) {
    followWrap.innerHTML = `
      <button type="button" class="ps-follow-button" data-follow-uid="${safe(uid)}">
        ${followingIds.has(uid) ? "Following" : "＋ Follow"}
      </button>
    `;
  } else {
    followWrap.innerHTML = "";
  }

  $("psProfileModal").querySelectorAll("[data-connection-tab]").forEach(button =>
    button.classList.toggle("active", button.dataset.connectionTab === "followers")
  );

  try {
    const data = await getConnectionData(uid);
    if (currentProfileUid !== uid) return;

    $("psModalStats").innerHTML = `
      <button type="button" class="ps-stat-button" data-open-tab="followers">
        <strong>${data.followersSnap.size}</strong><span>Followers</span>
      </button>
      <button type="button" class="ps-stat-button" data-open-tab="following">
        <strong>${data.followingSnap.size}</strong><span>Following</span>
      </button>
      <button type="button" class="ps-stat-button" data-open-tab="friends">
        <strong>${data.friendIds.length}</strong><span>Friends</span>
      </button>
    `;

    $("psModalStats").querySelectorAll("[data-open-tab]").forEach(button => {
      button.addEventListener("click", () => {
        activeConnectionTab = button.dataset.openTab;

        $("psProfileModal").querySelectorAll("[data-connection-tab]").forEach(tab =>
          tab.classList.toggle("active", tab.dataset.connectionTab === activeConnectionTab)
        );

        renderConnectionTab().catch(showConnectionError);
      });
    });

    await renderConnectionTab();
  } catch (error) {
    showConnectionError(error);
  }
}

/* ---------- YOUR OWN PROFILE CONNECTION COUNTS ---------- */

async function renderOwnProfileConnections() {
  const user = auth.currentUser;
  const card = $("profileCard");

  if (!user || !card) return;

  let stats = $("psOwnConnectionStats");

  if (!stats) {
    stats = document.createElement("div");
    stats.id = "psOwnConnectionStats";
    stats.className = "ps-connection-stats ps-own-connections";
    card.appendChild(stats);
  }

  try {
    const data = await getConnectionData(user.uid);

    stats.innerHTML = `
      <button type="button" class="ps-stat-button" data-own-tab="followers">
        <strong>${data.followersSnap.size}</strong><span>Followers</span>
      </button>
      <button type="button" class="ps-stat-button" data-own-tab="following">
        <strong>${data.followingSnap.size}</strong><span>Following</span>
      </button>
      <button type="button" class="ps-stat-button" data-own-tab="friends">
        <strong>${data.friendIds.length}</strong><span>Friends</span>
      </button>
    `;

    stats.querySelectorAll("[data-own-tab]").forEach(button => {
      button.addEventListener("click", () =>
        openProfile(user.uid).then(() => {
          activeConnectionTab = button.dataset.ownTab;

          $("psProfileModal").querySelectorAll("[data-connection-tab]").forEach(tab =>
            tab.classList.toggle("active", tab.dataset.connectionTab === activeConnectionTab)
          );

          renderConnectionTab().catch(showConnectionError);
        })
      );
    });
  } catch (error) {
    console.error("Could not load your profile connections:", error);
    stats.textContent = "Connection counts could not load.";
  }
}


/* ---------- POSTS: PROFILE LINKS + FOLLOW BUTTONS ---------- */

async function decoratePosts() {
  const user = auth.currentUser;
  if (!user) return;

  const posts = document.querySelectorAll("#feed .post");

  for (const post of posts) {
    const uid = post.dataset.creatorUid;
    if (!uid) continue;

    const authorName = post.querySelector(".post-author");
    const avatar = post.querySelector(".post-head .mini-avatar");

    [authorName, avatar].filter(Boolean).forEach(element => {
      element.dataset.profileUid = uid;
      element.classList.add("ps-profile-trigger");
      element.setAttribute("title", "View member profile");
    });

    if (uid === user.uid || post.querySelector(".ps-follow-wrap")) continue;

    const author = post.querySelector(".post-head");
    if (!author) continue;

    const wrap = document.createElement("div");
    wrap.className = "ps-follow-wrap";
    wrap.innerHTML = `
      <button type="button" class="ps-follow-button" data-follow-uid="${safe(uid)}">＋ Follow</button>
      <span class="ps-follower-count">Loading...</span>
    `;
    author.appendChild(wrap);

    const button = wrap.querySelector("button");

    button.addEventListener("click", () => {
      const name = post.querySelector(".post-author")?.textContent?.trim() || "PicShare member";
      const photoURL = post.querySelector(".mini-avatar")?.src || "";

      toggleFollow(uid, button, { name, photoURL });
    });

    updateFollowButton(button).catch(console.error);
  }

  applyFollowingFilter();
}

/* Profile links use delegation because the feed is rebuilt by app.js. */
function installProfileClickHandler() {
  const feed = $("feed");
  if (!feed || feed.dataset.profileClickReady === "true") return;

  feed.dataset.profileClickReady = "true";

  feed.addEventListener("click", event => {
    const trigger = event.target.closest("[data-profile-uid]");
    if (!trigger) return;

    const uid = trigger.dataset.profileUid;
    const post = trigger.closest(".post");
    const name = post?.querySelector(".post-author")?.textContent?.trim() || "PicShare member";
    const avatar = post?.querySelector(".mini-avatar");
    const photoURL = avatar?.tagName === "IMG" ? avatar.src : "";

    openProfile(uid, { name, photoURL }).catch(showConnectionError);
  });
}

/* ---------- FOLLOWING FEED FILTER ---------- */

function applyFollowingFilter() {
  const posts = document.querySelectorAll("#feed .post");

  posts.forEach(post => {
    const uid = post.dataset.creatorUid;
    post.hidden = followingFeed && (!uid || !followingIds.has(uid));
  });

  const empty = $("psFollowingEmpty");

  if (empty) {
    const visible = [...posts].some(post => !post.hidden);
    empty.hidden = !followingFeed || visible;
  }
}

function createFollowingControls() {
  const heading = $("feedSection");
  if (!heading || $("psFollowingControls")) return;

  const controls = document.createElement("div");
  controls.id = "psFollowingControls";
  controls.className = "ps-follow-controls";

  controls.innerHTML = `
    <button type="button" id="psAllFeed" class="ps-feed-tab active">🌍 Everyone</button>
    <button type="button" id="psFollowingFeed" class="ps-feed-tab">👥 Following</button>
  `;

  heading.appendChild(controls);

  const empty = document.createElement("div");
  empty.id = "psFollowingEmpty";
  empty.className = "card empty";
  empty.hidden = true;
  empty.textContent = "No posts from creators you follow yet.";

  $("feed")?.after(empty);

  $("psAllFeed").addEventListener("click", () => {
    followingFeed = false;
    $("psAllFeed").classList.add("active");
    $("psFollowingFeed").classList.remove("active");
    applyFollowingFilter();
  });

  $("psFollowingFeed").addEventListener("click", async () => {
    followingFeed = true;
    $("psFollowingFeed").classList.add("active");
    $("psAllFeed").classList.remove("active");

    try {
      await loadFollowing();
      applyFollowingFilter();
    } catch (error) {
      alert("Could not load following feed: " + error.message);
    }
  });
}

async function refreshFollowUI() {
  await loadFollowing();
  followCounts.clear();

  document.querySelectorAll("#feed .ps-follow-button").forEach(button => {
    updateFollowButton(button).catch(console.error);
  });

  applyFollowingFilter();
  renderOwnProfileConnections().catch(console.error);
}

/* ---------- STARTUP ---------- */

function startFollowSystem() {
  createFollowingControls();
  installProfileClickHandler();

  const feed = $("feed");
  if (!feed) return;

  if (feedObserver) feedObserver.disconnect();

  feedObserver = new MutationObserver(() => {
    decoratePosts().catch(console.error);
  });

  feedObserver.observe(feed, {
    childList: true,
    subtree: true
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    followingIds.clear();
    followingFeed = false;
    followCounts.clear();

    if (feedObserver) feedObserver.disconnect();
    feedObserver = null;

    $("psFollowingControls")?.remove();
    $("psFollowingEmpty")?.remove();
    $("psOwnConnectionStats")?.remove();

    closeProfile();
    return;
  }

  try {
    installProfileStyles();
    ensureProfileModal();

    await loadFollowing();

    startFollowSystem();

    await decoratePosts();
    await renderOwnProfileConnections();

  } catch (error) {
    console.error("Follow and profile connection system failed:", error);
  }
});

/* END PICSHARE FOLLOW + PROFILE CONNECTIONS */


