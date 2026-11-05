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
  doc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

const SUPABASE_URL =
  "https://rcfyzegwkopysdmrqiei.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

const moments = document.getElementById("dynamicMoments");
const appArea = document.getElementById("appArea");

if (!moments || !appArea) {
  console.error("PicShare: Stories HTML elements are missing.");
} else {

  let currentUser = null;
  let stories = [];
  let stopStories = null;
  let viewerStories = [];
  let selectedStory = 0;

  const DAY = 24 * 60 * 60 * 1000;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
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

      <input
        id="storyFile"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
      >

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
          <button id="storyPrevious" type="button">‹</button>
          <button id="storyNext" type="button">›</button>
        </div>

        <button id="deleteStoryBtn" class="story-delete"
          type="button" hidden>
          Delete my story
        </button>
      </div>
    </div>
  `);

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

    #storyStatus {
      font-size:13px;
      margin-top:8px;
    }

    .story-person {
      flex:0 0 78px;
      text-align:center;
      border:0;
      background:none;
      cursor:pointer;
      color:inherit;
    }

    .story-ring {
      width:70px;
      height:70px;
      padding:3px;
      margin:auto;
      border-radius:50%;
      background:linear-gradient(135deg,#20b8a4,#8165ef,#ff9d54);
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

    .story-viewer {
      position:fixed;
      inset:0;
      background:#080d16f5;
      z-index:9999;
      display:grid;
      place-items:center;
      padding:15px;
    }

    .story-viewer[hidden] {
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
      inset:50px 0 55px;
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

    .story-delete {
      position:absolute;
      bottom:14px;
      left:50%;
      transform:translateX(-50%);
      border:0;
      border-radius:10px;
      padding:10px 15px;
      background:#d94040;
      color:white;
      font-weight:700;
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

  // UPLOAD IMAGE TO SUPABASE

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
      throw new Error("Your story image must be smaller than 2 MB.");
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
      throw new Error(
        result.error || "Story image upload failed."
      );
    }

    return result.publicUrl;
  }

  // DISPLAY STORIES

  function renderStories() {
    const now = Date.now();

    const activeStories = stories.filter(story => {
      const expiry = story.expiresAt?.toMillis?.() || 0;
      return expiry > now;
    });

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
      if (!grouped.has(story.uid)) {
        grouped.set(story.uid, []);
      }

      grouped.get(story.uid).push(story);
    });

    grouped.forEach((items, uid) => {
      const latest = items[0];

      const button = document.createElement("button");
      button.className = "story-person";
      button.type = "button";

      const avatar = latest.photoURL
        ? `<img src="${escapeHTML(latest.photoURL)}" alt="">`
        : `<span class="story-initial">${
            escapeHTML((latest.name || "P").charAt(0).toUpperCase())
          }</span>`;

      button.innerHTML = `
        <div class="story-ring">${avatar}</div>
        <span class="story-person-name">
          ${escapeHTML(latest.name || "Member")}
        </span>
      `;

      button.addEventListener("click", () => {
        openStory(items, 0);
      });

      moments.appendChild(button);
    });
  }

  // OPEN STORY VIEWER

  function openStory(items, index) {
    if (!items.length) return;

    viewerStories = items;
    selectedStory = index;

    const item = viewerStories[selectedStory];

    const viewer = document.getElementById("storyViewer");
    const image = document.getElementById("storyImage");
    const owner = document.getElementById("storyOwner");
    const deleteButton = document.getElementById("deleteStoryBtn");
    const progress = document.getElementById("storyProgress");

    image.src = item.imageUrl;
    owner.textContent = item.name || "PicShare member";

    deleteButton.hidden =
      !currentUser || currentUser.uid !== item.uid;

    deleteButton.onclick = async () => {
      if (!confirm("Delete this story?")) return;

      try {
        await deleteDoc(doc(db, "stories", item.id));
        closeStory();
      } catch (error) {
        alert("Could not delete story: " + error.message);
      }
    };

    progress.style.transition = "none";
    progress.style.width = "0%";

    viewer.hidden = false;

    requestAnimationFrame(() => {
      progress.style.transition = "width 5s linear";
      progress.style.width = "100%";
    });

    clearTimeout(window.picShareStoryTimer);

    window.picShareStoryTimer = setTimeout(() => {
      if (selectedStory < viewerStories.length - 1) {
        openStory(viewerStories, selectedStory + 1);
      } else {
        closeStory();
      }
    }, 5000);
  }

  function closeStory() {
    clearTimeout(window.picShareStoryTimer);

    document.getElementById("storyViewer").hidden = true;
    document.getElementById("storyImage").src = "";

    viewerStories = [];
  }

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

  document.getElementById("storyClose")
    .addEventListener("click", closeStory);

  document.getElementById("storyNext")
    .addEventListener("click", nextStory);

  document.getElementById("storyPrevious")
    .addEventListener("click", previousStory);

  // ADD STORY BUTTON

  document.getElementById("addStoryBtn")
    .addEventListener("click", () => {
      if (!currentUser) {
        alert("Please sign in first.");
        return;
      }

      document.getElementById("storyFile").click();
    });

  // CREATE STORY

  document.getElementById("storyFile")
    .addEventListener("change", async event => {
      const file = event.target.files?.[0];

      if (!file || !currentUser) return;

      const status = document.getElementById("storyStatus");
      const button = document.getElementById("addStoryBtn");

      button.disabled = true;
      status.textContent = "Uploading your story...";

      try {
        const imageUrl = await uploadStoryImage(currentUser, file);

        // Use server time for createdAt.
        // Keep expiry slightly below 24 hours to satisfy the rules.
        const expiry = Timestamp.fromMillis(
          Date.now() + DAY - 60 * 1000
        );

        await addDoc(collection(db, "stories"), {
          uid: currentUser.uid,
          name: currentUser.displayName || "PicShare member",
          photoURL: currentUser.photoURL || "",
          imageUrl: imageUrl,
          createdAt: serverTimestamp(),
          expiresAt: expiry
        });

        status.textContent =
          "Your story has been shared successfully!";
      } catch (error) {
        console.error("Story upload error:", error);

        status.textContent =
          "Could not post story: " + error.message;
      } finally {
        button.disabled = false;
        event.target.value = "";
      }
    });

  // SIGN-IN / SIGN-OUT LISTENER

  onAuthStateChanged(auth, user => {
    currentUser = user;

    const button = document.getElementById("addStoryBtn");

    button.disabled = !user;

    if (stopStories) {
      stopStories();
      stopStories = null;
    }

    if (!user) {
      stories = [];
      renderStories();
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
        console.error("Stories loading error:", error);

        document.getElementById("storyStatus").textContent =
          "Stories could not load: " + error.message;
      }
    );
  });

}
