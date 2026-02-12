// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA9ed67zvgz6MPBvnKbYK2QA0QDe1q70bk",
  authDomain: "musicframeappstorage.firebaseapp.com",
  projectId: "musicframeappstorage",
  storageBucket: "musicframeappstorage.firebasestorage.app",
  messagingSenderId: "927515116326",
  appId: "1:927515116326:web:b3195cc58d0a9e437df7e7",
  measurementId: "G-HC0S211F5B",
};

// YouTube Data API key - Get one at: https://console.developers.google.com/apis/credentials
const YOUTUBE_API_KEY = "AIzaSyASjzjMY9UoghIqZk_oRQqSodcsRz5Oe7o";

// Feature tooltip rotation
const features = [
  "Add albums",
  "Join discussions",
  "Insert YouTube links",
  /* Mark Rate tracks as new with a small superscript flag */
  'Rate tracks <sup class="feature-new">NEW</sup>',
  'Take notes for individual track <sup class="feature-new">NEW</sup>',
  'Take notes for the whole album <sup class="feature-new">NEW</sup>',
  'Make notes visible to others <sup class="feature-new">NEW</sup>',
  "Dive deep into music",
  "Lock your album",
  "Edit album details",
  "View track ratings",
  "Navigate months",
  "Leave discussions",
  "Delete your albums",
  "See moderator actions",
  "Fetch track listings",
  "Manage external links",
];
let currentFeatureIndex = 0;

function rotateFeatureTooltip() {
  const loginTooltip = document.getElementById("loginFeatureTooltip");
  const mainTooltip = document.getElementById("mainFeatureTooltip");

  currentFeatureIndex = (currentFeatureIndex + 1) % features.length;
  const newFeature = features[currentFeatureIndex];

  if (loginTooltip) {
    loginTooltip.style.animation = "none";
    setTimeout(() => {
      loginTooltip.innerHTML = newFeature;
      loginTooltip.style.animation = "fadeInOut 0.5s ease-in-out";
    }, 10);
  }

  if (mainTooltip) {
    mainTooltip.style.animation = "none";
    setTimeout(() => {
      mainTooltip.innerHTML = newFeature;
      mainTooltip.style.animation = "fadeInOut 0.5s ease-in-out";
    }, 10);
  }
}

// Start rotating features every 5 seconds
setInterval(rotateFeatureTooltip, 1500);

// Initialize Firebase
let db;
let auth;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
  console.log("Firebase initialized successfully");

  // Monitor auth state
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log("Firebase Auth state: User signed in", user.email);
    } else {
      console.log("Firebase Auth state: No user signed in");
    }
  });

  // Load moderators from Firestore
  loadModerators();
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Month data structure - albums now loaded from Firebase
const monthData = {
  "2025-12": {
    participants: [],
    albums: [],
  },
  "2025-11": {
    participants: [],
    albums: [],
  },
  "2026-01": {
    participants: [],
    albums: [],
  },
};

// Current date tracking
let currentDate = new Date();
let currentUser = null;

// Initialize global participants array to prevent undefined errors
window.currentParticipants = [];

// Store consistent emoji assignments per user email
const userEmojiMap = {};

// Cached DOM elements for performance
const DOMCache = {
  elements: {},
  get(id) {
    if (!this.elements[id]) {
      this.elements[id] = document.getElementById(id);
    }
    return this.elements[id];
  },
  clear() {
    this.elements = {};
  },
};

// Utility: Debounce function for performance optimization
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utility function to generate month key
function getMonthKey(date = currentDate) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Album cover gradients (constant)
const ALBUM_GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
];

// Animal emojis for fallback avatars (constant)
const ANIMAL_EMOJIS = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦆",
  "🦉",
];

// Function to get consistent animal emoji for a user
function getAnimalEmojiForUser(email) {
  if (userEmojiMap[email]) {
    return userEmojiMap[email];
  }

  // Use email hash to consistently assign same emoji
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % ANIMAL_EMOJIS.length;
  const emoji = ANIMAL_EMOJIS[index];

  userEmojiMap[email] = emoji;
  return emoji;
}

// Month names
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Migration function to fetch tracks for existing albums
async function migrateAlbumsWithTracks() {
  if (!db) {
    await showCustomAlert("Database not initialized");
    return;
  }

  // Check if user is moderator
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can run this migration.");
    return;
  }

  const confirmMigrate = await showCustomConfirm(
    "This will fetch and add track listings to all existing albums that have YouTube Music links. Continue?",
    "Migrate Tracks",
  );
  if (!confirmMigrate) return;

  try {
    // Get all albums
    const snapshot = await db.collection("albums").get();
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of snapshot.docs) {
      const album = doc.data();

      // Skip if already has tracks or no playlistId/youtubeUrl
      if (album.tracks && album.tracks.length > 0) {
        console.log(`Skipping ${album.title} - already has tracks`);
        skipped++;
        continue;
      }

      // Extract playlist ID from youtubeUrl if playlistId not stored
      let playlistId = album.playlistId;
      if (!playlistId && album.youtubeUrl) {
        const match = album.youtubeUrl.match(/[?&]list=([^&]+)/);
        if (match) {
          playlistId = match[1];
        }
      }

      if (!playlistId) {
        console.log(`Skipping ${album.title} - no playlist ID`);
        skipped++;
        continue;
      }

      console.log(`Fetching tracks for: ${album.title}`);

      // Fetch tracks
      const { tracks, trackArtist } = await fetchPlaylistTracks(playlistId);

      if (tracks.length > 0) {
        // Update album with tracks and artist if missing
        const updateData = {
          tracks: tracks,
          playlistId: playlistId,
        };
        if (trackArtist && !sanitizeArtist(album.artist)) {
          updateData.artist = trackArtist;
        }
        await db.collection("albums").doc(doc.id).update(updateData);
        console.log(`Updated ${album.title} with ${tracks.length} tracks`);
        updated++;
      } else {
        console.log(`No tracks found for ${album.title}`);
        failed++;
      }

      // Small delay to avoid hitting API rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await showCustomAlert(
      `Migration complete!\nUpdated: ${updated}\nSkipped: ${skipped}\nFailed: ${failed}`,
      "Migration Complete",
    );

    // Reload albums to show tracks
    loadAlbums();
  } catch (error) {
    console.error("Migration error:", error);
    await showCustomAlert(
      `Migration failed: ${error.message}`,
      "Migration Failed",
    );
  }
}

// Allowed users - Add emails of people who can access the site
const ALLOWED_USERS = [
  "hadzhizhekov.mihail@gmail.com",
  "pesa.voivoda@gmail.com",
  "cls1337@gmail.com",
  "st.takov@googlemail.com",
  "ryokaku23@googlemail.com",
  // Add more emails here
];

// Moderator users - Can delete any album
// Moderator configuration - will be loaded from Firestore
let MODERATORS = [
  "st.takov@googlemail.com", // Fallback in case Firestore fails
];

// Load moderators from Firestore
async function loadModerators() {
  try {
    const doc = await db.collection("config").doc("moderators").get();
    if (doc.exists && doc.data().emails) {
      MODERATORS = doc.data().emails;
      console.log("Moderators loaded from Firestore:", MODERATORS);
    } else {
      console.log("No moderators document found, using default:", MODERATORS);
    }
  } catch (error) {
    console.warn(
      "Could not load moderators from Firestore (using defaults):",
      error.message,
    );
    // Keep using the default MODERATORS array defined above
  }
}

// Get moderator first names
function getModeratorNames() {
  const participants = window.currentParticipants || [];
  const moderatorNames = [];

  MODERATORS.forEach((email) => {
    const participant = participants.find((p) => p.email === email);
    if (participant) {
      // Extract first name from full name
      const firstName = participant.name.split(" ")[0];
      moderatorNames.push(firstName);
    }
  });

  return moderatorNames.length > 0 ? moderatorNames : ["a moderator"];
}

// Check if user is a moderator
function isModerator(email) {
  return MODERATORS.includes(email);
}

// Google Sign-In callback
async function handleGoogleSignIn() {
  console.log("Current origin:", window.location.origin);
  console.log("Current hostname:", window.location.hostname);

  if (!auth) {
    await showCustomAlert(
      "Authentication not initialized. Please refresh the page.",
    );
    return;
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");

    console.log("Starting sign-in with popup...");
    const result = await auth.signInWithPopup(provider);
    const user = result.user;

    // Check if user is in the allowed list
    if (!ALLOWED_USERS.includes(user.email)) {
      await auth.signOut();
      await showCustomAlert(
        "Access denied. Your email is not authorized to use this application.",
        "Access Denied",
      );
      console.warn("Unauthorized login attempt:", user.email);
      return;
    }

    currentUser = {
      name: sanitizeText(user.displayName),
      email: sanitizeText(user.email),
      picture: user.photoURL,
    };

    // Store minimal session info
    localStorage.setItem("user", JSON.stringify(currentUser));

    console.log("User signed in successfully:", currentUser.email);

    // Show main content and hide login
    console.log("Calling showMainContent...");
    showMainContent();
    console.log("showMainContent completed");

    // Force update display
    await updateDisplay();
  } catch (error) {
    console.error("Sign-in error:", error);

    if (error.code === "auth/popup-blocked") {
      await showCustomAlert(
        "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        "Pop-up Blocked",
      );
    } else if (error.code === "auth/popup-closed-by-user") {
      console.log("User closed the sign-in popup");
    } else {
      await showCustomAlert(`Sign-in failed: ${error.message}`, "Error");
    }
  }
}

// Parse JWT token (ONLY use for Google-verified tokens from handleCredentialResponse)
// WARNING: This does NOT verify signature - only use with trusted sources
function parseJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join(""),
  );
  return JSON.parse(jsonPayload);
}

// Sanitize text to prevent XSS attacks
function sanitizeText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Show main content after login
function showMainContent() {
  console.log("showMainContent called, currentUser:", currentUser);

  const loginOverlay = document.getElementById("loginOverlay");
  const mainContent = document.getElementById("mainContent");
  const userName = document.getElementById("userName");
  const userImage = document.getElementById("userImage");
  const moderatorBadge = document.getElementById("moderatorBadge");
  const moderatorActions = document.getElementById("moderatorActions");

  console.log("Elements found:", {
    loginOverlay: !!loginOverlay,
    mainContent: !!mainContent,
    userName: !!userName,
    userImage: !!userImage,
  });

  if (loginOverlay) loginOverlay.classList.add("hidden");
  if (mainContent) mainContent.classList.remove("hidden");

  // Update user info display (textContent is safe from XSS)
  if (userName) userName.textContent = currentUser.name;
  if (userImage) userImage.src = currentUser.picture;

  // Show moderator badge if user is a moderator
  if (isModerator(currentUser.email)) {
    if (moderatorBadge) moderatorBadge.classList.remove("hidden");
    if (moderatorActions) moderatorActions.classList.remove("hidden");
  } else {
    if (moderatorBadge) moderatorBadge.classList.add("hidden");
    if (moderatorActions) moderatorActions.classList.add("hidden");
  }

  console.log("Main content should now be visible");

  // Initialize the main app
  updateDisplay();
}

// Custom Alert System
function showCustomAlert(message, title = "Musicframe") {
  return new Promise((resolve) => {
    const modal = document.getElementById("customAlertModal");
    const titleEl = document.getElementById("customAlertTitle");
    const messageEl = document.getElementById("customAlertMessage");
    const buttonsContainer = document.getElementById("customAlertButtons");
    const closeBtn = document.getElementById("closeCustomAlert");

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Single OK button
    buttonsContainer.innerHTML =
      '<button class="modal-btn modal-btn-primary" id="customAlertOk">OK</button>';

    const okBtn = document.getElementById("customAlertOk");

    const closeModal = () => {
      modal.classList.add("hidden");
      resolve(true);
    };

    okBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;

    modal.classList.remove("hidden");
  });
}

// Custom Confirm System
function showCustomConfirm(message, title = "Confirm") {
  return new Promise((resolve) => {
    const modal = document.getElementById("customAlertModal");
    const titleEl = document.getElementById("customAlertTitle");
    const messageEl = document.getElementById("customAlertMessage");
    const buttonsContainer = document.getElementById("customAlertButtons");
    const closeBtn = document.getElementById("closeCustomAlert");

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Cancel and Confirm buttons
    buttonsContainer.innerHTML = `
            <button class="modal-btn modal-btn-cancel" id="customConfirmCancel">Cancel</button>
            <button class="modal-btn modal-btn-primary" id="customConfirmOk">OK</button>
        `;

    const cancelBtn = document.getElementById("customConfirmCancel");
    const okBtn = document.getElementById("customConfirmOk");

    const closeModal = (result) => {
      modal.classList.add("hidden");
      resolve(result);
    };

    okBtn.onclick = () => closeModal(true);
    cancelBtn.onclick = () => closeModal(false);
    closeBtn.onclick = () => closeModal(false);

    modal.classList.remove("hidden");
  });
}

// Small toast notification (non-blocking)
function showToast(message, duration = 1800) {
  try {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.style.position = "fixed";
      container.style.right = "20px";
      container.style.bottom = "20px";
      container.style.zIndex = "99999";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "8px";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "app-toast";
    // wrap message in a span so we can apply clipped-gradient text via CSS
    const span = document.createElement("span");
    span.className = "toast-text";
    span.textContent = message;
    toast.appendChild(span);
    // background and color moved to CSS (.app-toast) so theme can be styled centrally
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 6px 18px rgba(0,0,0,0.4)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "opacity 160ms ease, transform 160ms ease";
    container.appendChild(toast);

    // animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    // remove after duration
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => {
        toast.remove();
        // if container empty, remove it
        if (container && container.children.length === 0) container.remove();
      }, 180);
    }, duration);
  } catch (e) {
    console.log("Toast error:", e);
  }
}

// Sign out
async function signOut() {
  // Clear user session
  localStorage.removeItem("user");
  currentUser = null;

  // Show login overlay
  const loginOverlay = DOMCache.get("loginOverlay");
  const mainContent = DOMCache.get("mainContent");

  loginOverlay?.classList.remove("hidden");
  mainContent?.classList.add("hidden");

  // Sign out from Firebase Auth
  try {
    if (auth) {
      await auth.signOut();
    }
  } catch (error) {
    console.error("Error signing out from Firebase:", error);
  }
}

// Initialize the page
async function init() {
  // Check if user is already logged in
  const storedUser = localStorage.getItem("user");
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    showMainContent();
  }

  setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
  console.log("Setting up event listeners...");

  // Google Sign-In button
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  console.log("Google Sign-In button found:", !!googleSignInBtn);

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", () => {
      console.log("Google Sign-In button clicked!");
      handleGoogleSignIn();
    });
  }

  document
    .getElementById("prevMonth")
    ?.addEventListener("click", () => navigateMonth(-1));
  document
    .getElementById("nextMonth")
    ?.addEventListener("click", () => navigateMonth(1));
  document.getElementById("signOutBtn")?.addEventListener("click", signOut);
  document
    .getElementById("joinDiscussionBtn")
    ?.addEventListener("click", joinDiscussion);
  document
    .getElementById("leaveDiscussionBtn")
    ?.addEventListener("click", leaveDiscussion);
  document
    .getElementById("addAlbumBtn")
    ?.addEventListener("click", showAddAlbumModal);
  document
    .getElementById("migrateTracksBtn")
    ?.addEventListener("click", migrateAlbumsWithTracks);
  document
    .getElementById("removeAllParticipantsBtn")
    ?.addEventListener("click", removeAllParticipants);

  // Album Modal event listeners
  document
    .getElementById("closeAddAlbumModal")
    ?.addEventListener("click", closeAddAlbumModal);
  document
    .getElementById("cancelAddAlbum")
    ?.addEventListener("click", closeAddAlbumModal);
  document
    .getElementById("confirmAddAlbum")
    ?.addEventListener("click", processAddAlbum);

  // Close modal on overlay click
  document.getElementById("addAlbumModal")?.addEventListener("click", (e) => {
    if (e.target.id === "addAlbumModal") {
      closeAddAlbumModal();
    }
  });

  // Submit on Enter key
  document
    .getElementById("albumLinkInput")
    ?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        processAddAlbum();
      }
    });

  // Lock Modal event listeners
  document
    .getElementById("closeLockConfirmModal")
    ?.addEventListener("click", closeLockConfirmModal);
  document
    .getElementById("cancelLock")
    ?.addEventListener("click", closeLockConfirmModal);
  document
    .getElementById("confirmLock")
    ?.addEventListener("click", processLockAlbum);

  // Close modal on overlay click
  document
    .getElementById("lockConfirmModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "lockConfirmModal") {
        closeLockConfirmModal();
      }
    });

  // Unlock Modal event listeners
  document
    .getElementById("closeUnlockConfirmModal")
    ?.addEventListener("click", closeUnlockConfirmModal);
  document
    .getElementById("cancelUnlock")
    ?.addEventListener("click", closeUnlockConfirmModal);
  document
    .getElementById("confirmUnlock")
    ?.addEventListener("click", processUnlockAlbum);

  // Close modal on overlay click
  document
    .getElementById("unlockConfirmModal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "unlockConfirmModal") {
        closeUnlockConfirmModal();
      }
    });

  // Locked Info Modal event listeners
  document
    .getElementById("closeLockedInfoModal")
    ?.addEventListener("click", closeLockedInfoModal);
  document
    .getElementById("closeLockedInfoBtn")
    ?.addEventListener("click", closeLockedInfoModal);

  // Close modal on overlay click
  document.getElementById("lockedInfoModal")?.addEventListener("click", (e) => {
    if (e.target.id === "lockedInfoModal") {
      closeLockedInfoModal();
    }
  });

  // Rate Track Modal event listeners
  document
    .getElementById("closeRateTrackModal")
    ?.addEventListener("click", closeRateTrackModal);
  document
    .getElementById("cancelRateTrack")
    ?.addEventListener("click", closeRateTrackModal);

  // Track rating slider event listeners
  attachSliderListeners("trackRatingSlider", handleTrackRatingClick);
  document
    .getElementById("clearTrackRating")
    ?.addEventListener("click", clearTrackRating);

  // Old-style rating button event listeners
  document
    .getElementById("rateFavorite")
    ?.addEventListener("click", () => applyTrackRating("favorite"));
  document
    .getElementById("rateLeast")
    ?.addEventListener("click", () => applyTrackRating("least"));
  document
    .getElementById("rateLiked")
    ?.addEventListener("click", () => applyTrackRating("liked"));
  document
    .getElementById("rateDisliked")
    ?.addEventListener("click", () => applyTrackRating("disliked"));

  // Track Notes event listeners
  document
    .getElementById("notesVisibilityToggle")
    ?.addEventListener("click", toggleNotesVisibility);
  document
    .getElementById("trackRatingVisibilityToggle")
    ?.addEventListener("click", toggleTrackRatingVisibility);
  // Save button removed from UI; notes are auto-saved on modal close

  // Close modal on overlay click
  document.getElementById("rateTrackModal")?.addEventListener("click", (e) => {
    if (e.target.id === "rateTrackModal") {
      closeRateTrackModal();
    }
  });

  // Album Note Modal event listeners
  document
    .getElementById("closeAlbumNoteModal")
    ?.addEventListener("click", closeAlbumNoteModal);
  document
    .getElementById("cancelAlbumNote")
    ?.addEventListener("click", closeAlbumNoteModal);
  document
    .getElementById("albumNotesVisibilityToggle")
    ?.addEventListener("click", toggleAlbumNotesVisibility);
  document
    .getElementById("albumRatingVisibilityToggle")
    ?.addEventListener("click", toggleAlbumRatingVisibility);

  // Album rating slider event listeners
  attachSliderListeners("albumRatingSlider", handleAlbumRatingClick);
  document
    .getElementById("clearAlbumRating")
    ?.addEventListener("click", clearAlbumRating);

  // Close modal on overlay click
  document.getElementById("albumNoteModal")?.addEventListener("click", (e) => {
    if (e.target.id === "albumNoteModal") {
      closeAlbumNoteModal();
    }
  });

  // Edit Links Modal event listeners
  document
    .getElementById("closeEditLinksModal")
    ?.addEventListener("click", closeEditLinksModal);
  document
    .getElementById("cancelEditLinks")
    ?.addEventListener("click", closeEditLinksModal);
  document
    .getElementById("saveEditLinks")
    ?.addEventListener("click", saveEditedLinks);

  // Vote Best Album
  document
    .getElementById("voteBestAlbumBtn")
    ?.addEventListener("click", voteBestAlbum);
  document
    .getElementById("closeBestAlbumModal")
    ?.addEventListener("click", closeBestAlbumModal);
  document
    .getElementById("closeBestAlbumModalBtn")
    ?.addEventListener("click", closeBestAlbumModal);
  document.getElementById("bestAlbumModal")?.addEventListener("click", (e) => {
    if (e.target.id === "bestAlbumModal") closeBestAlbumModal();
  });
  document
    .getElementById("addNewLinkBtn")
    ?.addEventListener("click", addNewLinkRow);

  // Close modal on overlay click
  document.getElementById("editLinksModal")?.addEventListener("click", (e) => {
    if (e.target.id === "editLinksModal") {
      closeEditLinksModal();
    }
  });

  // Custom alert modal event listeners are handled dynamically
  // by showCustomAlert/showCustomConfirm via inline onclick handlers

  // Leave discussion modal event listeners
  document
    .getElementById("closeLeaveDiscussion")
    ?.addEventListener("click", closeLeaveDiscussionModal);
  document
    .getElementById("cancelLeaveDiscussion")
    ?.addEventListener("click", closeLeaveDiscussionModal);
  document
    .getElementById("confirmLeaveDiscussion")
    ?.addEventListener("click", confirmLeaveDiscussion);
}

