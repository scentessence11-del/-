(function() {
  "use strict";

  var ACCOUNTS_KEY = "makhzouni_accounts";
  var CURRENT_USER_KEY = "makhzouni_current_user";
  var DARK_MODE_KEY = "makhzouni_dark";

  var TYPES = {
    sale:            { label: "فاتورة بيع",   prefix: "INV-S", effect: "out", party: "العميل", partyType: "customer" },
    purchase:        { label: "فاتورة شراء",  prefix: "INV-P", effect: "in",  party: "المورد", partyType: "supplier" },
    sale_return:     { label: "مرتجع بيع",    prefix: "RET-S", effect: "in",  party: "العميل", partyType: "customer" },
    purchase_return: { label: "مرتجع شراء",   prefix: "RET-P", effect: "out", party: "المورد", partyType: "supplier" }
  };
  var PAY_METHODS = ["نقد", "تحويل", "بنك", "أجل"];

  var currentUser = null;
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

  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function load(key, fb) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; }
    catch (e) { return fb; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { console.error("Save:", e); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtInt(n) { return Number(n || 0).toLocaleString("en-US"); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function toast(msg, type) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast show " + (type || "");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = "toast " + (type || ""); }, 2800);
  }
  function today() { return new Date().toISOString().split("T")[0]; }

  function getUserKey(key) { return "user_" + (currentUser || "guest") + "_" + key; }
  function loadUserData(key, fb) { return load(getUserKey(key), fb); }
  function saveUserData(key, val) { save(getUserKey(key), val); }
  function loadAllData() {
    products = loadUserData("products", []);
    customers = loadUserData("customers", []);
    suppliers = loadUserData("suppliers", []);
    invoices = loadUserData("invoices", []);
    receipts = loadUserData("receipts", []);
    payments = loadUserData("payments", []);
    journals = loadUserData("journals", []);
    business = loadUserData("business", { name: "مخزوني", phone: "", address: "" });
  }

  if (localStorage.getItem(DARK_MODE_KEY) === "1") {
    document.body.classList.add("dark-mode");
  }

  var loginScreen = $("loginScreen");
  var appEl = $("app");

  function getAccounts() { return load(ACCOUNTS_KEY, []); }
  function saveAccounts(a) { save(ACCOUNTS_KEY, a); }

  function showSetup() {
    loginScreen.classList.remove("hidden");
    appEl.classList.add("hidden");
    $("setupView").classList.remove("hidden");
    $("loginView").classList.add("hidden");
  }
  function showLogin() {
    loginScreen.classList.remove("hidden");
    appEl.classList.add("hidden");
    $("setupView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
  }
  function enterApp() {
    if (appInited) { loadAllData(); renderAll(); updateCurrentUserDisplay(); return; }
    loginScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    appInited = true;
    initApp();
  }

  (function boot() {
    var accounts = getAccounts();
    var current = localStorage.getItem(CURRENT_USER_KEY);
    if (accounts.length === 0) { showSetup(); return; }
    if (current && accounts.some(function (a) { return a.username === current; })) {
      currentUser = current;
      loadAllData();
      enterApp();
      return;
    }
    showLogin();
  })();

  $("setupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = $("setupUser").value.trim();
    var p = $("setupPass").value;
    var p2 = $("setupPass2").value;
    if (u.length < 3) { toast("3 أحرف على الأقل", "error"); return; }
    if (p.length < 4) { toast("4 أحرف على الأقل", "error"); return; }
    if (p !== p2) { toast("كلمتا المرور غير متطابقتين", "error"); return; }
    var accounts = getAccounts();
    if (accounts.some(function (a) { return a.username === u; })) {
      toast("اسم المستخدم مستخدم", "error"); return;
    }
    accounts.push({ username: u, password: p, createdAt: new Date().toISOString() });
    saveAccounts(accounts);
    localStorage.setItem(CURRENT_USER_KEY, u);
    currentUser = u;
    loadAllData();
    toast("تم إنشاء الحساب ✅", "success");
    enterApp();
  });

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = $("loginUser").value.trim();
    var p = $("loginPass").value;
    var accounts = getAccounts();
    var acc = accounts.find(function (a) { return a.username === u; });
    if (!acc) { toast("اسم المستخدم غير موجود", "error"); return; }
    if (acc.password !== p) { toast("كلمة المرور غير صحيحة", "error"); return; }
    localStorage.setItem(CURRENT_USER_KEY, u);
    currentUser = u;
    loadAllData();
    toast("مرحباً " + u + " 👋", "success");
    enterApp();
  });

  function updateCurrentUserDisplay() {
    var el = $("currentUserName");
    if (el) el.textContent = currentUser || "-";
    var el2 = $("settingsUserName");
    if (el2) el2.textContent = currentUser || "-";
  }

  function initApp() {
    updateCurrentUserDisplay();
    $("mobileMenuBtn").addEventListener("click", function () {
      $("sidebar").classList.toggle("open");
      $("sidebarOverlay").classList.toggle("hidden");
    });
    $("sidebarOverlay").addEventListener("click", function () {
      $("sidebar").classList.remove("open");
      $("sidebarOverlay").classList.add("hidden");
    });
    initNavigation();
    initProducts();
    initCustomers();
    initSuppliers();
    initInvoices();
    initReceipts();
    initPayments();
    initJournals();
    initStatements();
    initReports();
    initSettings();
    initItemModal();
    initScanModal();
    initPrintModal();
    initAI();
    initSpeech();
    renderAll();
  }

  function initNavigation() {
    $$(".nav-parent").forEach(function (parent) {
      parent.addEventListener("click", function (e) {
        e.preventDefault();
        var group = this.closest(".nav-group");
        group.classList.toggle("open");
      });
    });
    $$(".nav-link:not(.nav-parent)").forEach(function (link) {
      if (!link.dataset.page) return;
      link.addEventListener("click", function (e) {
        e.preventDefault();
        navigateTo(link.dataset.page);
        if (window.innerWidth <= 900) {
          $("sidebar").classList.remove("open");
          $("sidebarOverlay").classList.add("hidden");
        }
      });
    });
    $$(".nav-child").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        navigateTo(link.dataset.page);
        if (window.innerWidth <= 900) {
          $("sidebar").classList.remove("open");
          $("sidebarOverlay").classList.add("hidden");
        }
      });
    });
    $$("[data-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () { navigateTo(btn.dataset.goto); });
    });
  }

  function navigateTo(page) {
    $$(".page").forEach(function (p) { p.classList.remove("active"); });
    $$(".nav-link, .nav-child").forEach(function (n) { n.classList.remove("active"); });

    var target = $("page-" + page);
    if (target) target.classList.add("active");

    var nav = document.querySelector('.nav-link[data-page="' + page + '"], .nav-child[data-page="' + page + '"]');
    if (nav) {
      nav.classList.add("active");
      var parentGroup = nav.closest(".nav-group");
      if (parentGroup) parentGroup.classList.add("open");
    }

    window.scrollTo(0, 0);

    if (page === "dashboard") { updateStats(); renderCharts(); }
    else if (page === "inventory") renderInventory();
    else if (page === "customers") renderCustomers();
    else if (page === "suppliers") renderSuppliers();
    else if (page === "reports") renderReport();
    else if (page === "settings") fillSettings();
    else if (page === "receipts") { renderCustomerSelect("rFrom"); renderReceipts(); }
    else if (page === "payments") { renderSupplierSelect("payTo"); renderPayments(); }
    else if (page === "journals") renderJournals();
    else if (page === "statements") renderStatementSelect();
    else if (["sales", "purchases", "salesReturns", "purchaseReturns"].indexOf(page) > -1) {
      var map = { sales: "sale", purchases: "purchase", salesReturns: "sale_return", purchaseReturns: "purchase_return" };
      renderInvoiceCustomerSelects();
      renderItems($("form-" + map[page]), map[page]);
    }
  }

  function updateStats() {
    var sales = invoices.filter(function (i) { return i.type === "sale"; })
      .reduce(function (s, i) { return s + Number(i.grandTotal || 0); }, 0);
    var purchases = invoices.filter(function (i) { return i.type === "purchase"; })
      .reduce(function (s, i) { return s + Number(i.grandTotal || 0); }, 0);
    var invVal = products.reduce(function (s, p) { return s + (Number(p.price) * Number(p.qty)); }, 0);
    var a = $("statSales"), b = $("statPurchases"), c = $("statInventory"), d = $("statProducts");
    if (a) a.textContent = fmt(sales);
    if (b) b.textContent = fmt(purchases);
    if (c) c.textContent = fmt(invVal);
    if (d) d.textContent = fmtInt(products.length);
    updateBadges();
  }

  function updateBadges() {
    var lowStock = products.filter(function (p) { return p.qty <= 5; }).length;
    var badge = $("badgeInventory");
    if (badge) {
      if (lowStock > 0) { badge.textContent = lowStock; badge.style.display = "inline-block"; }
      else badge.style.display = "none";
    }
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
    fillBusinessForm();
    renderStatementSelect();
  }

  function initProducts() {
    $("productForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var code = $("pCode").value.trim();
      var name = $("pName").value.trim();
      if (!code || !name) { toast("املأ الكود والاسم", "error"); return; }
      var dup = products.filter(function (p) { return p.code === code && p.id !== editingProductId; });
      if (dup.length > 0) { toast("الباركود مستخدم", "error"); return; }
      var data = {
        code: code, name: name,
        price: parseFloat($("pPrice").value) || 0,
        cost: parseFloat($("pCost").value) || 0,
        qty: parseInt($("pQty").value) || 0,
        details: $("pDetails").value.trim()
      };
      if (editingProductId) {
        for (var i = 0; i < products.length; i++) {
          if (products[i].id === editingProductId) {
            products[i] = Object.assign({}, products[i], data);
            break;
          }
        }
        toast("تم التحديث ✅", "success");
      } else {
        products.push(Object.assign({ id: uid() }, data));
        toast("تمت الإضافة ✅", "success");
      }
      saveUserData("products", products);
      resetProductForm();
      renderAll();
    });
    $("cancelProductEdit").addEventListener("click", resetProductForm);
    $("productSearch").addEventListener("input", renderProducts);
  }

  function resetProductForm() {
    $("productForm").reset();
    $("productSubmitText").textContent = "حفظ";
    $("productFormTitle").textContent = "إضافة منتج جديد";
    $("cancelProductEdit").classList.add("hidden");
    editingProductId = null;
  }

  function renderProducts() {
    var tbody = $("productsBody");
    var emptyEl = $("productsEmpty");
    var q = $("productSearch").value.trim().toLowerCase();
    var list = q ? products.filter(function (p) {
      return (p.name || "").toLowerCase().indexOf(q) > -1 ||
             (p.code || "").toLowerCase().indexOf(q) > -1;
    }) : products;
    tbody.innerHTML = "";
    if (list.length === 0) {
      emptyEl.classList.remove("hidden");
      emptyEl.textContent = products.length === 0 ? "لا منتجات." : "لا نتائج.";
      return;
    }
    emptyEl.classList.add("hidden");
    list.forEach(function (p) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(p.code) + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + fmt(p.price) + '</td>' +
        '<td>' + fmt(p.cost || 0) + '</td>' +
        '<td>' + fmtInt(p.qty) + '</td>' +
        '<td>' +
          '<button class="icon-btn edit" onclick="window.editProduct(\'' + p.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteProduct(\'' + p.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  window.editProduct = function (id) {
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    editingProductId = id;
    $("pCode").value = p.code || "";
    $("pName").value = p.name || "";
    $("pPrice").value = p.price || 0;
    $("pCost").value = p.cost || 0;
    $("pQty").value = p.qty || 0;
    $("pDetails").value = p.details || "";
    $("productSubmitText").textContent = "تحديث";
    $("productFormTitle").textContent = "تعديل: " + p.name;
    $("cancelProductEdit").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.deleteProduct = function (id) {
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('حذف "' + p.name + '"؟')) return;
    products = products.filter(function (x) { return x.id !== id; });
    saveUserData("products", products);
    renderAll();
    toast("تم الحذف 🗑️", "success");
  };

  function initCustomers() {
    $("customerForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("cName").value.trim();
      if (!name) { toast("أدخل الاسم", "error"); return; }
      if (editingCustomerId) {
        var c = customers.find(function (x) { return x.id === editingCustomerId; });
        if (c) { c.name = name; c.phone = $("cPhone").value.trim(); c.address = $("cAddress").value.trim(); }
        toast("تم التحديث ✅", "success");
      } else {
        customers.push({ id: uid(), name: name, phone: $("cPhone").value.trim(), address: $("cAddress").value.trim(), createdAt: new Date().toISOString() });
        toast("تمت الإضافة ✅", "success");
      }
      saveUserData("customers", customers);
      resetCustomerForm();
      renderAll();
    });
    $("cancelCustomerEdit").addEventListener("click", resetCustomerForm);
    $("customerSearch").addEventListener("input", renderCustomers);
  }

  function resetCustomerForm() {
    $("customerForm").reset();
    $("customerSubmitText").textContent = "حفظ";
    $("customerFormTitle").textContent = "إضافة عميل جديد";
    $("cancelCustomerEdit").classList.add("hidden");
    editingCustomerId = null;
  }

  function renderCustomers() {
    var tbody = $("customersBody");
    var emptyEl = $("customersEmpty");
    var q = $("customerSearch").value.trim().toLowerCase();
    var list = q ? customers.filter(function (c) {
      return (c.name || "").toLowerCase().indexOf(q) > -1 ||
             (c.phone || "").toLowerCase().indexOf(q) > -1;
    }) : customers;
    tbody.innerHTML = "";
    if (list.length === 0) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");
    list.forEach(function (c) {
      var bal = getCustomerBalance(c.id);
      var balClass = bal < 0 ? "balance-negative" : "balance-positive";
      var balText = fmt(Math.abs(bal)) + " ر.س " + (bal < 0 ? "(مدين)" : bal > 0 ? "(دائن)" : "");
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(c.name) + '</td>' +
        '<td>' + esc(c.phone || "—") + '</td>' +
        '<td class="' + balClass + '">' + balText + '</td>' +
        '<td>' +
          '<button class="icon-btn edit" onclick="window.editCustomer(\'' + c.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteCustomer(\'' + c.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  window.editCustomer = function (id) {
    var c = customers.find(function (x) { return x.id === id; });
    if (!c) return;
    editingCustomerId = id;
    $("cName").value = c.name || "";
    $("cPhone").value = c.phone || "";
    $("cAddress").value = c.address || "";
    $("customerSubmitText").textContent = "تحديث";
    $("customerFormTitle").textContent = "تعديل: " + c.name;
    $("cancelCustomerEdit").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.deleteCustomer = function (id) {
    var c = customers.find(function (x) { return x.id === id; });
    if (!c) return;
    if (!confirm('حذف "' + c.name + '"؟')) return;
    customers = customers.filter(function (x) { return x.id !== id; });
    saveUserData("customers", customers);
    renderAll();
    toast("تم الحذف 🗑️", "success");
  };

  function initSuppliers() {
    $("supplierForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("sName").value.trim();
      if (!name) { toast("أدخل الاسم", "error"); return; }
      if (editingSupplierId) {
        var s = suppliers.find(function (x) { return x.id === editingSupplierId; });
        if (s) { s.name = name; s.phone = $("sPhone").value.trim(); s.address = $("sAddress").value.trim(); }
        toast("تم التحديث ✅", "success");
      } else {
        suppliers.push({ id: uid(), name: name, phone: $("sPhone").value.trim(), address: $("sAddress").value.trim(), createdAt: new Date().toISOString() });
        toast("تمت الإضافة ✅", "success");
      }
      saveUserData("suppliers", suppliers);
      resetSupplierForm();
      renderAll();
    });
    $("cancelSupplierEdit").addEventListener("click", resetSupplierForm);
    $("supplierSearch").addEventListener("input", renderSuppliers);
  }

  function resetSupplierForm() {
    $("supplierForm").reset();
    $("supplierSubmitText").textContent = "حفظ";
    $("supplierFormTitle").textContent = "إضافة مورد جديد";
    $("cancelSupplierEdit").classList.add("hidden");
    editingSupplierId = null;
  }

  function renderSuppliers() {
    var tbody = $("suppliersBody");
    var emptyEl = $("suppliersEmpty");
    var q = $("supplierSearch").value.trim().toLowerCase();
    var list = q ? suppliers.filter(function (s) {
      return (s.name || "").toLowerCase().indexOf(q) > -1 ||
             (s.phone || "").toLowerCase().indexOf(q) > -1;
    }) : suppliers;
    tbody.innerHTML = "";
    if (list.length === 0) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");
    list.forEach(function (s) {
      var bal = getSupplierBalance(s.id);
      var balClass = bal < 0 ? "balance-negative" : "balance-positive";
      var balText = fmt(Math.abs(bal)) + " ر.س " + (bal < 0 ? "(مدين)" : bal > 0 ? "(دائن)" : "");
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.phone || "—") + '</td>' +
        '<td class="' + balClass + '">' + balText + '</td>' +
        '<td>' +
          '<button class="icon-btn edit" onclick="window.editSupplier(\'' + s.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteSupplier(\'' + s.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  window.editSupplier = function (id) {
    var s = suppliers.find(function (x) { return x.id === id; });
    if (!s) return;
    editingSupplierId = id;
    $("sName").value = s.name || "";
    $("sPhone").value = s.phone || "";
    $("sAddress").value = s.address || "";
    $("supplierSubmitText").textContent = "تحديث";
    $("supplierFormTitle").textContent = "تعديل: " + s.name;
    $("cancelSupplierEdit").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.deleteSupplier = function (id) {
    var s = suppliers.find(function (x) { return x.id === id; });
    if (!s) return;
    if (!confirm('حذف "' + s.name + '"؟')) return;
    suppliers = suppliers.filter(function (x) { return x.id !== id; });
    saveUserData("suppliers", suppliers);
    renderAll();
    toast("تم الحذف 🗑️", "success");
  };

  function getCustomerBalance(id) {
    if (!id) return 0;
    var b = 0;
    invoices.forEach(function (inv) {
      if (inv.customerId !== id || inv.method !== "أجل") return;
      if (inv.type === "sale") b -= inv.grandTotal;
      else if (inv.type === "sale_return") b += inv.grandTotal;
    });
    receipts.forEach(function (r) { if (r.customerId === id) b += r.amount; });
    return b;
  }
  function getSupplierBalance(id) {
    if (!id) return 0;
    var b = 0;
    invoices.forEach(function (inv) {
      if (inv.customerId !== id || inv.method !== "أجل") return;
      if (inv.type === "purchase") b += inv.grandTotal;
      else if (inv.type === "purchase_return") b -= inv.grandTotal;
    });
    payments.forEach(function (p) { if (p.customerId === id) b -= p.amount; });
    return b;
  }

  function renderCustomerSelect(elId) {
    var el = $(elId);
    if (!el) return;
    var current = el.value;
    el.innerHTML = '<option value="">-- اختر العميل --</option>';
    customers.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.name;
      el.appendChild(opt);
    });
    if (current) el.value = current;
  }
  function renderSupplierSelect(elId) {
    var el = $(elId);
    if (!el) return;
    var current = el.value;
    el.innerHTML = '<option value="">-- اختر المورد --</option>';
    suppliers.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.id; opt.textContent = s.name;
      el.appendChild(opt);
    });
    if (current) el.value = current;
  }
  function renderInvoiceCustomerSelects() {
    Object.keys(TYPES).forEach(function (type) {
      var form = $("form-" + type);
      if (!form) return;
      var sel = form.querySelector(".inv-customer-select");
      if (!sel) return;
      var current = sel.value;
      var list = TYPES[type].partyType === "supplier" ? suppliers : customers;
      var party = TYPES[type].party;
      sel.innerHTML = '<option value="">-- اختر ' + party + ' --</option>';
      list.forEach(function (item) {
        var opt = document.createElement("option");
        opt.value = item.id; opt.textContent = item.name;
        sel.appendChild(opt);
      });
      if (current) sel.value = current;
    });
  }
  function renderStatementSelect() {
    var sel = $("statementSelect");
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">-- اختر --</option>';
    if (customers.length) {
      var g1 = document.createElement("optgroup"); g1.label = "العملاء";
      customers.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = "customer:" + c.id; opt.textContent = c.name;
        g1.appendChild(opt);
      });
      sel.appendChild(g1);
    }
    if (suppliers.length) {
      var g2 = document.createElement("optgroup"); g2.label = "الموردون";
      suppliers.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = "supplier:" + s.id; opt.textContent = s.name;
        g2.appendChild(opt);
      });
      sel.appendChild(g2);
    }
    if (current) sel.value = current;
  }

  function initInvoices() {
    Object.keys(TYPES).forEach(function (type) {
      var form = $("form-" + type);
      if (!form) return;
      buildInvoiceForm(form, type);
      bindInvoiceForm(form, type);
    });
    $$(".invoice-search").forEach(function (input) {
      input.addEventListener("input", function () { renderInvoiceList(input.dataset.type); });
    });
  }

  function buildInvoiceForm(form, type) {
    var info = TYPES[type];
    var methodsOptions = PAY_METHODS.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join("");
    form.innerHTML =
      '<div class="form-grid">' +
        '<div class="form-field"><label>اسم ' + info.party + '</label><select class="inv-customer-select"><option value="">-- اختر --</option></select></div>' +
        '<div class="form-field"><label>العنوان</label><input type="text" class="inv-address"></div>' +
        '<div class="form-field"><label>الهاتف</label><input type="text" class="inv-phone"></div>' +
        '<div class="form-field"><label>التاريخ</label><input type="date" class="inv-date"></div>' +
        '<div class="form-field"><label>طريقة الدفع</label><select class="inv-method">' + methodsOptions + '</select></div>' +
        '<div class="form-field"><label>نسبة الضريبة (%)</label><input type="number" class="inv-tax" min="0" step="0.1" value="15"></div>' +
      '</div>' +
      '<h4 style="font-size:0.95rem;font-weight:700;margin:20px 0 12px">إضافة صنف</h4>' +
      '<div class="product-picker">' +
        '<div class="product-picker-label"><i class="fa-solid fa-cart-plus"></i> ابحث عن منتج</div>' +
        '<div class="picker-row">' +
          '<div class="picker-search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input type="text" class="picker-search" placeholder="اسم أو باركود..."></div>' +
          '<button type="button" class="picker-btn picker-add"><i class="fa-solid fa-plus"></i></button>' +
          '<button type="button" class="picker-btn picker-scan"><i class="fa-solid fa-camera"></i></button>' +
        '</div>' +
        '<div class="picker-results"></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th><th>إجراءات</th></tr></thead>' +
        '<tbody class="invoice-items-body"><tr><td colspan="5" class="empty-state">لا أصناف</td></tr></tbody>' +
      '</table></div>' +
      '<div class="invoice-totals">' +
        '<div><span>قبل الضريبة:</span> <strong class="inv-subtotal">0.00</strong> ر.س</div>' +
        '<div><span>الضريبة:</span> <strong class="inv-tax-val">0.00</strong> ر.س</div>' +
        '<div class="grand-total"><span>الإجمالي:</span> <strong class="inv-grand">0.00</strong> ر.س</div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-block"><i class="fa-solid fa-floppy-disk"></i> حفظ ' + info.label + '</button>';
    form.querySelector(".inv-date").value = today();
  }

  function bindInvoiceForm(form, type) {
    var pickerSearch = form.querySelector(".picker-search");
    var pickerResults = form.querySelector(".picker-results");
    pickerSearch.addEventListener("input", function () {
      var q = this.value.trim().toLowerCase();
      pickerResults.innerHTML = "";
      if (!q) return;
      var results = products.filter(function (p) {
        return (p.name || "").toLowerCase().indexOf(q) > -1 ||
               (p.code || "").toLowerCase().indexOf(q) > -1;
      }).slice(0, 8);
      if (results.length === 0) {
        pickerResults.innerHTML = '<div class="picker-item" style="color:#8895a7;justify-content:center">لا نتائج</div>';
        return;
      }
      results.forEach(function (p) {
        var div = document.createElement("div");
        div.className = "picker-item";
        div.innerHTML = '<div><div class="picker-item-name">' + esc(p.name) + '</div>' +
          '<div class="picker-item-meta">كود: ' + esc(p.code) + ' — متوفر: ' + fmtInt(p.qty) + '</div></div>' +
          '<div class="picker-item-price">' + fmt(p.price) + ' ر.س</div>';
        div.addEventListener("click", function () {
          pickerResults.innerHTML = "";
          pickerSearch.value = "";
          openItemModal(p, type, form, null);
        });
        pickerResults.appendChild(div);
      });
    });
    form.querySelector(".picker-add").addEventListener("click", function () {
      var q = pickerSearch.value.trim().toLowerCase();
      if (!q) { toast("اكتب اسم أو باركود", "error"); return; }
      var found = products.filter(function (p) {
        return (p.code || "").toLowerCase() === q || (p.name || "").toLowerCase() === q;
      })[0];
      if (!found) {
        found = products.filter(function (p) {
          return (p.name || "").toLowerCase().indexOf(q) > -1 ||
                 (p.code || "").toLowerCase().indexOf(q) > -1;
        })[0];
      }
      if (!found) { toast("لم يتم العثور", "error"); return; }
      pickerResults.innerHTML = "";
      pickerSearch.value = "";
      openItemModal(found, type, form, null);
    });
    form.querySelector(".picker-scan").addEventListener("click", function () {
      openScanModal(function (code) {
        var found = products.filter(function (p) {
          return String(p.code).trim() === code || String(p.name).trim() === code;
        })[0];
        if (found) openItemModal(found, type, form, null);
        else toast("لا يوجد منتج بهذا الباركود", "error");
      });
    });
    form.querySelector(".inv-tax").addEventListener("input", function () { updateTotals(form); });
    form.addEventListener("submit", function (e) { saveInvoice(e, form, type); });
  }

  function renderItems(form, type) {
    if (!form) return;
    var tbody = form.querySelector(".invoice-items-body");
    if (!tbody) return;
    var draft = drafts[type] || [];
    tbody.innerHTML = "";
    if (draft.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا أصناف</td></tr>';
    } else {
      draft.forEach(function (item, idx) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + esc(item.name) + '</td>' +
          '<td>' + fmt(item.price) + '</td>' +
          '<td>' + fmtInt(item.qty) + '</td>' +
          '<td>' + fmt(item.price * item.qty) + '</td>' +
          '<td>' +
            '<button class="icon-btn edit" onclick="window.editItem(\'' + type + '\', ' + idx + ')"><i class="fa-solid fa-pen"></i></button>' +
            '<button class="icon-btn delete" onclick="window.removeItem(\'' + type + '\', ' + idx + ')"><i class="fa-solid fa-trash"></i></button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }
    updateTotals(form);
  }

  window.editItem = function (type, idx) {
    var draft = drafts[type];
    if (!draft || !draft[idx]) return;
    var item = draft[idx];
    var product = products.find(function (p) { return p.id === item.productId; });
    if (!product) return;
    openItemModal(product, type, $("form-" + type), idx);
  };

  window.removeItem = function (type, idx) {
    if (!drafts[type]) return;
    drafts[type].splice(idx, 1);
    var form = $("form-" + type);
    if (form) renderItems(form, type);
  };

  function updateTotals(form) {
    if (!form) return;
    var type = form.dataset.type;
    var draft = drafts[type] || [];
    var subtotal = draft.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var taxRate = parseFloat(form.querySelector(".inv-tax").value) || 0;
    var taxVal = subtotal * (taxRate / 100);
    var grand = subtotal + taxVal;
    var subEl = form.querySelector(".inv-subtotal");
    var taxEl = form.querySelector(".inv-tax-val");
    var grandEl = form.querySelector(".inv-grand");
    if (subEl) subEl.textContent = fmt(subtotal);
    if (taxEl) taxEl.textContent = fmt(taxVal);
    if (grandEl) grandEl.textContent = fmt(grand);
  }

  function saveInvoice(e, form, type) {
    e.preventDefault();
    var draft = drafts[type];
    if (!draft || draft.length === 0) { toast("أضف صنفاً", "error"); return; }
    var customerId = form.querySelector(".inv-customer-select").value;
    if (!customerId) { toast("اختر " + TYPES[type].party, "error"); return; }
    var isSupplier = TYPES[type].partyType === "supplier";
    var entity = (isSupplier ? suppliers : customers).find(function (x) { return x.id === customerId; });
    if (!entity) return;
    var address = form.querySelector(".inv-address").value.trim();
    var phone = form.querySelector(".inv-phone").value.trim();
    var date = form.querySelector(".inv-date").value;
    var method = form.querySelector(".inv-method").value;
    var taxRate = parseFloat(form.querySelector(".inv-tax").value) || 0;
    var subtotal = draft.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var taxVal = subtotal * (taxRate / 100);
    var grandTotal = subtotal + taxVal;
    var info = TYPES[type];
    if (info.effect === "out") {
      for (var k = 0; k < draft.length; k++) {
        var prod = products.find(function (p) { return p.id === draft[k].productId; });
        if (!prod || prod.qty < draft[k].qty) {
          toast("المخزون غير كافٍ لـ " + draft[k].name, "error"); return;
        }
      }
    }
    draft.forEach(function (item) {
      var prod = products.find(function (p) { return p.id === item.productId; });
      if (prod) {
        if (info.effect === "out") prod.qty -= item.qty;
        else prod.qty += item.qty;
      }
    });
    saveUserData("products", products);
    var sameType = invoices.filter(function (i) { return i.type === type; });
    var number = info.prefix + "-" + String(sameType.length + 1).padStart(4, "0");
    invoices.push({
      id: uid(), type: type, number: number,
      customerId: customerId, customer: entity.name,
      address: address, phone: phone, date: date,
      method: method, taxRate: taxRate,
      items: draft.map(function (i) { return { productId: i.productId, name: i.name, price: i.price, qty: i.qty }; }),
      subtotal: subtotal, taxVal: taxVal, grandTotal: grandTotal,
      createdAt: new Date().toISOString()
    });
    saveUserData("invoices", invoices);
    drafts[type] = [];
    form.querySelector(".inv-customer-select").value = "";
    form.querySelector(".inv-address").value = "";
    form.querySelector(".inv-phone").value = "";
    form.querySelector(".inv-date").value = today();
    form.querySelector(".inv-tax").value = 15;
    renderItems(form, type);
    renderAll();
    toast("تم الحفظ ✅", "success");
  }

  function renderInvoiceList(type) {
    var tbody = document.querySelector('.invoice-list[data-type="' + type + '"]');
    var emptyEl = document.querySelector('.invoice-empty[data-type="' + type + '"]');
    var searchInput = document.querySelector('.invoice-search[data-type="' + type + '"]');
    if (!tbody) return;
    var q = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var list = invoices.filter(function (i) { return i.type === type; });
    if (q) {
      list = list.filter(function (inv) {
        return (inv.number || "").toLowerCase().indexOf(q) > -1 ||
               (inv.customer || "").toLowerCase().indexOf(q) > -1 ||
               (inv.date || "").indexOf(q) > -1;
      });
    }
    tbody.innerHTML = "";
    if (list.length === 0) { if (emptyEl) emptyEl.classList.remove("hidden"); return; }
    if (emptyEl) emptyEl.classList.add("hidden");
    list.slice().reverse().forEach(function (inv) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><span class="type-badge type-' + inv.type + '">' + esc(inv.number) + '</span></td>' +
        '<td>' + esc(inv.customer) + '</td>' +
        '<td>' + esc(inv.date) + '</td>' +
        '<td><span class="pay-badge">' + esc(inv.method || "نقد") + '</span></td>' +
        '<td>' + fmt(inv.grandTotal) + '</td>' +
        '<td>' +
          '<button class="icon-btn view" onclick="window.viewInvoice(\'' + inv.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteInvoice(\'' + inv.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  function renderInvoiceLists() {
    Object.keys(TYPES).forEach(renderInvoiceList);
  }

  window.deleteInvoice = function (id) {
    var inv = invoices.find(function (x) { return x.id === id; });
    if (!inv) return;
    var info = TYPES[inv.type];
    if (!info) return;
    if (!confirm("حذف " + info.label + " " + inv.number + "؟")) return;
    inv.items.forEach(function (item) {
      var prod = products.find(function (p) { return p.id === item.productId; });
      if (prod) {
        if (info.effect === "out") prod.qty += item.qty;
        else prod.qty -= item.qty;
        if (prod.qty < 0) prod.qty = 0;
      }
    });
    saveUserData("products", products);
    invoices = invoices.filter(function (x) { return x.id !== id; });
    saveUserData("invoices", invoices);
    renderAll();
    toast("تم الحذف", "success");
  };

  $("inventorySearch").addEventListener("input", renderInventory);
  function renderInventory() {
    var tbody = $("inventoryBody");
    var emptyEl = $("inventoryEmpty");
    var q = $("inventorySearch").value.trim().toLowerCase();
    var list = q ? products.filter(function (p) {
      return (p.name || "").toLowerCase().indexOf(q) > -1 ||
             (p.code || "").toLowerCase().indexOf(q) > -1;
    }) : products;
    tbody.innerHTML = "";
    if (list.length === 0) {
      emptyEl.classList.remove("hidden");
      emptyEl.textContent = products.length === 0 ? "المخزون فارغ." : "لا نتائج.";
      return;
    }
    emptyEl.classList.add("hidden");
    list.forEach(function (p) {
      var cls = "qty-green";
      if (p.qty === 0) cls = "qty-red";
      else if (p.qty < 5) cls = "qty-orange";
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(p.code) + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td><span class="qty-badge ' + cls + '">' + fmtInt(p.qty) + '</span></td>' +
        '<td>' + fmt(p.price) + '</td>' +
        '<td>' + fmt(p.price * p.qty) + '</td>';
      tbody.appendChild(tr);
    });
  }

  function initReceipts() {
    $("rDate").value = today();
    $("receiptForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var customerId = $("rFrom").value;
      var amount = parseFloat($("rAmount").value) || 0;
      if (!customerId || amount <= 0) { toast("املأ البيانات", "error"); return; }
      var entity = customers.find(function (c) { return c.id === customerId; });
      if (!entity) return;
      var number = "REC-" + String(receipts.length + 1).padStart(4, "0");
      receipts.push({ id: uid(), number: number, customerId: customerId, customer: entity.name, amount: amount, date: $("rDate").value, method: $("rMethod").value, note: $("rNote").value.trim() });
      saveUserData("receipts", receipts);
      $("receiptForm").reset();
      $("rDate").value = today();
      renderReceipts();
      renderCustomers();
      toast("تم الحفظ ✅", "success");
    });
    $("receiptsSearch").addEventListener("input", renderReceipts);
  }

  function renderReceipts() {
    var tbody = $("receiptsBody");
    var emptyEl = $("receiptsEmpty");
    var q = $("receiptsSearch").value.trim().toLowerCase();
    var list = q ? receipts.filter(function (r) {
      return (r.number || "").toLowerCase().indexOf(q) > -1 ||
             (r.customer || "").toLowerCase().indexOf(q) > -1;
    }) : receipts;
    tbody.innerHTML = "";
    if (list.length === 0) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");
    list.slice().reverse().forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(r.number) + '</td>' +
        '<td>' + esc(r.customer) + '</td>' +
        '<td>' + fmt(r.amount) + ' ر.س</td>' +
        '<td><span class="pay-badge">' + esc(r.method) + '</span></td>' +
        '<td>' + esc(r.date) + '</td>' +
        '<td>' +
          '<button class="icon-btn view" onclick="window.viewSanad(\'receipt\', \'' + r.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteSanad(\'receipt\', \'' + r.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  function initPayments() {
    $("payDate").value = today();
    $("paymentForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var customerId = $("payTo").value;
      var amount = parseFloat($("payAmount").value) || 0;
      if (!customerId || amount <= 0) { toast("املأ البيانات", "error"); return; }
      var entity = suppliers.find(function (s) { return s.id === customerId; });
      if (!entity) return;
      var number = "PAY-" + String(payments.length + 1).padStart(4, "0");
      payments.push({ id: uid(), number: number, customerId: customerId, customer: entity.name, amount: amount, date: $("payDate").value, method: $("payMethod").value, note: $("payNote").value.trim() });
      saveUserData("payments", payments);
      $("paymentForm").reset();
      $("payDate").value = today();
      renderPayments();
      renderSuppliers();
      toast("تم الحفظ ✅", "success");
    });
    $("paymentsSearch").addEventListener("input", renderPayments);
  }

  function renderPayments() {
    var tbody = $("paymentsBody");
    var emptyEl = $("paymentsEmpty");
    var q = $("paymentsSearch").value.trim().toLowerCase();
    var list = q ? payments.filter(function (p) {
      return (p.number || "").toLowerCase().indexOf(q) > -1 ||
             (p.customer || "").toLowerCase().indexOf(q) > -1;
    }) : payments;
    tbody.innerHTML = "";
    if (list.length === 0) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");
    list.slice().reverse().forEach(function (p) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(p.number) + '</td>' +
        '<td>' + esc(p.customer) + '</td>' +
        '<td>' + fmt(p.amount) + ' ر.س</td>' +
        '<td><span class="pay-badge">' + esc(p.method) + '</span></td>' +
        '<td>' + esc(p.date) + '</td>' +
        '<td>' +
          '<button class="icon-btn view" onclick="window.viewSanad(\'payment\', \'' + p.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteSanad(\'payment\', \'' + p.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  function initJournals() {
    $("jDate").value = today();
    $("journalForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var desc = $("jDesc").value.trim();
      var debit = $("jDebit").value.trim();
      var credit = $("jCredit").value.trim();
      var debitAmt = parseFloat($("jDebitAmt").value) || 0;
      var creditAmt = parseFloat($("jCreditAmt").value) || 0;
      if (!desc || !debit || !credit) { toast("املأ كل الحقول", "error"); return; }
      if (Math.abs(debitAmt - creditAmt) > 0.01) { toast("المدين ≠ الدائن", "error"); return; }
      journals.push({ id: uid(), number: "JRN-" + String(journals.length + 1).padStart(4, "0"), desc: desc, debitAccount: debit, creditAccount: credit, amount: debitAmt, date: $("jDate").value });
      saveUserData("journals", journals);
      $("journalForm").reset();
      $("jDate").value = today();
      renderJournals();
      toast("تم الحفظ ✅", "success");
    });
    $("journalsSearch").addEventListener("input", renderJournals);
  }

  function renderJournals() {
    var tbody = $("journalsBody");
    var emptyEl = $("journalsEmpty");
    var q = $("journalsSearch").value.trim().toLowerCase();
    var list = q ? journals.filter(function (j) {
      return (j.number || "").toLowerCase().indexOf(q) > -1 ||
             (j.desc || "").toLowerCase().indexOf(q) > -1;
    }) : journals;
    tbody.innerHTML = "";
    if (list.length === 0) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");
    list.slice().reverse().forEach(function (j) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + esc(j.number) + '</td>' +
        '<td>' + esc(j.desc) + '</td>' +
        '<td>' + esc(j.debitAccount) + '</td>' +
        '<td>' + esc(j.creditAccount) + '</td>' +
        '<td>' + fmt(j.amount) + ' ر.س</td>' +
        '<td>' + esc(j.date) + '</td>' +
        '<td>' +
          '<button class="icon-btn view" onclick="window.viewSanad(\'journal\', \'' + j.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
          '<button class="icon-btn delete" onclick="window.deleteSanad(\'journal\', \'' + j.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  window.deleteSanad = function (kind, id) {
    if (!confirm("حذف السند؟")) return;
    if (kind === "receipt") {
      receipts = receipts.filter(function (x) { return x.id !== id; });
      saveUserData("receipts", receipts);
      renderReceipts();
      renderCustomers();
    } else if (kind === "payment") {
      payments = payments.filter(function (x) { return x.id !== id; });
      saveUserData("payments", payments);
      renderPayments();
      renderSuppliers();
    } else if (kind === "journal") {
      journals = journals.filter(function (x) { return x.id !== id; });
      saveUserData("journals", journals);
      renderJournals();
    }
    toast("تم الحذف", "success");
  };

  function initStatements() {
    $("statementSelect").addEventListener("change", function () { renderStatementContent(this.value); });
  }

  function renderStatementContent(sel) {
    var content = $("statementContent");
    if (!sel) { content.innerHTML = '<div class="card"><p class="empty-state">اختر حساباً</p></div>'; return; }
    var parts = sel.split(":");
    var kind = parts[0], id = parts[1];
    var entity = kind === "customer"
      ? customers.find(function (c) { return c.id === id; })
      : suppliers.find(function (s) { return s.id === id; });
    if (!entity) return;
    var movements = [];
    invoices.forEach(function (inv) {
      if (inv.customerId !== id) return;
      var debit = 0, credit = 0;
      if (inv.type === "sale") debit = inv.grandTotal;
      else if (inv.type === "purchase") credit = inv.grandTotal;
      else if (inv.type === "sale_return") credit = inv.grandTotal;
      else if (inv.type === "purchase_return") debit = inv.grandTotal;
      movements.push({ date: inv.date, ref: inv.number, type: TYPES[inv.type].label, desc: inv.method, debit: debit, credit: credit });
    });
    receipts.forEach(function (r) {
      if (r.customerId !== id) return;
      movements.push({ date: r.date, ref: r.number, type: "سند قبض", desc: r.note || r.method, debit: 0, credit: r.amount });
    });
    payments.forEach(function (p) {
      if (p.customerId !== id) return;
      movements.push({ date: p.date, ref: p.number, type: "سند صرف", desc: p.note || p.method, debit: p.amount, credit: 0 });
    });
    movements.sort(function (a, b) { return a.date.localeCompare(b.date); });
    var totalDebit = 0, totalCredit = 0;
    movements.forEach(function (m) { totalDebit += m.debit; totalCredit += m.credit; });
    var displayBalance = totalDebit - totalCredit;
    var rows = "";
    var runningBal = 0;
    movements.forEach(function (m) {
      runningBal += (m.debit - m.credit);
      var balClass = runningBal > 0 ? "balance-positive" : runningBal < 0 ? "balance-negative" : "";
      rows +=
        '<tr>' +
          '<td>' + esc(m.date) + '</td>' +
          '<td>' + esc(m.ref) + '</td>' +
          '<td><span class="type-badge type-sale">' + esc(m.type) + '</span></td>' +
          '<td>' + esc(m.desc) + '</td>' +
          '<td>' + (m.debit ? fmt(m.debit) : "—") + '</td>' +
          '<td>' + (m.credit ? fmt(m.credit) : "—") + '</td>' +
          '<td class="' + balClass + '">' + fmt(Math.abs(runningBal)) + ' ' + (runningBal < 0 ? 'دائن' : runningBal > 0 ? 'مدين' : '—') + '</td>' +
        '</tr>';
    });
    content.innerHTML =
      '<div class="card">' +
        '<div class="statement-header">' +
          '<h3>' + esc(entity.name) + ' <span class="type-badge" style="background:rgba(255,255,255,0.15);color:#fff">' + (kind === "customer" ? "عميل" : "مورد") + '</span></h3>' +
          '<p>' + (entity.phone ? '📞 ' + esc(entity.phone) + ' — ' : '') + (entity.address ? '📍 ' + esc(entity.address) : '') + '</p>' +
        '</div>' +
        '<div class="statement-balance">' +
          '<div class="box debit"><span>إجمالي المدين</span><strong>' + fmt(totalDebit) + ' ر.س</strong></div>' +
          '<div class="box credit"><span>إجمالي الدائن</span><strong>' + fmt(totalCredit) + ' ر.س</strong></div>' +
          '<div class="box net ' + (displayBalance < 0 ? 'negative' : displayBalance > 0 ? 'positive' : '') + '"><span>الرصيد</span><strong>' + fmt(Math.abs(displayBalance)) + ' ر.س</strong></div>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>التاريخ</th><th>المرجع</th><th>النوع</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="7" class="empty-state">لا حركات</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  function initReports() {
    $$(".report-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        $$(".report-tab").forEach(function (t) { t.classList.remove("active"); });
        this.classList.add("active");
        currentReport = this.dataset.report;
        renderReport();
      });
    });
  }

  function renderReport() {
    var content = $("reportContent");
    if (!content) return;
    if (currentReport === "sales") renderSalesReport(content);
    else if (currentReport === "profit") renderProfitReport(content);
    else if (currentReport === "dead") renderDeadReport(content);
    else if (currentReport === "topCustomers") renderTopCustomersReport(content);
  }

  function renderSalesReport(content) {
    var byMonth = {};
    invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
      var m = (inv.date || "").slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { count: 0, total: 0 };
      byMonth[m].count++;
      byMonth[m].total += inv.grandTotal;
    });
    var keys = Object.keys(byMonth).sort().reverse();
    var total = invoices.filter(function (i) { return i.type === "sale"; }).reduce(function (s, i) { return s + i.grandTotal; }, 0);
    var count = invoices.filter(function (i) { return i.type === "sale"; }).length;
    var avg = count > 0 ? total / count : 0;
    var rows = keys.map(function (k) {
      return '<tr><td>' + k + '</td><td>' + byMonth[k].count + '</td><td>' + fmt(byMonth[k].total) + ' ر.س</td></tr>';
    }).join("");
    content.innerHTML =
      '<div class="report-summary">' +
        '<div class="report-summary-box"><span>إجمالي المبيعات</span><strong>' + fmt(total) + ' ر.س</strong></div>' +
        '<div class="report-summary-box"><span>عدد الفواتير</span><strong>' + count + '</strong></div>' +
        '<div class="report-summary-box"><span>متوسط الفاتورة</span><strong>' + fmt(avg) + ' ر.س</strong></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>الشهر</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="3" class="empty-state">لا بيانات</td></tr>') + '</tbody>' +
      '</table></div>';
  }

  function renderProfitReport(content) {
    var revenue = 0, cost = 0;
    invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
      inv.items.forEach(function (it) {
        var product = products.find(function (p) { return p.id === it.productId; });
        revenue += it.price * it.qty;
        cost += (product ? (product.cost || 0) : 0) * it.qty;
      });
    });
    var profit = revenue - cost;
    content.innerHTML =
      '<div class="report-summary">' +
        '<div class="report-summary-box"><span>إجمالي الإيرادات</span><strong style="color:#27ae60">' + fmt(revenue) + ' ر.س</strong></div>' +
        '<div class="report-summary-box"><span>إجمالي التكلفة</span><strong style="color:#e67e22">' + fmt(cost) + ' ر.س</strong></div>' +
        '<div class="report-summary-box"><span>الربح الصافي</span><strong style="color:' + (profit >= 0 ? "#27ae60" : "#e74c3c") + '">' + fmt(profit) + ' ر.س</strong></div>' +
      '</div>';
  }

  function renderDeadReport(content) {
    var lastSale = {};
    invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
      inv.items.forEach(function (it) {
        if (!lastSale[it.productId] || inv.date > lastSale[it.productId]) lastSale[it.productId] = inv.date;
      });
    });
    var now = new Date();
    var deadProducts = products.filter(function (p) {
      if (!lastSale[p.id]) return true;
      return Math.floor((now - new Date(lastSale[p.id])) / (1000 * 60 * 60 * 24)) > 30;
    }).map(function (p) {
      var days = lastSale[p.id] ? Math.floor((now - new Date(lastSale[p.id])) / (1000 * 60 * 60 * 24)) : "لم يُبع";
      return { name: p.name, qty: p.qty, days: days };
    });
    var rows = deadProducts.map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + p.qty + '</td><td>' + p.days + ' يوم</td></tr>';
    }).join("");
    content.innerHTML =
      '<div class="report-summary"><div class="report-summary-box"><span>منتجات راكدة</span><strong style="color:#e74c3c">' + deadProducts.length + '</strong></div></div>' +
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>المنتج</th><th>الكمية</th><th>آخر بيع</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="3" class="empty-state">لا منتجات راكدة ✅</td></tr>') + '</tbody>' +
      '</table></div>';
  }

  function renderTopCustomersReport(content) {
    var custTotals = {};
    invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
      if (!custTotals[inv.customerId]) custTotals[inv.customerId] = { name: inv.customer, count: 0, total: 0 };
      custTotals[inv.customerId].count++;
      custTotals[inv.customerId].total += inv.grandTotal;
    });
    var sorted = Object.values(custTotals).sort(function (a, b) { return b.total - a.total; }).slice(0, 10);
    var rows = sorted.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(c.name) + '</td><td>' + c.count + '</td><td>' + fmt(c.total) + ' ر.س</td></tr>';
    }).join("");
    content.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>#</th><th>العميل</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="4" class="empty-state">لا بيانات</td></tr>') + '</tbody>' +
      '</table></div>';
  }

  function renderCharts() {
    if (typeof Chart === "undefined") return;
    renderSalesChart();
    renderTopProductsChart();
    renderComparisonChart();
  }
  function refreshCharts() {
    if (salesChart) { try { salesChart.destroy(); } catch (e) {} salesChart = null; }
    if (topProductsChart) { try { topProductsChart.destroy(); } catch (e) {} topProductsChart = null; }
    if (comparisonChart) { try { comparisonChart.destroy(); } catch (e) {} comparisonChart = null; }
    renderCharts();
  }

  function renderSalesChart() {
    var ctx = $("salesChart");
    if (!ctx) return;
    if (salesChart) { try { salesChart.destroy(); } catch (e) {} }
    var labels = [], data = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dateStr = d.toISOString().split("T")[0];
      labels.push(dateStr.slice(5));
      var total = invoices.filter(function (inv) { return inv.type === "sale" && inv.date === dateStr; })
        .reduce(function (s, inv) { return s + inv.grandTotal; }, 0);
      data.push(total);
    }
    var isDark = document.body.classList.contains("dark-mode");
    var textColor = isDark ? "#94a3b8" : "#8895a7";
    var gridColor = isDark ? "#2d3748" : "#e4e9f2";
    salesChart = new Chart(ctx, {
      type: "line",
      data: { labels: labels, datasets: [{ label: "المبيعات", data: data, borderColor: "#4f8cff", backgroundColor: "rgba(79,140,255,0.1)", fill: true, tension: 0.4, pointRadius: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 10 }, callback: function (v) { return fmtInt(v); } }, grid: { color: gridColor } }
        }
      }
    });
  }

  function renderTopProductsChart() {
    var ctx = $("topProductsChart");
    if (!ctx) return;
    if (topProductsChart) { try { topProductsChart.destroy(); } catch (e) {} }
    var productSales = {};
    invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
      inv.items.forEach(function (it) {
        if (!productSales[it.productId]) productSales[it.productId] = { name: it.name, total: 0 };
        productSales[it.productId].total += it.price * it.qty;
      });
    });
    var sorted = Object.values(productSales).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
    if (sorted.length === 0) sorted = [{ name: "لا بيانات", total: 1 }];
    var isDark = document.body.classList.contains("dark-mode");
    var textColor = isDark ? "#94a3b8" : "#8895a7";
    topProductsChart = new Chart(ctx, {
      type: "doughnut",
      data: { labels: sorted.map(function (p) { return p.name; }), datasets: [{ data: sorted.map(function (p) { return p.total; }), backgroundColor: ["#4f8cff","#6a5acd","#ff8a4c","#2ecc71","#e74c3c"], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: textColor, font: { size: 10 }, padding: 8 } } } }
    });
  }

  function renderComparisonChart() {
    var ctx = $("comparisonChart");
    if (!ctx) return;
    if (comparisonChart) { try { comparisonChart.destroy(); } catch (e) {} }
    var labels = [], salesData = [], purchasesData = [];
    var now = new Date();
    var monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      labels.push(monthNames[d.getMonth()] + " " + d.getFullYear());
      var sales = invoices.filter(function (inv) { return inv.type === "sale" && (inv.date || "").slice(0, 7) === monthKey; }).reduce(function (s, inv) { return s + inv.grandTotal; }, 0);
      salesData.push(sales);
      var purchases = invoices.filter(function (inv) { return inv.type === "purchase" && (inv.date || "").slice(0, 7) === monthKey; }).reduce(function (s, inv) { return s + inv.grandTotal; }, 0);
      purchasesData.push(purchases);
    }
    var isDark = document.body.classList.contains("dark-mode");
    var textColor = isDark ? "#94a3b8" : "#8895a7";
    var gridColor = isDark ? "#2d3748" : "#e4e9f2";
    comparisonChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "المبيعات", data: salesData, backgroundColor: "rgba(46,204,113,0.85)", borderColor: "#27ae60", borderWidth: 2, borderRadius: 8 },
          { label: "المشتريات", data: purchasesData, backgroundColor: "rgba(255,138,76,0.85)", borderColor: "#e67e22", borderWidth: 2, borderRadius: 8 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top", labels: { color: textColor, font: { size: 13, weight: "bold", family: "Tajawal" }, padding: 18, usePointStyle: true, pointStyle: "rectRounded" } },
          tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ": " + fmt(ctx.parsed.y) + " ر.س"; } } }
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11, family: "Tajawal" } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, font: { size: 10 }, callback: function (v) { return fmtInt(v); } }, grid: { color: gridColor } }
        }
      }
    });
  }

  function initItemModal() {
    $("closeItemModal").addEventListener("click", closeItemModal);
    $("itemModal").addEventListener("click", function (e) { if (e.target.id === "itemModal") closeItemModal(); });
    $("confirmItemBtn").addEventListener("click", confirmAddItem);
    $("itemQtyInput").addEventListener("input", updateItemSubtotal);
    $("itemPriceInput").addEventListener("input", updateItemSubtotal);
  }

  function openItemModal(product, type, form, editIdx) {
    itemModalState.product = product;
    itemModalState.type = type;
    itemModalState.form = form;
    itemModalState.editIdx = editIdx;
    $("itemProductName").textContent = product.name;
    $("itemProductCode").textContent = "الكود: " + product.code + " | متوفر: " + fmtInt(product.qty);
    if (editIdx !== null && editIdx !== undefined && drafts[type][editIdx]) {
      $("itemQtyInput").value = drafts[type][editIdx].qty;
      $("itemPriceInput").value = drafts[type][editIdx].price;
    } else {
      $("itemQtyInput").value = 1;
      $("itemPriceInput").value = product.price;
    }
    var needsStock = (type === "sale" || type === "purchase_return");
    $("itemQtyInput").max = needsStock ? product.qty : 999999;
    updateItemSubtotal();
    $("itemModal").classList.remove("hidden");
    setTimeout(function () { $("itemQtyInput").focus(); }, 100);
  }

  function updateItemSubtotal() {
    var qty = parseFloat($("itemQtyInput").value) || 0;
    var price = parseFloat($("itemPriceInput").value) || 0;
    $("itemSubtotal").textContent = fmt(qty * price) + " ر.س";
  }

  function closeItemModal() {
    $("itemModal").classList.add("hidden");
    itemModalState = { product: null, type: null, form: null, editIdx: null };
  }

  function confirmAddItem() {
    if (!itemModalState.product) return;
    var qty = parseInt($("itemQtyInput").value) || 0;
    var price = parseFloat($("itemPriceInput").value) || 0;
    if (qty <= 0) { toast("كمية غير صحيحة", "error"); return; }
    if (price < 0) { toast("سعر غير صحيح", "error"); return; }
    var type = itemModalState.type;
    var form = itemModalState.form;
    var product = itemModalState.product;
    var needsStock = (type === "sale" || type === "purchase_return");
    if (itemModalState.editIdx !== null && itemModalState.editIdx !== undefined) {
      var draft = drafts[type];
      if (!draft[itemModalState.editIdx]) return;
      if (needsStock && qty > product.qty) { toast("المتوفر فقط " + product.qty, "error"); return; }
      draft[itemModalState.editIdx].qty = qty;
      draft[itemModalState.editIdx].price = price;
      renderItems(form, type);
      closeItemModal();
      toast("تم التعديل ✅", "success");
      return;
    }
    if (needsStock && qty > product.qty) { toast("المتوفر فقط " + product.qty, "error"); return; }
    var draftArr = drafts[type];
    var existing = draftArr.find(function (x) { return x.productId === product.id; });
    if (existing) {
      if (needsStock && existing.qty + qty > product.qty) { toast("تجاوز المخزون", "error"); return; }
      existing.qty += qty;
      existing.price = price;
    } else {
      draftArr.push({ productId: product.id, name: product.name, price: price, qty: qty });
    }
    renderItems(form, type);
    closeItemModal();
    toast("تمت الإضافة: " + product.name, "success");
  }

  function initScanModal() {
    $("closeScanBtn").addEventListener("click", closeScanModal);
    $("scanModal").addEventListener("click", function (e) { if (e.target.id === "scanModal") closeScanModal(); });
  }

  function openScanModal(callback) {
    scanCallback = callback;
    $("scanModal").classList.remove("hidden");
    setTimeout(function () {
      if (typeof Html5Qrcode === "undefined") { toast("المكتبة لم تُحمّل", "error"); closeScanModal(); return; }
      try { scanModalScanner = new Html5Qrcode("scanReader"); }
      catch (e) { toast("خطأ", "error"); closeScanModal(); return; }
      var config = { fps: 15, qrbox: function (w, h) { var m = Math.min(w, h); return { width: Math.floor(m * 0.9), height: Math.floor(m * 0.5) }; } };
      if (typeof Html5QrcodeSupportedFormats !== "undefined") {
        config.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128];
      }
      scanModalScanner.start({ facingMode: "environment" }, config,
        function (text) { var cb = scanCallback; closeScanModal(); if (cb) cb(String(text).trim()); },
        function () {}
      ).catch(function (err) { console.error(err); toast("تعذر فتح الكاميرا", "error"); closeScanModal(); });
    }, 100);
  }

  function closeScanModal() {
    $("scanModal").classList.add("hidden");
    if (scanModalScanner) {
      scanModalScanner.stop().then(function () {
        try { scanModalScanner.clear(); } catch (e) {}
        scanModalScanner = null;
        $("scanReader").innerHTML = "";
      }).catch(function () { scanModalScanner = null; });
    }
  }

  function initPrintModal() {
    $("closePrintBtn").addEventListener("click", function () {
      $("printModal").classList.add("hidden");
      $("printArea").innerHTML = "";
    });
    $("printBtn").addEventListener("click", function () {
      if (isPrinting) return;
      isPrinting = true;
      setTimeout(function () {
        try { window.print(); } catch (e) {}
        setTimeout(function () { isPrinting = false; }, 1500);
      }, 250);
    });
    $("printModal").addEventListener("click", function (e) {
      if (e.target.id === "printModal") { e.target.classList.add("hidden"); $("printArea").innerHTML = ""; }
    });
    window.addEventListener("afterprint", function () { isPrinting = false; });
  }

  function payMethodIcon(m) {
    if (m === "نقد") return "fa-money-bill-wave";
    if (m === "تحويل") return "fa-money-bill-transfer";
    if (m === "بنك") return "fa-building-columns";
    return "fa-clock";
  }

  window.viewInvoice = function (id) {
    var inv = invoices.find(function (x) { return x.id === id; });
    if (!inv) return;
    var info = TYPES[inv.type];
    if (!info) return;
    var itemsRows = inv.items.map(function (item, idx) {
      return '<tr><td style="text-align:center;color:#8895a7">' + (idx+1) + '</td><td style="font-weight:500">' + esc(item.name) + '</td><td>' + fmt(item.price) + ' ر.س</td><td style="text-align:center">' + fmtInt(item.qty) + '</td><td style="font-weight:700;color:#2c3e50">' + fmt(item.price * item.qty) + ' ر.س</td></tr>';
    }).join("");
    var html =
      '<div class="inv-new">' +
        '<div class="inv-new-header">' +
          '<div class="inv-new-brand">' +
            '<div class="inv-new-brand-icon"><i class="fa-solid fa-warehouse"></i></div>' +
            '<div class="inv-new-brand-text"><h2>' + esc(business.name) + '</h2><p><i class="fa-solid fa-phone"></i> ' + esc(business.phone) + '</p><p><i class="fa-solid fa-location-dot"></i> ' + esc(business.address) + '</p></div>' +
          '</div>' +
          '<div class="inv-new-badge"><span class="label">' + esc(info.label) + '</span><span class="number">' + esc(inv.number) + '</span></div>' +
        '</div>' +
        '<div class="inv-new-info">' +
          '<div class="inv-new-info-block"><h4>' + info.party + '</h4><p>' + esc(inv.customer) + '</p>' + (inv.phone ? '<small><i class="fa-solid fa-phone"></i> ' + esc(inv.phone) + '</small>' : '') + (inv.address ? '<small><i class="fa-solid fa-location-dot"></i> ' + esc(inv.address) + '</small>' : '') + '</div>' +
          '<div class="inv-new-info-block"><h4>التاريخ وطريقة الدفع</h4><p>' + esc(inv.date) + '</p><span class="method-badge"><i class="fa-solid ' + payMethodIcon(inv.method) + '"></i> ' + esc(inv.method || "نقد") + '</span></div>' +
        '</div>' +
        '<div class="inv-new-table-wrap"><table class="inv-new-table"><thead><tr><th style="width:40px">#</th><th>الصنف</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>' + itemsRows + '</tbody></table></div>' +
        '<div class="inv-new-totals">' +
          '<div class="inv-new-total-row"><span>قبل الضريبة</span><span>' + fmt(inv.subtotal) + ' ر.س</span></div>' +
          '<div class="inv-new-total-row"><span>الضريبة (' + inv.taxRate + '%)</span><span>' + fmt(inv.taxVal) + ' ر.س</span></div>' +
          '<div class="inv-new-total-grand"><span>الإجمالي</span><span>' + fmt(inv.grandTotal) + ' ر.س</span></div>' +
        '</div>' +
        '<div class="inv-new-footer"><h3>شكراً لثقتكم</h3><p>' + esc(business.name) + ' — ' + esc(business.phone) + '</p></div>' +
      '</div>';
    $("printArea").innerHTML = html;
    $("printModal").classList.remove("hidden");
  };

  window.viewSanad = function (kind, id) {
    var data, title, partyLabel, partyValue;
    if (kind === "receipt") {
      data = receipts.find(function (r) { return r.id === id; });
      title = "سند قبض"; partyLabel = "استلمنا من"; partyValue = data ? data.customer : "";
    } else if (kind === "payment") {
      data = payments.find(function (p) { return p.id === id; });
      title = "سند صرف"; partyLabel = "صُرف إلى"; partyValue = data ? data.customer : "";
    } else {
      data = journals.find(function (j) { return j.id === id; });
      title = "سند قيد";
    }
    if (!data) return;
    var html = '<div class="sanad-print">';
    if (kind === "journal") {
      html += '<div class="sanad-header"><h2><i class="fa-solid fa-book"></i> سند قيد</h2><span class="num">' + esc(data.number) + '</span></div>' +
        '<div class="sanad-amount"><span>المبلغ</span><strong>' + fmt(data.amount) + ' ر.س</strong></div>' +
        '<div class="sanad-details"><div><strong>البيان:</strong> ' + esc(data.desc) + '</div><div><strong>التاريخ:</strong> ' + esc(data.date) + '</div><div><strong>مدين:</strong> ' + esc(data.debitAccount) + '</div><div><strong>دائن:</strong> ' + esc(data.creditAccount) + '</div></div>';
    } else {
      html += '<div class="sanad-header"><h2><i class="fa-solid fa-' + (kind === "receipt" ? "receipt" : "money-bill-wave") + '"></i> ' + title + '</h2><span class="num">' + esc(data.number) + '</span></div>' +
        '<div class="sanad-amount"><span>المبلغ</span><strong>' + fmt(data.amount) + ' ر.س</strong></div>' +
        '<div class="sanad-details"><div><strong>' + partyLabel + ':</strong> ' + esc(partyValue) + '</div><div><strong>التاريخ:</strong> ' + esc(data.date) + '</div><div><strong>طريقة الدفع:</strong> ' + esc(data.method) + '</div><div><strong>البيان:</strong> ' + esc(data.note || "—") + '</div></div>';
    }
    html += '<div style="text-align:center;margin-top:40px;color:#8895a7"><p style="margin-bottom:60px">التوقيع: ______________________</p><small>' + esc(business.name) + ' — ' + esc(business.phone) + '</small></div></div>';
    $("printArea").innerHTML = html;
    $("printModal").classList.remove("hidden");
  };

  function initSettings() {
    $("businessForm").addEventListener("submit", function (e) {
      e.preventDefault();
      business = { name: $("bizName").value.trim(), phone: $("bizPhone").value.trim(), address: $("bizAddress").value.trim() };
      saveUserData("business", business);
      toast("تم الحفظ ✅", "success");
    });
    $("darkModeToggle").addEventListener("change", function () {
      document.body.classList.toggle("dark-mode", this.checked);
      localStorage.setItem(DARK_MODE_KEY, this.checked ? "1" : "0");
      if (salesChart) refreshCharts();
      toast(this.checked ? "الوضع الليلي مفعّل" : "الوضع النهاري مفعّل", "success");
    });
    $("languageSelect").addEventListener("change", function () {
      if (this.value === "en") {
        toast("English قريباً! العربية ستبقى", "error");
        this.value = "ar";
      }
    });
    $("changePasswordForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var oldP = $("oldPass").value;
      var newP = $("newPass").value;
      var newP2 = $("newPass2").value;
      var accounts = getAccounts();
      var acc = accounts.find(function (a) { return a.username === currentUser; });
      if (!acc) { toast("خطأ في الحساب", "error"); return; }
      if (acc.password !== oldP) { toast("كلمة المرور الحالية خاطئة", "error"); return; }
      if (newP.length < 4) { toast("كلمة المرور قصيرة", "error"); return; }
      if (newP !== newP2) { toast("كلمتا المرور غير متطابقتين", "error"); return; }
      acc.password = newP;
      saveAccounts(accounts);
      $("changePasswordForm").reset();
      toast("تم تغيير كلمة المرور ✅", "success");
    });
    $("logoutBtnSettings").addEventListener("click", function () {
      if (!confirm("تسجيل الخروج؟")) return;
      localStorage.removeItem(CURRENT_USER_KEY);
      location.reload();
    });
    $("deleteAllDataBtn").addEventListener("click", function () {
      if (!confirm("⚠️ سيتم حذف كل بيانات هذا الحساب نهائياً. متأكد؟")) return;
      if (!confirm("تأكيد أخير: لا يمكن التراجع!")) return;
      var keysToDelete = ["products", "customers", "suppliers", "invoices", "receipts", "payments", "journals", "business"];
      keysToDelete.forEach(function (k) {
        localStorage.removeItem(getUserKey(k));
      });
      products = []; customers = []; suppliers = []; invoices = [];
      receipts = []; payments = []; journals = [];
      business = { name: "مخزوني", phone: "", address: "" };
      renderAll();
      fillBusinessForm();
      toast("تم حذف كل البيانات 🗑️", "success");
    });
  }

  function fillSettings() {
    var toggle = $("darkModeToggle");
    if (toggle) toggle.checked = document.body.classList.contains("dark-mode");
    fillBusinessForm();
    updateCurrentUserDisplay();
  }

  function fillBusinessForm() {
    var b = $("bizName"); if (b) b.value = business.name || "";
    var p = $("bizPhone"); if (p) p.value = business.phone || "";
    var a = $("bizAddress"); if (a) a.value = business.address || "";
  }

  function initAI() {
    $("aiFab").addEventListener("click", function () {
      $("aiModal").classList.remove("hidden");
      setTimeout(function () { $("aiInput").focus(); }, 200);
    });
    $("closeAiModal").addEventListener("click", function () {
      $("aiModal").classList.add("hidden");
    });
    $("aiModal").addEventListener("click", function (e) {
      if (e.target.id === "aiModal") e.target.classList.add("hidden");
    });
    $("aiSendBtn").addEventListener("click", handleAISend);
    $("aiInput").addEventListener("keypress", function (e) { if (e.key === "Enter") handleAISend(); });
    $$(".ai-suggestion").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $("aiInput").value = btn.dataset.cmd;
        handleAISend();
      });
    });
    if ($("aiChat").children.length === 0) {
      aiBotSay("مرحباً " + (currentUser || "") + "! 👋<br>أنا مساعدك.<br><br>جرّب:<br>• <strong>أضف عميل اسمه أحمد</strong><br>• <strong>أضف منتج اسمه لابتوب بسعر 3000 كمية 10</strong><br>• <strong>كم الأرباح؟</strong><br>• <strong>المنتجات الناقصة</strong><br>• <strong>أفضل العملاء</strong>");
    }
  }

  function aiBotSay(text, type) {
    var chat = $("aiChat");
    var msg = document.createElement("div");
    msg.className = "ai-message bot" + (type ? " " + type : "");
    msg.innerHTML = text;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }
  function aiUserSay(text) {
    var chat = $("aiChat");
    var msg = document.createElement("div");
    msg.className = "ai-message user";
    msg.textContent = text;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }
  function handleAISend() {
    var input = $("aiInput");
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    aiUserSay(text);
    setTimeout(function () {
      var response = processAICommand(text);
      aiBotSay(response.text, response.type);
    }, 300);
  }

  function processAICommand(text) {
    var lower = text.toLowerCase();
    var clean = text.trim();

    if (/أضف منتج|اضف منتج/.test(lower)) {
      var nameMatch = clean.match(/اسمه\s+([^\s,،]+)|اسم\s+([^\s,،]+)/);
      var priceMatch = clean.match(/(?:بسعر|سعر)\s+(\d+(?:\.\d+)?)/);
      var qtyMatch = clean.match(/(?:كمية|بكمية)\s+(\d+)/);
      if (!nameMatch) return { text: "❌ مثال: <strong>أضف منتج اسمه لابتوب بسعر 3000 كمية 10</strong>", type: "error" };
      var pName = nameMatch[1] || nameMatch[2];
      var pPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
      var pQty = qtyMatch ? parseInt(qtyMatch[1]) : 0;
      var code = "P" + Date.now().toString().slice(-6);
      products.push({ id: uid(), code: code, name: pName, price: pPrice, cost: 0, qty: pQty, details: "" });
      saveUserData("products", products);
      renderAll();
      return { text: "✅ تم إضافة المنتج <strong>" + esc(pName) + "</strong><br>السعر: " + fmt(pPrice) + " ر.س<br>الكمية: " + pQty, type: "success" };
    }

    if (/أضف عميل|اضف عميل/.test(lower)) {
      var nameMatch = clean.match(/اسمه\s+([^\s,،]+)|اسم\s+([^\s,،]+)/);
      var phoneMatch = clean.match(/(?:هاتف|جوال|رقم)\s+([\d\+]+)/);
      if (!nameMatch) return { text: "❌ مثال: <strong>أضف عميل اسمه أحمد</strong>", type: "error" };
      var cName = nameMatch[1] || nameMatch[2];
      var cPhone = phoneMatch ? phoneMatch[1] : "";
      customers.push({ id: uid(), name: cName, phone: cPhone, address: "", createdAt: new Date().toISOString() });
      saveUserData("customers", customers);
      renderAll();
      return { text: "✅ تم إضافة العميل <strong>" + esc(cName) + "</strong>", type: "success" };
    }

    if (/أضف مورد|اضف مورد/.test(lower)) {
      var nameMatch = clean.match(/اسمه\s+([^\s,،]+)|اسم\s+([^\s,،]+)/);
      if (!nameMatch) return { text: "❌ مثال: <strong>أضف مورد اسمه شركة النور</strong>", type: "error" };
      var sName = nameMatch[1] || nameMatch[2];
      suppliers.push({ id: uid(), name: sName, phone: "", address: "", createdAt: new Date().toISOString() });
      saveUserData("suppliers", suppliers);
      renderAll();
      return { text: "✅ تم إضافة المورد <strong>" + esc(sName) + "</strong>", type: "success" };
    }

    if (/الربح|أرباح|ارباح/.test(lower)) {
      var revenue = 0, cost = 0;
      invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
        inv.items.forEach(function (it) {
          var product = products.find(function (p) { return p.id === it.productId; });
          revenue += it.price * it.qty;
          cost += (product ? (product.cost || 0) : 0) * it.qty;
        });
      });
      var profit = revenue - cost;
      return { text: "💰 <strong>الأرباح:</strong><br>• الإيرادات: <strong>" + fmt(revenue) + " ر.س</strong><br>• التكلفة: <strong>" + fmt(cost) + " ر.س</strong><br>• الربح: <strong style='color:" + (profit >= 0 ? "#27ae60" : "#e74c3c") + "'>" + fmt(profit) + " ر.س</strong>", type: "success" };
    }

    if (/مبيعات/.test(lower) && !/فاتورة|أنشئ|سوي/.test(lower)) {
      var total = invoices.filter(function (i) { return i.type === "sale"; }).reduce(function (s, i) { return s + i.grandTotal; }, 0);
      var count = invoices.filter(function (i) { return i.type === "sale"; }).length;
      return { text: "📊 <strong>المبيعات:</strong><br>• عدد الفواتير: <strong>" + count + "</strong><br>• الإجمالي: <strong>" + fmt(total) + " ر.س</strong>", type: "success" };
    }

    if (/ناقص|قليل|نفد|مخزون/.test(lower)) {
      var low = products.filter(function (p) { return p.qty <= 5; });
      if (low.length === 0) return { text: "✅ جميع المنتجات متوفرة!", type: "success" };
      var list = low.map(function (p) { return "• " + esc(p.name) + " — <strong style='color:#e74c3c'>" + p.qty + "</strong>"; }).join("<br>");
      return { text: "⚠️ <strong>النواقص (" + low.length + "):</strong><br>" + list, type: "error" };
    }

    if (/أفضل|افضل/.test(lower) && /عميل|عملاء/.test(lower)) {
      var custTotals = {};
      invoices.filter(function (i) { return i.type === "sale"; }).forEach(function (inv) {
        if (!custTotals[inv.customerId]) custTotals[inv.customerId] = { name: inv.customer, total: 0, count: 0 };
        custTotals[inv.customerId].total += inv.grandTotal;
        custTotals[inv.customerId].count++;
      });
      var sorted = Object.values(custTotals).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
      if (sorted.length === 0) return { text: "لا يوجد عملاء بعد.", type: "error" };
      var list = sorted.map(function (c, i) { return (i+1) + ". <strong>" + esc(c.name) + "</strong> — " + fmt(c.total) + " ر.س"; }).join("<br>");
      return { text: "👑 <strong>أفضل 5 عملاء:</strong><br>" + list, type: "success" };
    }

    if (/كم منتج|عدد المنتجات/.test(lower) && !/أضف|اضف/.test(lower)) {
      return { text: "📦 لديك <strong>" + products.length + "</strong> منتج بقيمة <strong>" + fmt(products.reduce(function (s, p) { return s + (p.price * p.qty); }, 0)) + " ر.س</strong>", type: "success" };
    }

    if (/فاتورة|فاتوره/.test(lower) && /بيع|عميل/.test(lower)) return createInvoiceByAI(text, "sale");
    if (/فاتورة|فاتوره/.test(lower) && /شراء|مورد/.test(lower)) return createInvoiceByAI(text, "purchase");

    var pages = { "لوحة": "dashboard", "رئيسية": "dashboard", "منتج": "products", "عملاء": "customers", "عميل": "customers", "موردين": "suppliers", "مورد": "suppliers", "مبيعات": "sales", "مشتريات": "purchases", "قبض": "receipts", "صرف": "payments", "قيد": "journals", "كشف": "statements", "تقارير": "reports", "مخزون": "inventory", "اعدادات": "settings" };
    if (/افتح|اذهب|روح/.test(lower)) {
      for (var key in pages) {
        if (lower.indexOf(key) > -1) { navigateTo(pages[key]); return { text: "✅ تم فتح الصفحة", type: "success" }; }
      }
    }

    if (/مساعدة|ساعدني|كيف/.test(lower)) {
      return { text: "🤖 <strong>الأوامر:</strong><br>• <strong>أضف عميل اسمه أحمد</strong><br>• <strong>أضف منتج اسمه لابتوب بسعر 3000 كمية 10</strong><br>• <strong>أضف مورد اسمه شركة النور</strong><br>• <strong>كم الأرباح؟</strong><br>• <strong>المنتجات الناقصة</strong><br>• <strong>أفضل العملاء</strong>", type: "success" };
    }

    return { text: "🤔 لم أفهم. اكتب <strong>مساعدة</strong>.", type: "error" };
  }

  function createInvoiceByAI(text, type) {
    var nameMatch = text.match(/للعميل\s+([^\s,،]+)|للمورد\s+([^\s,،]+)|ل\s+([^\s,،]+)/);
    var targetName = nameMatch ? (nameMatch[1] || nameMatch[2] || nameMatch[3]) : null;
    if (!targetName) return { text: "❌ مثال: <strong>سوي فاتورة بيع للعميل أحمد</strong>", type: "error" };
    var list = type === "sale" ? customers : suppliers;
    var entity = list.find(function (c) { return c.name.indexOf(targetName) > -1 || targetName.indexOf(c.name) > -1; });
    if (!entity) return { text: "❌ لم أجد " + (type === "sale" ? "عميلاً" : "مورداً") + " باسم <strong>" + esc(targetName) + "</strong>", type: "error" };
    var map = { sale: "sales", purchase: "purchases" };
    navigateTo(map[type]);
    setTimeout(function () {
      var form = $("form-" + type);
      if (form) {
        var sel = form.querySelector(".inv-customer-select");
        if (sel) sel.value = entity.id;
      }
    }, 300);
    return { text: "✅ فتحت فاتورة " + (type === "sale" ? "بيع" : "شراء") + " لـ <strong>" + esc(entity.name) + "</strong>", type: "success" };
  }

  function initSpeech() {
    var micBtn = $("aiMicBtn");
    if (!micBtn) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.addEventListener("click", function () {
        toast("المتصفح لا يدعم المايك. استخدم Chrome على HTTPS", "error");
      });
      return;
    }
    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = "ar-SA";
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;

    speechRecognition.onstart = function () {
      isRecording = true;
      micBtn.classList.add("recording");
      $("aiInput").placeholder = "🎤 جاري الاستماع...";
    };
    speechRecognition.onresult = function (event) {
      var transcript = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      $("aiInput").value = transcript;
    };
    speechRecognition.onend = function () {
      isRecording = false;
      micBtn.classList.remove("recording");
      $("aiInput").placeholder = "اكتب أمرك أو استخدم المايك...";
      if ($("aiInput").value.trim()) setTimeout(handleAISend, 200);
    };
    speechRecognition.onerror = function (e) {
      isRecording = false;
      micBtn.classList.remove("recording");
      $("aiInput").placeholder = "اكتب أمرك أو استخدم المايك...";
      if (e.error === "not-allowed") toast("يجب السماح بالميكروفون", "error");
      else if (e.error === "no-speech") toast("لم أسمع، حاول مرة أخرى", "error");
      else if (e.error === "network") toast("يحتاج اتصال إنترنت + HTTPS", "error");
      else if (e.error !== "aborted") toast("خطأ: " + e.error, "error");
    };
    micBtn.addEventListener("click", function () {
      if (isRecording) {
        try { speechRecognition.stop(); } catch (e) {}
      } else {
        try {
          $("aiInput").value = "";
          speechRecognition.start();
        } catch (e) { toast("تعذر بدء الاستماع", "error"); }
      }
    });
  }

})();