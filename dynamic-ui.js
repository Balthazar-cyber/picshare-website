import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  doc,
  setDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

const moments = document.getElementById("dynamicMoments");
const appArea = document.getElementById("appArea");

if (!moments || !appArea) {
  console.error("PicShare Stories: required HTML elements are missing.");
} else {
  let currentUser = null;
  let stories = [];
  let stopStories = null;
  let viewerStories = [];
  let selectedStory = 0;
  let storyTimer = null;

  const DAY = 24 * 60 * 60 * 1000;
  const STORY_DURATION = 5000;
  const ADMIN_UID = "VXDMuU17gifoBqTkbpC55Xre9242";

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function showStatus(message) {
    const status = document.getElementById("storyStatus");
    if (status) status.textContent = message;
  }

  function getTime(story) {
    return story.createdAt?.toMillis?.() || 0;
  }

  function isActive(story) {
    return (story.expiresAt?.toMillis?.() || 0) > Date.now();
  }

  // STORY INTERFACE

  const storySection =
    moments.closest("#momentsSection") || moments.parentElement;

  storySection.insertAdjacentHTML("beforeend", `
    <div class="story-create-area">
      <button id="addStoryBtn" type="button">
        <span>＋</span>
        <strong>Add your story</strong>
      </button>

      <input id="storyFile" type="file"
        accept="image/jpeg,image/png,image/webp" hidden>

      <p id="storyStatus" role="status" aria-live="polite"></p>
    </div>
  `);

  document.body.insertAdjacentHTML("beforeend", `
    <div id="storyViewer" class="story-viewer" hidden>
      <button id="storyClose" class="story-close" type="button">×</button>

      <div class="story-viewer-card">
        <div class="story-progress">
          <span id="storyProgress"></span>
        </div>

        <div id="storyOwner" class="story-owner"></div>

        <img id="storyImage" alt="PicShare story">

        <div class="story-controls">
          <button id="storyPrevious" type="button"
            aria-label="Previous story">‹</button>

          <button id="storyNext" type="button"
            aria-label="Next story">›</button>
        </div>

        <div class="story-actions">
          <button id="storyReact" type="button">❤️ React</button>
          <button id="storyViewers" type="button" hidden>Viewers</button>
          <button id="storyReactions" type="button" hidden>Reactions</button>
        </div>

        <div id="storyViewCount" class="story-view-count"></div>

        <button id="deleteStoryBtn" class="story-delete"
          type="button" hidden>Delete story</button>
      </div>
    </div>

    <div id="storyViewersModal" class="story-modal" hidden>
      <div class="story-modal-card">
        <button id="closeViewers" type="button">Close</button>
        <h3 id="storyModalTitle">Story viewers</h3>
        <div id="storyViewersList">Loading...</div>
      </div>
    </div>
  `);

  // STYLES

  const style = document.createElement("style");

  style.textContent = `
    .moments-row {
      display:flex;
      gap:14px;
      overflow-x:auto;
      padding:8px 2px 16px;
    }

    .story-create-area {
      margin:10px 0 15px;
    }

    #addStoryBtn {
      display:flex;
      align-items:center;
      gap:10px;
      padding:12px 16px;
      border-radius:13px;
      border:1px solid #bcebe3;
      background:#e3f8f4;
      color:#101b2d;
      cursor:pointer;
    }

    #addStoryBtn span {
      font-size:25px;
      color:#159e8e;
    }

    #addStoryBtn:disabled {
      opacity:.6;
      cursor:not-allowed;
    }

    #storyStatus {
      font-size:13px;
      margin-top:8px;
    }

    .story-person {
      position:relative;
      flex:0 0 78px;
      text-align:center;
      border:0;
      background:none;
      cursor:pointer;
      color:inherit;
      padding:0;
    }

    .story-ring {
      width:70px;
      height:70px;
      padding:3px;
      margin:auto;
      border-radius:50%;
      background:linear-gradient(135deg,#20b8a4,#8165ef,#ff9d54);
      box-sizing:border-box;
    }

    .story-ring img,
    .story-initial {
      width:100%;
      height:100%;
      object-fit:cover;
      border-radius:50%;
      border:3px solid white;
      box-sizing:border-box;
    }

    .story-initial {
      display:grid;
      place-items:center;
      background:#e3f8f4;
      color:#101b2d;
      font-weight:800;
      font-size:23px;
    }

    .story-person-name {
      display:block;
      margin-top:7px;
      font-size:11px;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .story-countdown {
      display:block;
      margin-top:4px;
      font-size:10px;
      color:#159e8e;
      font-weight:700;
    }

    .story-count-badge {
      position:absolute;
      top:0;
      right:0;
      min-width:21px;
      height:21px;
      padding:0 5px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:20px;
      background:#159e8e;
      color:white;
      font-size:11px;
      font-weight:800;
      border:2px solid white;
      box-sizing:border-box;
    }

    .story-viewer {
      position:fixed;
      inset:0;
      background:#080d16f5;
      z-index:9999;
      display:grid;
      place-items:center;
      padding:15px;
    }

    .story-viewer[hidden],
    .story-modal[hidden] {
      display:none;
    }

    .story-viewer-card {
      position:relative;
      width:min(420px,100%);
      height:min(760px,90vh);
      background:#101b2d;
      border-radius:18px;
      overflow:hidden;
    }

    .story-viewer-card > img {
      width:100%;
      height:100%;
      object-fit:contain;
    }

    .story-progress {
      position:absolute;
      top:12px;
      left:12px;
      right:12px;
      height:3px;
      background:#ffffff55;
      z-index:2;
    }

    .story-progress span {
      display:block;
      width:0;
      height:100%;
      background:white;
    }

    .story-owner {
      position:absolute;
      top:25px;
      left:15px;
      color:white;
      z-index:2;
      font-weight:700;
    }

    .story-close {
      position:absolute;
      top:15px;
      right:20px;
      z-index:10000;
      border:0;
      background:#ffffff22;
      color:white;
      border-radius:50%;
      width:42px;
      height:42px;
      font-size:28px;
    }

    .story-controls {
      position:absolute;
      inset:50px 0 100px;
      display:flex;
      justify-content:space-between;
      align-items:center;
    }

    .story-controls button {
      width:45px;
      height:100%;
      border:0;
      background:transparent;
      color:white;
      font-size:42px;
    }

    .story-actions {
      position:absolute;
      bottom:48px;
      left:8px;
      right:8px;
      display:flex;
      justify-content:center;
      flex-wrap:wrap;
      gap:6px;
    }

    .story-actions button,
    .story-delete,
    #closeViewers {
      border:0;
      border-radius:10px;
      padding:10px 12px;
      background:#ffffffeb;
      color:#101b2d;
      font-weight:700;
      cursor:pointer;
    }

    .story-view-count {
      position:absolute;
      bottom:15px;
      left:15px;
      color:white;
      font-size:12px;
    }

    .story-delete {
      position:absolute;
      top:60px;
      right:12px;
      background:#d94040;
      color:white;
    }

    .story-modal {
      position:fixed;
      inset:0;
      z-index:10001;
      background:#080d16dd;
      display:grid;
      place-items:center;
      padding:18px;
    }

    .story-modal-card {
      width:min(380px,100%);
      max-height:80vh;
      overflow:auto;
      background:white;
      color:#101b2d;
      padding:20px;
      border-radius:16px;
    }

    .story-viewer-row {
      padding:10px 0;
      border-bottom:1px solid #ddd;
    }

    @media(max-width:600px) {
      .story-viewer {
        padding:0;
      }

      .story-viewer-card {
        height:100%;
        width:100%;
        border-radius:0;
        max-height:none;
      }
    }
  `;

  document.head.appendChild(style);

  // IMAGE UPLOAD

  async function uploadStoryImage(user, file) {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Choose a JPG, PNG or WEBP image.");
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new Error("Your image must be smaller than 2 MB.");
    }

    const token = await user.getIdToken();
    const form = new FormData();

    form.append("file", file, file.name);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/dynamic-function`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "x-firebase-token": token
        },
        body: form
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.publicUrl) {
      throw new Error(result.error || "Image upload failed.");
    }

    return result.publicUrl;
  }

  // COUNTDOWN

  function timeLeft(story) {
    const expiry = story.expiresAt?.toMillis?.() || 0;
    const remaining = Math.max(0, expiry - Date.now());

    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);

    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  }

  // RENDER STORIES: GROUP BY OWNER

  function renderStories() {
    const activeStories = stories
      .filter(isActive)
      .sort((a, b) => getTime(b) - getTime(a));

    moments.innerHTML = "";

    if (!activeStories.length) {
      moments.innerHTML = `
        <p class="muted">
          No active stories yet. Share the first one!
        </p>
      `;
      return;
    }

    const grouped = new Map();

    activeStories.forEach(story => {
      if (!story.uid) return;

      if (!grouped.has(story.uid)) {
        grouped.set(story.uid, []);
      }

      grouped.get(story.uid).push(story);
    });

    grouped.forEach(items => {
      items.sort((a, b) => getTime(b) - getTime(a));

      const latest = items[0];
      const count = items.length;

      const avatar = latest.photoURL
        ? `<img src="${escapeHTML(latest.photoURL)}" alt="">`
        : `<span class="story-initial">${
            escapeHTML((latest.name || "P").charAt(0).toUpperCase())
          }</span>`;

      const button = document.createElement("button");

      button.className = "story-person";
      button.type = "button";

      button.innerHTML = `
        <div class="story-ring">${avatar}</div>
        <span class="story-count-badge">${count}</span>
        <span class="story-person-name">
          ${escapeHTML(latest.name || "Member")}
        </span>
        <small class="story-countdown">${timeLeft(latest)}</small>
      `;

      button.setAttribute(
        "aria-label",
        `${latest.name || "Member"} has ${count} active stories`
      );

      button.addEventListener("click", () => {
        openStory(items, 0);
      });

      moments.appendChild(button);
    });
  }

  // RECORD STORY VIEW

  async function recordView(story) {
    if (!currentUser || currentUser.uid === story.uid) return;

    const viewRef = doc(
      db,
      "stories",
      story.id,
      "views",
      currentUser.uid
    );

    await setDoc(viewRef, {
      uid: currentUser.uid,
      name: currentUser.displayName || "PicShare member",
      createdAt: serverTimestamp()
    });
  }

  // VIEW COUNT

  async function updateViewCount(story) {
    const countElement = document.getElementById("storyViewCount");
    const viewersButton = document.getElementById("storyViewers");
    const reactionsButton = document.getElementById("storyReactions");

    const isOwner = currentUser &&
      (currentUser.uid === story.uid ||
       currentUser.uid === ADMIN_UID);

    viewersButton.hidden = !isOwner;
    reactionsButton.hidden = !isOwner;

    try {
      const snapshot = await getDocs(
        collection(db, "stories", story.id, "views")
      );

      countElement.textContent = `${snapshot.size} views`;

    } catch (error) {
      console.error("Could not load view count:", error);
      countElement.textContent = "";
    }
  }

  // SHOW VIEWERS

  async function showViewers() {
    const story = viewerStories[selectedStory];
    if (!story || !currentUser) return;

    if (
      currentUser.uid !== story.uid &&
      currentUser.uid !== ADMIN_UID
    ) return;

    const modal = document.getElementById("storyViewersModal");
    const list = document.getElementById("storyViewersList");

    document.getElementById("storyModalTitle").textContent =
      "Story viewers";

    modal.hidden = false;
    list.textContent = "Loading viewers...";

    try {
      const snapshot = await getDocs(
        collection(db, "stories", story.id, "views")
      );

      list.innerHTML = "";

      if (snapshot.empty) {
        list.textContent = "Nobody has viewed this story yet.";
        return;
      }

      snapshot.forEach(item => {
        const data = item.data();
        const row = document.createElement("div");

        row.className = "story-viewer-row";
        row.textContent = data.name || "PicShare member";

        list.appendChild(row);
      });

    } catch (error) {
      list.textContent = "Could not load viewers: " + error.message;
    }
  }

  // SHOW REACTIONS

  async function showReactions() {
    const story = viewerStories[selectedStory];
    if (!story || !currentUser) return;

    if (
      currentUser.uid !== story.uid &&
      currentUser.uid !== ADMIN_UID
    ) return;

    const modal = document.getElementById("storyViewersModal");
    const list = document.getElementById("storyViewersList");

    document.getElementById("storyModalTitle").textContent =
      "Story reactions";

    modal.hidden = false;
    list.textContent = "Loading reactions...";

    try {
      const snapshot = await getDocs(
        collection(db, "stories", story.id, "reactions")
      );

      list.innerHTML = "";

      if (snapshot.empty) {
        list.textContent = "No reactions yet.";
        return;
      }

      snapshot.forEach(item => {
        const reaction = item.data();
        const row = document.createElement("div");

        row.className = "story-viewer-row";
        row.textContent =
          `${reaction.emoji || "❤️"} ${
            reaction.name || "PicShare member"
          }`;

        list.appendChild(row);
      });

    } catch (error) {
      list.textContent = "Could not load reactions: " + error.message;
    }
  }

  // REACT TO STORY

  async function reactToStory() {
    const story = viewerStories[selectedStory];

    if (!currentUser || !story) return;

    if (currentUser.uid === story.uid) {
      showStatus("You cannot react to your own story.");
      return;
    }

    try {
      const reactionRef = doc(
        db,
        "stories",
        story.id,
        "reactions",
        currentUser.uid
      );

      await setDoc(reactionRef, {
        uid: currentUser.uid,
        name: currentUser.displayName || "PicShare member",
        emoji: "❤️",
        createdAt: serverTimestamp()
      });

      document.getElementById("storyReact").textContent =
        "❤️ Reacted";

    } catch (error) {
      console.error("Reaction failed:", error);
      showStatus("Could not react: " + error.message);
    }
  }

  // OPEN STORY

  async function openStory(items, index) {
    if (!items.length || index < 0 || index >= items.length) return;

    clearTimeout(storyTimer);

    viewerStories = items.filter(isActive);

    if (!viewerStories.length) {
      closeStory();
      return;
    }

    if (index >= viewerStories.length) {
      closeStory();
      return;
    }

    selectedStory = index;

    const story = viewerStories[selectedStory];

    document.getElementById("storyImage").src = story.imageUrl;

    document.getElementById("storyOwner").textContent =
      story.name || "PicShare member";

    const deleteButton = document.getElementById("deleteStoryBtn");

    deleteButton.hidden = !currentUser ||
      (currentUser.uid !== story.uid &&
       currentUser.uid !== ADMIN_UID);

    deleteButton.onclick = async () => {
      if (!confirm("Delete this story?")) return;

      try {
        await deleteDoc(doc(db, "stories", story.id));

        const remaining = viewerStories.filter(
          item => item.id !== story.id
        );

        if (remaining.length) {
          viewerStories = remaining;
          selectedStory = Math.min(
            selectedStory,
            remaining.length - 1
          );
          openStory(viewerStories, selectedStory);
        } else {
          closeStory();
        }

      } catch (error) {
        alert("Could not delete story: " + error.message);
      }
    };

    document.getElementById("storyReact").textContent = "❤️ React";
    document.getElementById("storyViewers").hidden = true;
    document.getElementById("storyReactions").hidden = true;

    document.getElementById("storyViewer").hidden = false;
    document.getElementById("storyViewersModal").hidden = true;

    const progress = document.getElementById("storyProgress");

    progress.style.transition = "none";
    progress.style.width = "0%";

    requestAnimationFrame(() => {
      progress.style.transition = `width ${STORY_DURATION}ms linear`;
      progress.style.width = "100%";
    });

    try {
      await recordView(story);
    } catch (error) {
      console.error("Could not record story view:", error);
    }

    await updateViewCount(story);

    storyTimer = setTimeout(() => {
      if (selectedStory < viewerStories.length - 1) {
        openStory(viewerStories, selectedStory + 1);
      } else {
        closeStory();
      }
    }, STORY_DURATION);
  }

  // CLOSE STORY

  function closeStory() {
    clearTimeout(storyTimer);

    document.getElementById("storyViewer").hidden = true;
    document.getElementById("storyImage").src = "";
    document.getElementById("storyViewersModal").hidden = true;

    viewerStories = [];
    selectedStory = 0;
  }

  // NEXT AND PREVIOUS

  function nextStory() {
    if (selectedStory < viewerStories.length - 1) {
      openStory(viewerStories, selectedStory + 1);
    } else {
      closeStory();
    }
  }

  function previousStory() {
    if (selectedStory > 0) {
      openStory(viewerStories, selectedStory - 1);
    }
  }

  // BUTTON EVENTS

  document.getElementById("storyClose")
    .addEventListener("click", closeStory);

  document.getElementById("storyNext")
    .addEventListener("click", nextStory);

  document.getElementById("storyPrevious")
    .addEventListener("click", previousStory);

  document.getElementById("storyReact")
    .addEventListener("click", reactToStory);

  document.getElementById("storyViewers")
    .addEventListener("click", showViewers);

  document.getElementById("storyReactions")
    .addEventListener("click", showReactions);

  document.getElementById("closeViewers")
    .addEventListener("click", () => {
      document.getElementById("storyViewersModal").hidden = true;
    });

  document.getElementById("addStoryBtn")
    .addEventListener("click", () => {
      if (!currentUser) {
        alert("Please sign in first.");
        return;
      }

      document.getElementById("storyFile").click();
    });

  // UPLOAD STORY

  document.getElementById("storyFile")
    .addEventListener("change", async event => {
      const file = event.target.files?.[0];

      if (!file || !currentUser) return;

      const button = document.getElementById("addStoryBtn");

      button.disabled = true;
      showStatus("Uploading your story...");

      try {
        const imageUrl = await uploadStoryImage(currentUser, file);

        await addDoc(collection(db, "stories"), {
          uid: currentUser.uid,
          name: currentUser.displayName || "PicShare member",
          photoURL: currentUser.photoURL || "",
          imageUrl,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(
            Date.now() + DAY - 60000
          )
        });

        showStatus("Your story has been shared!");

      } catch (error) {
        console.error("Story upload failed:", error);
        showStatus("Could not post story: " + error.message);

      } finally {
        button.disabled = false;
        event.target.value = "";
      }
    });

  // AUTHENTICATION AND LIVE STORIES

  onAuthStateChanged(auth, user => {
    currentUser = user;

    document.getElementById("addStoryBtn").disabled = !user;

    if (stopStories) {
      stopStories();
      stopStories = null;
    }

    if (!user) {
      stories = [];
      renderStories();
      closeStory();
      return;
    }

    const storiesQuery = query(
      collection(db, "stories"),
      orderBy("createdAt", "desc")
    );

    stopStories = onSnapshot(
      storiesQuery,
      snapshot => {
        stories = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data()
        }));

        renderStories();
      },
      error => {
        console.error("Stories loading failed:", error);
        showStatus("Stories could not load: " + error.message);
      }
    );
  });

  // UPDATE COUNTDOWN EVERY MINUTE

  setInterval(() => {
    if (currentUser) renderStories();
  }, 60000);
}