function closeAddAlbumModal() {
  document.getElementById("addAlbumModal")?.classList.add("hidden");
}

function closeLockConfirmModal() {
  document.getElementById("lockConfirmModal")?.classList.add("hidden");
}

function closeUnlockConfirmModal() {
  document.getElementById("unlockConfirmModal")?.classList.add("hidden");
}

function closeLockedInfoModal() {
  document.getElementById("lockedInfoModal")?.classList.add("hidden");
}

function closeEditLinksModal() {
  document.getElementById("editLinksModal")?.classList.add("hidden");
}

// Show edit links modal
async function showEditLinksModal(albumId) {
  if (!db) return;

  window.currentEditAlbumId = albumId;

  // Load current links
  const albumDoc = await db.collection("albums").doc(albumId).get();
  if (!albumDoc.exists) {
    await showCustomAlert("Album not found");
    return;
  }

  const albumData = albumDoc.data();
  const externalLinks = albumData.externalLinks || [];
  const youtubeUrl = albumData.youtubeUrl || "";
  const isLocked = albumData.locked || false;

  // Populate YouTube Music section
  const youtubeContainer = document.getElementById("youtubeEditContainer");
  youtubeContainer.innerHTML = "";

  const youtubeLabel = document.createElement("label");
  youtubeLabel.className = "edit-link-label";
  youtubeLabel.textContent = "YouTube Music Link (Primary)";
  youtubeLabel.style.fontWeight = "600";
  youtubeLabel.style.marginBottom = "8px";
  youtubeLabel.style.display = "block";

  const youtubeInfo = document.createElement("p");
  youtubeInfo.style.fontSize = "0.85rem";
  youtubeInfo.style.color = "#a0a0a0";
  youtubeInfo.style.marginTop = "-4px";
  youtubeInfo.style.marginBottom = "8px";
  youtubeInfo.textContent =
    "This is your main album link. Once locked, it cannot be changed. Only a moderator can unlock it.";

  const youtubeInput = document.createElement("input");
  youtubeInput.type = "text";
  youtubeInput.id = "youtubeUrlInput";
  youtubeInput.className = "modal-input";
  youtubeInput.placeholder = "https://music.youtube.com/playlist?list=...";
  youtubeInput.value = youtubeUrl;
  youtubeInput.disabled = isLocked;
  youtubeInput.style.marginBottom = "20px";

  youtubeContainer.appendChild(youtubeLabel);
  youtubeContainer.appendChild(youtubeInfo);

  if (isLocked) {
    const lockNote = document.createElement("p");
    lockNote.style.fontSize = "0.9rem";
    lockNote.style.color = "#ef4444";
    lockNote.style.marginBottom = "8px";
    lockNote.textContent =
      "🔒 Album is locked - YouTube Music link cannot be changed";
    youtubeContainer.appendChild(lockNote);
    youtubeContainer.appendChild(youtubeInput);
  } else {
    youtubeContainer.appendChild(youtubeInput);
  }

  // Populate external links section
  const container = document.getElementById("editLinksContainer");
  container.innerHTML = "";

  if (externalLinks.length > 0) {
    const linksLabel = document.createElement("label");
    linksLabel.className = "edit-link-label";
    linksLabel.textContent = "External Links";
    linksLabel.style.fontWeight = "600";
    linksLabel.style.marginBottom = "12px";
    linksLabel.style.display = "block";
    container.appendChild(linksLabel);
  }

  externalLinks.forEach((link, index) => {
    addLinkRowToEdit(link.url, link.name, index);
  });

  // Show modal
  document.getElementById("editLinksModal").classList.remove("hidden");
}

// Add a link row to the edit container
function addLinkRowToEdit(url = "", name = "", index = null) {
  const container = document.getElementById("editLinksContainer");

  const item = document.createElement("div");
  item.className = "edit-link-item";
  if (index !== null) {
    item.dataset.index = index;
  }

  const inputs = document.createElement("div");
  inputs.className = "edit-link-inputs";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "modal-input link-url-input";
  urlInput.placeholder = "https://...";
  urlInput.value = url;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "modal-input link-name-input";
  nameInput.placeholder = "Platform name (e.g., Bandcamp)";
  nameInput.value = name;

  inputs.appendChild(urlInput);
  inputs.appendChild(nameInput);

  const removeBtn = document.createElement("button");
  removeBtn.className = "edit-link-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    item.remove();
  });

  item.appendChild(inputs);
  item.appendChild(removeBtn);
  container.appendChild(item);
}

// Add new empty link row
function addNewLinkRow() {
  addLinkRowToEdit();
}

// Save edited links
async function saveEditedLinks() {
  const albumId = window.currentEditAlbumId;
  if (!albumId || !db) return;

  // Get YouTube Music URL
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const youtubeUrl = youtubeUrlInput.value.trim();

  if (!youtubeUrl) {
    await showCustomAlert("YouTube Music link is required");
    return;
  }

  // Collect all external links from the form
  const container = document.getElementById("editLinksContainer");
  const items = container.querySelectorAll(".edit-link-item");

  const newLinks = [];
  items.forEach((item) => {
    const urlInput = item.querySelector(".link-url-input");
    const nameInput = item.querySelector(".link-name-input");

    const url = urlInput.value.trim();
    const name = nameInput.value.trim();

    if (url && name) {
      newLinks.push({
        url: url,
        name: name,
        addedAt: new Date().toISOString(),
      });
    }
  });

  // Close modal
  closeEditLinksModal();

  try {
    // Update in Firebase
    await db.collection("albums").doc(albumId).update({
      externalLinks: newLinks,
    });

    // Refresh display
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error saving links:", error);
    await showCustomAlert(`Failed to save links: ${error.message}`, "Error");
  }
}

// Show locked album info modal
function showLockedInfoModal() {
  const moderatorNames = getModeratorNames();
  const message = document.getElementById("lockedInfoMessage");

  if (moderatorNames.length === 1) {
    message.innerHTML = `This album is already locked in. Only the moderator/s,<strong> ${moderatorNames[0]}</strong> can unlock it. SUCK IT!`;
  } else {
    const namesList =
      moderatorNames.slice(0, -1).join(", ") +
      " or " +
      moderatorNames[moderatorNames.length - 1];
    message.innerHTML = `This album is already locked in. Only the moderator/s, ${namesList} can unlock it. SUCK IT!`;
  }

  const modal = document.getElementById("lockedInfoModal");
  modal.classList.remove("hidden");
}

// Show lock confirmation modal
function showLockConfirmModal(albumId) {
  window.currentLockAlbumId = albumId;
  const modal = document.getElementById("lockConfirmModal");
  modal.classList.remove("hidden");
}

// Process locking the album
async function processLockAlbum() {
  const albumId = window.currentLockAlbumId;
  if (!albumId) {
    await showCustomAlert("Album not found");
    return;
  }

  // Close modal
  document.getElementById("lockConfirmModal").classList.add("hidden");

  try {
    await db.collection("albums").doc(albumId).update({
      locked: true,
      lockedAt: new Date().toISOString(),
    });

    // Refresh albums display
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error locking album:", error);
    await showCustomAlert(`Failed to lock album: ${error.message}`, "Error");
  }
}

// Unlock album (moderator only)
async function showUnlockConfirmModal(albumId) {
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can unlock albums");
    return;
  }

  window.currentUnlockAlbumId = albumId;
  const modal = document.getElementById("unlockConfirmModal");
  modal.classList.remove("hidden");
}

// Process unlocking the album
async function processUnlockAlbum() {
  const albumId = window.currentUnlockAlbumId;
  if (!albumId) {
    await showCustomAlert("Album not found");
    return;
  }

  // Close modal
  document.getElementById("unlockConfirmModal").classList.add("hidden");

  try {
    await db.collection("albums").doc(albumId).update({
      locked: false,
      unlockedAt: new Date().toISOString(),
      unlockedBy: currentUser.email,
    });

    // Refresh albums display
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error unlocking album:", error);
    await showCustomAlert(`Failed to unlock album: ${error.message}`, "Error");
  }
}

// Navigate to previous or next month
function navigateMonth(direction) {
  currentDate.setMonth(currentDate.getMonth() + direction);
  updateDisplay();
}

// Join current month's discussion
async function joinDiscussion() {
  console.log("joinDiscussion called");

  if (!currentUser) {
    console.error("Join failed: No current user");
    await showCustomAlert("Please sign in first!");
    return;
  }

  if (!db) {
    console.error("Join failed: Database not initialized");
    await showCustomAlert("Database not initialized. Please refresh the page.");
    return;
  }

  const monthKey = getMonthKey();
  console.log(
    "Joining discussion for month:",
    monthKey,
    "User:",
    currentUser.email,
  );

  try {
    console.log("Checking if user is already a participant...");
    // Check if user is already a participant in Firestore
    const participantRef = db
      .collection("participants")
      .doc(`${monthKey}_${currentUser.email}`);
    const doc = await participantRef.get();

    if (doc.exists && !doc.data().left) {
      console.warn("User already participating");
      await showCustomAlert("You are already participating in this month!");
      return;
    }

    console.log("Adding user as participant...");
    // Add user as participant to Firestore (or rejoin if they left)
    await participantRef.set({
      monthKey: monthKey,
      name: currentUser.name,
      email: currentUser.email,
      picture: currentUser.picture,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      left: false,
    });
    console.log("User added to participants successfully");

    // Refresh display to show updated participants
    console.log("Reloading participants...");
    await loadParticipants(monthKey);

    // Reload albums to update the add album button
    console.log("Reloading albums...");
    await loadAlbums(monthKey);

    console.log("Join discussion completed successfully");
    await showCustomAlert("You have joined the discussion!", "Success");
  } catch (error) {
    console.error("Error joining discussion:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    await showCustomAlert(
      "Failed to join discussion. Please try again.",
      "Error",
    );
  }
}

// Leave discussion
async function leaveDiscussion() {
  if (!currentUser) {
    await showCustomAlert("Please sign in first!");
    return;
  }

  if (!db) {
    await showCustomAlert("Database not initialized. Please refresh the page.");
    return;
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    // Check if user has added an album
    const albumsSnapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .where("addedBy", "==", currentUser.email)
      .get();

    if (!albumsSnapshot.empty) {
      await showCustomAlert(
        "You must delete your album before leaving the discussion.",
      );
      return;
    }

    // Show confirmation modal
    const modal = document.getElementById("leaveDiscussionModal");
    modal.classList.remove("hidden");
  } catch (error) {
    console.error("Error checking albums:", error);
    await showCustomAlert("Failed to check albums. Please try again.", "Error");
  }
}

// Confirm leaving discussion
async function confirmLeaveDiscussion() {
  const modal = document.getElementById("leaveDiscussionModal");
  modal.classList.add("hidden");

  const monthKey = getMonthKey(currentDate);

  try {
    const participantRef = db
      .collection("participants")
      .doc(`${monthKey}_${currentUser.email}`);

    // Mark participant as left instead of deleting
    await participantRef.update({
      left: true,
      leftAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Reload data first, then show success message
    await loadParticipants(monthKey);
    await loadAlbums(monthKey);
    await showCustomAlert(
      "You have left the discussion successfully.",
      "Success",
    );
  } catch (error) {
    console.error("Error leaving discussion:", error);
    await showCustomAlert(
      "Failed to leave discussion. Please try again.",
      "Error",
    );
  }
}

// Remove participant (moderator only)
async function removeParticipant(participantEmail, participantName) {
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can remove participants.");
    return;
  }

  const firstName = participantName.split(" ")[0];
  const confirmed = await showCustomConfirm(
    `Are you sure you want to remove ${firstName} from this discussion?`,
    "Remove Participant",
  );
  if (!confirmed) {
    return;
  }

  const monthKey = getMonthKey(currentDate);

  try {
    const participantRef = db
      .collection("participants")
      .doc(`${monthKey}_${participantEmail}`);

    // Mark participant as left (same as voluntary leaving)
    await participantRef.update({
      left: true,
      leftAt: firebase.firestore.FieldValue.serverTimestamp(),
      removedByModerator: true,
    });

    await loadParticipants(monthKey);
    await loadAlbums(monthKey);
    await showCustomAlert(
      `${firstName} has been removed from the discussion.`,
      "Success",
    );
  } catch (error) {
    console.error("Error removing participant:", error);
    await showCustomAlert(
      "Failed to remove participant. Please try again.",
      "Error",
    );
  }
}

// Remove all participants (moderator only)
async function removeAllParticipants() {
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can remove all participants.");
    return;
  }

  const monthKey = getMonthKey(currentDate);
  const participants = window.currentParticipants || [];

  if (participants.length === 0) {
    await showCustomAlert(
      "There are no participants to remove.",
      "No Participants",
    );
    return;
  }

  const confirmed = await showCustomConfirm(
    `Are you sure you want to remove all ${participants.length} participant(s) from this month's discussion? This action cannot be undone.`,
    "Remove All Participants",
  );
  if (!confirmed) {
    return;
  }

  try {
    const batch = db.batch();
    let removedCount = 0;

    for (const participant of participants) {
      const participantRef = db
        .collection("participants")
        .doc(`${monthKey}_${participant.email}`);

      batch.update(participantRef, {
        left: true,
        leftAt: firebase.firestore.FieldValue.serverTimestamp(),
        removedByModerator: true,
      });
      removedCount++;
    }

    await batch.commit();

    await loadParticipants(monthKey);
    await loadAlbums(monthKey);
    await showCustomAlert(
      `Successfully removed ${removedCount} participant(s) from the discussion.`,
      "Success",
    );
  } catch (error) {
    console.error("Error removing all participants:", error);
    await showCustomAlert(
      "Failed to remove participants. Please try again.",
      "Error",
    );
  }
}

// Close leave discussion modal
function closeLeaveDiscussionModal() {
  const modal = document.getElementById("leaveDiscussionModal");
  modal.classList.add("hidden");
}

// Update the display with current month data
async function updateDisplay() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = getMonthKey();

  // Update month/year display
  document.getElementById("currentMonth").textContent = monthNames[month];
  document.getElementById("currentYear").textContent = year;

  // Load participants from Firebase
  await loadParticipants(monthKey);

  // Load albums from Firebase
  await loadAlbums(monthKey);
}

// Load participants from Firebase
async function loadParticipants(monthKey) {
  if (!db) {
    updateParticipants([]);
    return;
  }

  try {
    const snapshot = await db
      .collection("participants")
      .where("monthKey", "==", monthKey)
      .get();

    const participants = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Only include participants who haven't left
      if (!data.left) {
        participants.push({
          name: data.name,
          email: data.email,
          picture: data.picture,
          joinedAt: data.joinedAt,
        });
      }
    });

    // Sort participants by join time (client-side sorting)
    participants.sort((a, b) => {
      if (!a.joinedAt || !b.joinedAt) return 0;
      const timeA = a.joinedAt.toMillis
        ? a.joinedAt.toMillis()
        : new Date(a.joinedAt).getTime();
      const timeB = b.joinedAt.toMillis
        ? b.joinedAt.toMillis()
        : new Date(b.joinedAt).getTime();
      return timeA - timeB;
    });

    // Update join button state
    updateJoinButton(participants);

    // Update participants display
    updateParticipants(participants);

    // Store participants globally for add button check
    window.currentParticipants = participants;
  } catch (error) {
    console.error("Error loading participants:", error);
    updateParticipants([]);
    window.currentParticipants = [];
  }
}

// Toggle track rating visibility (per-track, like notes)
function toggleTrackRatingVisibility() {
  try {
    const toggle = document.getElementById("trackRatingVisibilityToggle");
    const label = document.getElementById("trackRatingVisibilityLabel");
    if (!toggle || toggle.disabled) return;

    toggle.classList.toggle("private");
    const isPrivate = toggle.classList.contains("private");
    toggle.setAttribute("aria-pressed", isPrivate ? "false" : "true");

    if (label) {
      label.textContent = isPrivate
        ? "This rating is visible only to you"
        : "This rating is visible to others";
      if (isPrivate) {
        label.classList.remove("visible-others");
      } else {
        label.classList.add("visible-others");
      }
    }
  } catch (e) {
    console.error("Error in toggleTrackRatingVisibility:", e);
  }
}

// Toggle album rating visibility (per-album, like notes)
function toggleAlbumRatingVisibility() {
  try {
    const toggle = document.getElementById("albumRatingVisibilityToggle");
    const label = document.getElementById("albumRatingVisibilityLabel");
    if (!toggle || toggle.disabled) return;

    toggle.classList.toggle("private");
    const isPrivate = toggle.classList.contains("private");
    toggle.setAttribute("aria-pressed", isPrivate ? "false" : "true");

    if (label) {
      label.textContent = isPrivate
        ? "This rating is visible only to you"
        : "This rating is visible to others";
      if (isPrivate) {
        label.classList.remove("visible-others");
      } else {
        label.classList.add("visible-others");
      }
    }
  } catch (e) {
    console.error("Error in toggleAlbumRatingVisibility:", e);
  }
}

// Update add album button based on whether user has added an album and is a participant
function updateAddAlbumButton(albums) {
  const addBtn = document.getElementById("addAlbumBtn");
  const migrateBtn = document.getElementById("migrateTracksBtn");

  if (!addBtn) return;

  if (!currentUser) {
    addBtn.style.display = "none";
    if (migrateBtn) migrateBtn.style.display = "none";
    return;
  }

  // Show migration button only for moderators
  const userIsModerator = isModerator(currentUser.email);
  if (migrateBtn) {
    migrateBtn.style.display = userIsModerator ? "inline-block" : "none";
  }

  // Check if user is a participant this month
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);

  if (!isParticipant) {
    addBtn.style.display = "none";
    return;
  }

  const userAlbum = albums.find((a) => a.addedBy === currentUser.email);

  if (userAlbum) {
    addBtn.style.display = "none";
  } else {
    addBtn.style.display = "inline-block";
    addBtn.textContent = "+ Add Your Album";
  }

  // Show Vote Best Album button if there are albums and participants
  updateVoteBestAlbumButton();
}

