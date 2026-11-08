import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/* PICSHARE APP */

const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";
const ADMIN_UID = "VXDMuU17gifoBqTkbpC55Xre9242";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));

let stopFeed = null, stopLikes = [], stopComments = [];
let stopNotifications = null, stopMembership = null;

let currentMembershipStatus = "active";
let membershipReady = false;

/* MEMBERSHIP MANAGEMENT */

const isAdmin = user => !!user && user.uid === ADMIN_UID;

const canInteract = () => !!auth.currentUser &&
  (isAdmin(auth.currentUser) ||
  (membershipReady && currentMembershipStatus === "active"));

function requireActiveMembership(action) {
  if (!auth.currentUser) {
    alert("Please sign in first.");
    return false;
  }

  if (!membershipReady) {
    alert("Membership status is loading. Try again shortly.");
    return false;
  }

  if (canInteract()) return true;

  alert(currentMembershipStatus === "restricted"
    ? `Your account is restricted. You can view posts but cannot ${action}.`
    : `Your account cannot ${action} at this time.`);

  return false;
}

function applyMembershipUI() {
  ["saveProfileBtn", "uploadPhotoBtn", "publishBtn"].forEach(id => {
    if ($(id)) $(id).disabled = !canInteract();
  });

  if ($("profileStatus") && currentMembershipStatus === "restricted") {
    $("profileStatus").textContent =
      "Restricted account: viewing is allowed, but publishing and interactions are disabled.";
  }
}

async function readMembership(user) {
  if (isAdmin(user)) return "active";

  const snap = await getDoc(
    doc(db, "membership_status", user.uid)
  );

  if (!snap.exists()) return "active";

  const value = String(snap.data().status || "active").toLowerCase();

  return ["active", "restricted", "suspended", "blocked"].includes(value)
    ? value : "suspended";
}

/* LISTENER CLEANUP */

function stopAllFeedListeners() {
  stopLikes.forEach(fn => fn());
  stopLikes = [];

  stopComments.forEach(fn => fn());
  stopComments = [];
}

function stopAllUserListeners() {
  if (stopFeed) stopFeed();
  if (stopNotifications) stopNotifications();
  if (stopMembership) stopMembership();

  stopFeed = null;
  stopNotifications = null;
  stopMembership = null;

  stopAllFeedListeners();
}

/* PROFILE MENU */

const profileMenuBtn = $("profileMenuBtn");
const profileDropdown = $("profileDropdown");
const profileMenuWrap = $("profileMenuWrap");

function closeProfileMenu() {
  if (profileDropdown) profileDropdown.hidden = true;
  profileMenuBtn?.setAttribute("aria-expanded", "false");
}

profileMenuBtn?.addEventListener("click", e => {
  e.stopPropagation();

  if (!profileDropdown) return;

  profileDropdown.hidden = !profileDropdown.hidden;

  profileMenuBtn.setAttribute(
    "aria-expanded",
    String(!profileDropdown.hidden)
  );
});

document.addEventListener("click", e => {
  if (profileMenuWrap && !profileMenuWrap.contains(e.target)) {
    closeProfileMenu();
  }
});

$("myProfileLink")?.addEventListener("click", () => {
  closeProfileMenu();
  $("profileCard")?.scrollIntoView({behavior:"smooth"});
});

$("editProfileLink")?.addEventListener("click", () => {
  closeProfileMenu();
  $("editProfileCard")?.scrollIntoView({behavior:"smooth"});
});

/* NOTIFICATIONS */

const notificationWrap = $("notificationWrap");
const notificationBtn = $("notificationBtn");
const notificationPanel = $("notificationPanel");
const notificationCount = $("notificationCount");
const notificationList = $("notificationList");
const markAllReadBtn = $("markAllReadBtn");

function closeNotificationPanel() {
  if (notificationPanel) notificationPanel.hidden = true;
}

