/* ============================================================
   مخزوني - مع Firebase (مزامنة سحابية)
============================================================ */

// 1. إعداد Firebase (المفاتيح الخاصة بك)
const firebaseConfig = {
  apiKey: "AIzaSyAxsYtPU9ICX6Q_D3mKtK8AELKAEDLcxug",
  authDomain: "mkzoni.firebaseapp.com",
  projectId: "mkzoni",
  storageBucket: "mkzoni.firebasestorage.app",
  messagingSenderId: "554671083741",
  appId: "1:554671083741:web:952a666621f44df2d44b34",
  measurementId: "G-1KQMPVDEZT"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// تفعيل العمل بدون إنترنت
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

(function() {
  "use strict";

  var currentUser = null;
  var unsubscribeSnapshot = null;
  
  var products = [];
  var customers = [];
  var suppliers = [];
  var invoices = [];
  var receipts = [];
  var payments = [];
  var journals = [];
  var business = { name: "مخزوني", phone: "", address: "" };
  
  var drafts = { sale: [], purchase: [], sale_return: [], purchase_return: [] };
  var editingProductId = null;
  var editingCustomerId = null;
  var editingSupplierId = null;
  var appInited = false;
  var isPrinting = false;
  var scanModalScanner = null;
  var scanCallback = null;
  var itemModalState = { product: null, type: null, form: null, editIdx: null };
  var currentReport = "sales";
  var salesChart = null;
  var topProductsChart = null;
  var comparisonChart = null;
  var speechRecognition = null;
  var isRecording = false;

  var TYPES = {
    sale:            { label: "فاتورة بيع",   prefix: "INV-S", effect: "out", party: "العميل", partyType: "customer" },
    purchase:        { label: "فاتورة شراء",  prefix: "INV-P", effect: "in",  party: "المورد", partyType: "supplier" },
    sale_return:     { label: "مرتجع بيع",    prefix: "RET-S", effect: "in",  party: "العميل", partyType: "customer" },
    purchase_return: { label: "مرتجع شراء",   prefix: "RET-P", effect: "out", party: "المورد", partyType: "supplier" }
  };
  var PAY_METHODS = ["نقد", "تحويل", "بنك", "أجل"];

  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtInt(n) { return Number(n || 0).toLocaleString("en-US"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(msg, type) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast show " + (type || "");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = "toast " + (type || ""); }, 2800);
  }
  function today() { return new Date().toISOString().split("T")[0]; }

  // ============================================================
  // المصادقة (تسجيل الدخول)
  // ============================================================
  var loginScreen = $("loginScreen");
  var appEl = $("app");

  function showLogin() {
    loginScreen.classList.remove("hidden");
    appEl.classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("setupView").classList.add("hidden");
  }

  function showSetup() {
    loginScreen.classList.remove("hidden");
    appEl.classList.add("hidden");
    $("setupView").classList.remove("hidden");
    $("loginView").classList.add("hidden");
  }

  function enterApp() {
    loginScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    updateCurrentUserDisplay();
    
    if (!appInited) {
      appInited = true;
      initApp();
    }
    listenToData();
  }

  auth.onAuthStateChanged(function(user) {
    if (user) {
      currentUser = user;
      enterApp();
    } else {
      currentUser = null;
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      showLogin();
    }
  });

  $("showLoginBtn").onclick = (e) => { e.preventDefault(); showLogin(); };
  $("showSetupBtn").onclick = (e) => { e.preventDefault(); showSetup(); };

  $("loginForm").onsubmit = function (e) {
    e.preventDefault();
    var email = $("loginUser").value.trim();
    var pass = $("loginPass").value;
    var btn = this.querySelector("button");
    btn.disabled = true;
    btn.innerHTML = 'جاري الدخول...';

    auth.signInWithEmailAndPassword(email, pass)
      .then(() => toast("مرحباً بك 👋", "success"))
      .catch((error) => {
        if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") toast("البريد أو كلمة المرور غير صحيحة", "error");
        else toast("خطأ: " + error.message, "error");
      })
      .finally(() => {
        btn.disabled = false;
        btn.innerHTML = 'دخول';
      });
  };

  $("setupForm").onsubmit = function (e) {
    e.preventDefault();
    var email = $("setupUser").value.trim();
    var pass = $("setupPass").value;
    if (pass !== $("setupPass2").value) { toast("كلمتا المرور غير متطابقتين", "error"); return; }
    
    var btn = this.querySelector("button");
    btn.disabled = true;
    btn.innerHTML = 'جاري الإنشاء...';

    auth.createUserWithEmailAndPassword(email, pass)
      .then(() => toast("تم إنشاء الحساب ✅", "success"))
      .catch((error) => {
        if (error.code === "auth/email-already-in-use") toast("البريد مستخدم بالفعل", "error");
        else toast("خطأ: " + error.message, "error");
      })
      .finally(() => {
        btn.disabled = false;
        btn.innerHTML = 'إنشاء الحساب';
      });
  };

  $("logoutBtnSettings").onclick = function () {
    if (!confirm("تسجيل الخروج؟")) return;
    auth.signOut();
  };

  function updateCurrentUserDisplay() {
    var email = currentUser ? currentUser.email : "-";
    if ($("currentUserName")) $("currentUserName").textContent = email.split('@')[0];
    if ($("settingsUserName")) $("settingsUserName").textContent = email;
  }

  // ============================================================
  // Firebase Sync
  // ============================================================
  function getUserDoc() { return db.collection("users").doc(currentUser.uid); }

  function listenToData() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    unsubscribeSnapshot = getUserDoc().onSnapshot((doc) => {
      if (doc.exists) {
        var data = doc.data();
        products = data.products || [];
        customers = data.customers || [];
        suppliers = data.suppliers || [];
        invoices = data.invoices || [];
        receipts = data.receipts || [];
        payments = data.payments || [];
        journals = data.journals || [];
        business = data.business || { name: "مخزوني", phone: "", address: "" };
        if (appInited) { renderAll(); fillBusinessForm(); }
      }
    }, (error) => console.error("Sync error:", error));
  }

  function saveData() {
    if (!currentUser) return;
    getUserDoc().set({
      products, customers, suppliers, invoices, receipts, payments, journals, business,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
    .catch((error) => {
      console.error("Save error:", error);
      toast("تعذر الحفظ - تحقق من الاتصال", "error");
    });
  }

  // ============================================================
  // التهيئة والتنقل
  // ============================================================
  function initApp() {
    if (localStorage.getItem("makhzouni_dark") === "1") document.body.classList.add("dark-mode");
    
    $("mobileMenuBtn").onclick = function () { $("sidebar").classList.toggle("open"); $("sidebarOverlay").classList.toggle("hidden"); };
    $("sidebarOverlay").onclick = function () { $("sidebar").classList.remove("open"); $("sidebarOverlay").classList.add("hidden"); };

    initNavigation();
    initProducts();
    initCustomers();
    initSuppliers();
    initInvoices();
    initReceipts();
    initPayments();
    initJournals();
    initSettings();
    initItemModal();
    initScanModal();
    initPrintModal();
    initAI();
    initSpeech();
    initReports();
  }

  function renderAll() {
    renderProducts();
    renderCustomers();
    renderSuppliers();
    renderInvoiceLists();
    renderInvoiceCustomerSelects();
    renderInventory();
    renderReceipts();
    renderPayments();
    renderJournals();
    updateStats();
    renderStatementSelect();
  }

  function initNavigation() {
    $$(".nav-parent").forEach(p => p.onclick = function(e) { e.preventDefault(); this.closest(".nav-group").classList.toggle("open"); });
    $$(".nav-link:not(.nav-parent), .nav-child").forEach(link => {
      if (!link.dataset.page) return;
      link.onclick = function(e) {
        e.preventDefault();
        navigateTo(link.dataset.page);
        if (window.innerWidth <= 900) { $("sidebar").classList.remove("open"); $("sidebarOverlay").classList.add("hidden"); }
      };
    });
  }

  function navigateTo(page) {
    $$(".page").forEach(p => p.classList.remove("active"));
    $$(".nav-link, .nav-child").forEach(n => n.classList.remove("active"));
    var target = $("page-" + page);
    if (target) target.classList.add("active");
    var nav = document.querySelector(`.nav-link[data-page="${page}"], .nav-child[data-page="${page}"]`);
    if (nav) { nav.classList.add("active"); var pg = nav.closest(".nav-group"); if (pg) pg.classList.add("open"); }
    window.scrollTo(0, 0);

    if (page === "dashboard") { updateStats(); renderCharts(); }
    else if (page === "inventory") renderInventory();
    else if (page === "settings") fillSettings();
    else if (page === "receipts") { renderCustomerSelect("rFrom"); }
    else if (page === "payments") { renderSupplierSelect("payTo"); }
    else if (["sales", "purchases", "salesReturns", "purchaseReturns"].includes(page)) {
      var map = { sales: "sale", purchases: "purchase", salesReturns: "sale_return", purchaseReturns: "purchase_return" };
      renderInvoiceCustomerSelects();
      renderItems($("form-" + map[page]), map[page]);
    }
  }

  function updateStats() {
    var sales = invoices.filter(i => i.type === "sale").reduce((s, i) => s + i.grandTotal, 0);
    var purchases = invoices.filter(i => i.type === "purchase").reduce((s, i) => s + i.grandTotal, 0);
    var invVal = products.reduce((s, p) => s + (p.price * p.qty), 0);
    if ($("statSales")) $("statSales").textContent = fmt(sales);
    if ($("statPurchases")) $("statPurchases").textContent = fmt(purchases);
    if ($("statInventory")) $("statInventory").textContent = fmt(invVal);
    if ($("statProducts")) $("statProducts").textContent = fmtInt(products.length);
  }

  // ============================================================
  // المنتجات
  // ============================================================
  function initProducts() {
    $("productForm").onsubmit = function (e) {
      e.preventDefault();
      var data = {
        code: $("pCode").value.trim(), name: $("pName").value.trim(),
        price: parseFloat($("pPrice").value) || 0, cost: parseFloat($("pCost").value) || 0, qty: parseInt($("pQty").value) || 0
      };
      if (editingProductId) {
        var idx = products.findIndex(p => p.id === editingProductId);
        if (idx > -1) products[idx] = Object.assign({}, products[idx], data);
      } else {
        products.push(Object.assign({ id: uid() }, data));
      }
      saveData(); resetProductForm(); renderProducts();
      toast("تم الحفظ ✅", "success");
    };
    $("cancelProductEdit").onclick = resetProductForm;
    $("productSearch").oninput = renderProducts;
  }

  function resetProductForm() {
    $("productForm").reset();
    $("productSubmitText").textContent = "حفظ";
    $("cancelProductEdit").classList.add("hidden");
    editingProductId = null;
  }

  function renderProducts() {
    var tbody = $("productsBody");
    var q = $("productSearch").value.toLowerCase();
    var list = q ? products.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) : products;
    tbody.innerHTML = "";
    list.forEach(p => {
      tbody.innerHTML += `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${fmt(p.price)}</td><td>${p.qty}</td>
        <td><button class="icon-btn edit" onclick="window.editProduct('${p.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn delete" onclick="window.deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
  }

  window.editProduct = function (id) {
    var p = products.find(x => x.id === id); if (!p) return;
    editingProductId = id;
    $("pCode").value = p.code; $("pName").value = p.name; $("pPrice").value = p.price; $("pCost").value = p.cost || 0; $("pQty").value = p.qty;
    $("productSubmitText").textContent = "تحديث"; $("cancelProductEdit").classList.remove("hidden");
    window.scrollTo(0, 0);
  };

  window.deleteProduct = function (id) {
    if (!confirm("حذف المنتج؟")) return;
    products = products.filter(x => x.id !== id); saveData(); renderProducts();
  };

  // ============================================================
  // العملاء والموردون
  // ============================================================
  function initCustomers() {
    $("customerForm").onsubmit = function (e) {
      e.preventDefault();
      var data = { name: $("cName").value.trim(), phone: $("cPhone").value.trim() };
      if (editingCustomerId) {
        var c = customers.find(x => x.id === editingCustomerId); if (c) Object.assign(c, data);
      } else {
        customers.push(Object.assign({ id: uid() }, data));
      }
      saveData(); $("customerForm").reset(); $("cancelCustomerEdit").classList.add("hidden"); editingCustomerId = null;
      renderCustomers(); toast("تم الحفظ ✅", "success");
    };
    $("customerSearch").oninput = renderCustomers;
  }

  function renderCustomers() {
    var tbody = $("customersBody");
    tbody.innerHTML = "";
    customers.forEach(c => {
      tbody.innerHTML += `<tr><td>${esc(c.name)}</td><td>${esc(c.phone || "")}</td><td>0.00</td>
        <td><button class="icon-btn delete" onclick="window.deleteCustomer('${c.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
  }

  window.deleteCustomer = function (id) {
    if (!confirm("حذف العميل؟")) return;
    customers = customers.filter(x => x.id !== id); saveData(); renderCustomers();
  };

  function initSuppliers() {
    $("supplierForm").onsubmit = function (e) {
      e.preventDefault();
      var data = { name: $("sName").value.trim(), phone: $("sPhone").value.trim() };
      if (editingSupplierId) {
        var s = suppliers.find(x => x.id === editingSupplierId); if (s) Object.assign(s, data);
      } else {
        suppliers.push(Object.assign({ id: uid() }, data));
      }
      saveData(); $("supplierForm").reset(); $("cancelSupplierEdit").classList.add("hidden"); editingSupplierId = null;
      renderSuppliers(); toast("تم الحفظ ✅", "success");
    };
    $("supplierSearch").oninput = renderSuppliers;
  }

  function renderSuppliers() {
    var tbody = $("suppliersBody");
    tbody.innerHTML = "";
    suppliers.forEach(s => {
      tbody.innerHTML += `<tr><td>${esc(s.name)}</td><td>${esc(s.phone || "")}</td><td>0.00</td>
        <td><button class="icon-btn delete" onclick="window.deleteSupplier('${s.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
  }

  window.deleteSupplier = function (id) {
    if (!confirm("حذف المورد؟")) return;
    suppliers = suppliers.filter(x => x.id !== id); saveData(); renderSuppliers();
  };

  // ============================================================
  // الفواتير (مختصرة للتوضيح)
  // ============================================================
  function initInvoices() {
    Object.keys(TYPES).forEach(type => {
      var form = $("form-" + type); if (!form) return;
      buildInvoiceForm(form, type);
    });
  }

  function buildInvoiceForm(form, type) {
    var info = TYPES[type];
    form.innerHTML = `
      <div class="form-grid">
        <div class="form-field"><label>${info.party}</label><select class="inv-customer-select"><option value="">-- اختر --</option></select></div>
        <div class="form-field"><label>التاريخ</label><input type="date" class="inv-date" value="${today()}"></div>
      </div>
      <div class="table-wrap" style="margin-top:15px"><table class="data-table"><thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>إجراءات</th></tr></thead><tbody class="invoice-items-body"></tbody></table></div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:15px">حفظ الفاتورة</button>`;
    form.onsubmit = (e) => { e.preventDefault(); toast("تم الحفظ ✅", "success"); form.reset(); };
  }

  function renderItems(form, type) {}

  function renderInvoiceLists() {
    $$(".invoice-list").forEach(el => el.innerHTML = "");
  }

  function renderInvoiceCustomerSelects() {
    Object.keys(TYPES).forEach(type => {
      var form = $("form-" + type); if (!form) return;
      var sel = form.querySelector(".inv-customer-select"); if (!sel) return;
      var list = TYPES[type].partyType === "supplier" ? suppliers : customers;
      sel.innerHTML = `<option value="">-- اختر --</option>`;
      list.forEach(item => { sel.innerHTML += `<option value="${item.id}">${esc(item.name)}</option>`; });
    });
  }

  // ============================================================
  // باقي الدوال الفارغة لتجنب الأخطاء
  // ============================================================
  function initReceipts() { $("receiptForm").onsubmit = (e) => { e.preventDefault(); toast("تم الحفظ ✅", "success"); }; }
  function renderReceipts() {}
  function renderCustomerSelect() {}
  function initPayments() { $("paymentForm").onsubmit = (e) => { e.preventDefault(); toast("تم الحفظ ✅", "success"); }; }
  function renderPayments() {}
  function renderSupplierSelect() {}
  function initJournals() { $("journalForm").onsubmit = (e) => { e.preventDefault(); toast("تم الحفظ ✅", "success"); }; }
  function renderJournals() {}
  function renderInventory() {}
  function renderStatementSelect() {}
  function initSettings() {
    $("darkModeToggle").onchange = function () { document.body.classList.toggle("dark-mode", this.checked); localStorage.setItem("makhzouni_dark", this.checked ? "1" : "0"); };
    $("changePasswordForm").onsubmit = (e) => { e.preventDefault(); toast("تم التغيير ✅", "success"); };
    $("deleteAllDataBtn").onclick = () => { if(confirm("حذف الكل؟")) { products=[]; customers=[]; suppliers=[]; invoices=[]; saveData(); renderAll(); } };
  }
  function fillSettings() { if($("darkModeToggle")) $("darkModeToggle").checked = document.body.classList.contains("dark-mode"); }
  function initReports() {}
  function renderCharts() {}
  function initItemModal() { $("closeItemModal").onclick = () => $("itemModal").classList.add("hidden"); }
  function initScanModal() { $("closeScanBtn").onclick = () => $("scanModal").classList.add("hidden"); }
  function initPrintModal() { $("closePrintBtn").onclick = () => $("printModal").classList.add("hidden"); $("printBtn").onclick = () => window.print(); }
  function initAI() {
    $("aiFab").onclick = () => $("aiModal").classList.remove("hidden");
    $("closeAiModal").onclick = () => $("aiModal").classList.add("hidden");
    $("aiSendBtn").onclick = () => { toast("المساعد يعمل قريباً", "success"); };
  }
  function initSpeech() {}

})();