// Delete album from Firebase
async function deleteAlbum(albumId) {
  console.log("deleteAlbum called with ID:", albumId);

  if (!db || !currentUser) {
    console.error("Delete failed: db or currentUser not available", {
      db: !!db,
      currentUser: !!currentUser,
    });
    await showCustomAlert("Unable to delete album. Please try again.", "Error");
    return;
  }

  try {
    console.log("Fetching album document...");
    // Get album data
    const albumDoc = await db.collection("albums").doc(albumId).get();
    if (!albumDoc.exists) {
      console.error("Album not found:", albumId);
      await showCustomAlert("Album not found.");
      return;
    }

    const albumData = albumDoc.data();
    console.log("Album data:", albumData);
    const isOwnAlbum = albumData.addedBy === currentUser.email;
    const userIsModerator = isModerator(currentUser.email);
    console.log("Permissions check:", {
      isOwnAlbum,
      userIsModerator,
      locked: albumData.locked,
    });

    // Check if album is locked and user is not a moderator
    if (albumData.locked && !userIsModerator) {
      console.warn("Delete blocked: Album is locked");
      await showCustomAlert(
        "This album is locked. Only a moderator can delete it.",
      );
      return;
    }

    // Non-moderators can only delete their own albums
    if (!isOwnAlbum && !userIsModerator) {
      console.warn("Delete blocked: Not own album and not moderator");
      await showCustomAlert("You can only delete your own albums.");
      return;
    }

    const confirmMessage =
      userIsModerator && !isOwnAlbum
        ? `Are you sure you want to delete this album by ${
            albumData.addedByName || "another user"
          }?`
        : "Are you sure you want to delete your album?";

    console.log("Showing confirmation dialog...");
    const confirmed = await showCustomConfirm(confirmMessage, "Delete Album");
    console.log("User confirmation:", confirmed);

    if (!confirmed) {
      console.log("Delete cancelled by user");
      return;
    }

    console.log("Deleting album from Firestore...");
    // Delete the album
    await db.collection("albums").doc(albumId).delete();
    console.log("Album deleted successfully:", albumId);

    // Refresh albums display
    const monthKey = getMonthKey();
    console.log("Reloading albums for month:", monthKey);
    await loadAlbums(monthKey);

    await showCustomAlert("Album deleted successfully!", "Success");
  } catch (error) {
    console.error("Error deleting album:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    await showCustomAlert(`Failed to delete album: ${error.message}`, "Error");
  }
}

// Show modal to add album
async function showAddAlbumModal() {
  if (!currentUser) {
    await showCustomAlert("Please sign in first!");
    return;
  }

  // Generate current month key
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Check if user is a participant this month
  const snapshot = await db
    .collection("participants")
    .where("monthKey", "==", monthKey)
    .where("email", "==", currentUser.email)
    .get();

  if (snapshot.empty) {
    await showCustomAlert(
      "You must join this month's discussion before adding an album!",
    );
    return;
  }

  // Show the modal
  const modal = document.getElementById("addAlbumModal");
  const input = document.getElementById("albumLinkInput");
  modal.classList.remove("hidden");
  input.value = "";
  input.focus();
}

// Process album addition from modal
async function processAddAlbum() {
  const input = document.getElementById("albumLinkInput");
  const userLink = input.value.trim();

  if (!userLink) {
    await showCustomAlert("Please enter a YouTube Music link");
    return;
  }

  // Extract playlist ID from the link
  const playlistIdMatch = userLink.match(/[?&]list=([^&]+)/);

  if (!playlistIdMatch) {
    await showCustomAlert(
      "Invalid YouTube Music link. Please make sure it contains a playlist ID.",
    );
    return;
  }

  const playlistId = playlistIdMatch[1];

  // Close modal
  document.getElementById("addAlbumModal").classList.add("hidden");

  try {
    if (YOUTUBE_API_KEY === "YOUR_YOUTUBE_API_KEY_HERE") {
      // If no API key, ask for manual title and artist
      const title = prompt("Enter album title:");
      if (!title || title.trim() === "") return;

      const artist = prompt("Enter artist name:");
      if (!artist || artist.trim() === "") return;

      await addAlbum(title.trim(), artist.trim(), "", userLink);
      return;
    }

    // Fetch the playlist to get title, artist, and cover art
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch album details from YouTube");
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      await showCustomAlert(
        "Could not find album information. Please try again.",
      );
      return;
    }

    const playlist = data.items[0];
    const rawTitle = playlist.snippet.title;
    const title = sanitizeAlbumTitle(rawTitle);
    const artist = playlist.snippet.channelTitle.replace(" - Topic", ""); // Remove "- Topic" from artist name

    let thumbnail =
      playlist.snippet.thumbnails.maxres?.url ||
      playlist.snippet.thumbnails.standard?.url ||
      playlist.snippet.thumbnails.high?.url ||
      playlist.snippet.thumbnails.medium?.url ||
      "";

    // Convert to higher resolution if possible
    if (thumbnail) {
      thumbnail = thumbnail.replace(/=w\d+-h\d+/, "=w544-h544-l90-rj");
    }

    // Fetch playlist tracks
    const { tracks, trackArtist } = await fetchPlaylistTracks(playlistId);

    // Use track artist as fallback if playlist channelTitle is just "YouTube"
    const finalArtist = sanitizeArtist(artist) ? artist : trackArtist || artist;

    await addAlbum(title, finalArtist, thumbnail, userLink, playlistId, tracks);
  } catch (error) {
    console.error("Error fetching album details:", error);
    await showCustomAlert(
      `Failed to fetch album information: ${error.message}\n\nPlease enter details manually.`,
      "Error",
    );

    // Fallback to manual entry
    const title = prompt("Enter album title:");
    if (!title || title.trim() === "") return;

    const artist = prompt("Enter artist name:");
    if (!artist || artist.trim() === "") return;

    await addAlbum(title.trim(), artist.trim(), "", userLink);
  }
}

// Sanitize playlist/album titles coming from YouTube
function sanitizeAlbumTitle(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();

  // Remove common leading prefixes like "Album -", "Album:", "Album —"
  s = s.replace(/^Album\s*[:\-—–]\s*/i, "");

  // Remove trailing "- YouTube" or "— YouTube" variants
  s = s.replace(/\s*[-—–]\s*YouTube( Music)?$/i, "");

  // Some titles include a trailing " - Topic" or similar; remove if present
  s = s.replace(/\s*[-—–]\s*Topic$/i, "");

  return s.trim();
}

// Sanitize artist/channel names for display (remove "YouTube"/"YouTube Music" etc.)
function sanitizeArtist(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();

  // Remove "- Topic" suffix
  s = s.replace(/\s*[-—–]\s*Topic$/i, "");

  // Remove trailing "- YouTube" or "— YouTube Music" variants
  s = s.replace(/\s*[-—–]\s*YouTube( Music)?$/i, "");

  // If the whole artist is just "YouTube" or "YouTube Music", clear it
  if (/^YouTube( Music)?$/i.test(s)) s = "";

  return s.trim();
}

// Migration: sanitize and persist artist fields for existing albums
// Usage (from browser console):
//   await window.migrateSanitizeArtists({dryRun: true}); // just preview
//   await window.migrateSanitizeArtists({dryRun: false}); // perform updates
async function migrateSanitizeArtists(options = {}) {
  const { dryRun = false, batchSize = 400 } = options;
  if (!db) {
    console.error("Firestore `db` not available. Initialize auth first.");
    return { ok: false, reason: "no-db" };
  }

  if (!confirm(`Run artist sanitize migration? dryRun=${!!dryRun}`)) {
    console.log("Migration cancelled by user");
    return { ok: false, reason: "cancelled" };
  }

  const snapshot = await db.collection("albums").get();
  if (!snapshot || snapshot.empty) {
    console.log("No albums found to migrate.");
    return { ok: true, migrated: 0 };
  }

  let total = 0;
  let toUpdate = [];

  for (const doc of snapshot.docs) {
    total++;
    const data = doc.data() || {};
    const raw = data.artist || "";
    const sanitized = sanitizeArtist(raw);

    // If sanitized empty or same as raw, skip (we only persist a cleaned non-empty value)
    if (!sanitized || sanitized === raw) continue;

    // prepare update: preserve original in artistRaw if not present
    const updates = { artist: sanitized };
    if (!data.artistRaw) updates.artistRaw = raw;

    toUpdate.push({ id: doc.id, updates });
  }

  console.log(
    `Albums scanned: ${total}, candidates to update: ${toUpdate.length}`,
  );

  if (dryRun)
    return { ok: true, dryRun: true, total, candidates: toUpdate.length };

  // Commit in batches
  let committed = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const u of toUpdate) {
    const ref = db.collection("albums").doc(u.id);
    batch.update(ref, u.updates);
    batchCount++;

    if (batchCount >= batchSize) {
      await batch.commit();
      committed += batchCount;
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    committed += batchCount;
  }

  console.log(`Migration complete. Documents updated: ${committed}`);
  return { ok: true, migrated: committed };
}

// Migration: re-fetch artist names from YouTube API for albums with missing artist
// Usage (from browser console):
//   await window.migrateRefetchArtists();
async function migrateRefetchArtists() {
  if (!db) {
    console.error("Firestore `db` not available.");
    return;
  }
  if (
    !confirm(
      "Re-fetch artist names using oEmbed (no API key needed) for ALL albums?",
    )
  )
    return;

  const snapshot = await db.collection("albums").get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const album = doc.data();
    const currentArtist = album.artist || "";
    const sanitized = sanitizeArtist(currentArtist);
    console.log(
      `Album: "${album.title}" | raw artist: "${currentArtist}" | sanitized: "${sanitized}"`,
    );

    // Get a videoId from stored tracks
    const tracks = album.tracks || [];
    const videoId = tracks.length > 0 ? tracks[0].videoId : null;

    if (!videoId) {
      console.log(`  → Skipped (no tracks/videoId)`);
      skipped++;
      continue;
    }

    try {
      // Use YouTube oEmbed API — no API key or referrer restriction
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const resp = await fetch(oembedUrl);
      if (!resp.ok) {
        console.log(`  → oEmbed failed (${resp.status})`);
        skipped++;
        continue;
      }
      const oembedData = await resp.json();
      const authorName = oembedData.author_name || "";
      console.log(`  → oEmbed author_name: "${authorName}"`);

      // Clean up: remove "- Topic" suffix
      let foundArtist = authorName.replace(/\s*[-—–]\s*Topic$/i, "").trim();
      if (/^YouTube( Music)?$/i.test(foundArtist)) foundArtist = "";

      if (foundArtist && foundArtist !== sanitized) {
        await db
          .collection("albums")
          .doc(doc.id)
          .update({ artist: foundArtist });
        console.log(`  → Updated: "${foundArtist}"`);
        updated++;
      } else {
        console.log(`  → No better artist found (got: "${foundArtist}")`);
        skipped++;
      }
    } catch (e) {
      console.error(`  → Error for "${album.title}":`, e);
      skipped++;
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
  alert(`Artist migration complete. Updated: ${updated}, Skipped: ${skipped}`);
}
window.migrateRefetchArtists = migrateRefetchArtists;

// Expose to console for manual invocation
window.migrateSanitizeArtists = migrateSanitizeArtists;

// Fetch playlist tracks from YouTube API
async function fetchPlaylistTracks(playlistId) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${YOUTUBE_API_KEY}`,
    );

    if (!response.ok) {
      console.error("Failed to fetch playlist tracks");
      return { tracks: [], trackArtist: "" };
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return { tracks: [], trackArtist: "" };
    }

    // Extract track titles from playlist items
    const tracks = data.items.map((item, index) => ({
      position: index + 1,
      title: item.snippet.title,
      videoId: item.snippet.resourceId.videoId,
    }));

    // Extract artist from first track's videoOwnerChannelTitle (fallback for artist)
    let trackArtist = "";
    if (data.items.length > 0 && data.items[0].snippet.videoOwnerChannelTitle) {
      trackArtist = data.items[0].snippet.videoOwnerChannelTitle
        .replace(/\s*[-—–]\s*Topic$/i, "")
        .trim();
      if (/^YouTube( Music)?$/i.test(trackArtist)) trackArtist = "";
    }

    // If still no artist, try fetching the first video's details as fallback
    if (!trackArtist && tracks.length > 0 && tracks[0].videoId) {
      try {
        const videoResp = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${tracks[0].videoId}&key=${YOUTUBE_API_KEY}`,
        );
        if (videoResp.ok) {
          const videoData = await videoResp.json();
          if (videoData.items && videoData.items.length > 0) {
            const channelTitle = videoData.items[0].snippet.channelTitle || "";
            trackArtist = channelTitle.replace(/\s*[-—–]\s*Topic$/i, "").trim();
            if (/^YouTube( Music)?$/i.test(trackArtist)) trackArtist = "";
          }
        }
      } catch (e) {
        console.warn("Failed to fetch video details for artist:", e);
      }
    }

    return { tracks, trackArtist };
  } catch (error) {
    console.error("Error fetching playlist tracks:", error);
    return { tracks: [], trackArtist: "" };
  }
}