notificationBtn?.addEventListener("click", e => {
  e.stopPropagation();

  if (notificationPanel) {
    notificationPanel.hidden = !notificationPanel.hidden;
  }
});

document.addEventListener("click", e => {
  if (notificationWrap && !notificationWrap.contains(e.target)) {
    closeNotificationPanel();
  }
});

function renderNotifications(items) {
  if (!notificationList) return;

  const unread = items.filter(x => !x.read).length;

  if (notificationCount) {
    notificationCount.textContent =
      unread > 99 ? "99+" : String(unread);

    notificationCount.hidden = unread === 0;
  }

  if (!items.length) {
    notificationList.innerHTML =
      '<p class="muted">No notifications yet.</p>';
    return;
  }

  notificationList.innerHTML = items.map(item => {
    const actor = safe(item.actorName || "PicShare member");

    const verb = item.type === "like"
  ? "liked your post."
  : item.type === "comment"
  ? "commented on your post."
  : item.type === "story_reaction"
  ? "liked your story. ❤️"
  : "interacted with your post.";

    return `<div class="notification-item ${item.read ? "" : "unread"}">
      <strong>${actor}</strong> ${verb}
      ${item.commentText ? `<p>${safe(item.commentText)}</p>` : ""}
    </div>`;
  }).join("");
}

function startNotifications(user) {
  if (stopNotifications) stopNotifications();

  stopNotifications = onSnapshot(
    query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc")
    ),
    snap => renderNotifications(
      snap.docs.map(d => ({id:d.id, ...d.data()}))
    ),
    err => {
      console.error("Notification error:", err);

      if (notificationList) {
        notificationList.textContent =
          "Notifications could not load.";
      }
    }
  );
}

async function sendNotification(
  toUid, actorUid, actorName, postId, type, commentText = ""
) {
  if (!toUid || toUid === actorUid) return;

  try {
    await addDoc(
      collection(db, "users", toUid, "notifications"),
      {
        actorUid,
        actorName,
        postId,
        type,
        commentText,
        read:false,
        createdAt:serverTimestamp()
      }
    );
  } catch (err) {
    console.error("Could not send notification:", err);
  }
}

markAllReadBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  markAllReadBtn.disabled = true;

  try {
    const snap = await getDocs(
      collection(db, "users", user.uid, "notifications")
    );

    await Promise.all(
      snap.docs
        .filter(d => !d.data().read)
        .map(d => updateDoc(d.ref, {read:true}))
    );

  } catch (err) {
    console.error("Could not mark notifications read:", err);
  } finally {
    markAllReadBtn.disabled = false;
  }
});

/* AUTH FORM HELPERS */

function showMessage(message, error = false) {
  if (!$("authMessage")) return;

  $("authMessage").textContent = message;
  $("authMessage").style.color = error ? "#b42318" : "";
}

function getInputs() {
  return {
    email: $("email")?.value.trim() || "",
    password: $("password")?.value || "",
    name: $("displayName")?.value.trim() || ""
  };
}

/* SUPABASE IMAGE UPLOAD */

