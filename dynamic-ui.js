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
  getDocs,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";


/* =====================================
   PICSHARE STORIES 2.0
===================================== */

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

const SUPABASE_URL =
  "https://rcfyzegwkopysdmrqiei.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

const ADMIN_UID = "VXDMuU17gifoBqTkbpC55Xre9242";

const DAY = 24 * 60 * 60 * 1000;
const STORY_DURATION = 5000;

const moments = document.getElementById("dynamicMoments");
const appArea = document.getElementById("appArea");

if (!moments || !appArea) {
  console.error("PicShare Stories: Required elements missing.");
} else {

  let currentUser = null;
  let stories = [];
  let stopStories = null;

  let viewerStories = [];
  let selectedStory = 0;

  let storyTimer = null;
  let progressFrame = null;

  let storyStartedAt = 0;
  let elapsedBeforePause = 0;
  let paused = false;

  let membershipStatus = "active";
  let membershipReady = false;

  let touchStartX = 0;
  let touchStartY = 0;


  /* =====================================
     HELPERS
  ===================================== */

  const $ = id => document.getElementById(id);

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
    const element = $("storyStatus");

    if (element) {
      element.textContent = message;
    }
  }

  function isAdmin() {
    return !!currentUser &&
      currentUser.uid === ADMIN_UID;
  }

  async function canInteract() {

    if (!currentUser) return false;

    if (isAdmin()) return true;

    if (!membershipReady) {
      showStatus("Checking your membership...");
      return false;
    }

    return membershipStatus === "active";
  }

  async function refreshMembership() {

    if (!currentUser) {
      membershipReady = false;
      membershipStatus = "active";
      return;
    }

    if (isAdmin()) {
      membershipStatus = "active";
      membershipReady = true;
      return;
    }

    try {

      const membershipDoc = await getDoc(
        doc(db, "membership_status", currentUser.uid)
      );

      membershipStatus = membershipDoc.exists()
        ? String(
            membershipDoc.data().status || "active"
          ).toLowerCase()
        : "active";

      membershipReady = true;

    } catch (error) {

      console.error("Membership check failed:", error);

      membershipReady = false;
    }
  }


  /* =====================================
     STORY INTERFACE
  ===================================== */

  const storySection =
    moments.closest("#momentsSection") ||
    moments.parentElement;

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

      <p
        id="storyStatus"
        role="status"
        aria-live="polite">
      </p>

    </div>

  `);


  document.body.insertAdjacentHTML("beforeend", `

    <div id="storyViewer" class="story-viewer" hidden>

      <button
        id="storyClose"
        class="story-close"
        type="button"
        aria-label="Close stories">
        ×
      </button>

      <div class="story-viewer-card">

        <div
          id="storyProgressContainer"
          class="story-progress">
        </div>

        <div id="storyOwner" class="story-owner"></div>

        <img
          id="storyImage"
          alt="PicShare story"
          draggable="false"
        >

        <div class="story-controls">

          <button
            id="storyPrevious"
            type="button"
            aria-label="Previous story">
            ‹
          </button>

          <button
            id="storyNext"
            type="button"
            aria-label="Next story">
            ›
          </button>

        </div>

        <div class="story-actions">

          <button id="storyReact" type="button">
            ❤️ React
          </button>

          <button
            id="storyViewers"
            type="button"
            hidden>
            Viewers
          </button>

        </div>

        <div id="storyViewCount" class="story-view-count"></div>

        <button
          id="deleteStoryBtn"
          class="story-delete"
          type="button"
          hidden>
          Delete story
        </button>

      </div>

    </div>


    <div id="storyViewersModal" class="story-modal" hidden>

      <div class="story-modal-card">

        <button id="closeViewers" type="button">
          Close
        </button>

        <h3>Story viewers</h3>

        <div id="storyViewersList">
          Loading viewers...
        </div>

      </div>

    </div>

  `);


  /* =====================================
     STORIES DESIGN
  ===================================== */

  const style = document.createElement("style");

  style.textContent = `

    .moments-row {
      display:flex;
      gap:15px;
      overflow-x:auto;
      padding:12px 4px 18px;
      scrollbar-width:none;
    }

    .moments-row::-webkit-scrollbar {
      display:none;
    }

    .story-create-area {
      margin:12px 0 16px;
    }

    #addStoryBtn {
      display:flex;
      align-items:center;
      gap:12px;
      padding:13px 18px;
      border-radius:15px;
      border:1px solid #bcebe3;
      background:linear-gradient(135deg,#e3f8f4,#f1f0ff);
      color:#101b2d;
      cursor:pointer;
      font-weight:700;
      transition:.2s;
    }

    #addStoryBtn:hover {
      transform:translateY(-2px);
      box-shadow:0 7px 20px #159e8e22;
    }

    #addStoryBtn span {
      font-size:28px;
      color:#159e8e;
    }

    #addStoryBtn:disabled {
      opacity:.5;
      cursor:not-allowed;
    }

    #storyStatus {
      font-size:13px;
      margin-top:9px;
      color:#159e8e;
    }

    .story-person {
      flex:0 0 78px;
      text-align:center;
      border:0;
      background:none;
      cursor:pointer;
      color:inherit;
      padding:0;
      transition:transform .2s;
    }

    .story-person:hover {
      transform:translateY(-3px);
    }

    .story-ring {
      width:72px;
      height:72px;
      padding:3px;
      margin:auto;
      border-radius:50%;
      background:conic-gradient(
        #20b8a4,
        #62d6c5,
        #8165ef,
        #ffad66,
        #20b8a4
      );
      box-shadow:0 4px 15px #20b8a433;
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
      margin-top:8px;
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

    .story-viewer {
      position:fixed;
      inset:0;
      background:#080d16f7;
      z-index:9999;
      display:grid;
      place-items:center;
      padding:15px;
      backdrop-filter:blur(10px);
    }

    .story-viewer[hidden],
    .story-modal[hidden] {
      display:none;
    }

    .story-viewer-card {
      position:relative;
      width:min(430px,100%);
      height:min(780px,92vh);
      background:#101b2d;
      border-radius:20px;
      overflow:hidden;
      box-shadow:0 20px 70px #0008;
      touch-action:pan-y;
    }

    .story-viewer-card > img {
      width:100%;
      height:100%;
      object-fit:contain;
      user-select:none;
      -webkit-user-drag:none;
    }

    .story-progress {
      position:absolute;
      top:12px;
      left:12px;
      right:12px;
      display:flex;
      gap:4px;
      z-index:5;
    }

    .story-progress-item {
      height:4px;
      flex:1;
      background:#ffffff55;
      border-radius:10px;
      overflow:hidden;
    }

    .story-progress-fill {
      height:100%;
      width:0%;
      background:white;
      border-radius:10px;
    }

    .story-owner {
      position:absolute;
      top:28px;
      left:15px;
      color:white;
      z-index:4;
      font-weight:800;
      text-shadow:0 2px 5px #0008;
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
      cursor:pointer;
    }

    .story-controls {
      position:absolute;
      inset:60px 0 100px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      z-index:3;
      pointer-events:none;
    }

    .story-controls button {
      width:25%;
      height:100%;
      border:0;
      background:transparent;
      color:white;
      font-size:42px;
      cursor:pointer;
      pointer-events:auto;
      opacity:.65;
    }

    .story-controls button:hover {
      opacity:1;
    }

    .story-actions {
      position:absolute;
      bottom:48px;
      left:12px;
      right:12px;
      display:flex;
      justify-content:center;
      gap:10px;
      z-index:4;
    }

    .story-actions button,
    .story-delete,
    #closeViewers {
      border:0;
      border-radius:12px;
      padding:11px 16px;
      background:#ffffffeb;
      color:#101b2d;
      font-weight:800;
      cursor:pointer;
    }

    .story-actions button:disabled {
      opacity:.5;
    }

    .story-view-count {
      position:absolute;
      bottom:15px;
      left:15px;
      color:white;
      font-size:12px;
      z-index:4;
    }

    .story-delete {
      position:absolute;
      top:65px;
      right:12px;
      background:#d94040;
      color:white;
      z-index:5;
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
      width:min(390px,100%);
      max-height:80vh;
      overflow:auto;
      background:white;
      color:#101b2d;
      padding:20px;
      border-radius:18px;
    }

    .story-viewer-row {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      padding:13px 4px;
      border-bottom:1px solid #eee;
    }

    .story-viewer-row img {
      width:35px;
      height:35px;
      border-radius:50%;
      object-fit:cover;
    }

    .story-viewer-info {
      display:flex;
      align-items:center;
      gap:10px;
    }

    .viewer-heart {
      font-size:19px;
    }

    @media(max-width:600px) {

      .story-viewer {
        padding:0;
      }

      .story-viewer-card {
        width:100%;
        height:100%;
        max-height:none;
        border-radius:0;
      }

      .story-controls {
        inset:60px 0 110px;
      }

    }

    @media(prefers-reduced-motion:reduce) {

      .story-person,
      #addStoryBtn {
        transition:none;
      }

    }

  `;

  document.head.appendChild(style);


  /* =====================================
     IMAGE UPLOAD
  ===================================== */

  async function uploadStoryImage(user,file) {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Choose a JPG, PNG or WEBP image.");
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new Error("Image must be smaller than 2 MB.");
    }

    const token = await user.getIdToken();

    const form = new FormData();

    form.append("file",file,file.name);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/dynamic-function`,
      {
        method:"POST",
        headers:{
          apikey:SUPABASE_KEY,
          "x-firebase-token":token
        },
        body:form
      }
    );

    const result = await response.json().catch(()=>({}));

    if (!response.ok || !result.publicUrl) {
      throw new Error(
        result.error || "Image upload failed."
      );
    }

    return result.publicUrl;
  }


  /* =====================================
     STORY COUNTDOWN
  ===================================== */

  function timeLeft(story) {

    const expiry =
      story.expiresAt?.toMillis?.() || 0;

    const remaining = Math.max(
      0,
      expiry-Date.now()
    );

    const hours = Math.floor(
      remaining/3600000
    );

    const minutes = Math.floor(
      (remaining%3600000)/60000
    );

    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }

    return `${minutes}m left`;
  }


  /* =====================================
     RENDER STORIES
  ===================================== */

  function renderStories() {

    const activeStories = stories.filter(story =>

      (story.expiresAt?.toMillis?.() || 0) > Date.now()

    );

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
        grouped.set(story.uid,[]);
      }

      grouped.get(story.uid).push(story);

    });

    grouped.forEach(items => {

      const latest = items[0];

      const avatar = latest.photoURL
        ? `<img src="${escapeHTML(latest.photoURL)}" alt="">`
        : `<span class="story-initial">${
            escapeHTML(
              (latest.name || "P").charAt(0).toUpperCase()
            )
          }</span>`;

      const button = document.createElement("button");

      button.className = "story-person";
      button.type = "button";

      button.innerHTML = `

        <div class="story-ring">
          ${avatar}
        </div>

        <span class="story-person-name">
          ${escapeHTML(latest.name || "Member")}
        </span>

        <small class="story-countdown">
          ${timeLeft(latest)}
        </small>

      `;

      button.addEventListener("click",() => {

        openStory(items,0);

      });

      moments.appendChild(button);

    });

  }


  /* =====================================
     RECORD STORY VIEW
  ===================================== */

  async function recordView(story) {

    if (!currentUser) return;

    if (currentUser.uid === story.uid) return;

    const viewRef = doc(
      db,
      "stories",
      story.id,
      "views",
      currentUser.uid
    );

    await setDoc(viewRef,{

      uid:currentUser.uid,

      name:currentUser.displayName || "PicShare member",

      photoURL:currentUser.photoURL || "",

      createdAt:serverTimestamp()

    });

  }


  /* =====================================
     UPDATE VIEW COUNT
  ===================================== */

  async function updateViewCount(story) {

    const countElement = $("storyViewCount");

    const viewersButton = $("storyViewers");

    try {

      const [views,reactions] = await Promise.all([

        getDocs(
          collection(db,"stories",story.id,"views")
        ),

        getDocs(
          collection(db,"stories",story.id,"reactions")
        )

      ]);

      countElement.textContent =
        `${views.size} views · ${reactions.size} reactions`;

      viewersButton.hidden =
        !currentUser ||
        (
          currentUser.uid !== story.uid &&
          !isAdmin()
        );

    } catch(error) {

      console.error(error);

      countElement.textContent = "";

      viewersButton.hidden = true;

    }

  }


  /* =====================================
     VIEWERS LIST
  ===================================== */

  async function showViewers() {

    const story = viewerStories[selectedStory];

    if (!story || !currentUser) return;

    if (
      currentUser.uid !== story.uid &&
      !isAdmin()
    ) return;

    const modal = $("storyViewersModal");

    const list = $("storyViewersList");

    modal.hidden = false;

    list.textContent = "Loading viewers...";

    try {

      const [views,reactions] = await Promise.all([

        getDocs(
          collection(db,"stories",story.id,"views")
        ),

        getDocs(
          collection(db,"stories",story.id,"reactions")
        )

      ]);

      const reactedUsers = new Set(
        reactions.docs.map(item=>item.id)
      );

      list.innerHTML = "";

      if (views.empty) {

        list.textContent =
          "Nobody has viewed this story yet.";

        return;
      }

      views.forEach(item=>{

        const data = item.data();

        const row = document.createElement("div");

        row.className = "story-viewer-row";

        const info = document.createElement("div");

        info.className = "story-viewer-info";

        if (data.photoURL) {

          const image = document.createElement("img");

          image.src = data.photoURL;

          image.alt = "";

          info.appendChild(image);

        }

        const name = document.createElement("span");

        name.textContent =
          data.name || "PicShare member";

        info.appendChild(name);

        row.appendChild(info);

        if (reactedUsers.has(item.id)) {

          const heart = document.createElement("span");

          heart.className = "viewer-heart";

          heart.textContent = "❤️";

          row.appendChild(heart);

        }

        list.appendChild(row);

      });

    } catch(error) {

      console.error(error);

      list.textContent =
        "Could not load viewers.";

    }

  }


  /* =====================================
     REACT TO STORY
  ===================================== */

  async function reactToStory() {

    const story = viewerStories[selectedStory];

    const button = $("storyReact");

    if (!currentUser || !story) return;

    if (currentUser.uid === story.uid) {

      showStatus("You cannot react to your own story.");

      return;

    }

    if (!(await canInteract())) {

      showStatus(
        "Your membership does not allow reactions."
      );

      return;

    }

    button.disabled = true;

    button.textContent = "Saving...";

    try {

      const reactionRef = doc(
        db,
        "stories",
        story.id,
        "reactions",
        currentUser.uid
      );

      const existing = await getDoc(reactionRef);

      if (existing.exists()) {

        button.textContent = "❤️ Reacted";

        showStatus(
          "You have already reacted to this story."
        );

        return;

      }

      const actorName =
        currentUser.displayName || "PicShare member";

      await setDoc(reactionRef,{

        uid:currentUser.uid,

        name:actorName,

        emoji:"❤️",

        createdAt:serverTimestamp()

      });

      await addDoc(
        collection(
          db,
          "users",
          story.uid,
          "notifications"
        ),
        {

          actorUid:currentUser.uid,

          actorName,

          type:"story_reaction",

          storyId:story.id,

          read:false,

          createdAt:serverTimestamp()

        }
      );

      button.textContent = "❤️ Reacted";

      showStatus("Reaction sent!");

      await updateViewCount(story);

    } catch(error) {

      console.error(error);

      showStatus(
        "Could not send reaction. Please try again."
      );

    } finally {

      button.disabled = false;

    }

  }


  /* =====================================
     PROGRESS INDICATORS
  ===================================== */

  function renderProgress() {

    const container = $("storyProgressContainer");

    container.innerHTML = "";

    viewerStories.forEach((story,index)=>{

      const item = document.createElement("div");

      item.className = "story-progress-item";

      const fill = document.createElement("div");

      fill.className = "story-progress-fill";

      if (index < selectedStory) {

        fill.style.width = "100%";

      } else if (index === selectedStory) {

        fill.id = "activeStoryProgress";

      }

      item.appendChild(fill);

      container.appendChild(item);

    });

  }


  /* =====================================
     STORY TIMER
  ===================================== */

  function stopStoryTimer() {

    clearTimeout(storyTimer);

    cancelAnimationFrame(progressFrame);

    storyTimer = null;

    progressFrame = null;

  }

  function startStoryTimer() {

    stopStoryTimer();

    paused = false;

    elapsedBeforePause = 0;

    storyStartedAt = performance.now();

    const fill = $("activeStoryProgress");

    if (!fill) return;

    function animate() {

      if (paused) return;

      const elapsed =
        elapsedBeforePause +
        (performance.now()-storyStartedAt);

      const progress = Math.min(
        100,
        elapsed/STORY_DURATION*100
      );

      fill.style.width = `${progress}%`;

      if (progress >= 100) {

        nextStory();

        return;

      }

      progressFrame = requestAnimationFrame(animate);

    }

    progressFrame = requestAnimationFrame(animate);

    storyTimer = setTimeout(
      nextStory,
      STORY_DURATION
    );

  }

  function pauseStory() {

    if (paused || !viewerStories.length) return;

    paused = true;

    elapsedBeforePause +=
      performance.now()-storyStartedAt;

    clearTimeout(storyTimer);

    cancelAnimationFrame(progressFrame);

  }

  function resumeStory() {

    if (!paused || !viewerStories.length) return;

    paused = false;

    storyStartedAt = performance.now();

    startResumeTimer();

  }

  function startResumeTimer() {

    stopStoryTimer();

    storyStartedAt = performance.now();

    const fill = $("activeStoryProgress");

    const remaining =
      STORY_DURATION-elapsedBeforePause;

    function animate() {

      if (paused) return;

      const elapsed =
        elapsedBeforePause +
        performance.now()-storyStartedAt;

      fill.style.width =
        `${Math.min(100,elapsed/STORY_DURATION*100)}%`;

      if (elapsed >= STORY_DURATION) {

        nextStory();

        return;

      }

      progressFrame =
        requestAnimationFrame(animate);

    }

    progressFrame =
      requestAnimationFrame(animate);

    storyTimer = setTimeout(
      nextStory,
      remaining
    );

  }


  /* =====================================
     OPEN STORY
  ===================================== */

  async function openStory(items,index) {

    if (
      !items.length ||
      index < 0 ||
      index >= items.length
    ) return;

    stopStoryTimer();

    viewerStories = items;

    selectedStory = index;

    const story = viewerStories[selectedStory];

    if (
      (story.expiresAt?.toMillis?.() || 0) <= Date.now()
    ) {

      nextStory();

      return;

    }

    $("storyImage").src = story.imageUrl;

    $("storyOwner").textContent =
      story.name || "PicShare member";

    const deleteButton = $("deleteStoryBtn");

    deleteButton.hidden =
      !currentUser ||
      (
        currentUser.uid !== story.uid &&
        !isAdmin()
      );

    deleteButton.onclick = async()=>{

      if (!confirm("Delete this story?")) return;

      deleteButton.disabled = true;

      try {

        await deleteDoc(
          doc(db,"stories",story.id)
        );

        closeStory();

        showStatus("Story deleted.");

      } catch(error) {

        alert("Could not delete story: "+error.message);

      } finally {

        deleteButton.disabled = false;

      }

    };


    const reactButton = $("storyReact");

    reactButton.textContent = "❤️ React";

    reactButton.disabled = false;

    reactButton.hidden =
      !currentUser ||
      currentUser.uid === story.uid;

    if (
      currentUser &&
      currentUser.uid !== story.uid
    ) {

      try {

        const reactionRef = doc(
          db,
          "stories",
          story.id,
          "reactions",
          currentUser.uid
        );

        const existing =
          await getDoc(reactionRef);

        if (existing.exists()) {

          reactButton.textContent =
            "❤️ Reacted";

        }

      } catch(error) {

        console.error(error);

      }

    }

    $("storyViewer").hidden = false;

    renderProgress();

    try {

      await recordView(story);

    } catch(error) {

      console.error("View recording failed:",error);

    }

    await updateViewCount(story);

    startStoryTimer();

  }


  /* =====================================
     CLOSE STORY
  ===================================== */

  function closeStory() {

    stopStoryTimer();

    $("storyViewer").hidden = true;

    $("storyImage").src = "";

    $("storyViewersModal").hidden = true;

    viewerStories = [];

    selectedStory = 0;

    paused = false;

  }


  /* =====================================
     STORY NAVIGATION
  ===================================== */

  function nextStory() {

    if (!viewerStories.length) return;

    if (
      selectedStory <
      viewerStories.length-1
    ) {

      openStory(
        viewerStories,
        selectedStory+1
      );

    } else {

      closeStory();

    }

  }

  function previousStory() {

    if (!viewerStories.length) return;

    if (selectedStory > 0) {

      openStory(
        viewerStories,
        selectedStory-1
      );

    }

  }


  /* =====================================
     TOUCH NAVIGATION
  ===================================== */

  const storyCard = document.querySelector(
    ".story-viewer-card"
  );

  storyCard.addEventListener(
    "touchstart",
    event=>{

      const touch = event.changedTouches[0];

      touchStartX = touch.clientX;

      touchStartY = touch.clientY;

    },
    {passive:true}
  );

  storyCard.addEventListener(
    "touchend",
    event=>{

      const touch = event.changedTouches[0];

      const differenceX =
        touch.clientX-touchStartX;

      const differenceY =
        touch.clientY-touchStartY;

      if (
        Math.abs(differenceX)>60 &&
        Math.abs(differenceX)>Math.abs(differenceY)
      ) {

        if (differenceX<0) {

          nextStory();

        } else {

          previousStory();

        }

      }

    },
    {passive:true}
  );


  /* =====================================
     HOLD TO PAUSE
  ===================================== */

  storyCard.addEventListener(
    "pointerdown",
    event=>{

      if (
        event.target.closest("button")
      ) return;

      pauseStory();

    }
  );

  storyCard.addEventListener(
    "pointerup",
    resumeStory
  );

  storyCard.addEventListener(
    "pointercancel",
    resumeStory
  );

  storyCard.addEventListener(
    "pointerleave",
    resumeStory
  );


  /* =====================================
     KEYBOARD NAVIGATION
  ===================================== */

  document.addEventListener("keydown",event=>{

    if ($("storyViewer").hidden) return;

    if (event.key === "Escape") {

      closeStory();

    }

    if (event.key === "ArrowRight") {

      nextStory();

    }

    if (event.key === "ArrowLeft") {

      previousStory();

    }

  });


  /* =====================================
     BUTTON EVENTS
  ===================================== */

  $("storyClose").addEventListener(
    "click",
    closeStory
  );

  $("storyNext").addEventListener(
    "click",
    nextStory
  );

  $("storyPrevious").addEventListener(
    "click",
    previousStory
  );

  $("storyReact").addEventListener(
    "click",
    reactToStory
  );

  $("storyViewers").addEventListener(
    "click",
    showViewers
  );

  $("closeViewers").addEventListener(
    "click",
    ()=>{
      $("storyViewersModal").hidden = true;
    }
  );


  /* =====================================
     ADD STORY BUTTON
  ===================================== */

  $("addStoryBtn").addEventListener(
    "click",
    async()=>{

      if (!currentUser) {

        alert("Please sign in first.");

        return;

      }

      await refreshMembership();

      if (!(await canInteract())) {

        showStatus(
          "Your membership does not allow story uploads."
        );

        return;

      }

      $("storyFile").click();

    }
  );


  /* =====================================
     UPLOAD STORY
  ===================================== */

  $("storyFile").addEventListener(
    "change",
    async event=>{

      const file =
        event.target.files?.[0];

      if (!file || !currentUser) return;

      const button = $("addStoryBtn");

      button.disabled = true;

      showStatus("Uploading your story...");

      try {

        await refreshMembership();

        if (!(await canInteract())) {

          throw new Error(
            "Your membership does not allow story uploads."
          );

        }

        const imageUrl =
          await uploadStoryImage(currentUser,file);

        await addDoc(
          collection(db,"stories"),
          {

            uid:currentUser.uid,

            name:
              currentUser.displayName ||
              "PicShare member",

            photoURL:
              currentUser.photoURL || "",

            imageUrl,

            createdAt:serverTimestamp(),

            expiresAt:Timestamp.fromMillis(
              Date.now()+DAY
            )

          }
        );

        showStatus(
          "Your story has been shared successfully!"
        );

      } catch(error) {

        console.error("Story upload failed:",error);

        showStatus(
          "Could not post story: "+error.message
        );

      } finally {

        button.disabled = !currentUser;

        event.target.value = "";

      }

    }
  );


  /* =====================================
     AUTHENTICATION
  ===================================== */

  onAuthStateChanged(auth,async user=>{

    currentUser = user;

    if (stopStories) {

      stopStories();

      stopStories = null;

    }

    if (!user) {

      membershipReady = false;

      membershipStatus = "active";

      stories = [];

      closeStory();

      renderStories();

      $("addStoryBtn").disabled = true;

      return;

    }

    $("addStoryBtn").disabled = false;

    await refreshMembership();

    const storiesQuery = query(
      collection(db,"stories"),
      orderBy("createdAt","desc")
    );

    stopStories = onSnapshot(
      storiesQuery,
      snapshot=>{

        stories = snapshot.docs.map(item=>({

          id:item.id,

          ...item.data()

        }));

        renderStories();

      },
      error=>{

        console.error(
          "Stories loading failed:",
          error
        );

        showStatus(
          "Stories could not load. Please try again."
        );

      }
    );

  });


  /* =====================================
     UPDATE COUNTDOWN
  ===================================== */

  setInterval(()=>{

    if (currentUser) {

      renderStories();

    }

  },60000);

}

    /* ==========================================
   PICSHARE — DARK MODE CONTROLLER
========================================== */