// Add album to Firebase
async function addAlbum(
  title,
  artist,
  coverUrl,
  youtubeUrl = "",
  playlistId = "",
  tracks = [],
) {
  if (!db || !currentUser) {
    await showCustomAlert("Unable to add album. Please try again.");
    return;
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  try {
    // Check if user already added an album this month
    const existingAlbum = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .where("addedBy", "==", currentUser.email)
      .get();

    if (!existingAlbum.empty) {
      await showCustomAlert("You have already added an album for this month!");
      return;
    }

    // Add the album
    console.log("Adding album:", {
      title,
      artist,
      coverUrl,
      youtubeUrl,
      playlistId,
      tracks,
      monthKey,
    });

    await db.collection("albums").add({
      monthKey: monthKey,
      title: title,
      artist: artist,
      coverUrl: coverUrl || "",
      youtubeUrl: youtubeUrl || "",
      playlistId: playlistId || "",
      tracks: tracks || [],
      addedBy: currentUser.email,
      addedByName: currentUser.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("Album added successfully");

    // Refresh albums display
    await loadAlbums(monthKey);
  } catch (error) {
    console.error("Error adding album:", error);
    console.error("Error details:", error.message, error.code);
    await showCustomAlert(
      `Failed to add album: ${error.message}\n\nPlease check the browser console for details.`,
      "Error",
    );
  }
}

// Update join button based on participation status
function updateJoinButton(participants) {
  const joinBtn = document.getElementById("joinDiscussionBtn");
  const leaveBtn = document.getElementById("leaveDiscussionBtn");
  if (!joinBtn) return;

  const isParticipating =
    currentUser && participants.some((p) => p.email === currentUser.email);

  if (isParticipating) {
    joinBtn.style.display = "none";
    if (leaveBtn) leaveBtn.style.display = "inline-block";
  } else {
    joinBtn.style.display = "inline-block";
    joinBtn.textContent = "+ Join This Month's Discussion";
    joinBtn.classList.remove("joined");
    joinBtn.disabled = false;
    if (leaveBtn) leaveBtn.style.display = "none";
  }
}

// Update participants list
function updateParticipants(participants) {
  const participantsList = document.getElementById("participantsList");
  // Clear existing content
  participantsList.innerHTML = "";

  if (participants.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.color = "#666";
    emptyMsg.textContent = "No participants yet. Be the first!";
    participantsList.appendChild(emptyMsg);
    return;
  }

  // Use cached participant colors
  const participantColors = PARTICIPANT_COLORS;

  // Create elements safely to prevent XSS
  participants.forEach((participant, index) => {
    const div = document.createElement("div");
    div.className = "participant";

    // Add email as data attribute for highlighting
    div.dataset.email = participant.email;

    // Assign color based on index
    const colorIndex = index % participantColors.length;
    div.dataset.colorIndex = colorIndex;

    // Apply participant's color to their avatar border
    const color = participantColors[colorIndex];
    div.style.setProperty("--participant-border", color.border);
    div.style.setProperty("--participant-shadow", color.shadow);

    // If participant has avatar (new format), show it
    if (participant.picture) {
      div.classList.add("has-avatar");

      // Container for avatar
      const avatarContainer = document.createElement("div");
      avatarContainer.style.position = "relative";
      avatarContainer.style.display = "inline-block";

      const avatar = document.createElement("img");
      avatar.className = "participant-avatar";
      avatar.src = participant.picture;
      avatar.alt = participant.name;

      // Fallback to random animal emoji if image fails to load
      avatar.onerror = () => {
        const emoji = getAnimalEmojiForUser(participant.email);
        const emojiSpan = document.createElement("div");
        emojiSpan.className = "participant-avatar";
        emojiSpan.textContent = emoji;
        emojiSpan.style.fontSize = "40px";
        emojiSpan.style.display = "flex";
        emojiSpan.style.alignItems = "center";
        emojiSpan.style.justifyContent = "center";
        emojiSpan.style.width = "50px";
        emojiSpan.style.height = "50px";
        emojiSpan.style.borderRadius = "50%";
        avatar.replaceWith(emojiSpan);
      };

      avatarContainer.appendChild(avatar);

      div.appendChild(avatarContainer);

      const nameSpan = document.createElement("span");
      nameSpan.className = "participant-name";
      // Show only first name
      const firstName = participant.name.split(" ")[0];
      nameSpan.textContent = firstName;
      div.appendChild(nameSpan);
    } else {
      // Old format - just text
      div.textContent = participant;
    }

    // Add moderator remove button (if current user is moderator and it's not their own participant card)
    if (
      currentUser &&
      isModerator(currentUser.email) &&
      participant.email !== currentUser.email
    ) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "participant-remove-btn";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove participant";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeParticipant(participant.email, participant.name);
      };
      div.appendChild(removeBtn);
    }

    // Add click event: on mobile scroll to that participant's album, on desktop toggle highlight
    div.addEventListener("click", () => {
      try {
        const isMobile = window.matchMedia("(max-width: 640px)").matches;
        if (isMobile) {
          scrollToAlbumByEmail(participant.email);
        } else {
          toggleHighlightAlbum(participant.email);
        }
      } catch (e) {
        // fallback to highlight
        toggleHighlightAlbum(participant.email);
      }
    });

    participantsList.appendChild(div);
  });
}

// Update albums grid
function updateAlbums(albums) {
  const albumsGrid = document.getElementById("albumsGrid");

  // Clear existing content
  albumsGrid.innerHTML = "";

  if (albums.length === 0) {
    const p = document.createElement("p");
    p.style.textAlign = "center";
    p.style.gridColumn = "1/-1";
    p.style.color = "#666";
    p.textContent =
      "No albums added yet. Join the discussion and be the first!";
    albumsGrid.appendChild(p);
    return;
  }

  // Sort albums by creation date (oldest first)
  const sortedAlbums = [...albums].sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return a.createdAt.toMillis() - b.createdAt.toMillis();
  });

  // Use cached album cover gradients
  const gradients = ALBUM_GRADIENTS;

  // Compute album rankings if voting has ended (all revealed)
  let albumRankMap = null; // albumId -> rank (1-based)
  const _participants = window.currentParticipants || [];
  if (_participants.length >= 2 && sortedAlbums.length >= 2) {
    const _allVoted = sortedAlbums.every((album) => {
      const ar = album.albumRatings || {};
      return _participants.every((p) => ar[p.email] !== undefined);
    });
    const _allRevealed =
      _allVoted &&
      sortedAlbums.every((album) => {
        const vm = album.albumRatingsVisible || {};
        return _participants.every((p) => vm[p.email] === true);
      });
    if (_allRevealed) {
      const ranked = sortedAlbums
        .map((album) => {
          const ar = album.albumRatings || {};
          const scores = _participants
            .map((p) => ar[p.email])
            .filter((v) => v !== undefined);
          const mean =
            scores.length > 0
              ? scores.reduce((a, b) => a + b, 0) / scores.length
              : 0;
          return { id: album.id, mean };
        })
        .sort((a, b) => b.mean - a.mean);
      albumRankMap = {};
      ranked.forEach((r, i) => {
        albumRankMap[r.id] = i + 1;
      });
    }
  }

  // Create elements safely to prevent XSS
  sortedAlbums.forEach((album, index) => {
    // Create wrapper for album card + tracks
    const albumWrapper = document.createElement("div");
    albumWrapper.className = "album-wrapper";

    const card = document.createElement("div");
    card.className = "album-card";

    // Add data attribute for the person who added it
    card.dataset.addedBy = album.addedBy;

    // Assign color based on participant
    const participant = document.querySelector(
      `.participant[data-email="${album.addedBy}"]`,
    );
    const colorIndex = participant?.dataset.colorIndex || 0;
    const colors = getParticipantColors();
    const color = colors[colorIndex % colors.length];

    // Apply the participant's color to the album border
    card.style.setProperty("--album-border", color.border);
    card.style.setProperty("--album-shadow", color.shadow);

    // Highlight user's own album with special class (but still use their color)
    const isUserAlbum = currentUser && album.addedBy === currentUser.email;
    if (isUserAlbum) {
      card.classList.add("user-album");
    }

    // Make card clickable if YouTube URL exists
    if (album.youtubeUrl) {
      card.style.cursor = "pointer";
      card.addEventListener("click", (e) => {
        // Don't open link if clicking delete button
        if (!e.target.classList.contains("delete-album-btn")) {
          window.open(album.youtubeUrl, "_blank");
        }
      });
    }

    // Add hover listeners to highlight participant
    card.addEventListener("mouseenter", () => {
      card.classList.add("album-hover");
      highlightParticipant(album.addedBy);
    });

    card.addEventListener("mouseleave", () => {
      card.classList.remove("album-hover");
      unhighlightParticipant(album.addedBy);
    });

    const cover = document.createElement("div");
    cover.className = "album-cover";

    // Use cover image if provided, otherwise use gradient
    if (album.coverUrl) {
      console.log("Loading cover:", album.coverUrl);
      const img = document.createElement("img");
      img.src = album.coverUrl;
      const _artistAlt = sanitizeArtist(album.artist);
      // Decide whether to fallback to raw artist: only if raw isn't a YouTube token
      const rawArtist = album.artist ? album.artist.trim() : "";
      const rawIsOnlyYouTube = /^YouTube( Music)?$/i.test(rawArtist);
      const artistForAlt =
        _artistAlt || (!rawIsOnlyYouTube && rawArtist ? rawArtist : "");
      img.alt =
        sanitizeAlbumTitle(album.title) +
        (artistForAlt ? ` by ${artistForAlt}` : "");
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.onerror = () => {
        try {
          console.warn("Failed to load image (attempting fallbacks):", img.src);
          // Attempt progressive YouTube thumbnail fallbacks if applicable
          const fallbackOrder = [
            "maxresdefault",
            "sddefault",
            "hqdefault",
            "mqdefault",
            "default",
          ];
          const src = img.src || "";
          let attempted = parseInt(img.dataset.thumbAttempts || "0", 10);

          // find which token is currently in the src
          let replaced = false;
          for (let i = 0; i < fallbackOrder.length; i++) {
            const token = fallbackOrder[i];
            if (src.includes(token)) {
              const nextIndex = Math.min(
                i + 1 + attempted,
                fallbackOrder.length - 1,
              );
              const nextToken = fallbackOrder[nextIndex];
              if (nextToken && nextToken !== token) {
                const newSrc = src.replace(token, nextToken);
                img.dataset.thumbAttempts = String(attempted + 1);
                img.src = newSrc;
                replaced = true;
                break;
              }
            }
          }

          if (!replaced) {
            // If no recognizable token or we've exhausted fallbacks, try constructing a video-based thumbnail
            const triedVideo = img.dataset.triedVideo === "1";
            const firstVideoId =
              (album &&
                album.tracks &&
                album.tracks[0] &&
                album.tracks[0].videoId) ||
              null;
            if (!triedVideo && firstVideoId) {
              img.dataset.triedVideo = "1";
              const videoUrl = `https://i.ytimg.com/vi/${firstVideoId}/hqdefault.jpg`;
              console.log("Trying video-based thumbnail:", videoUrl);
              img.src = videoUrl;
              replaced = true;
            } else {
              // Final fallback: show vinyl record emoji
              const vinylEmoji = document.createElement("div");
              vinylEmoji.textContent = "💿";
              vinylEmoji.style.fontSize = "100px";
              vinylEmoji.style.display = "flex";
              vinylEmoji.style.alignItems = "center";
              vinylEmoji.style.justifyContent = "center";
              vinylEmoji.style.width = "100%";
              vinylEmoji.style.height = "100%";
              vinylEmoji.style.background = gradients[index % gradients.length];
              img.replaceWith(vinylEmoji);
              setTimeout(() => {
                if (typeof clampAlbumTitles === "function") clampAlbumTitles();
                if (typeof equalizeAlbumTitleHeights === "function")
                  equalizeAlbumTitleHeights();
              }, 80);
            }
          }
        } catch (e) {
          console.error("Error in img.onerror fallback:", e);
        }
      };
      cover.appendChild(img);
      img.addEventListener("load", () => {
        setTimeout(() => {
          if (typeof clampAlbumTitles === "function") clampAlbumTitles();
          if (typeof equalizeAlbumTitleHeights === "function")
            equalizeAlbumTitleHeights();
        }, 80);
      });
    } else {
      console.log("No cover URL, using gradient");
      cover.style.background = gradients[index % gradients.length];
    }

    const info = document.createElement("div");
    info.className = "album-info";

    const _artistText = sanitizeArtist(album.artist);
    const rawArtistText = album.artist ? album.artist.trim() : "";
    const rawIsOnlyYouTube2 = /^YouTube( Music)?$/i.test(rawArtistText);
    const artistDisplay =
      _artistText || (!rawIsOnlyYouTube2 && rawArtistText ? rawArtistText : "");

    const title = document.createElement("h3");
    const albumTitle = sanitizeAlbumTitle(album.title);
    title.textContent = artistDisplay
      ? `${artistDisplay} - ${albumTitle}`
      : albumTitle;

    info.appendChild(title);

    // Compute album rating entries (used for overlay below)
    const albumRatings = album.albumRatings || {};
    const albumRatingsVisMap = album.albumRatingsVisible || {};
    // For past months, show all ratings (visibility only matters for current month)
    const now = new Date();
    const realMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const viewedMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
    const isPastMonth = viewedMonthKey < realMonthKey;
    console.log(
      `Album "${album.title}" viewed=${viewedMonthKey} real=${realMonthKey} isPast=${isPastMonth} albumRatings=`,
      albumRatings,
      "visMap=",
      albumRatingsVisMap,
    );
    const ratingEntries = Object.entries(albumRatings).filter(([email]) => {
      if (email === currentUser?.email) return true;
      if (isPastMonth) return true;
      return albumRatingsVisMap[email] === true;
    });
    const ratingValues = ratingEntries.map(([, v]) => v);

    // Individual ratings bar above track list
    let ratingsOverlay = null;
    if (ratingEntries.length > 0) {
      ratingsOverlay = document.createElement("div");
      ratingsOverlay.className = "album-ratings-overlay";

      // Add rank badge if voting has ended
      if (albumRankMap && albumRankMap[album.id]) {
        const rank = albumRankMap[album.id];
        if (rank <= 3) {
          const rankBadge = document.createElement("div");
          rankBadge.className = "album-rank-badge rank-" + rank;
          if (rank === 1) {
            rankBadge.textContent = "🏆 #1";
          } else {
            rankBadge.textContent = "#" + rank;
          }
          ratingsOverlay.appendChild(rankBadge);
        }
      }
      const albumRatingsVisibleMap = album.albumRatingsVisible || {};
      ratingEntries.forEach(([userEmail, rating]) => {
        // Skip users who have hidden their album rating (unless it's the current user or past month)
        if (userEmail !== currentUser?.email && !isPastMonth) {
          if (albumRatingsVisibleMap[userEmail] !== true) return;
        }

        const participant = window.currentParticipants?.find(
          (p) => p.email === userEmail,
        );
        const hue = (rating / 10) * 120;
        const color = `hsl(${hue}, 80%, 55%)`;
        const item = document.createElement("div");
        item.className = "album-rating-avatar-item";

        if (participant && participant.picture) {
          const avatar = document.createElement("img");
          avatar.className = "album-rating-avatar-img";
          avatar.src = participant.picture;
          avatar.alt = participant.name || userEmail;
          avatar.title = `${participant.name || userEmail}: ${rating}`;
          avatar.onerror = () => {
            const emoji = getAnimalEmojiForUser(userEmail);
            const emojiEl = document.createElement("div");
            emojiEl.className =
              "album-rating-avatar-img album-rating-avatar-emoji";
            emojiEl.textContent = emoji;
            emojiEl.title = `${participant?.name || userEmail}: ${rating}`;
            avatar.replaceWith(emojiEl);
          };
          item.appendChild(avatar);
        } else {
          // Fallback: emoji avatar
          const emoji = getAnimalEmojiForUser(userEmail);
          const emojiEl = document.createElement("div");
          emojiEl.className =
            "album-rating-avatar-img album-rating-avatar-emoji";
          emojiEl.textContent = emoji;
          emojiEl.title = `${participant?.name || userEmail}: ${rating}`;
          item.appendChild(emojiEl);
        }

        const num = document.createElement("span");
        num.className = "album-rating-avatar-num";
        num.textContent = rating;
        num.style.color = color;
        item.appendChild(num);
        ratingsOverlay.appendChild(item);
      });
    }

    // Check if current user is a moderator
    const userIsModerator = currentUser && isModerator(currentUser.email);

    // Add buttons for user's own album OR if user is a moderator
    if (isUserAlbum || userIsModerator) {
      // Show delete button if: (album not locked) OR (user is moderator)
      if (!album.locked || userIsModerator) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-album-btn";
        deleteBtn.textContent = "✕";
        deleteBtn.title =
          userIsModerator && !isUserAlbum
            ? "Delete album (Moderator)"
            : "Delete your album";
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          console.log("Delete button clicked for album:", album.id);
          await deleteAlbum(album.id);
        });
        card.appendChild(deleteBtn);
      }

      // Only show lock and edit buttons for user's own album
      if (isUserAlbum) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "✎";
        editBtn.title = "Edit all external links";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showEditLinksModal(album.id);
        });
        card.appendChild(editBtn);

        const lockBtn = document.createElement("button");
        lockBtn.className = "lock-btn" + (album.locked ? " locked" : "");
        lockBtn.textContent = album.locked ? "🔒" : "🔓";

        // If moderator and locked, allow unlock; otherwise show lock status
        if (userIsModerator && album.locked) {
          lockBtn.title = "Unlock your album (Moderator)";
          lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showUnlockConfirmModal(album.id);
          });
        } else if (album.locked) {
          lockBtn.title = "Album is locked";
          lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showLockedInfoModal();
          });
        } else {
          lockBtn.title = "Lock your selection";
          lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showLockConfirmModal(album.id);
          });
        }
        card.appendChild(lockBtn);
      }
    }

    // Add unlock button for moderators on locked albums that aren't theirs
    if (userIsModerator && album.locked && !isUserAlbum) {
      const unlockBtn = document.createElement("button");
      unlockBtn.className = "unlock-btn";
      unlockBtn.textContent = "🔓";
      unlockBtn.title = "Unlock album (Moderator)";
      unlockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showUnlockConfirmModal(album.id);
      });
      card.appendChild(unlockBtn);
    }

    // Add lock button for moderators on unlocked albums that aren't theirs
    if (userIsModerator && !album.locked && !isUserAlbum) {
      const lockBtn = document.createElement("button");
      lockBtn.className = "lock-btn";
      lockBtn.textContent = "🔓";
      lockBtn.title = "Lock album (Moderator)";
      lockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showLockConfirmModal(album.id);
      });
      card.appendChild(lockBtn);
    }

    // Add edit button for moderators on other people's albums
    if (userIsModerator && !isUserAlbum) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✎";
      editBtn.title = "Edit external links (Moderator)";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEditLinksModal(album.id);
      });
      card.appendChild(editBtn);
    }

    // Action buttons container (shown on hover on desktop)
    const actionContainer = document.createElement("div");
    actionContainer.className = "album-action-buttons";

    // Album-level notes action
    const albumNoteBtn = document.createElement("button");
    albumNoteBtn.className = "action-btn album-note-action";
    albumNoteBtn.innerHTML = "📝";
    albumNoteBtn.title = "Album Notes";
    albumNoteBtn.setAttribute("aria-label", "Album Notes");
    albumNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showAlbumNoteModal(album.id);
    });

    // YouTube / play action
    const youtubeBtn = document.createElement("button");
    youtubeBtn.className = "action-btn album-youtube-action";
    youtubeBtn.innerHTML = "▶";
    youtubeBtn.title = "Open on YouTube Music";
    youtubeBtn.setAttribute("aria-label", "Open on YouTube Music");
    youtubeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (album.youtubeUrl) {
        window.open(album.youtubeUrl, "_blank");
      } else if (album.playlistId) {
        window.open(
          "https://music.youtube.com/playlist?list=" + album.playlistId,
          "_blank",
        );
      }
    });

    actionContainer.appendChild(albumNoteBtn);
    actionContainer.appendChild(youtubeBtn);
    card.appendChild(actionContainer);

    // Show external links circles
    if (album.externalLinks && album.externalLinks.length > 0) {
      album.externalLinks.forEach((link, linkIndex) => {
        const linkCircle = document.createElement("a");
        linkCircle.href = link.url;
        linkCircle.target = "_blank";
        linkCircle.className = "external-link-circle";
        linkCircle.title = link.name;
        linkCircle.textContent = link.name.charAt(0).toUpperCase();
        linkCircle.style.left = `${8 + linkIndex * 40}px`;
        linkCircle.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        card.appendChild(linkCircle);
      });
    }

    // Show album-level public-note indicator if any participant has a visible album note
    try {
      const notes = album.albumNotes || {};
      const visibleNotes = Object.values(notes).filter(
        (n) => n && n.visible && n.text && n.text.trim() !== "",
      );
      const publicCount = visibleNotes.length;
      if (publicCount > 0) {
        const noteIndicator = document.createElement("div");
        noteIndicator.className = "album-note-indicator";
        const titleText = `${publicCount} public note${
          publicCount > 1 ? "s" : ""
        }`;
        noteIndicator.title = titleText;
        noteIndicator.setAttribute("aria-label", titleText);

        // Build icon + superscript count
        noteIndicator.innerHTML = `
          <span class="note-icon">📝</span>
          <span class="note-count">${publicCount}</span>
        `;

        // Show preview on hover
        noteIndicator.addEventListener("mouseenter", (e) => {
          try {
            showAlbumNotePreview(album, noteIndicator);
          } catch (err) {
            console.warn("Preview show error:", err);
          }
        });

        noteIndicator.addEventListener("mouseleave", (e) => {
          try {
            hideAlbumNotePreview();
          } catch (err) {
            console.warn("Preview hide error:", err);
          }
        });

        card.appendChild(noteIndicator);
      }
    } catch (e) {
      // ignore
    }

    card.appendChild(cover);
    card.appendChild(info);

    // Add individual ratings overlay above the card (positioned absolutely)
    if (ratingsOverlay) {
      albumWrapper.appendChild(ratingsOverlay);
    }

    // Old voting system display (Jan 2026 and earlier used a 3pt/1pt pick system)
    // Show "X pts" total + vote avatars for months before February 2026
    if (
      viewedMonthKey < "2026-02" &&
      album.votes &&
      Object.keys(album.votes).length > 0
    ) {
      const totalVotes = Object.values(album.votes).reduce(
        (sum, points) => sum + points,
        0,
      );

      // Total points badge
      const voteBadge = document.createElement("div");
      voteBadge.className = "old-vote-badge";
      voteBadge.textContent = `${totalVotes} pts`;
      albumWrapper.appendChild(voteBadge);

      // Vote avatars with 🥇/🥈 indicators
      const voteAvatarsContainer = document.createElement("div");
      voteAvatarsContainer.className = "old-vote-avatars";

      Object.entries(album.votes).forEach(([voterEmail, points]) => {
        const participant = window.currentParticipants?.find(
          (p) => p.email === voterEmail,
        );
        if (!participant) return;

        // Get participant's color
        const participantElement = document.querySelector(
          `.participant[data-email="${voterEmail}"]`,
        );
        const colorIndex = participantElement?.dataset.colorIndex || 0;
        const colors = getParticipantColors();
        const participantColor = colors[colorIndex % colors.length];

        const voteAvatar = document.createElement("div");
        voteAvatar.className = "old-vote-avatar";

        // Points emoji above avatar
        const pointsEmoji = document.createElement("div");
        pointsEmoji.className = "old-vote-emoji";
        pointsEmoji.textContent = points === 3 ? "🥇" : "🥈";
        voteAvatar.appendChild(pointsEmoji);

        // Avatar image
        const avatar = document.createElement("img");
        avatar.src = participant.picture;
        avatar.alt = participant.name;
        avatar.className = "old-vote-avatar-img";
        avatar.style.border = `2px solid ${participantColor.border}`;
        avatar.title = `${participant.name}: ${points} points`;

        // Fallback to consistent animal emoji if image fails
        avatar.onerror = () => {
          const emoji = getAnimalEmojiForUser(voterEmail);
          const emojiSpan = document.createElement("div");
          emojiSpan.textContent = emoji;
          emojiSpan.className = "old-vote-avatar-img old-vote-avatar-emoji";
          emojiSpan.title = `${participant.name}: ${points} points`;
          avatar.replaceWith(emojiSpan);
        };

        voteAvatar.appendChild(avatar);
        voteAvatarsContainer.appendChild(voteAvatar);
      });

      albumWrapper.appendChild(voteAvatarsContainer);
    }

    albumWrapper.appendChild(card);

    // Add track list as separate div below the album card (inside wrapper)
    if (album.tracks && album.tracks.length > 0) {
      const tracksContainer = document.createElement("div");
      tracksContainer.className = "album-tracks";
      tracksContainer.dataset.albumId = album.id;

      album.tracks.forEach((track) => {
        const trackItem = document.createElement("div");
        trackItem.className = "track-item";

        const trackText = document.createElement("span");
        trackText.className = "track-text";
        trackText.textContent = `${track.position}. ${track.title}`;
        trackItem.appendChild(trackText);

        // Add ratings container for all users who rated this track (also hosts note indicator)
        const trackRatings = album.trackRatings || {};
        const trackKey = `${track.position}-${track.title}`;
        const ratingsContainer = document.createElement("div");
        ratingsContainer.className = "track-ratings-container";

        let hasNotes = false;

        // Check all users' ratings and notes for this track
        Object.entries(trackRatings).forEach(([userEmail, userRating]) => {
          // Skip users who have hidden their rating for this track (unless it's the current user or past month)
          if (userEmail !== currentUser?.email && !isPastMonth) {
            if (userRating.ratingsVisible?.[trackKey] !== true) return;
          }

          // Detect notes for this user on this track
          try {
            if (
              userRating.notes &&
              userRating.notes[trackKey] &&
              userRating.notes[trackKey].visible === true &&
              userRating.notes[trackKey].text &&
              userRating.notes[trackKey].text.trim() !== ""
            ) {
              hasNotes = true;
            }
          } catch (e) {
            // ignore malformed entries
          }

          // Determine what to display: old-style emoji type and/or new numeric rating
          let ratingType = null;
          let numericRating = null;

          // Check old-style ratings
          if (userRating.favorite === trackKey) {
            ratingType = "favorite";
          } else if (userRating.leastFavorite === trackKey) {
            ratingType = "least";
          } else if (userRating.liked && userRating.liked.includes(trackKey)) {
            ratingType = "liked";
          } else if (
            userRating.disliked &&
            userRating.disliked.includes(trackKey)
          ) {
            ratingType = "disliked";
          }

          // Check new numeric rating
          if (
            userRating.ratings &&
            userRating.ratings[trackKey] !== undefined
          ) {
            numericRating = userRating.ratings[trackKey];
          }

          if (ratingType || numericRating !== null) {
            // Find participant to get their picture
            const participant = window.currentParticipants?.find(
              (p) => p.email === userEmail,
            );
            if (participant) {
              // Determine if this particular user has a visible note for this track
              let userHasNote = false;
              try {
                userHasNote = !!(
                  userRating.notes &&
                  userRating.notes[trackKey] &&
                  userRating.notes[trackKey].visible === true &&
                  userRating.notes[trackKey].text &&
                  userRating.notes[trackKey].text.trim() !== ""
                );
              } catch (e) {
                userHasNote = false;
              }
              // Show old-style emoji if present
              if (ratingType) {
                addRatingIndicator(
                  ratingsContainer,
                  ratingType,
                  participant,
                  userHasNote,
                );
              }
              // Show numeric rating if present (and no emoji already shown for this user)
              if (numericRating !== null && !ratingType) {
                addRatingIndicator(
                  ratingsContainer,
                  numericRating,
                  participant,
                  userHasNote,
                );
              }
              // If both, show combined: emoji + number
              if (numericRating !== null && ratingType) {
                // Already added emoji above; append numeric to same avatar's container
                const lastChild = ratingsContainer.lastElementChild;
                if (lastChild) {
                  const ratingSpan = document.createElement("span");
                  ratingSpan.className = "track-rating-number";
                  ratingSpan.textContent = numericRating;
                  if (numericRating >= 8) {
                    ratingSpan.style.color = "#22c55e";
                  } else if (numericRating >= 5) {
                    ratingSpan.style.color = "#fbbf24";
                  } else {
                    ratingSpan.style.color = "#ef4444";
                  }
                  lastChild.appendChild(ratingSpan);
                }
              }
            }
          }
        });

        // (note indicator removed — overlay on avatars handles per-user notes)

        // If current user has a visible note for this track but hasn't rated it,
        // show their avatar with the note overlay so they see their note marker.
        try {
          if (currentUser && currentUser.email) {
            const myRating = trackRatings[currentUser.email];
            let iRated = false;
            if (myRating) {
              if (
                myRating.ratings &&
                myRating.ratings[trackKey] !== undefined
              ) {
                iRated = true;
              }
              if (
                myRating.favorite === trackKey ||
                myRating.leastFavorite === trackKey ||
                (myRating.liked && myRating.liked.includes(trackKey)) ||
                (myRating.disliked && myRating.disliked.includes(trackKey))
              ) {
                iRated = true;
              }
            }

            // Check if current user's note is visible
            let myHasVisibleNote = false;
            if (
              myRating &&
              myRating.notes &&
              myRating.notes[trackKey] &&
              myRating.notes[trackKey].visible === true &&
              myRating.notes[trackKey].text &&
              myRating.notes[trackKey].text.trim() !== ""
            ) {
              myHasVisibleNote = true;
            }

            if (myHasVisibleNote && !iRated) {
              // find participant info for current user
              const me = window.currentParticipants?.find(
                (p) => p.email === currentUser.email,
              );
              if (me) {
                addRatingIndicator(ratingsContainer, null, me, true);
              }
            }
          }
        } catch (e) {
          /* ignore */
        }

        if (ratingsContainer.children.length > 0) {
          trackItem.appendChild(ratingsContainer);
        }

        // Add click handler to open rating modal
        trackItem.addEventListener("click", () => {
          if (currentUser) {
            showRateTrackModal(album.id, track, album.trackRatings || {});
          }
        });

        tracksContainer.appendChild(trackItem);
      });

      albumWrapper.appendChild(tracksContainer);
    }

    albumsGrid.appendChild(albumWrapper);
  });
}