async function uploadImage(user, file) {
  if (!canInteract()) {
    throw new Error("Your membership does not allow uploads.");
  }

  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WEBP image.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 2 MB.");
  }

  const token = await user.getIdToken();

  const form = new FormData();
  form.append("file", file, file.name);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/dynamic-function`,
    {
      method:"POST",
      headers:{
        apikey:SUPABASE_PUBLISHABLE_KEY,
        "x-firebase-token":token
      },
      body:form
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error || `Upload failed (${response.status})`
    );
  }

  if (!result.publicUrl) {
    throw new Error("The upload did not return a photo URL.");
  }

  return result.publicUrl;
}

/* PROFILE */

async function loadProfile(user) {
  const snap = await getDoc(doc(db, "users", user.uid));

  const profile = snap.exists() ? snap.data() : {};

  const name = profile.name || user.displayName || "PicShare member";
  const photo = profile.photoURL || user.photoURL || "";

  if ($("profileName")) {
    $("profileName").textContent = name;
  }

  if ($("profileNameInput")) {
    $("profileNameInput").value = name;
  }

  if ($("profileInitial")) {
    $("profileInitial").textContent = name.charAt(0).toUpperCase();
  }

  let avatar = $("profileDisplayPhoto");

  const art = $("profileCard")?.querySelector(".profile-art");

  if (photo && art) {
    if (!avatar) {
      avatar = document.createElement("img");
      avatar.id = "profileDisplayPhoto";
      avatar.className = "profile-photo";
      avatar.alt = "Profile photo";
      art.appendChild(avatar);
    }

    avatar.src = photo;
    avatar.hidden = false;

    if ($("profileInitial")) {
      $("profileInitial").hidden = true;
    }

  } else {
    avatar?.remove();

    if ($("profileInitial")) {
      $("profileInitial").hidden = false;
    }
  }
}

$("saveProfileBtn")?.addEventListener("click", async () => {
  if (!requireActiveMembership("edit your profile")) return;

  const user = auth.currentUser;
  const name = $("profileNameInput")?.value.trim() || "";
  const file = $("profilePhotoInput")?.files?.[0];

  if (!user) return;

  if (!name || name.length > 30) {
    if ($("profileStatus")) {
      $("profileStatus").textContent =
        "Enter a display name of 1–30 characters.";
    }
    return;
  }

  const button = $("saveProfileBtn");
  button.disabled = true;

  try {
    const photoURL = file
      ? await uploadImage(user, file)
      : (user.photoURL || "");

    await updateProfile(user, {
      displayName:name,
      photoURL
    });

    await setDoc(
      doc(db, "users", user.uid),
      {uid:user.uid, name, photoURL},
      {merge:true}
    );

    if ($("profilePhotoInput")) {
      $("profilePhotoInput").value = "";
    }

    if ($("profileStatus")) {
      $("profileStatus").textContent = "Profile saved successfully!";
    }

    await loadProfile(user);

  } catch (err) {
    if ($("profileStatus")) {
      $("profileStatus").textContent = err.message;
    }
  } finally {
    button.disabled = !canInteract();
  }
});

/* REGISTRATION AND SIGN-IN */

$("signUpBtn")?.addEventListener("click", async () => {
  const {email,password,name} = getInputs();

  if (!email || password.length < 6 || !name) {
    return showMessage(
      "Enter an email, a password of at least 6 characters, and a display name.",
      true
    );
  }

  try {
    const credential = await createUserWithEmailAndPassword(
      auth, email, password
    );

    await updateProfile(credential.user, {
      displayName:name
    });

    await setDoc(
      doc(db,"users",credential.user.uid),
      {
        uid:credential.user.uid,
        name,
        photoURL:"",
        createdAt:serverTimestamp()
      },
      {merge:true}
    );

    showMessage("Account created.");

  } catch (err) {
    showMessage(err.message,true);
  }
});

$("signInBtn")?.addEventListener("click", async () => {
  const {email,password} = getInputs();

  if (!email || !password) {
    return showMessage("Enter your email and password.",true);
  }

  try {
    await signInWithEmailAndPassword(auth,email,password);
    showMessage("");

  } catch (err) {
    showMessage(err.message,true);
  }
});

$("signOutBtn")?.addEventListener("click", async () => {
  closeProfileMenu();
  closeNotificationPanel();
  await signOut(auth);
});

/* CREATE PHOTO POSTS */

$("uploadPhotoBtn")?.addEventListener("click", async () => {
  if (!requireActiveMembership("upload photos")) return;

  const user = auth.currentUser;
  const file = $("photoFile")?.files?.[0];

  if (!user) return alert("Please sign in first.");
  if (!file) return alert("Choose a photo first.");

  const button = $("uploadPhotoBtn");
  button.disabled = true;

  if ($("photoUploadStatus")) {
    $("photoUploadStatus").textContent = "Uploading...";
  }

  try {
    const imageUrl = await uploadImage(user,file);

    const profileSnap = await getDoc(
      doc(db,"users",user.uid)
    );

    const profile = profileSnap.exists()
      ? profileSnap.data()
      : {};

    await addDoc(collection(db,"posts"), {
      uid:user.uid,
      name:profile.name || user.displayName || "PicShare member",
      photoURL:profile.photoURL || user.photoURL || "",
      caption:$("caption")?.value.trim() || "",
      imageUrl,
      createdAt:serverTimestamp()
    });

    if ($("photoUploadStatus")) {
      $("photoUploadStatus").textContent =
        "Photo uploaded and shared to your feed!";
    }

    if ($("photoPreview")) {
      $("photoPreview").src=imageUrl;
      $("photoPreview").hidden=false;
    }

    if ($("photoFile")) $("photoFile").value="";
    if ($("caption")) $("caption").value="";

    if ($("charCount")) {
      $("charCount").textContent="0 / 220";
    }

  } catch (err) {
    if ($("photoUploadStatus")) {
      $("photoUploadStatus").textContent =
        "Upload failed: " + err.message;
    }

  } finally {
    button.disabled = !canInteract();
  }
});

$("caption")?.addEventListener("input", () => {
  if ($("charCount")) {
    $("charCount").textContent =
      `${$("caption").value.length} / 220`;
  }
});

/* TEXT POSTS */

$("publishBtn")?.addEventListener("click", async () => {
  if (!requireActiveMembership("publish posts")) return;

  const user = auth.currentUser;
  const caption = $("caption")?.value.trim() || "";

  if (!user) return alert("Please sign in first.");
  if (!caption) return alert("Write a message first.");

  if (caption.length > 220) {
    return alert("Posts cannot exceed 220 characters.");
  }

  const button=$("publishBtn");
  button.disabled=true;

  try {
    const snap=await getDoc(
      doc(db,"users",user.uid)
    );

    const profile=snap.exists()?snap.data():{};

    await addDoc(collection(db,"posts"), {
      uid:user.uid,
      name:profile.name || user.displayName || "PicShare member",
      photoURL:profile.photoURL || user.photoURL || "",
      caption,
      createdAt:serverTimestamp()
    });

    $("caption").value="";

    if ($("charCount")) {
      $("charCount").textContent="0 / 220";
    }

  } catch(err) {
    alert("Could not publish: "+err.message);

  } finally {
    button.disabled=!canInteract();
  }
});

/* LIKES */

async function toggleLike(postId,button) {
  const user=auth.currentUser;

  if (!user) {
    return alert("Please sign in to like posts.");
  }

  if (!requireActiveMembership("like posts")) return;

  button.disabled=true;

  try {
    const ref=doc(
      db,"posts",postId,"likes",user.uid
    );

    if (button.dataset.liked==="true") {
      await deleteDoc(ref);

    } else {
      await setDoc(ref,{
        uid:user.uid,
        createdAt:serverTimestamp()
      });

      const postSnap=await getDoc(
        doc(db,"posts",postId)
      );

      if (postSnap.exists()) {
        const profileSnap=await getDoc(
          doc(db,"users",user.uid)
        );

        const profile=profileSnap.exists()
          ? profileSnap.data()
          : {};

        await sendNotification(
          postSnap.data().uid,
          user.uid,
          profile.name || user.displayName || "PicShare member",
          postId,
          "like"
        );
      }
    }

  } catch(err) {
    alert("Could not update like: "+err.message);

  } finally {
    button.disabled=!canInteract();
  }
}

/* COMMENTS */

async function addComment(postId,input,button) {
  const user=auth.currentUser;
  const text=input.value.trim();

  if (!user) {
    return alert("Please sign in to comment.");
  }

  if (!requireActiveMembership("comment")) return;
  if (!text) return alert("Write a comment first.");

  if (text.length>500) {
    return alert("Comments cannot exceed 500 characters.");
  }

  button.disabled=true;

  try {
    const snap=await getDoc(
      doc(db,"users",user.uid)
    );

    const profile=snap.exists()?snap.data():{};

    await addDoc(
      collection(db,"posts",postId,"comments"),
      {
        uid:user.uid,
        name:profile.name || user.displayName || "PicShare member",
        photoURL:profile.photoURL || user.photoURL || "",
        text,
        createdAt:serverTimestamp()
      }
    );

    const postSnap=await getDoc(
      doc(db,"posts",postId)
    );

    if (postSnap.exists()) {
      await sendNotification(
        postSnap.data().uid,
        user.uid,
        profile.name || user.displayName || "PicShare member",
        postId,
        "comment",
        text
      );
    }

    input.value="";

  } catch(err) {
    alert("Could not add comment: "+err.message);

  } finally {
    button.disabled=!canInteract();
  }
}

async function deleteComment(postId,commentId) {
  const user=auth.currentUser;

  if (!user) return;

  if (!isAdmin(user) && !canInteract()) {
    return alert("Your membership does not allow this action.");
  }

  if (!confirm("Delete this comment?")) return;

  try {
    await deleteDoc(
      doc(db,"posts",postId,"comments",commentId)
    );

  } catch(err) {
    alert("Could not delete comment: "+err.message);
  }
}

/* AVATAR MARKUP */

function avatarHTML(name,photoURL,className) {
  if (photoURL) {
    return `<img class="${className}" src="${safe(photoURL)}" alt="${safe(name)}" loading="lazy">`;
  }

  return `<span class="${className}">${safe(
    (name || "P").slice(0,1).toUpperCase()
  )}</span>`;
}

/* FEED AND LIVE LIKE/COMMENT LISTENERS */

function startFeed() {
  if (stopFeed) stopFeed();

  stopAllFeedListeners();

  stopFeed=onSnapshot(
    collection(db,"posts"),
    snapshot=>{

      stopAllFeedListeners();

      const posts=[...snapshot.docs].sort((a,b)=>
        (b.data().createdAt?.toMillis?.()||0)-
        (a.data().createdAt?.toMillis?.()||0)
      );

      if ($("postCount")) {
        $("postCount").textContent=
          `${posts.length} ${posts.length===1?"post":"posts"}`;
      }

      if (!posts.length) {
        if ($("feed")) {
          $("feed").innerHTML=
            '<div class="card empty"><b>Your feed is waiting.</b> Be the first to share a message.</div>';
        }
        return;
      }

      const interactive=canInteract();

      if ($("feed")) {
        $("feed").innerHTML=posts.map(postDoc=>{
          const p=postDoc.data();
          const id=postDoc.id;

          const date=p.createdAt?.toDate
            ? p.createdAt.toDate().toLocaleString()
            : "Earlier post";

          const photo = p.imageUrl
  ? `
    <div class="post-media">
      <img
        class="post-backdrop"
        src="${safe(p.imageUrl)}"
        alt=""
        aria-hidden="true"
        loading="lazy"
      >
      <img
        class="post-image"
        src="${safe(p.imageUrl)}"
        alt="Photo shared by ${safe(p.name || "PicShare member")}"
        loading="lazy"
      >
    </div>
  `
  : "";

          const caption=p.caption
            ? `<div class="post-caption">${safe(p.caption)}</div>`
            : "";

          const actions=interactive
            ? `<div class="post-actions">
                <button type="button" class="like-button"
                  data-post-id="${safe(id)}" data-liked="false">
                  🤍 Like <span class="like-count">0</span>
                </button>
              </div>`
            : '<p class="muted">Read-only access: interactions are disabled.</p>';

          const form=interactive
            ? `<form class="comment-form" data-comment-form="${safe(id)}">
                <input type="text" maxlength="500"
                  placeholder="Write a comment..."
                  aria-label="Write a comment" required>
                <button type="submit">Send</button>
              </form>`
            : "";

          return `<article class="card post ${p.imageUrl ? "video-style-post" : "text-style-post"}" data-creator-uid="${safe(p.uid)}">
  <div class="post-head">
    ${avatarHTML(p.name,p.photoURL,"mini-avatar")}
    <div>
      <div class="post-author">
        ${safe(p.name || "PicShare member")}
      </div>
      <div class="post-date">
        ${safe(date)}
      </div>
    </div>
  </div>

  ${photo}

  ${caption}

  <div class="post-actions">
    ${interactive
      ? `<button type="button" class="like-button"
          data-post-id="${safe(id)}" data-liked="false">
          🤍 Like <span class="like-count">0</span>
        </button>`
      : '<span class="muted">Read-only</span>'}
  </div>

  <div class="comments-section">
    <div class="comments-title">💬 Comments</div>

    <div class="comments-list"
      data-comments-post="${safe(id)}">
      <span class="muted">Loading comments...</span>
    </div>

    ${form}
  </div>

