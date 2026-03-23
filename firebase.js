// =============================================
// ADPAY — FIREBASE REAL-TIME LAYER
// firebase.js — included by both index.html and admin.html
// =============================================
// 
// SETUP INSTRUCTIONS (one-time, ~5 minutes):
// 1. Go to https://console.firebase.google.com
// 2. Click "Add project" → name it "adpay" → Continue
// 3. Disable Google Analytics → Create project
// 4. Click "Web" icon (</>) → Register app as "adpay-web"
// 5. Copy the firebaseConfig object below and replace the placeholder
// 6. In Firebase console: Build → Firestore Database → Create database → Start in test mode
// 7. Build → Authentication → Get started → Email/Password → Enable
// 8. Deploy your files to any host (Netlify, Vercel, Firebase Hosting)
//
// YOUR FIREBASE CONFIG (replace with yours from Firebase console):
// =============================================

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// =============================================
// FIREBASE SDK (loaded via CDN in HTML files)
// This file sets up the db/auth references
// and exports helper functions used by both
// index.html (users) and admin.html (admin)
// =============================================

let db, auth, rtdb;
let isFirebaseReady = false;

async function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db     = firebase.firestore();
    auth   = firebase.auth();
    rtdb   = firebase.database ? firebase.database() : null;

    // Enable offline persistence for fast navigation
    await db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition') console.warn('Persistence: multiple tabs open');
      if (err.code === 'unimplemented')        console.warn('Persistence not supported');
    });

    isFirebaseReady = true;
    console.log('✅ Firebase connected');

    // Seed initial data if first run
    await seedInitialData();
    return true;
  } catch (err) {
    console.error('Firebase init error:', err);
    isFirebaseReady = false;
    return false;
  }
}