// Highlight participant when hovering over their album
function highlightParticipant(email) {
  const participant = document.querySelector(
    `.participant[data-email="${email}"]`,
  );
  if (participant) {
    participant.classList.add("highlighted");

    // Get participant's color
    const colorIndex = participant.dataset.colorIndex;
    const colors = getParticipantColors();
    const color = colors[colorIndex % colors.length];

    // Apply custom color
    participant.style.setProperty("--highlight-border", color.border);
    participant.style.setProperty("--highlight-shadow", color.shadow);
  }
}

// Equalize album title heights to the tallest title
function equalizeAlbumTitleHeights() {
  try {
    const titles = Array.from(document.querySelectorAll(".album-info h3"));
    if (!titles || titles.length === 0) return;

    // Reset any previously set minHeights so measurement is natural
    // Clear any previously applied minHeight to get natural measurements
    titles.forEach((t) => (t.style.minHeight = ""));

    // Ensure we measure the full, un-truncated text for each title.
    // If `data-full-title` exists (from clampAlbumTitles), temporarily set it.
    const originals = new Map();
    titles.forEach((t) => {
      originals.set(t, t.textContent);
      if (t.dataset.fullTitle) t.textContent = t.dataset.fullTitle;
    });

    // Force reflow and measure the natural heights
    let maxH = 0;
    titles.forEach((t) => {
      const h = Math.max(t.scrollHeight, t.getBoundingClientRect().height);
      if (h > maxH) maxH = h;
    });

    // Restore the original text content (clamped/truncated state)
    titles.forEach((t) => {
      t.textContent = originals.get(t) || t.textContent;
    });

    // Apply same minHeight to all titles (round up)
    if (maxH > 0) {
      const px = Math.ceil(maxH) + "px";
      titles.forEach((t) => {
        t.style.minHeight = px;
      });
    }
    // Re-apply JS clamping so any over-long titles get truncated visually
    if (typeof clampAlbumTitles === "function") {
      clampAlbumTitles();
    }
  } catch (e) {
    console.warn("equalizeAlbumTitleHeights error:", e);
  }
}

// Debounced resize handler to re-equalize on viewport changes
let _equalizeResizeTimer = null;
window.addEventListener("resize", () => {
  if (_equalizeResizeTimer) clearTimeout(_equalizeResizeTimer);
  _equalizeResizeTimer = setTimeout(() => {
    equalizeAlbumTitleHeights();
  }, 150);
});

// Clamp album titles to a max number of lines with JS fallback (works in Firefox)
function clampAlbumTitles() {
  try {
    const titles = Array.from(document.querySelectorAll(".album-info h3"));
    if (!titles.length) return;

    const w = window.innerWidth;
    let maxLines = 2;
    if (w >= 1400) maxLines = 4;
    else if (w >= 900) maxLines = 3;

    titles.forEach((el) => {
      // store full text
      if (!el.dataset.fullTitle) el.dataset.fullTitle = el.textContent.trim();
      const full = el.dataset.fullTitle;

      // compute allowed height
      const lineHeight =
        parseFloat(getComputedStyle(el).lineHeight) ||
        1.2 * parseFloat(getComputedStyle(el).fontSize);
      const maxH = Math.ceil(lineHeight * maxLines);

      // Fast path: if current scrollHeight fits, restore full text
      el.textContent = full;
      if (el.scrollHeight <= maxH) return;

      // Binary search for max chars that fit
      let lo = 0;
      let hi = full.length;
      let best = "";
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        el.textContent = full.slice(0, mid).trim() + "…";
        if (el.scrollHeight <= maxH) {
          best = el.textContent;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      el.textContent = best || full.slice(0, 30).trim() + "…";
    });
  } catch (e) {
    console.warn("clampAlbumTitles error:", e);
  }
}

// Debounced clamp on resize
let _clampResizeTimer = null;
window.addEventListener("resize", () => {
  if (_clampResizeTimer) clearTimeout(_clampResizeTimer);
  _clampResizeTimer = setTimeout(() => {
    clampAlbumTitles();
    if (typeof equalizeAlbumInfoHeights === "function")
      equalizeAlbumInfoHeights();
  }, 180);
});

// Equalize the full .album-info container heights to the tallest one
function equalizeAlbumInfoHeights() {
  try {
    const infos = Array.from(document.querySelectorAll(".album-info"));
    if (!infos || infos.length === 0) return;

    // Reset any previously set minHeight
    infos.forEach((i) => (i.style.minHeight = ""));

    // Temporarily ensure titles show full text for accurate measurement
    const titles = Array.from(document.querySelectorAll(".album-info h3"));
    const titleOriginals = new Map();
    titles.forEach((t) => {
      titleOriginals.set(t, t.textContent);
      if (t.dataset.fullTitle) t.textContent = t.dataset.fullTitle;
    });

    // Measure natural heights of the info blocks
    let maxH = 0;
    infos.forEach((i) => {
      const h = Math.max(i.scrollHeight, i.getBoundingClientRect().height);
      if (h > maxH) maxH = h;
    });

    // Restore title text (clamped/truncated state)
    titles.forEach((t) => {
      if (titleOriginals.has(t)) t.textContent = titleOriginals.get(t);
    });

    // Apply the max height as minHeight for visual consistency
    if (maxH > 0) {
      const px = Math.ceil(maxH) + "px";
      infos.forEach((i) => (i.style.minHeight = px));
    }

    // Re-apply JS clamping so long titles still show ellipsis
    if (typeof clampAlbumTitles === "function") clampAlbumTitles();
  } catch (e) {
    console.warn("equalizeAlbumInfoHeights error:", e);
  }
}

// Backwards-compatible alias
function equalizeAlbumTitleHeights() {
  if (typeof equalizeAlbumInfoHeights === "function")
    equalizeAlbumInfoHeights();
}

// Remove highlight from participant
function unhighlightParticipant(email) {
  const participant = document.querySelector(
    `.participant[data-email="${email}"]`,
  );
  if (participant) {
    participant.classList.remove("highlighted");
  }
}

// Participant color palette (constant to avoid recreation)
const PARTICIPANT_COLORS = [
  { border: "rgba(102, 126, 234, 0.8)", shadow: "rgba(102, 126, 234, 0.6)" }, // Purple
  { border: "rgba(245, 87, 108, 0.8)", shadow: "rgba(245, 87, 108, 0.6)" }, // Pink
  { border: "rgba(52, 211, 153, 0.8)", shadow: "rgba(52, 211, 153, 0.6)" }, // Green
  { border: "rgba(251, 191, 36, 0.8)", shadow: "rgba(251, 191, 36, 0.6)" }, // Yellow
  { border: "rgba(239, 68, 68, 0.8)", shadow: "rgba(239, 68, 68, 0.6)" }, // Red
  { border: "rgba(59, 130, 246, 0.8)", shadow: "rgba(59, 130, 246, 0.6)" }, // Blue
  { border: "rgba(168, 85, 247, 0.8)", shadow: "rgba(168, 85, 247, 0.6)" }, // Violet
  { border: "rgba(236, 72, 153, 0.8)", shadow: "rgba(236, 72, 153, 0.6)" }, // Magenta
];

// Get participant color palette
function getParticipantColors() {
  return PARTICIPANT_COLORS;
}

// Add rating indicator to track item (supports both emoji type and numeric rating)
function addRatingIndicator(
  container,
  typeOrRating,
  participant,
  hasNote = false,
) {
  const ratingDiv = document.createElement("div");
  ratingDiv.className = "track-rating";

  // Add user email as data attribute for highlighting
  if (participant && participant.email) {
    ratingDiv.dataset.userEmail = participant.email;
  }

  // Determine if this is a string type (old-style) or number (new-style)
  const isOldStyle = typeof typeOrRating === "string";
  const titleSuffix =
    typeOrRating !== null && typeOrRating !== undefined
      ? typeOrRating
      : "No rating";

  // Add user avatar
  if (participant && participant.picture) {
    const avatar = document.createElement("img");
    avatar.className = "track-rating-avatar";
    avatar.src = participant.picture;
    avatar.alt = `${participant.name}'s rating`;
    avatar.title = `${participant.name}: ${titleSuffix}`;

    // Fallback to consistent animal emoji if image fails
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(participant.email);
      const emojiSpan = document.createElement("div");
      emojiSpan.textContent = emoji;
      emojiSpan.className = "track-rating-avatar";
      emojiSpan.style.fontSize = "18px";
      emojiSpan.style.display = "flex";
      emojiSpan.style.alignItems = "center";
      emojiSpan.style.justifyContent = "center";
      emojiSpan.style.width = "24px";
      emojiSpan.style.height = "24px";
      emojiSpan.style.borderRadius = "50%";
      emojiSpan.title = `${participant.name}: ${titleSuffix}`;
      avatar.replaceWith(emojiSpan);
    };

    ratingDiv.appendChild(avatar);
  }

  // If the user has a note for this track, add a small overlay on their avatar
  if (hasNote) {
    const noteOverlay = document.createElement("span");
    noteOverlay.className = "note-overlay";
    noteOverlay.textContent = "📝";
    noteOverlay.title = "User has notes";
    ratingDiv.appendChild(noteOverlay);
  }

  // Add emoji based on old-style rating type
  if (isOldStyle && typeOrRating) {
    const emoji = document.createElement("span");
    emoji.className = "track-rating-emoji";

    if (typeOrRating === "favorite") {
      emoji.textContent = "⭐";
      emoji.style.color = "#fbbf24";
    } else if (typeOrRating === "least") {
      emoji.textContent = "💔";
      emoji.style.color = "#ef4444";
    } else if (typeOrRating === "liked") {
      emoji.textContent = "👍";
      emoji.style.color = "#22c55e";
    } else if (typeOrRating === "disliked") {
      emoji.textContent = "👎";
      emoji.style.color = "#ef4444";
    }

    ratingDiv.appendChild(emoji);
  }

  // Add numeric rating if it's a number
  if (!isOldStyle && typeOrRating !== null && typeOrRating !== undefined) {
    const ratingSpan = document.createElement("span");
    ratingSpan.className = "track-rating-number";
    ratingSpan.textContent = typeOrRating;
    // Color based on rating value
    if (typeOrRating >= 8) {
      ratingSpan.style.color = "#22c55e"; // Green for high ratings
    } else if (typeOrRating >= 5) {
      ratingSpan.style.color = "#fbbf24"; // Yellow for mid ratings
    } else {
      ratingSpan.style.color = "#ef4444"; // Red for low ratings
    }
    ratingDiv.appendChild(ratingSpan);
  }
  container.appendChild(ratingDiv);
}

// Store current rating context
let currentRatingContext = null;
let trackPlayer = null;

// Attach input listener to a rating slider
function attachSliderListeners(sliderId, changeHandler) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;
  // Use 'input' for real-time feedback, 'change' for final value (saves on release)
  slider.addEventListener("input", () => {
    const value = parseFloat(slider.value);
    const container = slider.closest(".rating-slider-container");
    const display = container?.querySelector(".rating-slider-value");
    updateSliderDisplay(display, value);
    container?.classList.remove("no-value");
  });
  slider.addEventListener("change", () => {
    const value = parseFloat(slider.value);
    changeHandler(value);
  });
}

// Get a color for a rating value: 0=red, 5=yellow, 10=green (HSL hue 0→60→120)
function getRatingColor(value) {
  const hue = (value / 10) * 120; // 0=red(0), 5=yellow(60), 10=green(120)
  return `hsl(${hue}, 80%, 55%)`;
}

// Helper: update slider value display with color
function updateSliderDisplay(display, value) {
  if (!display) return;
  const color = getRatingColor(value);
  display.textContent = value;
  display.style.color = color;
}

// Set a value on a rating slider
function selectRatingGridValue(gridId, displayId, value) {
  const container = document.getElementById(gridId);
  if (!container) return;
  const slider = container.querySelector(".rating-slider");
  const display = container.querySelector(".rating-slider-value");
  if (slider) {
    slider.value = value;
  }
  container.classList.remove("no-value");
  updateSliderDisplay(display, value);
}

// Clear selection on a rating slider
function clearRatingGridSelection(gridId, displayId) {
  const container = document.getElementById(gridId);
  if (!container) return;
  const slider = container.querySelector(".rating-slider");
  const display = container.querySelector(".rating-slider-value");
  if (slider) {
    slider.value = 5;
  }
  container.classList.add("no-value");
  if (display) {
    display.textContent = "—";
    display.style.color = "";
  }
}

// Handle track rating button click — auto-saves
async function handleTrackRatingClick(value) {
  selectRatingGridValue("trackRatingGrid", "trackRatingValue", value);
  await saveTrackRating(value);
}

// Handle album rating button click — auto-saves
async function handleAlbumRatingClick(value) {
  selectRatingGridValue("albumRatingGrid", "albumRatingValue", value);
  await saveAlbumRating(value);
}

// Display other users' track ratings
function displayTrackRatings(allTrackRatings, trackKey) {
  const container = document.getElementById("trackRatingsDisplay");
  if (!container) return;
  container.innerHTML = "";

  // Collect ratings for this track
  const ratingsForTrack = [];
  Object.entries(allTrackRatings).forEach(([userEmail, userRating]) => {
    if (userRating.ratings && userRating.ratings[trackKey] !== undefined) {
      // Skip users who have hidden their rating for this track (unless it's the current user)
      if (userEmail !== currentUser?.email) {
        // For past months, show all ratings
        const _now = new Date();
        const _realMK = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
        const _viewedMK = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
        const _isPast = _viewedMK < _realMK;
        if (!_isPast && userRating.ratingsVisible?.[trackKey] !== true) return;
      }

      const participant = window.currentParticipants?.find(
        (p) => p.email === userEmail,
      );
      if (participant) {
        ratingsForTrack.push({
          email: userEmail,
          name: participant.name.split(" ")[0],
          picture: participant.picture,
          rating: userRating.ratings[trackKey],
        });
      }
    }
  });

  if (ratingsForTrack.length === 0) return;

  const title = document.createElement("div");
  title.className = "ratings-display-title";
  title.textContent = "Other Ratings";
  container.appendChild(title);

  const ratingsGrid = document.createElement("div");
  ratingsGrid.className = "ratings-grid";

  ratingsForTrack.forEach(({ email, name, picture, rating }) => {
    if (email === currentUser?.email) return; // Skip current user

    const ratingItem = document.createElement("div");
    ratingItem.className = "rating-item";

    const avatar = document.createElement("img");
    avatar.src = picture;
    avatar.alt = name;
    avatar.className = "rating-avatar";
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(email);
      const emojiSpan = document.createElement("span");
      emojiSpan.textContent = emoji;
      emojiSpan.className = "rating-avatar-emoji";
      avatar.replaceWith(emojiSpan);
    };

    const ratingValue = document.createElement("span");
    ratingValue.className = "rating-value";
    ratingValue.textContent = rating;

    ratingItem.appendChild(avatar);
    ratingItem.appendChild(ratingValue);
    ratingsGrid.appendChild(ratingItem);
  });

  container.appendChild(ratingsGrid);
}