</article>`;
        }).join("");
      }

      document.querySelectorAll(".like-button").forEach(button=>
        button.addEventListener("click",()=>
          toggleLike(button.dataset.postId,button)
        )
      );

      document.querySelectorAll(".comment-form").forEach(form=>
        form.addEventListener("submit",event=>{
          event.preventDefault();

          addComment(
            form.dataset.commentForm,
            form.querySelector("input"),
            form.querySelector("button")
          );
        })
      );

      /* LIVE LIKE COUNTS */

      posts.forEach(postDoc=>{
        const id=postDoc.id;

        const stop=onSnapshot(
          collection(db,"posts",id,"likes"),
          likesSnap=>{

            const button=[
              ...document.querySelectorAll(".like-button")
            ].find(b=>b.dataset.postId===id);

            if (!button) return;

            const liked=auth.currentUser
              ? likesSnap.docs.some(d=>d.id===auth.currentUser.uid)
              : false;

            button.dataset.liked=String(liked);

            button.innerHTML=
              `${liked?"❤️ Unlike":"🤍 Like"}
              <span class="like-count">${likesSnap.size}</span>`;

          },
          err=>console.error("Likes could not load:",err)
        );

        stopLikes.push(stop);
      });

      /* LIVE COMMENTS */

      posts.forEach(postDoc=>{
        const id=postDoc.id;

        const stop=onSnapshot(
          query(
            collection(db,"posts",id,"comments"),
            orderBy("createdAt","asc")
          ),

          commentsSnap=>{

            const box=document.querySelector(
              `[data-comments-post="${id}"]`
            );

            if (!box) return;

            if (commentsSnap.empty) {
              box.innerHTML=
                '<p class="muted">No comments yet. Be the first!</p>';
              return;
            }

            box.innerHTML=commentsSnap.docs.map(commentDoc=>{
              const c=commentDoc.data();
              const cid=commentDoc.id;

              const mayDelete=auth.currentUser &&
                (
                  auth.currentUser.uid===c.uid ||
                  isAdmin(auth.currentUser)
                );

              return `<div class="comment-item">

                ${avatarHTML(c.name,c.photoURL,"comment-avatar")}

                <div class="comment-content">
                  <strong>${safe(c.name||"PicShare member")}</strong>
                  <p>${safe(c.text)}</p>
                </div>

                ${mayDelete
                  ? `<button class="delete-comment"
                      type="button"
                      data-comment-id="${safe(cid)}"
                      data-post-id="${safe(id)}">
                      Delete
                    </button>`
                  : ""}

              </div>`;
            }).join("");

            box.querySelectorAll(".delete-comment").forEach(button=>
              button.addEventListener("click",()=>
                deleteComment(
                  button.dataset.postId,
                  button.dataset.commentId
                )
              )
            );
          },

          err=>{
            console.error("Comments could not load:",err);

            const box=document.querySelector(
              `[data-comments-post="${id}"]`
            );

            if (box) {
              box.textContent="Could not load comments.";
            }
          }
        );

        stopComments.push(stop);
      });

    },

    err=>{
      console.error("Feed error:",err);

      if ($("feed")) {
        $("feed").textContent=
          "Could not load posts: "+err.message;
      }
    }
  );
}

/* AUTHENTICATION AND LIVE MEMBERSHIP STATUS */

onAuthStateChanged(auth,async user=>{

  stopAllUserListeners();

  membershipReady=false;
  currentMembershipStatus="active";

  if ($("authCard")) $("authCard").hidden=!!user;
  if ($("appArea")) $("appArea").hidden=!user;
  if ($("signOutBtn")) $("signOutBtn").hidden=!user;

  if (profileMenuWrap) profileMenuWrap.hidden=!user;
  if (notificationWrap) notificationWrap.hidden=!user;

  closeProfileMenu();
  closeNotificationPanel();

  if (!user) {

    if ($("profileName")) {
      $("profileName").textContent="Not signed in";
    }

    if ($("profileNameInput")) {
      $("profileNameInput").value="";
    }

    $("profileDisplayPhoto")?.remove();

    if ($("profileInitial")) {
      $("profileInitial").hidden=false;
      $("profileInitial").textContent="P";
    }

    if (notificationCount) {
      notificationCount.textContent="0";
      notificationCount.hidden=true;
    }

    if (notificationList) {
      notificationList.innerHTML=
        '<p class="muted">Sign in to see notifications.</p>';
    }

    return;
  }

  try {

    const status=await readMembership(user);

    currentMembershipStatus=status;
    membershipReady=true;

    if (!isAdmin(user) &&
        ["blocked","suspended"].includes(status)) {

      alert(status==="blocked"
        ? "This PicShare account has been blocked. Contact the administrator."
        : "This PicShare account is suspended. Contact the administrator."
      );

      await signOut(auth);
      return;
    }

    applyMembershipUI();

    /* WATCH FOR ADMIN MEMBERSHIP CHANGES */

    if (!isAdmin(user)) {

      stopMembership=onSnapshot(
        doc(db,"membership_status",user.uid),

        async snap=>{

          const raw=snap.exists()
            ? String(snap.data().status||"active").toLowerCase()
            : "active";

          const next=[
            "active",
            "restricted",
            "suspended",
            "blocked"
          ].includes(raw) ? raw : "suspended";

          if (next===currentMembershipStatus) return;

          currentMembershipStatus=next;
          membershipReady=true;

          if (["blocked","suspended"].includes(next)) {

            alert(next==="blocked"
              ? "Your account has been blocked."
              : "Your account has been suspended."
            );

            await signOut(auth);
            return;
          }

          applyMembershipUI();
          startFeed();

        },

        err=>console.error(
          "Membership listener error:",err
        )
      );
    }

    startFeed();
    startNotifications(user);

    const userRef=doc(db,"users",user.uid);
    const userSnap=await getDoc(userRef);

    const profile=userSnap.exists()
      ? userSnap.data()
      : {};

    if (canInteract()) {

      await setDoc(userRef,{
        uid:user.uid,
        name:profile.name||
          user.displayName||
          "PicShare member",
        photoURL:profile.photoURL||
          user.photoURL||
          ""
      },{merge:true});

    }

    await loadProfile(user);
    applyMembershipUI();

  } catch(err) {

    console.error("Account setup error:",err);

    if ($("profileStatus")) {
      $("profileStatus").textContent=
        "Account could not be loaded: "+err.message;
    }
  }
});
