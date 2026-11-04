import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const ADMIN_UID = "VXDMuU17gifoBqTkbpC55Xre9242";

const SUPABASE_URL = "https://rcfyzegwkopysdmrqiei.supabase.co";

const SUPABASE_KEY = "sb_publishable_qHS9O29gNmsP5NgsP10FpQ_zg7NpIES";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

$("loginBtn").onclick = async () => {
  try {
    $("loginError").textContent = "";
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (e) {
    $("loginError").textContent = e.message;
  }
};

$("logoutBtn").onclick = () => signOut(auth);
$("refreshBtn").onclick = loadPosts;
$("refreshUsersBtn").onclick = loadUsers;

onAuthStateChanged(auth, async user => {
  $("loginPanel").hidden = !!user;
  $("dashboard").hidden = true;

  if (!user) {
    $("status").textContent =
      "Sign in with your authorised administrator account.";
    return;
  }

  if (user.uid !== ADMIN_UID) {
    $("status").textContent =
      "Access denied. This account is not an authorised administrator.";
    await signOut(auth);
    return;
  }

  $("status").textContent = "Administrator access confirmed.";
  $("dashboard").hidden = false;

  await Promise.all([loadPosts(), loadUsers()]);
});

async function loadUsers() {
  $("users").textContent = "Loading members…";

  try {
    const [usersSnap, statusSnap] = await Promise.all([
      getDocs(query(collection(db, "users"), orderBy("name"))),
      getDocs(collection(db, "membership_status"))
    ]);

    const statuses = {};

    statusSnap.forEach(d => {
      statuses[d.id] = d.data().status || "active";
    });

    $("userCount").textContent = usersSnap.size;

    if (usersSnap.empty) {
      $("users").textContent = "No member profiles found yet.";
      return;
    }

    $("users").innerHTML = usersSnap.docs.map(d => {
      const u = d.data();
      const uid = u.uid || d.id;
      const currentStatus = statuses[uid] || "active";

      return `
        <div class="member">
          <strong>${safe(u.name || "PicShare member")}</strong>

          <div class="meta">
            User ID: ${safe(uid)}
          </div>

          <div class="meta">
            Current status: <strong>${safe(currentStatus)}</strong>
          </div>

          <select class="member-status" data-uid="${safe(uid)}">
            <option value="active" ${currentStatus === "active" ? "selected" : ""}>Active</option>
            <option value="restricted" ${currentStatus === "restricted" ? "selected" : ""}>Restricted</option>
            <option value="suspended" ${currentStatus === "suspended" ? "selected" : ""}>Suspended</option>
            <option value="blocked" ${currentStatus === "blocked" ? "selected" : ""}>Blocked</option>
          </select>

          <button class="manage-member" data-uid="${safe(uid)}">
            Update status
          </button>
        </div>
      `;
    }).join("");

    $("users").querySelectorAll(".manage-member").forEach(button => {
      button.onclick = () => updateMemberStatus(button.dataset.uid, button);
    });

  } catch (e) {
    $("users").textContent = "Could not load members: " + e.message;
  }
}

async function updateMemberStatus(uid, button) {
  const select = $("users").querySelector(
    `.member-status[data-uid="${CSS.escape(uid)}"]`
  );

  if (!select) return;

  const status = select.value;

  const reason = prompt(
    "Enter a reason for this membership status change:"
  );

  if (reason === null) return;

  if (reason.length > 500) {
    alert("The reason must be 500 characters or fewer.");
    return;
  }

  if (!confirm(`Change this member's status to ${status}?`)) return;

  button.disabled = true;
  button.textContent = "Updating…";

  try {
    const user = auth.currentUser;

    if (!user || user.uid !== ADMIN_UID) {
      throw new Error("Administrator sign-in required.");
    }

    const token = await user.getIdToken();

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/manage-membership`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "x-firebase-token": token
        },
        body: JSON.stringify({
          uid,
          status,
          reason
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Membership update failed.");
    }

    alert("Member status updated successfully.");

    await loadUsers();

  } catch (e) {
    alert("Could not update member: " + e.message);
    button.disabled = false;
    button.textContent = "Update status";
  }
}

async function loadPosts() {
  $("posts").textContent = "Loading posts…";

  try {
    const snap = await getDocs(
      query(collection(db, "posts"), orderBy("createdAt", "desc"))
    );

    $("postCount").textContent = snap.size;

    if (snap.empty) {
      $("posts").textContent = "No posts yet.";
      return;
    }

    $("posts").innerHTML = snap.docs.map(d => {
      const p = d.data();

      const date = p.createdAt?.toDate
        ? p.createdAt.toDate().toLocaleString()
        : "Date unavailable";

      const img = p.imageUrl
        ? `<img src="${safe(p.imageUrl)}" alt="Post image" loading="lazy">`
        : "";

      return `
        <article class="post">
          <div class="meta">
            By ${safe(p.name || "PicShare member")} · ${safe(date)}
          </div>

          ${img}

          <p>${safe(p.caption || "")}</p>

          <button class="danger" data-id="${safe(d.id)}">
            Delete post
          </button>
        </article>
      `;
    }).join("");

    $("posts").querySelectorAll("[data-id]").forEach(button => {
      button.onclick = async () => {
        if (!confirm("Delete this post permanently?")) return;

        button.disabled = true;

        try {
          await deleteDoc(doc(db, "posts", button.dataset.id));
          await loadPosts();
        } catch (e) {
          alert("Could not delete: " + e.message);
          button.disabled = false;
        }
      };
    });

  } catch (e) {
    $("posts").textContent = "Could not load posts: " + e.message;
  }
}