// Show rate track modal
async function showRateTrackModal(albumId, track, allTrackRatings = {}) {
  if (!currentUser) {
    await showCustomAlert("You must be signed in to rate tracks.");
    return;
  }

  // Check if user joined the discussion for this month
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);

  currentRatingContext = {
    albumId,
    track,
    currentRatings: allTrackRatings,
  };

  const modal = document.getElementById("rateTrackModal");
  const trackNameEl = document.getElementById("rateTrackName");
  trackNameEl.textContent = `${track.position}. ${track.title}`;

  // Update modal title depending on participation
  try {
    const modalTitle = document.getElementById("rateTrackModalTitle");
    if (modalTitle) {
      modalTitle.textContent = isParticipant
        ? "Rate Track"
        : "Join discussion to rate and take notes";
      if (!isParticipant) {
        modalTitle.classList.add("join-title");
      } else {
        modalTitle.classList.remove("join-title");
      }
    }
  } catch (e) {
    // ignore
  }

  // Clear existing avatars from old-style buttons
  document
    .querySelectorAll(".rating-btn .rating-avatars")
    .forEach((el) => el.remove());

  // Load user's notes for this specific track from ratings
  const trackKey = `${track.position}-${track.title}`;
  const notesTextarea = document.getElementById("trackNotesTextarea");
  const visibilityToggle = document.getElementById("notesVisibilityToggle");
  const clearBtn = document.getElementById("clearTrackRating");

  // Old-style rating button IDs
  const ratingButtonIds = [
    "rateFavorite",
    "rateLeast",
    "rateLiked",
    "rateDisliked",
  ];

  // Disable rating and notes if user is not a participant
  if (!isParticipant) {
    // Disable rating slider
    const trackSlider = document.getElementById("trackRatingSlider");
    if (trackSlider) trackSlider.disabled = true;
    if (clearBtn) clearBtn.disabled = true;

    // Disable old-style buttons
    ratingButtonIds.forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.disabled = true;
        b.classList.add("disabled");
        b.title = "Join the discussion to rate tracks";
      }
    });

    // Disable notes textarea and visibility toggle
    if (notesTextarea) {
      notesTextarea.disabled = true;
      notesTextarea.placeholder = "Join the discussion to add notes";
    }
    if (visibilityToggle) {
      visibilityToggle.disabled = true;
      visibilityToggle.setAttribute("aria-disabled", "true");
    }
    const trackRatVisToggle = document.getElementById(
      "trackRatingVisibilityToggle",
    );
    if (trackRatVisToggle) {
      trackRatVisToggle.disabled = true;
      trackRatVisToggle.setAttribute("aria-disabled", "true");
    }
  } else {
    // Ensure enabled
    const trackSlider2 = document.getElementById("trackRatingSlider");
    if (trackSlider2) trackSlider2.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    // Enable old-style buttons
    ratingButtonIds.forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.disabled = false;
        b.classList.remove("disabled");
        b.title = "";
      }
    });

    if (notesTextarea) notesTextarea.disabled = false;
    if (visibilityToggle) {
      visibilityToggle.disabled = false;
      visibilityToggle.removeAttribute("aria-disabled");
    }
    const trackRatVisToggle2 = document.getElementById(
      "trackRatingVisibilityToggle",
    );
    if (trackRatVisToggle2) {
      trackRatVisToggle2.disabled = false;
      trackRatVisToggle2.removeAttribute("aria-disabled");
    }
  }

  // Load user's current numeric rating for this track
  const userRating = allTrackRatings[currentUser.email];
  const currentTrackRating = userRating?.ratings?.[trackKey];

  if (currentTrackRating !== undefined) {
    selectRatingGridValue(
      "trackRatingGrid",
      "trackRatingValue",
      currentTrackRating,
    );
  } else {
    clearRatingGridSelection("trackRatingGrid", "trackRatingValue");
  }

  // Load track rating visibility state
  const trackRatingVisToggle = document.getElementById(
    "trackRatingVisibilityToggle",
  );
  const trackRatingVisLabel = document.getElementById(
    "trackRatingVisibilityLabel",
  );
  if (trackRatingVisToggle) {
    const isRatingVisible = userRating?.ratingsVisible?.[trackKey] === true;
    if (isRatingVisible) {
      trackRatingVisToggle.classList.remove("private");
    } else {
      trackRatingVisToggle.classList.add("private");
    }
    trackRatingVisToggle.setAttribute(
      "aria-pressed",
      isRatingVisible ? "true" : "false",
    );
    if (trackRatingVisLabel) {
      trackRatingVisLabel.textContent = isRatingVisible
        ? "This rating is visible to others"
        : "This rating is visible only to you";
      if (isRatingVisible) {
        trackRatingVisLabel.classList.add("visible-others");
      } else {
        trackRatingVisLabel.classList.remove("visible-others");
      }
    }
  }

  // Build a map of notes for this track from allTrackRatings
  const trackNotesForThisTrack = {};
  Object.entries(allTrackRatings).forEach(([userEmail, userRating]) => {
    if (userRating && userRating.notes && userRating.notes[trackKey]) {
      trackNotesForThisTrack[userEmail] = userRating.notes[trackKey];
    }
  });

  const userNote = trackNotesForThisTrack[currentUser.email];

  if (userNote) {
    notesTextarea.value = userNote.text || "";
    if (userNote.visible) {
      visibilityToggle.classList.remove("private");
    } else {
      visibilityToggle.classList.add("private");
    }
  } else {
    notesTextarea.value = "";
    visibilityToggle.classList.add("private"); // Default to private
  }

  // Update visibility label text
  try {
    const visibilityLabel = document.getElementById("notesVisibilityLabel");
    if (visibilityLabel) {
      const isPrivate = visibilityToggle.classList.contains("private");
      visibilityLabel.textContent = isPrivate
        ? "These notes are visible only to you"
        : "These notes are visible to others";
      // Update class for color state
      if (isPrivate) {
        visibilityLabel.classList.remove("visible-others");
      } else {
        visibilityLabel.classList.add("visible-others");
      }
    }
  } catch (e) {
    // ignore
  }

  // Display other users' visible notes (pass per-track notes map)
  displayOtherUsersNotes(trackNotesForThisTrack);

  // Display other users' ratings for this track
  displayTrackRatings(allTrackRatings, trackKey);

  // Render avatars on old-style buttons
  renderRatingAvatars(track, allTrackRatings);

  modal.classList.remove("hidden");

  // Load YouTube player if we have a video ID
  if (track.videoId) {
    loadTrackPlayer(track.videoId);
  }
}

// Render rating avatars on old-style buttons for a given track
function renderRatingAvatars(track, allTrackRatings = {}) {
  // Clear existing avatars
  document
    .querySelectorAll(".rating-btn .rating-avatars")
    .forEach((el) => el.remove());

  const trackKey = `${track.position}-${track.title}`;
  const trackSpecificRatings = {};

  Object.entries(allTrackRatings).forEach(([userEmail, userRating]) => {
    if (userRating.favorite === trackKey) {
      trackSpecificRatings[userEmail] = "favorite";
    } else if (userRating.leastFavorite === trackKey) {
      trackSpecificRatings[userEmail] = "least";
    } else if (userRating.liked && userRating.liked.includes(trackKey)) {
      trackSpecificRatings[userEmail] = "liked";
    } else if (userRating.disliked && userRating.disliked.includes(trackKey)) {
      trackSpecificRatings[userEmail] = "disliked";
    }
  });

  if (Object.keys(trackSpecificRatings).length === 0) return;

  const ratingTypes = {
    favorite: "rateFavorite",
    least: "rateLeast",
    liked: "rateLiked",
    disliked: "rateDisliked",
  };

  Object.entries(ratingTypes).forEach(([ratingType, buttonId]) => {
    const button = document.getElementById(buttonId);
    if (!button) return;

    const usersWithRating = Object.entries(trackSpecificRatings)
      .filter(([email, rating]) => rating === ratingType)
      .map(([email]) => email);

    if (usersWithRating.length > 0) {
      const avatarsContainer = document.createElement("div");
      avatarsContainer.className = "rating-avatars";
      avatarsContainer.style.display = "flex";
      avatarsContainer.style.gap = "4px";
      avatarsContainer.style.marginTop = "8px";
      avatarsContainer.style.justifyContent = "center";
      avatarsContainer.style.flexWrap = "wrap";

      usersWithRating.forEach((email) => {
        const participant = window.currentParticipants?.find(
          (p) => p.email === email,
        );
        if (participant) {
          const avatar = document.createElement("img");
          avatar.src = participant.picture;
          avatar.alt = participant.name;
          avatar.style.width = "20px";
          avatar.style.height = "20px";
          avatar.style.borderRadius = "50%";
          avatar.style.border = "1px solid rgba(255, 255, 255, 0.3)";
          avatar.title = participant.name;

          avatar.onerror = () => {
            const emoji = getAnimalEmojiForUser(email);
            const emojiSpan = document.createElement("div");
            emojiSpan.textContent = emoji;
            emojiSpan.style.fontSize = "16px";
            emojiSpan.style.width = "20px";
            emojiSpan.style.height = "20px";
            emojiSpan.style.display = "flex";
            emojiSpan.style.alignItems = "center";
            emojiSpan.style.justifyContent = "center";
            emojiSpan.title = participant.name;
            avatar.replaceWith(emojiSpan);
          };

          avatarsContainer.appendChild(avatar);
        }
      });

      button.appendChild(avatarsContainer);
    }
  });
}

// Display other users' visible notes
function displayOtherUsersNotes(allTrackNotes) {
  const container = document.getElementById("otherUsersNotes");
  container.innerHTML = "";

  const visibleNotes = Object.entries(allTrackNotes).filter(
    ([email, note]) => note.visible && email !== currentUser.email && note.text,
  );

  if (visibleNotes.length === 0) {
    return;
  }

  const title = document.createElement("div");
  title.className = "other-users-notes-title";
  title.textContent = "Participants Notes";
  container.appendChild(title);

  visibleNotes.forEach(([email, note]) => {
    const participant = window.currentParticipants?.find(
      (p) => p.email === email,
    );
    if (!participant) return;

    const card = document.createElement("div");
    card.className = "user-note-card";

    const header = document.createElement("div");
    header.className = "user-note-header";

    const avatar = document.createElement("img");
    avatar.className = "user-note-avatar";
    avatar.src = participant.picture;
    avatar.alt = participant.name;
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(email);
      const emojiSpan = document.createElement("div");
      emojiSpan.textContent = emoji;
      emojiSpan.style.fontSize = "20px";
      avatar.replaceWith(emojiSpan);
    };

    const name = document.createElement("div");
    name.className = "user-note-name";
    name.textContent = participant.name.split(" ")[0];

    header.appendChild(avatar);
    header.appendChild(name);

    const text = document.createElement("div");
    text.className = "user-note-text";
    text.textContent = note.text;

    card.appendChild(header);
    card.appendChild(text);
    container.appendChild(card);
  });
}

// Toggle notes visibility
function toggleNotesVisibility() {
  try {
    const toggle = document.getElementById("notesVisibilityToggle");
    const label = document.getElementById("notesVisibilityLabel");

    console.log("toggleNotesVisibility called");

    if (!toggle) return;

    if (toggle.disabled) {
      console.log(
        "toggleNotesVisibility: toggle is disabled for non-participants",
      );
      return;
    }

    toggle.classList.toggle("private");

    // update aria-pressed for accessibility
    const pressed = !toggle.classList.contains("private");
    try {
      toggle.setAttribute("aria-pressed", pressed ? "true" : "false");
    } catch (e) {}

    if (label) {
      const isPrivate = toggle.classList.contains("private");
      label.textContent = isPrivate
        ? "These notes are visible only to you"
        : "These notes are visible to others";
      if (isPrivate) {
        label.classList.remove("visible-others");
      } else {
        label.classList.add("visible-others");
      }
    }
  } catch (e) {
    console.error("Error in toggleNotesVisibility:", e);
  }
}

// Save track notes
async function saveTrackNotes(options = {}) {
  const { silent = false } = options || {};
  if (!db || !currentUser || !currentRatingContext) {
    return;
  }

  // Prevent non-participants from saving notes
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    if (!silent) {
      await showCustomAlert(
        "Join the discussion to add notes.",
        "Join to Participate",
      );
    }
    return;
  }
  const { albumId, track, currentRatings } = currentRatingContext;
  const trackKey = `${track.position}-${track.title}`;
  const textarea = document.getElementById("trackNotesTextarea");
  const visibilityToggle = document.getElementById("notesVisibilityToggle");
  const noteText = textarea.value.trim();
  const isVisible = !visibilityToggle.classList.contains("private");

  // Work with a copy of the ratings object
  const updatedAllRatings = { ...(currentRatings || {}) };

  // Ensure current user's rating object exists
  if (!updatedAllRatings[currentUser.email]) {
    updatedAllRatings[currentUser.email] = {};
  }

  const userRatingObj = { ...(updatedAllRatings[currentUser.email] || {}) };
  const userNotes = { ...(userRatingObj.notes || {}) };

  if (noteText) {
    userNotes[trackKey] = {
      text: noteText,
      visible: isVisible,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    console.log(
      "Adding/updating note for user:",
      currentUser.email,
      "on track",
      trackKey,
    );
  } else {
    // Remove note if text is empty
    delete userNotes[trackKey];
    console.log(
      "Removing note for user:",
      currentUser.email,
      "on track",
      trackKey,
    );
  }

  // Assign notes back to user's rating object
  userRatingObj.notes = userNotes;
  updatedAllRatings[currentUser.email] = userRatingObj;

  try {
    const docRef = db.collection("albums").doc(albumId);
    console.log("Updating Firestore doc (trackRatings):", docRef.path);
    await docRef.update({
      trackRatings: updatedAllRatings,
    });

    if (!silent) {
      await showCustomAlert("Notes saved successfully!", "Success");
    } else {
      // gentle visual confirmation for auto-save
      showToast("Notes auto-saved");
      console.log("Notes saved silently");
    }

    // Update context with new ratings
    currentRatingContext.currentRatings = updatedAllRatings;

    // Update original note state so unsaved-change detection doesn't trigger
    try {
      currentRatingContext.originalNoteText = noteText || "";
      currentRatingContext.originalNoteVisible = isVisible;
    } catch (e) {
      // ignore
    }

    // Update the album in window.currentAlbums so the data stays fresh
    if (window.currentAlbums) {
      const albumIndex = window.currentAlbums.findIndex(
        (a) => a.id === albumId,
      );
      if (albumIndex !== -1) {
        window.currentAlbums[albumIndex].trackRatings = updatedAllRatings;
        console.log("✓ Updated album.trackRatings in window.currentAlbums");
      }
    }

    // Build per-track notes map and refresh display
    const trackNotesForThisTrack = {};
    Object.entries(updatedAllRatings).forEach(([userEmail, userRating]) => {
      if (userRating && userRating.notes && userRating.notes[trackKey]) {
        trackNotesForThisTrack[userEmail] = userRating.notes[trackKey];
      }
    });

    displayOtherUsersNotes(trackNotesForThisTrack);
  } catch (error) {
    console.error("Error saving track notes:", error);
    await showCustomAlert(`Failed to save notes: ${error.message}`, "Error");
  }
}

// Load YouTube IFrame API
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    return;
  }

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Initialize YouTube player when API is ready
function onYouTubeIframeAPIReady() {
  // API is ready, players can now be created
}

// Load track player
function loadTrackPlayer(videoId) {
  // Ensure YouTube API is loaded
  if (!window.YT || !window.YT.Player) {
    loadYouTubeAPI();
    // Wait and retry
    setTimeout(() => loadTrackPlayer(videoId), 500);
    return;
  }

  // Destroy existing player if any
  if (trackPlayer) {
    trackPlayer.destroy();
  }

  // Create new player
  trackPlayer = new YT.Player("trackPlayer", {
    height: "200",
    width: "100%",
    videoId: videoId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
    },
  });
}

