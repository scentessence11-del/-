/* ============================================================
   cloud.js — طبقة الاتصال بـ Firebase
============================================================ */
(function () {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyAxsYtPU9ICX6Q_D3mKtK8AELKAEDLcxug",
    authDomain: "mkzoni.firebaseapp.com",
    projectId: "mkzoni",
    storageBucket: "mkzoni.firebasestorage.app",
    messagingSenderId: "554671083741",
    appId: "1:554671083741:web:952a666621f44df2d44b34",
    measurementId: "G-1KQMPVDEZT"
  };

  var Cloud = {
    ready: false,
    auth: null,
    db: null,
    currentUser: null,
    onAuthChangeCallbacks: [],
    _pendingWrites: 0,
    _statusCallbacks: [],

    init: function () {
      if (typeof firebase === "undefined") return false;
      try {
        firebase.initializeApp(firebaseConfig);
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
        this.ready = true;
        var self = this;
        this.auth.onAuthStateChanged(function (user) {
          self.currentUser = user;
          self.onAuthChangeCallbacks.forEach(function (cb) { try { cb(user); } catch (e) {} });
        });
        return true;
      } catch (e) { return false; }
    },

    onAuthChange: function (cb) {
      this.onAuthChangeCallbacks.push(cb);
      if (this.currentUser !== undefined) { try { cb(this.currentUser); } catch (e) {} }
    },
    onStatus: function (cb) { this._statusCallbacks.push(cb); },
    _emitStatus: function (state, msg) {
      this._statusCallbacks.forEach(function (cb) { try { cb(state, msg); } catch (e) {} });
    },

    signUp: function (email, password) { return this.auth.createUserWithEmailAndPassword(email, password); },
    signIn: function (email, password) { return this.auth.signInWithEmailAndPassword(email, password); },
    signInWithGoogle: function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      return this.auth.signInWithPopup(provider);
    },
    signOut: function () { return this.auth.signOut(); },

    // === دوال الجوال المحدثة ===
    setupRecaptcha: function (containerId) {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
          size: 'invisible',
          callback: function (response) {}
        });
      }
      return window.recaptchaVerifier;
    },
    signInWithPhone: function (phoneNumber) {
      var verifier = this.setupRecaptcha('recaptcha-container');
      return this.auth.signInWithPhoneNumber(phoneNumber, verifier);
    },
    confirmPhoneCode: function (confirmationResult, code) {
      return confirmationResult.confirm(code);
    },
    clearRecaptcha: function () {
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(e){}
        window.recaptchaVerifier = null;
      }
    },

    changePassword: function (newPassword) {
      if (!this.currentUser) return Promise.reject(new Error("لا يوجد مستخدم"));
      return this.currentUser.updatePassword(newPassword);
    },
    changeEmail: function (newEmail) {
      if (!this.currentUser) return Promise.reject(new Error("لا يوجد مستخدم"));
      return this.currentUser.updateEmail(newEmail);
    },
    sendPasswordReset: function (email) { return this.auth.sendPasswordResetEmail(email); },

    saveDocument: function (key, data) {
      if (!this.currentUser) return Promise.reject(new Error("غير مسجل"));
      var self = this;
      self._pendingWrites++; self._emitStatus("saving", "");
      return this.db.collection("users").doc(this.currentUser.uid).collection("data").doc(key)
        .set({ value: data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () {
          self._pendingWrites--;
          if (self._pendingWrites === 0) self._emitStatus("saved", "");
          return true;
        }).catch(function (err) {
          self._pendingWrites--; self._emitStatus("error", err.message); throw err;
        });
    },

    loadAllData: function () {
      if (!this.currentUser) return Promise.reject(new Error("غير مسجل"));
      var self = this; self._emitStatus("loading", "");
      return this.db.collection("users").doc(this.currentUser.uid).collection("data").get()
        .then(function (snap) {
          var result = {};
          snap.forEach(function (doc) {
            var d = doc.data();
            if (d && d.value !== undefined && d.value !== null) result[doc.id] = d.value;
          });
          self._emitStatus("loaded", ""); return result;
        }).catch(function (err) { self._emitStatus("error", err.message); throw err; });
    },

    listenToAll: function (callback) {
      if (!this.currentUser) return Promise.reject(new Error("غير مسجل"));
      return this.db.collection("users").doc(this.currentUser.uid).collection("data")
        .onSnapshot(function (snap) {
          var result = {};
          snap.forEach(function (doc) {
            var d = doc.data();
            if (d && d.value !== undefined && d.value !== null) result[doc.id] = d.value;
          });
          callback(result);
        }, function (err) {});
    },
    getUser: function () { return this.currentUser; },
    isSignedIn: function () { return !!this.currentUser; }
  };

  window.Cloud = Cloud;
})();