(() => {
  const STORAGE_KEY = "picshare-theme";

  function applyTheme(theme) {
    const dark = theme === "dark";

    document.documentElement.classList.toggle("dark-mode", dark);

    const button = document.getElementById("picshareThemeToggle");

    if (button) {
      button.textContent = dark ? "☀️" : "🌙";
      button.title = dark ? "Switch to Light Mode" : "Switch to Dark Mode";
      button.setAttribute("aria-label", button.title);
    }
  }

  function initializeTheme() {
    let savedTheme = "light";

    try {
      savedTheme = localStorage.getItem(STORAGE_KEY) || "light";
    } catch (error) {
      console.warn("PicShare could not read theme preference.");
    }

    applyTheme(savedTheme);

    if (!document.getElementById("picshareThemeToggle")) {
      const button = document.createElement("button");

      button.id = "picshareThemeToggle";
      button.type = "button";
      button.textContent = savedTheme === "dark" ? "☀️" : "🌙";
      button.title = "Switch theme";
      button.setAttribute("aria-label", "Switch theme");

      button.addEventListener("click", () => {
        const isDark = document.documentElement.classList.contains("dark-mode");
        const newTheme = isDark ? "light" : "dark";

        try {
          localStorage.setItem(STORAGE_KEY, newTheme);
        } catch (error) {
          console.warn("PicShare could not save theme preference.");
        }

        applyTheme(newTheme);
      });

      document.body.appendChild(button);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTheme);
  } else {
    initializeTheme();
  }
})();

/* END PICSHARE THEME CONTROLLER */