// Close rate track modal
async function closeRateTrackModal() {
  const modal = document.getElementById("rateTrackModal");

  // Attempt to auto-save notes silently if there are changes
  try {
    if (currentRatingContext) {
      // call saveTrackNotes silently; it will update context/original state
      await saveTrackNotes({ silent: true });
    }
  } catch (e) {
    console.warn("Auto-save before close failed:", e);
    // proceed to close anyway
  }

  modal.classList.add("hidden");

  // Destroy player if it exists
  if (trackPlayer) {
    trackPlayer.destroy();
    trackPlayer = null;
  }

  // Clear player container
  const playerContainer = document.getElementById("trackPlayer");
  if (playerContainer) {
    playerContainer.innerHTML = "";
  }

  currentRatingContext = null;
  // Refresh overview when modal is closed
  try {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (e) {
    console.warn("Failed to refresh albums after closing modal:", e);
  }
}

// Store album note context for rating
let currentAlbumNoteContext = null;

// Show album note modal for whole-album notes and ratings
async function showAlbumNoteModal(albumId) {
  if (!currentUser) {
    await showCustomAlert("You must be signed in to rate albums.");
    return;
  }

  if (!db) return;

  window.currentAlbumNoteId = albumId;
  currentAlbumNoteContext = { albumId };

  try {
    const doc = await db.collection("albums").doc(albumId).get();
    if (!doc.exists) {
      await showCustomAlert("Album not found.");
      return;
    }

    const album = doc.data();

    // Populate modal info
    const titleEl = document.getElementById("albumNoteModalTitle");
    const infoEl = document.getElementById("albumNoteAlbumInfo");
    if (titleEl) {
      const _artist = sanitizeArtist(album.artist);
      const rawArtistTitle = album.artist ? album.artist.trim() : "";
      const rawIsOnlyYouTube3 = /^YouTube( Music)?$/i.test(rawArtistTitle);
      if (_artist) {
        titleEl.textContent = `${sanitizeAlbumTitle(album.title)} — ${_artist}`;
      } else if (rawArtistTitle && !rawIsOnlyYouTube3) {
        // fall back to raw artist only if it's not just YouTube
        titleEl.textContent = `${sanitizeAlbumTitle(
          album.title,
        )} — ${rawArtistTitle}`;
      } else {
        titleEl.textContent = sanitizeAlbumTitle(album.title);
      }
    }
    if (infoEl)
      infoEl.textContent = album.description || "Rate this album and add notes";

    // Load album ratings
    const albumRatings = album.albumRatings || {};
    const myAlbumRating = albumRatings[currentUser.email];

    const clearAlbumRatingBtn = document.getElementById("clearAlbumRating");

    // Check if user is a participant
    const isParticipant =
      window.currentParticipants &&
      window.currentParticipants.some((p) => p.email === currentUser.email);

    if (myAlbumRating !== undefined) {
      selectRatingGridValue(
        "albumRatingGrid",
        "albumRatingValue",
        myAlbumRating,
      );
    } else {
      clearRatingGridSelection("albumRatingGrid", "albumRatingValue");
    }

    // Load album rating visibility state
    const albumRatingsVisible = album.albumRatingsVisible || {};
    const albumRatingVisToggle = document.getElementById(
      "albumRatingVisibilityToggle",
    );
    const albumRatingVisLabel = document.getElementById(
      "albumRatingVisibilityLabel",
    );
    if (albumRatingVisToggle) {
      const isRatingVisible = albumRatingsVisible[currentUser.email] === true;
      if (isRatingVisible) {
        albumRatingVisToggle.classList.remove("private");
      } else {
        albumRatingVisToggle.classList.add("private");
      }
      albumRatingVisToggle.setAttribute(
        "aria-pressed",
        isRatingVisible ? "true" : "false",
      );
      if (albumRatingVisLabel) {
        albumRatingVisLabel.textContent = isRatingVisible
          ? "This rating is visible to others"
          : "This rating is visible only to you";
        if (isRatingVisible) {
          albumRatingVisLabel.classList.add("visible-others");
        } else {
          albumRatingVisLabel.classList.remove("visible-others");
        }
      }
    }

    // Display other users' album ratings
    displayAlbumRatings(albumRatings, albumRatingsVisible);

    const notesMap = album.albumNotes || {};
    const myNote = notesMap[currentUser.email];

    const textarea = document.getElementById("albumNoteTextarea");
    const visibilityToggle = document.getElementById(
      "albumNotesVisibilityToggle",
    );

    if (textarea) textarea.value = (myNote && myNote.text) || "";

    if (visibilityToggle) {
      if (myNote && myNote.visible) {
        visibilityToggle.classList.remove("private");
      } else {
        visibilityToggle.classList.add("private");
      }
      const label = document.getElementById("albumNotesVisibilityLabel");
      if (label) {
        const isPrivate = visibilityToggle.classList.contains("private");
        label.textContent = isPrivate
          ? "These notes are visible only to you "
          : "These notes are visible to others";
        // Update green state when This note is visible to others
        if (isPrivate) {
          label.classList.remove("visible-others");
          visibilityToggle.setAttribute("aria-pressed", "false");
        } else {
          label.classList.add("visible-others");
          visibilityToggle.setAttribute("aria-pressed", "true");
        }
      }
    }

    // Display other users' visible album notes
    displayOtherUsersAlbumNotes(notesMap);

    if (!isParticipant) {
      // Disable rating controls
      const albSlider = document.getElementById("albumRatingSlider");
      if (albSlider) albSlider.disabled = true;
      if (clearAlbumRatingBtn) clearAlbumRatingBtn.disabled = true;

      if (textarea) {
        textarea.disabled = true;
        textarea.placeholder = "Join the discussion to add album notes";
      }
      if (visibilityToggle) {
        visibilityToggle.disabled = true;
        visibilityToggle.setAttribute("aria-disabled", "true");
      }
      const albRatVisToggle = document.getElementById(
        "albumRatingVisibilityToggle",
      );
      if (albRatVisToggle) {
        albRatVisToggle.disabled = true;
        albRatVisToggle.setAttribute("aria-disabled", "true");
      }
    } else {
      // Enable rating controls
      const albSlider2 = document.getElementById("albumRatingSlider");
      if (albSlider2) albSlider2.disabled = false;
      if (clearAlbumRatingBtn) clearAlbumRatingBtn.disabled = false;

      if (textarea) textarea.disabled = false;
      if (visibilityToggle) {
        visibilityToggle.disabled = false;
        visibilityToggle.removeAttribute("aria-disabled");
      }
      const albRatVisToggle2 = document.getElementById(
        "albumRatingVisibilityToggle",
      );
      if (albRatVisToggle2) {
        albRatVisToggle2.disabled = false;
        albRatVisToggle2.removeAttribute("aria-disabled");
      }
    }

    // Compute and show Bayesian average suggestion
    updateBayesianSuggestion(albumId);

    document.getElementById("albumNoteModal").classList.remove("hidden");
  } catch (error) {
    console.error("Error opening album note modal:", error);
    await showCustomAlert("Failed to open album notes: " + error.message);
  }
}

// Compute Bayesian average of a user's track ratings for an album
// Formula: B = (C * m + Σxi) / (C + n)
//   n  = number of tracks the user rated on this album
//   Σxi = sum of those ratings
//   C  = mean track count across all albums this month  (prior weight)
//   m  = user's overall mean track rating across all albums (prior mean)
function updateBayesianSuggestion(albumId) {
  const el = document.getElementById("bayesianSuggestion");
  if (!el) return;
  el.classList.add("hidden");
  const sectionEl = document.getElementById("suggestedScoreSection");
  if (sectionEl) sectionEl.classList.add("hidden");

  if (
    !currentUser ||
    !window.currentAlbums ||
    window.currentAlbums.length === 0
  )
    return;

  const userEmail = currentUser.email;
  const albums = window.currentAlbums;

  // Collect the user's track ratings for the target album
  const album = albums.find((a) => a.id === albumId);
  if (!album) return;
  const trackRatings = album.trackRatings || {};
  const userRating = trackRatings[userEmail];
  const userRatingsMap = (userRating && userRating.ratings) || {};
  const albumRatingValues = Object.values(userRatingsMap);
  const n = albumRatingValues.length;
  const sumXi = albumRatingValues.reduce((a, b) => a + b, 0);

  // C = mean track count across all albums this month
  const trackCounts = albums.map((a) => (a.tracks ? a.tracks.length : 0));
  const C = trackCounts.reduce((a, b) => a + b, 0) / trackCounts.length;

  // m = user's overall mean track rating across ALL albums this month
  let allUserRatings = [];
  albums.forEach((a) => {
    const tr = a.trackRatings || {};
    const ur = tr[userEmail];
    if (ur && ur.ratings) {
      allUserRatings = allUserRatings.concat(Object.values(ur.ratings));
    }
  });

  if (allUserRatings.length === 0 || n === 0) {
    // Not enough data to suggest
    return;
  }

  const m = allUserRatings.reduce((a, b) => a + b, 0) / allUserRatings.length;

  // Bayesian average
  const bayesian = (C * m + sumXi) / (C + n);
  const bayesianRounded = Math.round(bayesian * 2) / 2;

  // Mean of this album's track ratings
  const mean = sumXi / n;
  const meanRounded = Math.round(mean * 2) / 2;

  // Median of this album's track ratings
  const sorted = [...albumRatingValues].sort((a, b) => a - b);
  let median;
  if (sorted.length % 2 === 0) {
    median = (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  } else {
    median = sorted[Math.floor(sorted.length / 2)];
  }
  const medianRounded = Math.round(median * 2) / 2;

  el.innerHTML = `
    <div class="bayesian-row"><span class="bayesian-label">Bayesian avg</span> <span class="bayesian-value">${bayesianRounded.toFixed(1)}</span> <span class="bayesian-detail">(${n} track${n !== 1 ? "s" : ""} · prior ${m.toFixed(1)} × ${C.toFixed(1)} weight)</span></div>
    <div class="bayesian-row"><span class="bayesian-label">Average</span> <span class="bayesian-value">${meanRounded.toFixed(1)}</span></div>
    <div class="bayesian-row"><span class="bayesian-label">Median</span> <span class="bayesian-value">${medianRounded.toFixed(1)}</span></div>
  `;
  el.classList.remove("hidden");
  const section = document.getElementById("suggestedScoreSection");
  if (section) section.classList.remove("hidden");
}

// Display other users' album-level notes
function displayOtherUsersAlbumNotes(notesMap = {}) {
  const container = document.getElementById("albumOtherUsersNotes");
  if (!container) return;
  container.innerHTML = "";

  const visibleNotes = Object.entries(notesMap).filter(
    ([email, note]) =>
      note && note.visible && email !== currentUser.email && note.text,
  );

  if (visibleNotes.length === 0) return;

  const title = document.createElement("div");
  title.className = "other-users-notes-title";
  title.textContent = "Participants Notes";
  container.appendChild(title);

  visibleNotes.forEach(([email, note]) => {
    const participant = window.currentParticipants?.find(
      (p) => p.email === email,
    );
    if (!participant) return;

    const card = document.createElement("div");
    card.className = "user-note-card";

    const header = document.createElement("div");
    header.className = "user-note-header";

    const avatar = document.createElement("img");
    avatar.className = "user-note-avatar";
    avatar.src = participant.picture;
    avatar.alt = participant.name;
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(email);
      const emojiSpan = document.createElement("div");
      emojiSpan.textContent = emoji;
      emojiSpan.style.fontSize = "20px";
      avatar.replaceWith(emojiSpan);
    };

    const name = document.createElement("div");
    name.className = "user-note-name";
    name.textContent = participant.name.split(" ")[0];

    header.appendChild(avatar);
    header.appendChild(name);

    const text = document.createElement("div");
    text.className = "user-note-text";
    text.textContent = note.text;

    card.appendChild(header);
    card.appendChild(text);
    container.appendChild(card);
  });
}

// Floating preview element (reused)
let _albumNotePreviewEl = null;

function _ensureAlbumNotePreviewEl() {
  if (!_albumNotePreviewEl) {
    _albumNotePreviewEl = document.createElement("div");
    _albumNotePreviewEl.className = "album-note-preview hidden";
    document.body.appendChild(_albumNotePreviewEl);
  }
  return _albumNotePreviewEl;
}

// Show album preview: display up to 2 public notes as snippets
function showAlbumNotePreview(album, anchorEl) {
  if (!album) return;
  const notes = album.albumNotes || {};
  const visibleEntries = Object.entries(notes).filter(
    ([email, n]) => n && n.visible && n.text && n.text.trim() !== "",
  );
  if (visibleEntries.length === 0) return;

  const preview = _ensureAlbumNotePreviewEl();
  preview.innerHTML = "";

  const title = document.createElement("div");
  title.className = "album-note-preview-title";
  title.textContent = `${sanitizeAlbumTitle(album.title)} — Notes`;
  preview.appendChild(title);

  const list = document.createElement("div");
  list.className = "album-note-preview-list";

  // show first two notes
  visibleEntries.slice(0, 2).forEach(([email, note]) => {
    const participant = window.currentParticipants?.find(
      (p) => p.email === email,
    );
    const name = participant
      ? participant.name.split(" ")[0]
      : email.split("@")[0];

    const item = document.createElement("div");
    item.className = "album-note-preview-item";

    const who = document.createElement("div");
    who.className = "album-note-preview-who";
    who.textContent = name;

    const text = document.createElement("div");
    text.className = "album-note-preview-text";
    const snippet =
      note.text.length > 140 ? note.text.slice(0, 137) + "…" : note.text;
    text.textContent = snippet;

    item.appendChild(who);
    item.appendChild(text);
    list.appendChild(item);
  });

  if (visibleEntries.length > 2) {
    const more = document.createElement("div");
    more.className = "album-note-preview-more";
    more.textContent = `+${visibleEntries.length - 2} more`;
    list.appendChild(more);
  }

  preview.appendChild(list);

  // position near anchorEl
  const rect = anchorEl.getBoundingClientRect();
  const gap = 8;
  preview.style.left =
    Math.min(
      Math.max(8, rect.left + rect.width / 2 - 140),
      window.innerWidth - 16 - 280,
    ) + "px";
  preview.style.top = Math.max(8, rect.top - preview.offsetHeight - 12) + "px";

  // make visible
  preview.classList.remove("hidden");
}

function hideAlbumNotePreview() {
  if (_albumNotePreviewEl) {
    _albumNotePreviewEl.classList.add("hidden");
  }
}

// Toggle album notes visibility (UI)
function toggleAlbumNotesVisibility() {
  try {
    const toggle = document.getElementById("albumNotesVisibilityToggle");
    const label = document.getElementById("albumNotesVisibilityLabel");
    if (!toggle) return;

    if (toggle.disabled) return;

    toggle.classList.toggle("private");
    const pressed = !toggle.classList.contains("private");
    toggle.setAttribute("aria-pressed", pressed ? "true" : "false");

    if (label) {
      const isPrivate = toggle.classList.contains("private");
      label.textContent = isPrivate
        ? "These notes are visible only to you "
        : "These notes are visible to others";
      // Update green state when These notes are visible to others
      if (isPrivate) {
        label.classList.remove("visible-others");
      } else {
        label.classList.add("visible-others");
      }
    }
  } catch (e) {
    console.error("Error in toggleAlbumNotesVisibility:", e);
  }
}

// Save album-level notes
async function saveAlbumNotes(options = {}) {
  const { silent = false } = options || {};
  if (!db || !currentUser || !window.currentAlbumNoteId) return;

  // Prevent non-participants
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    if (!silent)
      await showCustomAlert("Join the discussion to add album notes.");
    return;
  }

  const albumId = window.currentAlbumNoteId;
  const textarea = document.getElementById("albumNoteTextarea");
  const visibilityToggle = document.getElementById(
    "albumNotesVisibilityToggle",
  );
  const noteText = textarea ? textarea.value.trim() : "";
  const isVisible = !visibilityToggle.classList.contains("private");

  try {
    const albumRef = db.collection("albums").doc(albumId);
    const albumDoc = await albumRef.get();
    if (!albumDoc.exists) return;

    const albumData = albumDoc.data();
    const notes = { ...(albumData.albumNotes || {}) };

    if (noteText) {
      notes[currentUser.email] = {
        text: noteText,
        visible: isVisible,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
    } else {
      delete notes[currentUser.email];
    }

    await albumRef.update({ albumNotes: notes });

    if (!silent) {
      await showCustomAlert("Album notes saved successfully!", "Success");
    } else {
      showToast("Album notes auto-saved");
    }

    // Refresh displayed notes in modal
    displayOtherUsersAlbumNotes(notes);

    // Update in-memory album list if present
    if (window.currentAlbums) {
      const idx = window.currentAlbums.findIndex((a) => a.id === albumId);
      if (idx !== -1) {
        window.currentAlbums[idx].albumNotes = notes;
      }
    }
  } catch (error) {
    console.error("Error saving album notes:", error);
    await showCustomAlert(`Failed to save album notes: ${error.message}`);
  }
}

// Close album note modal (auto-saves)
async function closeAlbumNoteModal() {
  const modal = document.getElementById("albumNoteModal");
  try {
    await saveAlbumNotes({ silent: true });
  } catch (e) {
    console.warn("Auto-save album note failed:", e);
  }
  // Also save album rating visibility on close
  try {
    await saveAlbumRatingVisibility();
  } catch (e) {
    console.warn("Auto-save album rating visibility failed:", e);
  }
  modal.classList.add("hidden");
  window.currentAlbumNoteId = null;

  // Refresh albums list to show note overlays/indicators
  try {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (e) {
    console.warn("Failed to refresh albums after closing album note modal:", e);
  }
}

// Apply old-style track rating (favorite/least/liked/disliked)
let _applyingTrackRating = false;
async function applyTrackRating(ratingType) {
  if (_applyingTrackRating) return;
  if (!db || !currentUser || !currentRatingContext) {
    return;
  }
  _applyingTrackRating = true;
  try {
    await _applyTrackRatingInner(ratingType);
  } finally {
    _applyingTrackRating = false;
  }
}
async function _applyTrackRatingInner(ratingType) {
  // Prevent non-participants from applying ratings
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    await showCustomAlert(
      "Join the discussion to rate tracks.",
      "Join to Participate",
    );
    return;
  }

  const { albumId, track, currentRatings } = currentRatingContext;
  const trackKey = `${track.position}-${track.title}`;
  const userEmail = currentUser.email;
  const userRating = currentRatings[userEmail] || {};

  // Clone current ratings
  const updatedRatings = { ...currentRatings };
  const newUserRating = { ...userRating };

  if (ratingType === "favorite") {
    if (newUserRating.favorite === trackKey) {
      delete newUserRating.favorite;
    } else {
      newUserRating.favorite = trackKey;
    }
  } else if (ratingType === "least") {
    if (newUserRating.leastFavorite === trackKey) {
      delete newUserRating.leastFavorite;
    } else {
      newUserRating.leastFavorite = trackKey;
    }
  } else if (ratingType === "liked") {
    const liked = newUserRating.liked || [];
    if (liked.includes(trackKey)) {
      newUserRating.liked = liked.filter((k) => k !== trackKey);
    } else {
      newUserRating.liked = [...liked, trackKey];
      if (newUserRating.disliked) {
        newUserRating.disliked = newUserRating.disliked.filter(
          (k) => k !== trackKey,
        );
      }
    }
  } else if (ratingType === "disliked") {
    const disliked = newUserRating.disliked || [];
    if (disliked.includes(trackKey)) {
      newUserRating.disliked = disliked.filter((k) => k !== trackKey);
    } else {
      newUserRating.disliked = [...disliked, trackKey];
      if (newUserRating.liked) {
        newUserRating.liked = newUserRating.liked.filter((k) => k !== trackKey);
      }
    }
  }

  // Clean up empty arrays
  if (newUserRating.liked && newUserRating.liked.length === 0) {
    delete newUserRating.liked;
  }
  if (newUserRating.disliked && newUserRating.disliked.length === 0) {
    delete newUserRating.disliked;
  }

  if (Object.keys(newUserRating).length > 0) {
    updatedRatings[userEmail] = newUserRating;
  } else {
    delete updatedRatings[userEmail];
  }

  try {
    await db.collection("albums").doc(albumId).update({
      trackRatings: updatedRatings,
    });

    // Update in-memory context
    if (currentRatingContext) {
      currentRatingContext.currentRatings = updatedRatings;

      // Refresh avatars in the open modal
      renderRatingAvatars(track, updatedRatings);

      if (window.currentAlbums) {
        const albumIndex = window.currentAlbums.findIndex(
          (a) => a.id === albumId,
        );
        if (albumIndex !== -1) {
          window.currentAlbums[albumIndex].trackRatings = updatedRatings;
        }
      }
    }

    // Reload albums
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (error) {
    console.error("Error rating track:", error);
    if (error.code === "permission-denied") {
      showCustomAlert(
        "Permission denied. You need to be signed in to rate tracks.",
      );
    } else {
      showCustomAlert("Failed to save rating: " + error.message);
    }
  }
}

// Save track rating (0-10 scale)
async function saveTrackRating(ratingValue) {
  if (!db || !currentUser || !currentRatingContext) {
    return;
  }

  // Prevent non-participants from applying ratings
  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    await showCustomAlert(
      "Join the discussion to rate tracks.",
      "Join to Participate",
    );
    return;
  }

  ratingValue = parseFloat(ratingValue);

  const { albumId, track, currentRatings } = currentRatingContext;
  const trackKey = `${track.position}-${track.title}`;
  const userEmail = currentUser.email;
  const userRating = currentRatings[userEmail] || {};

  // Clone current ratings
  const updatedRatings = { ...currentRatings };
  const newUserRating = { ...userRating };

  // Initialize ratings object if it doesn't exist
  if (!newUserRating.ratings) {
    newUserRating.ratings = {};
  }

  // Set the track rating
  newUserRating.ratings[trackKey] = ratingValue;

  // Save rating visibility
  if (!newUserRating.ratingsVisible) {
    newUserRating.ratingsVisible = {};
  }
  const visToggle = document.getElementById("trackRatingVisibilityToggle");
  newUserRating.ratingsVisible[trackKey] = visToggle
    ? !visToggle.classList.contains("private")
    : false;

  // Update user rating
  updatedRatings[userEmail] = newUserRating;

  try {
    await db.collection("albums").doc(albumId).update({
      trackRatings: updatedRatings,
    });

    // Update in-memory context
    if (currentRatingContext) {
      currentRatingContext.currentRatings = updatedRatings;

      // Update album in window.currentAlbums
      if (window.currentAlbums) {
        const albumIndex = window.currentAlbums.findIndex(
          (a) => a.id === albumId,
        );
        if (albumIndex !== -1) {
          window.currentAlbums[albumIndex].trackRatings = updatedRatings;
        }
      }
    }

    // Update display
    const ratingDisplay = document.getElementById("trackRatingValue");
    if (ratingDisplay) {
      ratingDisplay.textContent = ratingValue;
    }

    // Refresh ratings display
    displayTrackRatings(updatedRatings, trackKey);

    // Reload albums
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (error) {
    console.error("Error saving track rating:", error);
    showCustomAlert("Failed to save rating: " + error.message);
  }
}

// Clear track rating
async function clearTrackRating() {
  if (!db || !currentUser || !currentRatingContext) {
    return;
  }

  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    return;
  }

  const { albumId, track, currentRatings } = currentRatingContext;
  const trackKey = `${track.position}-${track.title}`;
  const userEmail = currentUser.email;
  const userRating = currentRatings[userEmail];

  if (
    !userRating ||
    !userRating.ratings ||
    userRating.ratings[trackKey] === undefined
  ) {
    return; // Nothing to clear
  }

  // Clone and update
  const updatedRatings = { ...currentRatings };
  const newUserRating = { ...userRating };
  delete newUserRating.ratings[trackKey];

  // Also clean up ratingsVisible for this track
  if (newUserRating.ratingsVisible) {
    delete newUserRating.ratingsVisible[trackKey];
    if (Object.keys(newUserRating.ratingsVisible).length === 0) {
      delete newUserRating.ratingsVisible;
    }
  }

  // Clean up empty ratings object
  if (Object.keys(newUserRating.ratings).length === 0) {
    delete newUserRating.ratings;
  }

  // Clean up empty user rating
  if (Object.keys(newUserRating).length === 0) {
    delete updatedRatings[userEmail];
  } else {
    updatedRatings[userEmail] = newUserRating;
  }

  try {
    await db.collection("albums").doc(albumId).update({
      trackRatings: updatedRatings,
    });

    // Update in-memory context
    if (currentRatingContext) {
      currentRatingContext.currentRatings = updatedRatings;

      if (window.currentAlbums) {
        const albumIndex = window.currentAlbums.findIndex(
          (a) => a.id === albumId,
        );
        if (albumIndex !== -1) {
          window.currentAlbums[albumIndex].trackRatings = updatedRatings;
        }
      }
    }

    // Reset UI
    clearRatingGridSelection("trackRatingGrid", "trackRatingValue");

    // Refresh ratings display
    displayTrackRatings(updatedRatings, trackKey);

    // Reload albums
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (error) {
    console.error("Error clearing track rating:", error);
    showCustomAlert("Failed to clear rating: " + error.message);
  }
}

// Save album rating (0-10 scale)
async function saveAlbumRating(ratingValue) {
  if (!db || !currentUser || !currentAlbumNoteContext) {
    return;
  }

  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    await showCustomAlert(
      "Join the discussion to rate albums.",
      "Join to Participate",
    );
    return;
  }

  ratingValue = parseFloat(ratingValue);

  const { albumId } = currentAlbumNoteContext;
  const userEmail = currentUser.email;

  // Get current album
  const album = window.currentAlbums?.find((a) => a.id === albumId);
  const albumRatings = album?.albumRatings || {};

  // Update ratings
  const updatedAlbumRatings = { ...albumRatings };
  updatedAlbumRatings[userEmail] = ratingValue;

  // Save rating visibility
  const albumRatingsVisible = album?.albumRatingsVisible || {};
  const updatedAlbumRatingsVisible = { ...albumRatingsVisible };
  const albumVisToggle = document.getElementById("albumRatingVisibilityToggle");
  updatedAlbumRatingsVisible[userEmail] = albumVisToggle
    ? !albumVisToggle.classList.contains("private")
    : false;

  try {
    await db.collection("albums").doc(albumId).update({
      albumRatings: updatedAlbumRatings,
      albumRatingsVisible: updatedAlbumRatingsVisible,
    });

    // Update in-memory
    if (window.currentAlbums) {
      const albumIndex = window.currentAlbums.findIndex(
        (a) => a.id === albumId,
      );
      if (albumIndex !== -1) {
        window.currentAlbums[albumIndex].albumRatings = updatedAlbumRatings;
        window.currentAlbums[albumIndex].albumRatingsVisible =
          updatedAlbumRatingsVisible;
      }
    }

    // Update display
    const ratingDisplay = document.getElementById("albumRatingValue");
    if (ratingDisplay) {
      ratingDisplay.textContent = ratingValue;
    }

    // Refresh ratings display
    displayAlbumRatings(updatedAlbumRatings, updatedAlbumRatingsVisible);

    // Reload albums
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (error) {
    console.error("Error saving album rating:", error);
    showCustomAlert("Failed to save album rating: " + error.message);
  }
}

// Save album rating visibility independently (called on modal close)
async function saveAlbumRatingVisibility() {
  if (!db || !currentUser || !currentAlbumNoteContext) return;
  const { albumId } = currentAlbumNoteContext;
  const userEmail = currentUser.email;
  const album = window.currentAlbums?.find((a) => a.id === albumId);
  if (!album) return;

  // Only save if user has a rating
  const albumRatings = album.albumRatings || {};
  if (albumRatings[userEmail] === undefined) return;

  const albumRatingsVisible = album.albumRatingsVisible || {};
  const albumVisToggle = document.getElementById("albumRatingVisibilityToggle");
  const newVisible = albumVisToggle
    ? !albumVisToggle.classList.contains("private")
    : false;

  // Skip if nothing changed
  if (albumRatingsVisible[userEmail] === newVisible) return;

  const updatedAlbumRatingsVisible = { ...albumRatingsVisible };
  updatedAlbumRatingsVisible[userEmail] = newVisible;

  try {
    await db.collection("albums").doc(albumId).update({
      albumRatingsVisible: updatedAlbumRatingsVisible,
    });
    if (window.currentAlbums) {
      const idx = window.currentAlbums.findIndex((a) => a.id === albumId);
      if (idx !== -1) {
        window.currentAlbums[idx].albumRatingsVisible =
          updatedAlbumRatingsVisible;
      }
    }
  } catch (e) {
    console.error("Error saving album rating visibility:", e);
  }
}

// Clear album rating
async function clearAlbumRating() {
  if (!db || !currentUser || !currentAlbumNoteContext) {
    return;
  }

  const isParticipant =
    window.currentParticipants &&
    window.currentParticipants.some((p) => p.email === currentUser.email);
  if (!isParticipant) {
    return;
  }

  const { albumId } = currentAlbumNoteContext;
  const userEmail = currentUser.email;

  const album = window.currentAlbums?.find((a) => a.id === albumId);
  const albumRatings = album?.albumRatings || {};

  if (albumRatings[userEmail] === undefined) {
    return; // Nothing to clear
  }

  const updatedAlbumRatings = { ...albumRatings };
  delete updatedAlbumRatings[userEmail];

  try {
    await db.collection("albums").doc(albumId).update({
      albumRatings: updatedAlbumRatings,
    });

    // Update in-memory
    if (window.currentAlbums) {
      const albumIndex = window.currentAlbums.findIndex(
        (a) => a.id === albumId,
      );
      if (albumIndex !== -1) {
        window.currentAlbums[albumIndex].albumRatings = updatedAlbumRatings;
      }
    }

    // Reset UI
    clearRatingGridSelection("albumRatingGrid", "albumRatingValue");

    // Refresh ratings display
    displayAlbumRatings(updatedAlbumRatings, album?.albumRatingsVisible || {});

    // Reload albums
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    loadAlbums(monthKey);
  } catch (error) {
    console.error("Error clearing album rating:", error);
    showCustomAlert("Failed to clear album rating: " + error.message);
  }
}

// Display other users' album ratings
function displayAlbumRatings(albumRatings, albumRatingsVisible) {
  const container = document.getElementById("albumRatingsDisplay");
  if (!container) return;
  container.innerHTML = "";
  const visMap = albumRatingsVisible || {};

  // For past months, show all ratings regardless of visibility setting
  const _now = new Date();
  const _realMK = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
  const _viewedMK = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const _isPast = _viewedMK < _realMK;

  const ratingsArray = [];
  Object.entries(albumRatings || {}).forEach(([userEmail, rating]) => {
    // Skip users who have hidden their album rating (unless it's the current user or past month)
    if (
      userEmail !== currentUser?.email &&
      !_isPast &&
      visMap[userEmail] !== true
    )
      return;

    const participant = window.currentParticipants?.find(
      (p) => p.email === userEmail,
    );
    if (participant && userEmail !== currentUser?.email) {
      ratingsArray.push({
        email: userEmail,
        name: participant.name.split(" ")[0],
        picture: participant.picture,
        rating: rating,
      });
    }
  });

  if (ratingsArray.length === 0) return;

  const title = document.createElement("div");
  title.className = "ratings-display-title";
  title.textContent = "Other Ratings";
  container.appendChild(title);

  const ratingsGrid = document.createElement("div");
  ratingsGrid.className = "ratings-grid";

  ratingsArray.forEach(({ email, name, picture, rating }) => {
    const ratingItem = document.createElement("div");
    ratingItem.className = "rating-item";

    const avatar = document.createElement("img");
    avatar.src = picture;
    avatar.alt = name;
    avatar.className = "rating-avatar";
    avatar.onerror = () => {
      const emoji = getAnimalEmojiForUser(email);
      const emojiSpan = document.createElement("span");
      emojiSpan.textContent = emoji;
      emojiSpan.className = "rating-avatar-emoji";
      avatar.replaceWith(emojiSpan);
    };

    const nameEl = document.createElement("span");
    nameEl.className = "rating-name";
    nameEl.textContent = name;

    const ratingValueEl = document.createElement("span");
    ratingValueEl.className = "rating-value";
    ratingValueEl.textContent = rating;

    ratingItem.appendChild(avatar);
    ratingItem.appendChild(nameEl);
    ratingItem.appendChild(ratingValueEl);
    ratingsGrid.appendChild(ratingItem);
  });

  container.appendChild(ratingsGrid);
}

// Toggle highlight on participant's album when clicking their avatar
function toggleHighlightAlbum(email) {
  const albums = document.querySelectorAll(".album-card");
  const participant = document.querySelector(
    `.participant[data-email="${email}"]`,
  );

  // Check if already highlighted
  const isHighlighted = participant?.classList.contains("highlighted");

  if (isHighlighted) {
    // Remove highlight from participant
    participant.classList.remove("highlighted");

    // Remove highlight from their album
    albums.forEach((album) => {
      if (album.dataset.addedBy === email) {
        album.classList.remove("highlighted-album");
        album.style.removeProperty("--highlight-border");
        album.style.removeProperty("--highlight-shadow");
      }
    });

    // Remove highlight from track ratings
    document.querySelectorAll(".track-rating-highlight").forEach((el) => {
      el.classList.remove("track-rating-highlight");
      el.style.removeProperty("background");
      el.style.removeProperty("border-left");
      el.style.removeProperty("transform");
      el.style.removeProperty("box-shadow");
    });
  } else {
    // Remove all existing highlights first
    document
      .querySelectorAll(".participant.highlighted")
      .forEach((p) => p.classList.remove("highlighted"));
    document.querySelectorAll(".album-card.highlighted-album").forEach((a) => {
      a.classList.remove("highlighted-album");
      a.style.removeProperty("--highlight-border");
      a.style.removeProperty("--highlight-shadow");
    });
    document.querySelectorAll(".track-rating-highlight").forEach((el) => {
      el.classList.remove("track-rating-highlight");
      el.style.removeProperty("background");
      el.style.removeProperty("border-left");
      el.style.removeProperty("transform");
      el.style.removeProperty("box-shadow");
    });

    // Get participant's color
    const colorIndex = participant?.dataset.colorIndex;
    const colors = getParticipantColors();
    const color = colors[colorIndex % colors.length];

    // Add highlight to participant
    if (participant) {
      participant.classList.add("highlighted");
      participant.style.setProperty("--highlight-border", color.border);
      participant.style.setProperty("--highlight-shadow", color.shadow);
    }

    // Add highlight to their album
    albums.forEach((album) => {
      if (album.dataset.addedBy === email) {
        album.classList.add("highlighted-album");
        album.style.setProperty("--highlight-border", color.border);
        album.style.setProperty("--highlight-shadow", color.shadow);
      }
    });

    // Highlight their track ratings - highlight the whole track item
    document.querySelectorAll(".track-rating").forEach((rating) => {
      if (rating.dataset.userEmail === email) {
        // Find the parent track-item
        const trackItem = rating.closest(".track-item");
        if (trackItem) {
          trackItem.classList.add("track-rating-highlight");
          trackItem.style.background = `linear-gradient(135deg, ${color.border}20, ${color.shadow}20)`;
          trackItem.style.borderLeft = `4px solid ${color.border}`;
          trackItem.style.transform = "translateX(4px)";
          trackItem.style.transition = "all 0.3s ease";
          trackItem.style.boxShadow = `0 2px 8px ${color.shadow}`;
        }
      }
    });
  }
}

// Scroll the page to the album added by the specified email (mobile UX)
function scrollToAlbumByEmail(email) {
  if (!email) return;
  const albumCard = document.querySelector(
    `.album-card[data-added-by="${email}"]`,
  );
  if (!albumCard) return;

  // Scroll into view and add a temporary highlight class for feedback
  albumCard.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
  albumCard.classList.add("album-temp-focus");
  setTimeout(() => {
    albumCard.classList.remove("album-temp-focus");
  }, 1800);
}

// Mobile scroll-to-top behavior: show when scrolled down and handle click
document.addEventListener("DOMContentLoaded", () => {
  try {
    const scrollBtn = document.getElementById("mobileScrollTopBtn");
    if (!scrollBtn) return;

    const updateVisibility = () => {
      const isMobile = window.matchMedia("(max-width: 640px)").matches;
      if (!isMobile) {
        scrollBtn.classList.add("hidden");
        return;
      }
      if (window.scrollY > 200) scrollBtn.classList.remove("hidden");
      else scrollBtn.classList.add("hidden");
    };

    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    scrollBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      scrollBtn.classList.add("hidden");
    });

    // initial check
    updateVisibility();
  } catch (e) {
    console.warn("mobile scroll-top init failed", e);
  }
});