// =============================================
// SEED INITIAL DATA (only runs once)
// =============================================
async function seedInitialData() {
  const snap = await db.collection('meta').doc('seeded').get();
  if (snap.exists) return; // already seeded

  const batch = db.batch();

  // Seed ads
  const adsData = [
    { name:'GameZone Pro',      category:'gaming',    pay:0.50, icon:'🎮', duration:30, views:1204, status:'active', description:'Action-packed mobile gaming',   videoUrl:'', thumbnail:'' },
    { name:'CryptoWallet X',    category:'finance',   pay:0.60, icon:'💰', duration:25, views:887,  status:'active', description:'Secure crypto wallet',          videoUrl:'', thumbnail:'' },
    { name:'FitLife Coach',     category:'lifestyle', pay:0.45, icon:'🏋️', duration:20, views:643,  status:'active', description:'Personal fitness & nutrition',  videoUrl:'', thumbnail:'' },
    { name:'ShopEasy',          category:'shopping',  pay:0.40, icon:'🛍️', duration:15, views:1567, status:'active', description:'Online shopping made easy',     videoUrl:'', thumbnail:'' },
    { name:'MusicPro Studio',   category:'lifestyle', pay:0.35, icon:'🎵', duration:20, views:422,  status:'active', description:'Create & discover music',        videoUrl:'', thumbnail:'' },
    { name:'LearnFast Academy', category:'education', pay:0.55, icon:'📚', duration:35, views:299,  status:'active', description:'Online courses & skill building',videoUrl:'', thumbnail:'' },
    { name:'RideShare Go',      category:'lifestyle', pay:0.50, icon:'🚕', duration:25, views:754,  status:'active', description:'Affordable city rides',          videoUrl:'', thumbnail:'' },
    { name:'FoodDash Delivery', category:'shopping',  pay:0.45, icon:'🍔', duration:20, views:932,  status:'active', description:'Fast food delivery service',     videoUrl:'', thumbnail:'' },
    { name:'InvestSmart',       category:'finance',   pay:0.65, icon:'📈', duration:30, views:188,  status:'paused', description:'Smart investing platform',      videoUrl:'', thumbnail:'' },
    { name:'TravelLite',        category:'lifestyle', pay:0.40, icon:'✈️', duration:25, views:367,  status:'active', description:'Budget travel booking',          videoUrl:'', thumbnail:'' },
  ];
  adsData.forEach(ad => {
    const ref = db.collection('ads').doc();
    batch.set(ref, { ...ad, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });

  // Seed demo transactions
  const txns = [
    { type:'earning',    amount:0.50, method:'Ad Watch',           status:'completed', desc:'GameZone Pro Ad',      date: new Date('2025-03-15T14:32:00').toISOString() },
    { type:'withdrawal', amount:20.00, method:'PayPal',            status:'completed', desc:'Withdrawal to PayPal', date: new Date('2025-03-14T10:00:00').toISOString() },
    { type:'deposit',    amount:10.00, method:'Debit/Credit Card', status:'completed', desc:'Top-up deposit',       date: new Date('2025-03-13T09:15:00').toISOString() },
  ];
  txns.forEach(t => {
    const ref = db.collection('transactions').doc();
    batch.set(ref, { ...t, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });

  // Mark as seeded
  batch.set(db.collection('meta').doc('seeded'), { at: new Date().toISOString() });
  await batch.commit();
  console.log('✅ Initial data seeded');
}

// =============================================
// AUTH HELPERS
// =============================================
async function fbRegister(name, email, phone, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;
  await cred.user.updateProfile({ displayName: name });

  const userData = {
    uid, name, email, phone,
    balance: 0, adsWatched: 0, totalEarned: 0, referrals: 0,
    tier: 'Starter', status: 'active', role: 'user',
    refCode: 'ADPAY-' + name.split(' ')[0].toUpperCase().slice(0,4) + uid.slice(0,4).toUpperCase(),
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    watchedAds: []
  };
  await db.collection('users').doc(uid).set(userData);
  return userData;
}

async function fbLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const snap = await db.collection('users').doc(cred.user.uid).get();
  if (!snap.exists) throw new Error('User profile not found');
  return { uid: cred.user.uid, ...snap.data() };
}

async function fbLogout() {
  await auth.signOut();
}

// =============================================
// USER HELPERS
// =============================================
function watchUser(uid, callback) {
  return db.collection('users').doc(uid).onSnapshot(snap => {
    if (snap.exists) callback({ uid: snap.id, ...snap.data() });
  });
}

async function updateUser(uid, data) {
  await db.collection('users').doc(uid).update(data);
}

async function getUser(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { uid: snap.id, ...snap.data() } : null;
}

// =============================================
// ADS HELPERS
// =============================================
function watchAds(callback) {
  return db.collection('ads')
    .where('status', '==', 'active')
    .onSnapshot(snap => {
      const ads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(ads);
    });
}

function watchAllAds(callback) {
  return db.collection('ads')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      const ads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(ads);
    });
}

async function saveAd(adData, adId = null) {
  if (adId) {
    await db.collection('ads').doc(adId).update({ ...adData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return adId;
  } else {
    const ref = await db.collection('ads').add({ ...adData, views: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  }
}

async function deleteAdFb(adId) {
  await db.collection('ads').doc(adId).delete();
}

async function recordAdView(uid, adId, adName, earned) {
  const batch = db.batch();
  // Update ad view count
  batch.update(db.collection('ads').doc(adId), {
    views: firebase.firestore.FieldValue.increment(1)
  });
  // Update user stats
  batch.update(db.collection('users').doc(uid), {
    balance:      firebase.firestore.FieldValue.increment(earned),
    totalEarned:  firebase.firestore.FieldValue.increment(earned),
    adsWatched:   firebase.firestore.FieldValue.increment(1),
    watchedAds:   firebase.firestore.FieldValue.arrayUnion(adId)
  });
  await batch.commit();
  // Log transaction
  await addTransaction(uid, 'earning', earned, 'Ad Watch', `${adName} Ad`, 'completed');
}

// =============================================
// TRANSACTION HELPERS
// =============================================
async function addTransaction(uid, type, amount, method, desc, status = 'completed') {
  const txn = {
    uid, type, amount, method, desc, status,
    date: new Date().toISOString(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection('transactions').add(txn);
  return txn;
}

function watchUserTransactions(uid, callback) {
  return db.collection('transactions')
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

// =============================================
// ADMIN HELPERS
// =============================================
function watchAllUsers(callback) {
  return db.collection('users')
    .orderBy('joinedAt', 'desc')
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
}

function watchAllTransactions(callback) {
  return db.collection('transactions')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

async function adminUpdateUser(uid, data) {
  await db.collection('users').doc(uid).update(data);
}

async function approveTxnFb(txnId) {
  await db.collection('transactions').doc(txnId).update({ status: 'completed' });
}

async function rejectTxnFb(txnId, uid, amount) {
  const batch = db.batch();
  batch.update(db.collection('transactions').doc(txnId), { status: 'rejected' });
  batch.update(db.collection('users').doc(uid), {
    balance: firebase.firestore.FieldValue.increment(amount)
  });
  await batch.commit();
}

async function getAdminStats() {
  const [usersSnap, txnsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('transactions').get()
  ]);
  const txns = txnsSnap.docs.map(d => d.data());
  return {
    totalUsers:   usersSnap.size,
    totalPaid:    txns.filter(t=>t.type==='earning'&&t.status==='completed').reduce((s,t)=>s+t.amount,0),
    totalDeposits:txns.filter(t=>t.type==='deposit'&&t.status==='completed').reduce((s,t)=>s+t.amount,0),
    totalAdsWatched: usersSnap.docs.reduce((s,d)=>s+(d.data().adsWatched||0),0),
    pending: txns.filter(t=>t.status==='pending').length
  };
}

// =============================================
// PRESENCE / ONLINE STATUS (via Realtime DB)
// =============================================
function setUserPresence(uid) {
  if (!rtdb) return;
  const presenceRef = rtdb.ref('presence/' + uid);
  presenceRef.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
  presenceRef.onDisconnect().update({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
}
