/* ==========================================
   PICSHARE 2.0 — FOLLOW SYSTEM
   Firebase SDK 11.6.0
========================================== */

import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

/* REUSE EXISTING FIREBASE APP */

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

let followingIds = new Set();
let followCounts = new Map();
let followingFeed = false;
let loading = false;

/* GET PROFILE */

async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : {};
}

/* LOAD FOLLOWING LIST */

async function loadFollowing() {
  const user = auth.currentUser;

  followingIds.clear();

  if (!user) return;

  const snap = await getDocs(
    collection(db, "users", user.uid, "following")
  );

  snap.forEach(item => followingIds.add(item.id));
}

/* GET FOLLOWER COUNT */

async function getFollowerCount(uid) {
  if (followCounts.has(uid)) {
    return followCounts.get(uid);
  }

  const snap = await getDocs(
    collection(db, "users", uid, "followers")
  );

  followCounts.set(uid, snap.size);

  return snap.size;
}

/* FOLLOW / UNFOLLOW */

async function toggleFollow(targetUid, button) {
  const user = auth.currentUser;

  if (!user) {
    alert("Please sign in to follow creators.");
    return;
  }

  if (user.uid === targetUid) {
    alert("You cannot follow yourself.");
    return;
  }

  if (loading) return;

  button.disabled = true;
  loading = true;

  try {
    const targetProfile = await getProfile(targetUid);

    if (!targetProfile.uid) {
      throw new Error("This creator's profile could not be found.");
    }

    const followingRef = doc(
      db, "users", user.uid, "following", targetUid
    );

    const followerRef = doc(
      db, "users", targetUid, "followers", user.uid
    );

    const isFollowing = followingIds.has(targetUid);
    const batch = writeBatch(db);

    if (isFollowing) {
      batch.delete(followingRef);
      batch.delete(followerRef);
    } else {
      const profile = await getProfile(user.uid);

      const relationship = {
        uid: user.uid,
        followedUid: targetUid,
        name: profile.name || user.displayName || "PicShare member",
        photoURL: profile.photoURL || user.photoURL || "",
        createdAt: serverTimestamp()
      };

      batch.set(followingRef, relationship);
      batch.set(followerRef, relationship);
    }

    await batch.commit();

    if (isFollowing) {
      followingIds.delete(targetUid);
      followCounts.set(
        targetUid,
        Math.max(0, (followCounts.get(targetUid) || 1) - 1)
      );
    } else {
      followingIds.add(targetUid);
      followCounts.set(
        targetUid,
        (followCounts.get(targetUid) || 0) + 1
      );

      /* FOLLOW NOTIFICATION */

      await addDoc(
        collection(db, "users", targetUid, "notifications"),
        {
          actorUid: user.uid,
          actorName: user.displayName || "PicShare member",
          type: "follow",
          read: false,
          createdAt: serverTimestamp()
        }
      ).catch(error => {
        console.error("Follow notification failed:", error);
      });
    }

    await refreshFollowUI();

  } catch (error) {
    console.error("Follow error:", error);
    alert("Follow action failed: " + error.message);

  } finally {
    button.disabled = false;
    loading = false;
  }
}

/* UPDATE FOLLOW BUTTONS */

async function updateFollowButton(button) {
  const user = auth.currentUser;
  const targetUid = button.dataset.followUid;

  if (!user || !targetUid || targetUid === user.uid) {
    button.hidden = true;
    return;
  }

  const count = await getFollowerCount(targetUid);

  const following = followingIds.has(targetUid);

  button.textContent = following ? "Following" : "＋ Follow";
  button.classList.toggle("following-active", following);

  const countElement = button.parentElement
    ?.querySelector(".ps-follower-count");

  if (countElement) {
    countElement.textContent =
      `${count} ${count === 1 ? "follower" : "followers"}`;
  }
}

/* ADD FOLLOW BUTTONS TO POSTS */

async function decoratePosts() {
  const user = auth.currentUser;

  if (!user) return;

  const posts = document.querySelectorAll("#feed .post");

  for (const post of posts) {
    const author = post.querySelector(".post-head");

    if (!author || author.querySelector(".ps-follow-wrap")) {
      continue;
    }

    const postId = post.querySelector("[data-post-id]")
      ?.dataset.postId;

    // Get creator UID from the original post markup.
    const uid = post.dataset.creatorUid;

    if (!uid || uid === user.uid) continue;

    const wrap = document.createElement("div");
    wrap.className = "ps-follow-wrap";

    wrap.innerHTML = `
      <button
        type="button"
        class="ps-follow-button"
        data-follow-uid="${safe(uid)}">
        ＋ Follow
      </button>
      <span class="ps-follower-count">Loading...</span>
    `;

    author.appendChild(wrap);

    const button = wrap.querySelector("button");

    button.addEventListener("click", () => {
      toggleFollow(uid, button);
    });

    updateFollowButton(button).catch(console.error);
  }

  applyFollowingFilter();
}

/* FOLLOWING FEED FILTER */

function applyFollowingFilter() {
  const posts = document.querySelectorAll("#feed .post");

  posts.forEach(post => {
    const uid = post.dataset.creatorUid;

    post.hidden = followingFeed &&
      (!uid || !followingIds.has(uid));
  });

  const empty = $("psFollowingEmpty");

  if (empty) {
    const visible = [...posts].some(post => !post.hidden);
    empty.hidden = !followingFeed || visible;
  }
}

/* ADD FEED FILTER BUTTONS */

function createFollowingControls() {
  const heading = $("feedSection");

  if (!heading || $("psFollowingControls")) return;

  const controls = document.createElement("div");

  controls.id = "psFollowingControls";
  controls.className = "ps-follow-controls";

  controls.innerHTML = `
    <button type="button" id="psAllFeed" class="ps-feed-tab active">
      🌍 Everyone
    </button>

    <button type="button" id="psFollowingFeed" class="ps-feed-tab">
      👥 Following
    </button>
  `;

  heading.appendChild(controls);

  const empty = document.createElement("div");

  empty.id = "psFollowingEmpty";
  empty.className = "card empty";
  empty.hidden = true;
  empty.textContent =
    "No posts from creators you follow yet.";

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

/* REFRESH FOLLOW UI */

async function refreshFollowUI() {
  await loadFollowing();

  followCounts.clear();

  document.querySelectorAll(
    "#feed .ps-follow-button"
  ).forEach(button => {
    updateFollowButton(button).catch(console.error);
  });

  applyFollowingFilter();
}

/* WAIT FOR APP FEED */

function startFollowSystem() {
  createFollowingControls();

  const feed = $("feed");

  if (!feed) return;

  const observer = new MutationObserver(() => {
    decoratePosts().catch(console.error);
  });

  observer.observe(feed, {
    childList: true,
    subtree: true
  });
}

/* AUTHENTICATION */

onAuthStateChanged(auth, async user => {
  if (!user) {
    followingIds.clear();
    followingFeed = false;
    $("psFollowingControls")?.remove();
    $("psFollowingEmpty")?.remove();
    return;
  }

  try {
    await loadFollowing();
    startFollowSystem();
    await decoratePosts();
  } catch (error) {
    console.error("Follow system initialization failed:", error);
  }
});

/* END PICSHARE FOLLOW SYSTEM */