// Load albums from Firebase
async function loadAlbums(monthKey) {
  if (!db) {
    updateAlbums([]);
    updateAddAlbumButton([]);
    return;
  }

  try {
    const snapshot = await db
      .collection("albums")
      .where("monthKey", "==", monthKey)
      .get();

    const albums = [];
    snapshot.forEach((doc) => {
      const data = doc.data();

      albums.push({
        id: doc.id,
        title: data.title,
        artist: data.artist,
        coverUrl: data.coverUrl,
        youtubeUrl: data.youtubeUrl,
        playlistId: data.playlistId || "",
        tracks: data.tracks || [],
        trackRatings: data.trackRatings || {},
        albumRatings: data.albumRatings || {},
        albumRatingsVisible: data.albumRatingsVisible || {},
        externalLinks: data.externalLinks || [],
        albumNotes: data.albumNotes || {},
        votes: data.votes || {},
        addedBy: data.addedBy,
        addedByName: data.addedByName,
        locked: data.locked || false,
        createdAt: data.createdAt,
      });
    });

    // Store albums in global variable for access by updateParticipants
    window.currentAlbums = albums;

    // Update the albums array
    updateAlbums(albums);
    updateAddAlbumButton(albums);

    // Equalize album title heights so long titles don't break layout
    if (typeof clampAlbumTitles === "function") {
      clampAlbumTitles();
    }
    if (typeof equalizeAlbumTitleHeights === "function") {
      equalizeAlbumTitleHeights();
    }
  } catch (error) {
    console.error("Error loading albums:", error);
    updateAlbums([]);
    updateAddAlbumButton([]);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Show/hide Vote Best Album button based on state
function updateVoteBestAlbumButton() {
  const btn = document.getElementById("voteBestAlbumBtn");
  if (!btn) return;

  const albums = window.currentAlbums || [];
  const participants = window.currentParticipants || [];

  // Show button if there are at least 2 albums and at least 2 participants
  if (albums.length >= 2 && participants.length >= 2 && currentUser) {
    btn.classList.remove("hidden");

    // Check if everyone has voted on every album
    const allVoted = albums.every((album) => {
      const albumRatings = album.albumRatings || {};
      return participants.every((p) => albumRatings[p.email] !== undefined);
    });

    // Check if all ratings are already revealed (voting ended)
    const allRevealed =
      allVoted &&
      albums.every((album) => {
        const visMap = album.albumRatingsVisible || {};
        return participants.every((p) => visMap[p.email] === true);
      });

    if (allRevealed) {
      btn.textContent = "🏆 Voting Ended";
      btn.disabled = true;
      btn.classList.add("joined"); // reuse the greyed-out style
    } else {
      btn.textContent = allVoted ? "🏆 Reveal Winner" : "🏆 Vote Best Album";
      btn.disabled = false;
      btn.classList.remove("joined");
    }

    // Show reset button only for moderators when voting has ended
    const resetBtn = document.getElementById("resetVotingBtn");
    if (resetBtn) {
      if (allRevealed && currentUser && isModerator(currentUser.email)) {
        resetBtn.classList.remove("hidden");
      } else {
        resetBtn.classList.add("hidden");
      }
    }
  } else {
    btn.classList.add("hidden");
    const resetBtn = document.getElementById("resetVotingBtn");
    if (resetBtn) resetBtn.classList.add("hidden");
  }
}

// Vote Best Album — reveal all ratings and compute winner
async function voteBestAlbum() {
  const albums = window.currentAlbums || [];
  const participants = window.currentParticipants || [];

  if (albums.length === 0 || participants.length === 0) {
    await showCustomAlert("No albums or participants found.");
    return;
  }

  // Check that every participant has rated every album
  const missing = [];
  for (const album of albums) {
    const albumRatings = album.albumRatings || {};
    for (const participant of participants) {
      if (albumRatings[participant.email] === undefined) {
        const name = participant.name?.split(" ")[0] || participant.email;
        const title = album.title || "Untitled";
        missing.push(`${name} has not rated "${title}"`);
      }
    }
  }

  if (missing.length > 0) {
    const resultsContainer = document.getElementById("bestAlbumResults");
    if (!resultsContainer) return;

    const warningHtml = `
      <div class="best-album-missing-warning">
        <strong>Not everyone has voted yet!</strong><br />
        ${missing.map((m) => `• ${m}`).join("<br />")}
      </div>
      <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">All participants must rate all albums before revealing results.</p>
    `;
    resultsContainer.innerHTML = warningHtml;
    document.getElementById("bestAlbumModalTitle").textContent =
      "⏳ Waiting for Votes";
    document.getElementById("bestAlbumModal").classList.remove("hidden");
    return;
  }

  // Confirm before revealing
  const confirmed = await showCustomConfirm(
    "This will reveal all track and album ratings to everyone. Continue?",
  );
  if (!confirmed) return;

  // Make all album ratings visible and all track ratings visible
  try {
    for (const album of albums) {
      const updates = {};

      // Make all album ratings visible
      const albumRatingsVisible = { ...(album.albumRatingsVisible || {}) };
      for (const participant of participants) {
        albumRatingsVisible[participant.email] = true;
      }
      updates.albumRatingsVisible = albumRatingsVisible;

      // Make all track ratings visible
      const trackRatings = { ...(album.trackRatings || {}) };
      let trackRatingsChanged = false;
      for (const participant of participants) {
        const userRating = trackRatings[participant.email];
        if (userRating && userRating.ratings) {
          const ratingsVisible = { ...(userRating.ratingsVisible || {}) };
          const tracks = Object.keys(userRating.ratings);
          for (const trackKey of tracks) {
            if (ratingsVisible[trackKey] !== true) {
              ratingsVisible[trackKey] = true;
              trackRatingsChanged = true;
            }
          }
          trackRatings[participant.email] = {
            ...userRating,
            ratingsVisible,
          };
        }
      }
      if (trackRatingsChanged) {
        updates.trackRatings = trackRatings;
      }

      await db.collection("albums").doc(album.id).update(updates);

      // Update in-memory
      const idx = window.currentAlbums.findIndex((a) => a.id === album.id);
      if (idx !== -1) {
        window.currentAlbums[idx].albumRatingsVisible = albumRatingsVisible;
        if (trackRatingsChanged) {
          window.currentAlbums[idx].trackRatings = trackRatings;
        }
      }
    }
  } catch (e) {
    console.error("Error revealing ratings:", e);
    await showCustomAlert("Error revealing ratings. Please try again.");
    return;
  }

  // Compute results: mean of all participant album ratings per album
  const results = albums.map((album) => {
    const albumRatings = album.albumRatings || {};
    const scores = participants
      .map((p) => albumRatings[p.email])
      .filter((v) => v !== undefined);
    const mean =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return {
      album,
      mean,
      scores: participants.map((p) => ({
        name: p.name?.split(" ")[0] || p.email,
        picture: p.picture,
        email: p.email,
        score: albumRatings[p.email],
      })),
    };
  });

  // Sort by mean descending
  results.sort((a, b) => b.mean - a.mean);

  // Build results HTML
  const resultsContainer = document.getElementById("bestAlbumResults");
  if (!resultsContainer) return;

  let html = '<div class="best-album-results-list">';
  results.forEach((r, idx) => {
    const isWinner = idx === 0;
    const hue = (r.mean / 10) * 120;
    const color = `hsl(${hue}, 80%, 55%)`;
    const coverUrl = r.album.coverUrl || "";
    const title = sanitizeAlbumTitle(r.album.title) || "Untitled";
    const artist = sanitizeArtist(r.album.artist) || "";
    const coverId = `best-album-cover-${idx}`;

    html += `
      <div class="best-album-result-item ${isWinner ? "winner" : ""}">
        <div class="best-album-result-rank">${isWinner ? "🏆" : `#${idx + 1}`}</div>
        ${coverUrl ? `<img class="best-album-result-cover" id="${coverId}" src="${coverUrl}" alt="" onerror="this.style.display='none'" />` : ""}
        <div class="best-album-result-info">
          <div class="best-album-result-title">${title}</div>
          ${artist ? `<div class="best-album-result-artist">${artist}</div>` : ""}
          <div class="best-album-result-voters">
            ${r.scores
              .map(
                (s) =>
                  `<span class="best-album-voter">${s.name} <span class="best-album-voter-score">${s.score !== undefined ? s.score : "—"}</span></span>`,
              )
              .join("")}
          </div>
        </div>
        <div class="best-album-result-score" style="color: ${color}">${r.mean.toFixed(1)}</div>
      </div>
    `;
  });
  html += "</div>";

  resultsContainer.innerHTML = html;
  document.getElementById("bestAlbumModalTitle").textContent =
    `🏆 Best Album: ${results[0].album.title}`;
  document.getElementById("bestAlbumModal").classList.remove("hidden");

  // Reload albums to reflect new visibility
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  await loadAlbums(monthKey);
}

function closeBestAlbumModal() {
  document.getElementById("bestAlbumModal")?.classList.add("hidden");
}

// Reset Voting — moderator only: hide all album & track ratings again
async function resetVoting() {
  if (!currentUser || !isModerator(currentUser.email)) {
    await showCustomAlert("Only moderators can reset voting.");
    return;
  }

  const confirmed = await showCustomConfirm(
    "This will hide all revealed ratings and reset the voting state. Continue?",
  );
  if (!confirmed) return;

  const albums = window.currentAlbums || [];
  const participants = window.currentParticipants || [];

  try {
    for (const album of albums) {
      const updates = {};

      // Reset all album ratings visibility to false
      const albumRatingsVisible = { ...(album.albumRatingsVisible || {}) };
      for (const participant of participants) {
        if (albumRatingsVisible[participant.email] !== undefined) {
          albumRatingsVisible[participant.email] = false;
        }
      }
      updates.albumRatingsVisible = albumRatingsVisible;

      // Reset all track ratings visibility to false
      const trackRatings = { ...(album.trackRatings || {}) };
      let trackRatingsChanged = false;
      for (const participant of participants) {
        const userRating = trackRatings[participant.email];
        if (userRating && userRating.ratingsVisible) {
          const ratingsVisible = { ...(userRating.ratingsVisible || {}) };
          for (const trackKey of Object.keys(ratingsVisible)) {
            if (ratingsVisible[trackKey] === true) {
              ratingsVisible[trackKey] = false;
              trackRatingsChanged = true;
            }
          }
          trackRatings[participant.email] = {
            ...userRating,
            ratingsVisible,
          };
        }
      }
      if (trackRatingsChanged) {
        updates.trackRatings = trackRatings;
      }

      await db.collection("albums").doc(album.id).update(updates);

      // Update in-memory
      const idx = window.currentAlbums.findIndex((a) => a.id === album.id);
      if (idx !== -1) {
        window.currentAlbums[idx].albumRatingsVisible = albumRatingsVisible;
        if (trackRatingsChanged) {
          window.currentAlbums[idx].trackRatings = trackRatings;
        }
      }
    }

    // Reload albums to reflect changes
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    await loadAlbums(monthKey);

    await showCustomAlert(
      "Voting has been reset. All ratings are hidden again.",
    );
  } catch (e) {
    console.error("Error resetting voting:", e);
    await showCustomAlert("Error resetting voting. Please try again.");
  }
}

// Load YouTube API
loadYouTubeAPI();

// Make onYouTubeIframeAPIReady available globally
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
