// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    setDoc,
    getDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

function logAppError(msg, err) {
    console.error(msg, err);
    const logEl = document.getElementById('app-debug-log');
    if (logEl) {
        logEl.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg} ${err ? (err.message || err) : ''}</div>`;
        logEl.style.display = 'block';
    }
}

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDDs2p-ix18DsJXUAOa4OjdbGml0VaSGq0",
    authDomain: "finance-tracker-b42c4.firebaseapp.com",
    projectId: "finance-tracker-b42c4",
    storageBucket: "finance-tracker-b42c4.firebasestorage.app",
    messagingSenderId: "960545234758",
    appId: "1:960545234758:web:3b38aa3c43f879928c4f47",
    measurementId: "G-35D8F5V20P"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// Data Management
class FinanceTracker {
    constructor() {
        console.log("FinanceTracker constructor starting...");
        this.transactions = [];
        this.installments = [];
        this.initialBalances = { cash: 0, bank: 0 };
        this.customCategories = { income: [], expense: [] };
        this.recurringTemplates = [];
        this.debts = [];

        this.currentFilter = 'all';
        this.currentCategoryFilter = 'all';
        this.currentTransactionType = 'income';
        this.currentLandingTransactionType = 'income';
        this.currentPaymentMethod = 'cash';
        this.currentLandingPaymentMethod = 'cash';

        this.user = null;
        this.authMode = 'login'; // 'login' or 'register'
        this.initialized = false;

        // PIN Authentication
        this.pinInput = "";
        this.storedPin = null;
        this.isPinVerified = false;
        this.pinMode = 'create'; // 'create' or 'verify'
        this.pinUIInitialized = false;

        this.setupAuth();
    }


    async init() {
        if (!this.user) return;
        console.log("FinanceTracker initializing for user:", this.user.uid);

        if (!this.initialized) {
            this.setupEventListeners();
            this.initialized = true;
        }

        this.loadTheme();
        this.setDefaultDate();
        this.setupLandingForm();

        try {
            await this.loadAllData();
            await this.checkAndProcessRecurringPayments();
            await this.checkInstallments();
            await this.loadDebts();
            console.log("Data/Recurring/Installments/Debts checks complete");
        } catch (error) {
            logAppError("Veri yükleme hatası", error);
        }

        console.log("Updating summary/UI...");
        this.updateSummary();
        this.renderTransactions();
        this.renderInstallments();
        this.renderRecurringTemplates();
        this.renderCustomCategories();
        this.updateCategoryDropdowns();
        this.updateFilterCategoryDropdown();
        console.log("FinanceTracker init complete");
    }


    async loadAllData() {
        try {
            // Load user profile (balances and categories)
            const userSnap = await getDoc(this.getUserDoc());
            if (userSnap.exists()) {
                const userData = userSnap.data();
                this.initialBalances = userData.initialBalances || {
                    cash: 0,
                    bank: 0
                };
                this.customCategories = userData.customCategories || {
                    income: [],
                    expense: []
                };
            } else {
                // Initialize settings if they don't exist
                await this.saveInitialBalances({
                    cash: 0,
                    bank: 0
                });
                await this.saveCustomCategories({
                    income: [],
                    expense: []
                });
            }

            // Load transactions
            const q = query(this.getTransactionsRef(), orderBy("date", "desc"));
            const querySnapshot = await getDocs(q);
            this.transactions = [];
            querySnapshot.forEach((doc) => {
                this.transactions.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Load installments
            const instSnapshot = await getDocs(this.getInstallmentsRef());
            this.installments = [];
            instSnapshot.forEach((doc) => {
                this.installments.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Load recurring templates
            const recSnapshot = await getDocs(this.getRecurringRef());
            this.recurringTemplates = [];
            recSnapshot.forEach((doc) => {
                this.recurringTemplates.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            this.renderTransactions();
            this.renderInstallments();
            this.renderRecurringTemplates(); // Corrected from renderRecurringList
            this.renderMonthlyHistory();
            this.updateSummary();
            this.updateCategoryDropdowns();
            this.updateFilterCategoryDropdown();
        } catch (error) {
            logAppError("Yükleme Hatası:", error);
        }
    }

    async checkAndProcessRecurringPayments() {
        // console.log("Checking recurring payments...");
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const templates = [...this.recurringTemplates];
        let processedCount = 0;

        for (const template of templates) {
            const nextDate = new Date(template.nextDate);
            nextDate.setHours(0, 0, 0, 0);

            // If nextDate is today or in the past
            if (nextDate <= today) {
                console.log(`Processing recurring payment: ${template.description}, Due: ${template.nextDate}`);

                // Create new transaction
                const transactionData = {
                    type: template.type,
                    paymentMethod: template.paymentMethod,
                    description: template.description + " (Otomatik)",
                    amount: template.amount,
                    date: template.nextDate, // Use the scheduled date
                    category: template.category,
                    createdAt: new Date().toISOString(),
                    isRecurring: true
                };

                try {
                    // Save transaction
                    const docRef = await addDoc(this.getTransactionsRef(), transactionData);
                    this.transactions.unshift({
                        id: docRef.id,
                        ...transactionData
                    });

                    // Update template next date (add 1 month)
                    const newNextDate = new Date(template.nextDate);
                    newNextDate.setMonth(newNextDate.getMonth() + 1);
                    const newNextDateStr = newNextDate.toISOString().split('T')[0];

                    await updateDoc(this.getRecurringDoc(template.id), {
                        nextDate: newNextDateStr
                    });

                    // Update local state
                    const templateIndex = this.recurringTemplates.findIndex(t => t.id === template.id);
                    if (templateIndex !== -1) {
                        this.recurringTemplates[templateIndex].nextDate = newNextDateStr;
                    }

                    processedCount++;
                } catch (error) {
                    console.error(`Error processing recurring payment ${template.id}:`, error);
                }
            }
        }

        if (processedCount > 0) {
            this.renderRecurringTemplates();
            this.renderTransactions();
            this.updateSummary();
            alert(`${processedCount} adet otomatik işlem eklendi.`);
        }
    }

    // Settings (Balances & Categories)
    async saveInitialBalances(data) {
        try {
            this.initialBalances = data;
            await setDoc(this.getUserDoc(), {
                initialBalances: data
            }, {
                merge: true
            });
        } catch (error) {
            logAppError("Bakiye kaydedilemedi", error);
        }
    }

    async saveCustomCategories(data) {
        try {
            this.customCategories = data;
            await setDoc(this.getUserDoc(), {
                customCategories: data
            }, {
                merge: true
            });
        } catch (error) {
            logAppError("Kategoriler kaydedilemedi", error);
        }
    }

    // Theme
    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // Balance Editing
    editBalance(type) {
        this.currentEditingBalanceType = type;

        // Calculate current total balance for pre-filling the input
        let currentTotalBalance = this.initialBalances[type] || 0;

        this.transactions.forEach(t => {
            const isIncome = t.type === 'income';
            if (type === 'cash' && t.paymentMethod === 'cash') {
                currentTotalBalance += isIncome ? t.amount : -t.amount;
            } else if (type === 'bank' && t.paymentMethod !== 'cash') {
                currentTotalBalance += isIncome ? t.amount : -t.amount;
            }
        });

        const label = type === 'cash' ? 'Nakit Bakiye' : 'Banka Bakiye';

        document.getElementById('balanceModalTitle').textContent = `${label} Düzenle`;
        document.getElementById('newBalanceValue').value = currentTotalBalance;
        document.getElementById('balanceModal').classList.add('active');
    }

    async handleBalanceSubmit(e) {
        e.preventDefault();
        const type = this.currentEditingBalanceType;
        const targetBalance = parseFloat(document.getElementById('newBalanceValue').value);

        if (!isNaN(targetBalance)) {
            try {
                // Calculate total transaction impact for this type
                let transactionsTotal = 0;
                this.transactions.forEach(t => {
                    const isIncome = t.type === 'income';

                    if (type === 'cash' && t.paymentMethod === 'cash') {
                        transactionsTotal += isIncome ? t.amount : -t.amount;
                    } else if (type === 'bank' && t.paymentMethod !== 'cash') { // explicit check for bank/other
                        transactionsTotal += isIncome ? t.amount : -t.amount;
                    }
                });

                // Algorithm: Target = Initial + TransactionsTotal
                // Therefore: Initial = Target - TransactionsTotal
                const newInitialBalance = targetBalance - transactionsTotal;

                console.log(`Adjusting ${type} balance: Target=${targetBalance}, TransTotal=${transactionsTotal}, NewInitial=${newInitialBalance}`);

                const newBalances = {
                    ...this.initialBalances,
                    [type]: newInitialBalance
                };
                await this.saveInitialBalances(newBalances);

                this.updateSummary();
                this.closeBalanceModal();
                alert("Bakiye güncellendi.");
            } catch (error) {
                console.error("Error saving balance:", error);
                alert("Bakiye kaydedilirken bir hata oluştu.");
            }
        }
    }

    closeBalanceModal() {
        document.getElementById('balanceModal').classList.remove('active');
        document.getElementById('balanceForm').reset();
    }

    // Event Listeners
    setupEventListeners() {
        // Add Migration Button
        const headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('migrateDataBtn')) {
            const btn = document.createElement('button');
            btn.id = 'migrateDataBtn';
            btn.className = 'btn-secondary';
            btn.style.marginRight = '10px';
            btn.textContent = 'Eski Verileri Al';
            btn.onclick = () => this.migrateOldData();
            headerActions.prepend(btn);
        }

        // Landing Page Actions
        const goToDashboard = document.getElementById('goToDashboard');
        const mainLogo = document.querySelector('.app-header .logo');

        if (goToDashboard) {
            goToDashboard.addEventListener('click', () => {
                this.switchView('dashboard');
            });
        }

        if (mainLogo) {
            mainLogo.style.cursor = 'pointer';
            mainLogo.addEventListener('click', () => {
                this.switchView('landing');
            });
        }

        // Landing Form Type Selector
        document.querySelectorAll('.landing-type-selector .type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const typeBtn = e.target.closest('.type-btn');
                this.selectLandingTransactionType(typeBtn);
            });
        });

        // Landing Form Payment Selector
        document.querySelectorAll('.landing-payment-selector .payment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const paymentBtn = e.target.closest('.payment-btn');
                this.selectLandingPaymentMethod(paymentBtn);
            });
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // Balance card click to edit
        const cashCard = document.getElementById('cashBalanceCard');
        const bankCard = document.getElementById('bankBalanceCard');

        if (cashCard) cashCard.addEventListener('click', () => this.editBalance('cash'));
        if (bankCard) bankCard.addEventListener('click', () => this.editBalance('bank'));

        // Category management
        document.getElementById('categoryManageBtn').addEventListener('click', () => this.openCategoryModal());
        document.getElementById('closeCategoryModal').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('addIncomeCategory').addEventListener('click', () => this.addCustomCategory('income'));
        document.getElementById('addExpenseCategory').addEventListener('click', () => this.addCustomCategory('expense'));

        // Installment Payment Method
        const instPaymentBtns = document.querySelectorAll('#installmentPaymentMethod .type-btn');
        instPaymentBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                instPaymentBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentInstallmentPaymentMethod = e.target.dataset.value;
                document.getElementById('selectedInstallmentPaymentMethod').value = e.target.dataset.value;
            });
        });



        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Transaction Modal
        document.getElementById('addTransactionBtn').addEventListener('click', () => this.openTransactionModal());
        document.getElementById('closeTransactionModal').addEventListener('click', () => this.closeTransactionModal());
        document.getElementById('cancelTransaction').addEventListener('click', () => this.closeTransactionModal());
        document.getElementById('transactionForm').addEventListener('submit', (e) => this.handleTransactionSubmit(e));

        // Transaction Type Selector
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectTransactionType(e.target.closest('.type-btn')));
        });

        // Payment Method Selector
        document.querySelectorAll('.payment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectPaymentMethod(e.target.closest('.payment-btn')));
        });

        // Installment Modal
        document.getElementById('addInstallmentBtn').addEventListener('click', () => this.openInstallmentModal());
        document.getElementById('closeInstallmentModal').addEventListener('click', () => this.closeInstallmentModal());
        document.getElementById('cancelInstallment').addEventListener('click', () => this.closeInstallmentModal());
        document.getElementById('installmentForm').addEventListener('submit', (e) => this.handleInstallmentSubmit(e));

        // Balance Modal
        document.getElementById('closeBalanceModal').addEventListener('click', () => this.closeBalanceModal());
        document.getElementById('cancelBalance').addEventListener('click', () => this.closeBalanceModal());
        document.getElementById('balanceForm').addEventListener('submit', (e) => this.handleBalanceSubmit(e));

        // Filter
        document.getElementById('filterType').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.currentCategoryFilter = 'all'; // Reset category filter when type changes
            this.updateFilterCategoryDropdown();
            this.renderTransactions();
        });

        document.getElementById('filterCategory').addEventListener('change', (e) => {
            this.currentCategoryFilter = e.target.value;
            this.renderTransactions();
        });

        // Monthly Detail Modal
        document.getElementById('closeMonthlyDetailModal').addEventListener('click', () => this.closeMonthlyDetailModal());

        // Debt Modal
        const addDebtBtn = document.getElementById('addDebtBtn');
        if (addDebtBtn) addDebtBtn.addEventListener('click', () => this.openDebtModal());

        const closeDebtModal = document.getElementById('closeDebtModal');
        if (closeDebtModal) closeDebtModal.addEventListener('click', () => this.closeDebtModal());

        const cancelDebt = document.getElementById('cancelDebt');
        if (cancelDebt) cancelDebt.addEventListener('click', () => this.closeDebtModal());

        const debtForm = document.getElementById('debtForm');
        if (debtForm) debtForm.addEventListener('submit', (e) => this.handleDebtSubmit(e));

        const debtTypeBtns = document.querySelectorAll('.debt-type-selector .type-btn');
        debtTypeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.type-btn');
                if (!targetBtn) return;
                debtTypeBtns.forEach(b => b.classList.remove('active'));
                targetBtn.classList.add('active');
                const typeInput = document.getElementById('selectedDebtType');
                if (typeInput) typeInput.value = targetBtn.dataset.type;
            });
        });

        // Event Delegation for Debts List Actions
        const debtsList = document.getElementById('debtsList');
        if (debtsList) {
            debtsList.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-icon');
                if (!btn) return;

                const card = btn.closest('.debt-card');
                const debtId = btn.dataset.id;
                const action = btn.dataset.action;

                if (action === 'toggle') this.toggleDebtStatus(debtId);
                else if (action === 'edit') {
                    const debt = this.debts.find(d => d.id === debtId);
                    if (debt) this.openDebtModal(debt);
                } else if (action === 'delete') this.deleteDebt(debtId);
            });
        }

        // Close modal on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Event Delegation for History Cards
        const historyList = document.getElementById('monthlyHistoryList');
        if (historyList) {
            historyList.addEventListener('click', (e) => {
                const card = e.target.closest('.history-card');
                if (card) {
                    const year = parseInt(card.dataset.year);
                    const month = parseInt(card.dataset.month);
                    this.openMonthlyDetail(year, month);
                }
            });
        }
    }

    setupLandingForm() {
        console.log("Setting up landing form...");
        const landingForm = document.getElementById('landingTransactionForm');
        if (landingForm) {
            landingForm.addEventListener('submit', (e) => {
                console.log("Landing form submitted");
                this.handleLandingTransactionSubmit(e);
            });
            this.setLandingDefaultDate();
        }
    }

    setLandingDefaultDate() {
        const dateInput = document.getElementById('landingTransactionDate');
        if (dateInput) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}`;
        }
    }

    selectLandingTransactionType(btn) {
        if (!btn) return;
        const type = btn.dataset.type;
        this.currentLandingTransactionType = type;

        document.querySelectorAll('.landing-type-selector .type-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });

        const incomeCategories = document.getElementById('landingIncomeCategories');
        const expenseCategories = document.getElementById('landingExpenseCategories');

        if (type === 'income') {
            incomeCategories.style.display = '';
            expenseCategories.style.display = 'none';
        } else {
            incomeCategories.style.display = 'none';
            expenseCategories.style.display = '';
        }
        document.getElementById('landingTransactionCategory').value = "";
    }

    selectLandingPaymentMethod(btn) {
        if (!btn) return;
        const payment = btn.dataset.payment;
        this.currentLandingPaymentMethod = payment;

        document.querySelectorAll('.landing-payment-selector .payment-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });
    }

    async handleLandingTransactionSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const description = document.getElementById('landingTransactionDescription').value;
            const amountVal = document.getElementById('landingTransactionAmount').value;
            const date = document.getElementById('landingTransactionDate').value;
            const category = document.getElementById('landingTransactionCategory').value;

            console.log("Data:", {
                description,
                amountVal,
                date,
                category,
                type: this.currentLandingTransactionType
            });

            if (!description || !amountVal || !date || !category) {
                alert("Lütfen tüm alanları doldurun.");
                submitBtn.disabled = false;
                return;
            }

            const transactionData = {
                type: this.currentLandingTransactionType,
                paymentMethod: this.currentLandingPaymentMethod,
                description: description,
                amount: parseFloat(amountVal),
                date: date,
                category: category,
                createdAt: new Date().toISOString()
            };

            const docRef = await addDoc(this.getTransactionsRef(), transactionData);
            console.log("Document saved with ID:", docRef.id);
            this.transactions.unshift({
                id: docRef.id,
                ...transactionData
            });

            this.updateSummary();
            this.renderTransactions();

            form.reset();
            this.setLandingDefaultDate();

            // For automated testing, we might want to skip the alert or handle it
            console.log("SUCCESS: Transaction saved");

            this.switchView('dashboard');
        } catch (error) {
            console.error("Error saving landing transaction:", error);
            alert(`İşlem kaydedilirken bir hata oluştu: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
        }
    }

    // View Management
    switchView(view) {
        const landingPage = document.getElementById('landingPage');
        const dashboardPage = document.getElementById('dashboardPage');

        if (view === 'landing') {
            landingPage.style.display = 'flex';
            dashboardPage.style.display = 'none';
        } else {
            landingPage.style.display = 'none';
            dashboardPage.style.display = 'flex';
        }
    }

    // Category Management
    openCategoryModal() {
        document.getElementById('categoryModal').classList.add('active');
        this.renderCustomCategories();
    }

    closeCategoryModal() {
        document.getElementById('categoryModal').classList.remove('active');
    }

    async addCustomCategory(type) {
        const inputId = type === 'income' ? 'newIncomeCategory' : 'newExpenseCategory';
        const input = document.getElementById(inputId);
        const categoryName = input.value.trim();

        if (!categoryName) return;

        const categoryId = `custom_${type}_${Date.now()}`;
        const newCategories = {
            ...this.customCategories
        };
        newCategories[type].push({
            id: categoryId,
            name: categoryName
        });

        await this.saveCustomCategories(newCategories);
        input.value = '';
        this.renderCustomCategories();
        this.updateCategoryDropdowns();
    }

    async deleteCustomCategory(type, categoryId) {
        if (confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) {
            const newCategories = {
                ...this.customCategories
            };
            newCategories[type] = newCategories[type].filter(cat => cat.id !== categoryId);
            await this.saveCustomCategories(newCategories);
            this.renderCustomCategories();
            this.updateCategoryDropdowns();
        }
    }

    renderCustomCategories() {
        if (!this.customCategories.income) return;

        // Render income categories
        const incomeList = document.getElementById('incomeCategoriesList');
        incomeList.innerHTML = this.customCategories.income.map(cat => `
            <div class="category-item">
                <span class="category-item-name">${this.escapeHtml(cat.name)}</span>
                <button class="category-item-delete" onclick="app.deleteCustomCategory('income', '${cat.id}')" aria-label="Sil">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 5l6 6m0-6l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');

        // Render expense categories
        const expenseList = document.getElementById('expenseCategoriesList');
        expenseList.innerHTML = this.customCategories.expense.map(cat => `
            <div class="category-item">
                <span class="category-item-name">${this.escapeHtml(cat.name)}</span>
                <button class="category-item-delete" onclick="app.deleteCustomCategory('expense', '${cat.id}')" aria-label="Sil">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 5l6 6m0-6l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    updateCategoryDropdowns() {
        if (!this.customCategories.income) return;

        const incomeGroup = document.getElementById('incomeCategories');
        const expenseGroup = document.getElementById('expenseCategories');

        // Add custom income categories
        const existingIncomeCustom = incomeGroup.querySelectorAll('[data-custom]');
        existingIncomeCustom.forEach(el => el.remove());

        this.customCategories.income.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            option.setAttribute('data-custom', 'true');
            incomeGroup.appendChild(option);
        });

        // Add custom expense categories
        const existingExpenseCustom = expenseGroup.querySelectorAll('[data-custom]');
        existingExpenseCustom.forEach(el => el.remove());

        this.customCategories.expense.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            option.setAttribute('data-custom', 'true');
            expenseGroup.appendChild(option);
        });

        this.updateFilterCategoryDropdown();

        // For Landing Page
        const landingIncomeSelect = document.getElementById('landingIncomeCategories');
        const landingExpenseSelect = document.getElementById('landingExpenseCategories');

        if (landingIncomeSelect) {
            landingIncomeSelect.innerHTML = `
                <option value="salary">Maaş</option>
                <option value="freelance">Serbest Çalışma</option>
                <option value="investment">Yatırım</option>
                <option value="other-income">Diğer</option>
                ${this.customCategories.income.map(cat => `<option value="${this.escapeHtml(cat.id)}">${this.escapeHtml(cat.name)}</option>`).join('')}
            `;
        }

        if (landingExpenseSelect) {
            landingExpenseSelect.innerHTML = `
                <option value="food">Yiyecek & İçecek</option>
                <option value="transport">Ulaşım</option>
                <option value="bills">Faturalar</option>
                <option value="shopping">Alışveriş</option>
                <option value="health">Sağlık</option>
                <option value="entertainment">Eğlence</option>
                <option value="other-expense">Diğer</option>
                ${this.customCategories.expense.map(cat => `<option value="${this.escapeHtml(cat.id)}">${this.escapeHtml(cat.name)}</option>`).join('')}
            `;
        }
    }

    updateFilterCategoryDropdown() {
        const categoryFilter = document.getElementById('filterCategory');
        if (!categoryFilter) return;

        const type = this.currentFilter;
        let options = '<option value="all">Tüm Kategoriler</option>';

        const addOptions = (categories, prefix = '') => {
            Object.entries(categories).forEach(([id, name]) => {
                options += `<option value="${id}">${prefix}${name}</option>`;
            });
        };

        const defaultIncome = {
            'salary': 'Maaş',
            'freelance': 'Serbest Çalışma',
            'investment': 'Yatırım',
            'other-income': 'Diğer'
        };

        const defaultExpense = {
            'food': 'Yiyecek & İçecek',
            'transport': 'Ulaşım',
            'bills': 'Faturalar',
            'shopping': 'Alışveriş',
            'health': 'Sağlık',
            'entertainment': 'Eğlence',
            'other-expense': 'Diğer'
        };

        if (type === 'all' || type === 'income') {
            addOptions(defaultIncome, type === 'all' ? 'Gelir: ' : '');
            this.customCategories.income.forEach(cat => {
                options += `<option value="${cat.id}">${type === 'all' ? 'Gelir: ' : ''}${cat.name}</option>`;
            });
        }

        if (type === 'all' || type === 'expense') {
            addOptions(defaultExpense, type === 'all' ? 'Gider: ' : '');
            this.customCategories.expense.forEach(cat => {
                options += `<option value="${cat.id}">${type === 'all' ? 'Gider: ' : ''}${cat.name}</option>`;
            });
        }

        categoryFilter.innerHTML = options;
        categoryFilter.value = this.currentCategoryFilter;

        // Add a class for styling if you like
        categoryFilter.classList.toggle('has-selection', this.currentCategoryFilter !== 'all');
    }

    // Tabs
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        if (tabName === 'summary') {
            this.updateSummary();
        }
    }

    // Transaction Modal
    openTransactionModal(transaction = null) {
        const modal = document.getElementById('transactionModal');
        const form = document.getElementById('transactionForm');

        if (transaction) {
            // Edit mode
            document.getElementById('transactionModalTitle').textContent = 'İşlemi Düzenle';
            document.getElementById('transactionDescription').value = transaction.description;
            document.getElementById('transactionAmount').value = transaction.amount;
            document.getElementById('transactionDate').value = transaction.date;
            document.getElementById('transactionCategory').value = transaction.category;

            this.currentTransactionType = transaction.type;
            this.currentPaymentMethod = transaction.paymentMethod || 'cash';

            this.selectTransactionType(document.querySelector(`.type-btn[data-type="${transaction.type}"]`));
            this.selectPaymentMethod(document.querySelector(`.payment-btn[data-payment="${this.currentPaymentMethod}"]`));

            form.dataset.editId = transaction.id;
        } else {
            // Add mode
            document.getElementById('transactionModalTitle').textContent = 'Yeni İşlem';
            form.reset();
            delete form.dataset.editId;
            this.setDefaultDate();
            this.selectTransactionType(document.querySelector('.type-btn[data-type="income"]'));
            this.selectPaymentMethod(document.querySelector('.payment-btn[data-payment="cash"]'));
            const recurringCheckbox = document.getElementById('transactionRecurring');
            if (recurringCheckbox) recurringCheckbox.checked = false;
        }

        modal.classList.add('active');
    }

    closeTransactionModal() {
        document.getElementById('transactionModal').classList.remove('active');
        document.getElementById('transactionForm').reset();
    }

    selectTransactionType(btn) {
        if (!btn) return;
        const type = btn.dataset.type;
        this.currentTransactionType = type;

        document.querySelectorAll('.type-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });

        const incomeCategories = document.getElementById('incomeCategories');
        const expenseCategories = document.getElementById('expenseCategories');

        if (type === 'income') {
            if (incomeCategories) incomeCategories.style.display = '';
            if (expenseCategories) expenseCategories.style.display = 'none';
            const firstOption = incomeCategories ? incomeCategories.querySelector('option') : null;
            if (firstOption) document.getElementById('transactionCategory').value = firstOption.value;
        } else {
            if (incomeCategories) incomeCategories.style.display = 'none';
            if (expenseCategories) expenseCategories.style.display = '';
            const firstOption = expenseCategories ? expenseCategories.querySelector('option') : null;
            if (firstOption) document.getElementById('transactionCategory').value = firstOption.value;
        }
    }

    selectPaymentMethod(btn) {
        if (!btn) return;
        const payment = btn.dataset.payment;
        this.currentPaymentMethod = payment;

        document.querySelectorAll('.payment-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });
    }

    async handleTransactionSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const description = document.getElementById('transactionDescription').value;
            const amountVal = document.getElementById('transactionAmount').value;
            const date = document.getElementById('transactionDate').value;
            const category = document.getElementById('transactionCategory').value;

            if (!description || !amountVal || !date || !category) {
                alert("Lütfen tüm alanları doldurun.");
                submitBtn.disabled = false;
                return;
            }

            // Find existing existing transaction for createdAt safely
            let createdAt = new Date().toISOString();
            if (form.dataset.editId) {
                const existing = this.transactions.find(t => t.id === form.dataset.editId);
                if (existing && existing.createdAt) {
                    createdAt = existing.createdAt;
                }
            }

            const transactionData = {
                type: this.currentTransactionType,
                paymentMethod: this.currentPaymentMethod,
                description: description,
                amount: parseFloat(amountVal),
                date: date,
                category: category,
                createdAt: createdAt
            };

            if (form.dataset.editId) {
                const ref = this.getTransactionDoc(form.dataset.editId);
                await updateDoc(ref, transactionData);
                const index = this.transactions.findIndex(t => t.id === form.dataset.editId);
                if (index !== -1) {
                    this.transactions[index] = {
                        id: form.dataset.editId,
                        ...transactionData
                    };
                }
            } else {
                const docRef = await addDoc(this.getTransactionsRef(), transactionData);
                this.transactions.unshift({
                    id: docRef.id,
                    ...transactionData
                });

                // Handle Recurring
                const isRecurring = document.getElementById('transactionRecurring').checked;
                if (isRecurring) {
                    const nextDate = new Date(date);
                    nextDate.setMonth(nextDate.getMonth() + 1);

                    const templateData = {
                        ...transactionData,
                        nextDate: nextDate.toISOString().split('T')[0],
                        createdAt: new Date().toISOString()
                    };
                    delete templateData.date; // Template uses nextDate

                    const recRef = await addDoc(this.getRecurringRef(), templateData);
                    this.recurringTemplates.unshift({
                        id: recRef.id,
                        ...templateData
                    });
                    this.renderRecurringTemplates();
                }
            }

            this.updateSummary();
            this.renderTransactions();
            this.closeTransactionModal();
        } catch (error) {
            console.error("Error saving transaction:", error);
            alert(`İşlem kaydedilirken bir hata oluştu: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
        }
    }

    async deleteTransaction(id) {
        if (confirm('Bu işlemi silmek istediğinizden emin misiniz?')) {
            try {
                await deleteDoc(this.getTransactionDoc(id));
                this.transactions = this.transactions.filter(t => t.id !== id);
                this.updateSummary();
                this.renderTransactions();
            } catch (error) {
                console.error("Error deleting transaction:", error);
                alert("Silme işlemi başarısız oldu.");
            }
        }
    }

    // Installment Modal
    openInstallmentModal() {
        const modal = document.getElementById('installmentModal');
        document.getElementById('installmentForm').reset();
        this.setDefaultInstallmentDate();
        modal.classList.add('active');
    }

    closeInstallmentModal() {
        document.getElementById('installmentModal').classList.remove('active');
    }

    async handleInstallmentSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const description = document.getElementById('installmentDescription').value;
            const totalAmountVal = document.getElementById('installmentTotal').value;
            const installmentCountVal = document.getElementById('installmentCount').value;
            const startDate = document.getElementById('installmentStart').value;

            if (!description || !totalAmountVal || !installmentCountVal || !startDate) {
                alert("Lütfen tüm alanları doldurun.");
                submitBtn.disabled = false;
                return;
            }

            const totalAmount = parseFloat(totalAmountVal);
            const installmentCount = parseInt(installmentCountVal);

            if (isNaN(totalAmount) || isNaN(installmentCount) || installmentCount <= 0) {
                alert("Lütfen geçerli değerler girin.");
                submitBtn.disabled = false;
                return;
            }

            const installmentData = {
                description: description,
                totalAmount: totalAmount,
                installmentCount: installmentCount,
                monthlyAmount: totalAmount / installmentCount,
                startDate: startDate,
                paidCount: 0,
                createdAt: new Date().toISOString()
            };

            const docRef = await addDoc(this.getInstallmentsRef(), installmentData);
            this.installments.unshift({
                id: docRef.id,
                ...installmentData
            });

            this.updateSummary();
            this.renderInstallments();
            this.closeInstallmentModal();
        } catch (error) {
            console.error("Error saving installment:", error);
            alert(`Taksit kaydedilirken bir hata oluştu: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
        }
    }

    async deleteInstallment(id) {
        if (confirm('Bu taksiti silmek istediğinizden emin misiniz?')) {
            try {
                await deleteDoc(this.getInstallmentDoc(id));
                this.installments = this.installments.filter(i => i.id !== id);
                this.updateSummary();
                this.renderInstallments();
            } catch (error) {
                console.error("Error deleting installment:", error);
                alert("Silme işlemi başarısız oldu.");
            }
        }
    }

    async payInstallment(id) {
        const installment = this.installments.find(i => i.id === id);
        if (installment && installment.paidCount < installment.installmentCount) {
            try {
                const today = new Date().toISOString().split('T')[0];
                const newPaidCount = installment.paidCount + 1;

                // Create transaction
                const transactionData = {
                    type: 'expense',
                    paymentMethod: installment.paymentMethod || 'cash',
                    description: `${installment.description} (Taksit ${newPaidCount}/${installment.installmentCount})`,
                    amount: installment.monthlyAmount,
                    date: today,
                    category: 'bills', // Default to bills or 'other-expense'
                    createdAt: new Date().toISOString(),
                    isAutoGenerated: true,
                    installmentId: id
                };

                const transRef = await addDoc(this.getTransactionsRef(), transactionData);
                this.transactions.unshift({
                    id: transRef.id,
                    ...transactionData
                });

                await updateDoc(this.getInstallmentDoc(id), {
                    paidCount: newPaidCount
                });

                installment.paidCount = newPaidCount;
                this.updateSummary();
                this.renderTransactions();
                this.renderInstallments();
            } catch (error) {
                console.error("Error paying installment:", error);
                alert("Ödeme işlemi başarısız oldu.");
            }
        }
    }

    // Installment Logic
    async checkInstallments() {
        // console.log("Checking installments...");
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        let hasChanges = false;

        for (const installment of this.installments) {
            if (installment.paidCount >= installment.installmentCount) continue;

            const start = new Date(installment.startDate);
            // console.log(`Checking installment: ${installment.description}, Paid: ${installment.paidCount}, Start: ${installment.startDate}`);

            let checkY = start.getFullYear();
            let checkM = start.getMonth() + installment.paidCount;

            // Loop to catch up on missed payments
            while (true) {
                // Construct target date for the "paidCount-th" month
                // We use day 1 to safely determine the year/month without overflow issues from day 31
                const targetDate = new Date(checkY, checkM, 1);
                const targetYear = targetDate.getFullYear();
                const targetMonth = targetDate.getMonth();

                // If target month is in the future relative to now, stop.
                if (targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth)) {
                    break;
                }

                // If we are here, it means this installment month 'should' be paid by now (or is due this month).
                // Check if we already have a transaction for this installment in this specific month
                const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

                // Look for existing transaction for this installment in this month
                const alreadyPaid = this.transactions.some(t =>
                    t.installmentId === installment.id &&
                    t.date.startsWith(monthKey)
                );

                if (!alreadyPaid) {
                    console.log(`Processing due installment: ${installment.description} for ${monthKey}`);
                    try {
                        const newPaidCount = installment.paidCount + 1;
                        // Use original day, but cap at 28 to avoid Feb 30 issues, or current date if catching up?
                        // Better: Use today's date if we are catching up, OR use the due date.
                        // User request: "Günü geldiğinde". So let's use the due date.
                        // If catching up from past, use the past due date to keep history accurate? 
                        // Or use Today? Let's use Due Date for accuracy, but if it's old, it will appear in past history.
                        // Wait, if it's OLD, it might affect past balances. That's actually correct.

                        const dueDay = start.getDate();
                        const safeDay = Math.min(dueDay, 28); // Simple safety

                        // Construct the exact due date for that month
                        const paymentDateObj = new Date(targetYear, targetMonth, safeDay);
                        const paymentDate = paymentDateObj.toISOString().split('T')[0];

                        const transactionData = {
                            type: 'expense',
                            paymentMethod: installment.paymentMethod || 'cash',
                            description: `${installment.description} (Taksit ${newPaidCount}/${installment.installmentCount})`,
                            amount: installment.monthlyAmount,
                            date: paymentDate,
                            category: 'bills',
                            createdAt: new Date().toISOString(),
                            isAutoGenerated: true,
                            installmentId: installment.id
                        };

                        const transRef = await addDoc(this.getTransactionsRef(), transactionData);
                        this.transactions.unshift({
                            id: transRef.id,
                            ...transactionData
                        });

                        await updateDoc(this.getInstallmentDoc(installment.id), {
                            paidCount: newPaidCount
                        });

                        installment.paidCount = newPaidCount;
                        hasChanges = true;

                        // Move to next month
                        checkM++;
                    } catch (error) {
                        console.error("Error processing auto installment:", error);
                        break;
                    }
                } else {
                    // Already paid for this specific month
                    // console.log(`Skipping ${installment.description} for ${monthKey} (Already Paid)`);
                    checkM++;
                    // Safety break if we loop too much (e.g. corrupted data)
                    if (installment.paidCount + (checkM - (start.getMonth() + installment.paidCount)) > installment.installmentCount + 5) break;
                }

                // If we've reached the total count, stop
                if (installment.paidCount >= installment.installmentCount) break;
            }
        }

        if (hasChanges) {
            console.log("Installment updates processed, refreshing UI");
            this.updateSummary();
            this.renderTransactions();
            this.renderInstallments();
        }
    }

    // Recurring Transactions Logic
    async checkRecurringTransactions() {
        const today = new Date().toISOString().split('T')[0];
        let hasChanges = false;

        for (const template of this.recurringTemplates) {
            let nextDate = template.nextDate;

            while (nextDate <= today) {
                try {
                    // Create transaction
                    const transactionData = {
                        type: template.type,
                        paymentMethod: template.paymentMethod || 'cash',
                        description: template.description,
                        amount: template.amount,
                        date: nextDate,
                        category: template.category,
                        createdAt: new Date().toISOString(),
                        isAutoGenerated: true
                    };

                    const docRef = await addDoc(this.getTransactionsRef(), transactionData);
                    this.transactions.unshift({
                        id: docRef.id,
                        ...transactionData
                    });

                    // Update nextDate
                    const d = new Date(nextDate);
                    d.setMonth(d.getMonth() + 1);
                    nextDate = d.toISOString().split('T')[0];
                    hasChanges = true;
                } catch (error) {
                    console.error("Error generating recurring transaction:", error);
                    break;
                }
            }

            if (nextDate !== template.nextDate) {
                try {
                    await updateDoc(this.getRecurringDoc(template.id), {
                        nextDate: nextDate
                    });
                    template.nextDate = nextDate;
                } catch (error) {
                    console.error("Error updating template nextDate:", error);
                }
            }
        }

        if (hasChanges) {
            this.updateSummary();
            this.renderTransactions();
            this.renderRecurringTemplates();
        }
    }

    renderRecurringTemplates() {
        const container = document.getElementById('recurringList');
        if (!container) return;

        if (this.recurringTemplates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <path d="M12 12v40h40" stroke="currentColor" stroke-width="2" opacity="0.2" />
                        <circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="2" opacity="0.3" />
                    </svg>
                    <p>Henüz düzenli işlem bulunmuyor</p>
                    <p class="empty-state-hint">Yeni bir işlem eklerken "otomatik tekrarla" seçeneğini kullanabilirsiniz</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.recurringTemplates.map(template => `
            <div class="transaction-item ${template.type}">
                <div class="transaction-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </div>
                <div class="transaction-details">
                    <div class="transaction-description">${this.escapeHtml(template.description)}</div>
                    <div class="transaction-meta">
                        <span>Sıradaki: ${this.formatDate(template.nextDate)}</span>
                        <span>•</span>
                        <span>${this.getCategoryName(template.category)}</span>
                        <span>•</span>
                        <span>${template.paymentMethod === 'cash' ? 'Nakit' : 'Banka'}</span>
                    </div>
                </div>
                <div class="transaction-amount">
                    ${template.type === 'income' ? '+' : '-'}${this.formatCurrency(template.amount)}
                </div>
                <button class="transaction-delete" onclick="app.deleteRecurringTemplate('${template.id}')" aria-label="Sil">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6 6l8 8m0-8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    async deleteRecurringTemplate(id) {
        if (confirm('Bu otomatik işlemi iptal etmek istediğinizden emin misiniz? Gelecekteki işlemler artık otomatik eklenmeyecek.')) {
            try {
                await deleteDoc(this.getRecurringDoc(id));
                this.recurringTemplates = this.recurringTemplates.filter(t => t.id !== id);
                this.renderRecurringTemplates();
            } catch (error) {
                console.error("Error deleting recurring template:", error);
                alert("İşlem başarısız oldu.");
            }
        }
    }

    // Monthly filtering
    getCurrentMonthTransactions() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        return this.transactions.filter(t => {
            const transactionDate = new Date(t.date);
            return transactionDate.getFullYear() === currentYear &&
                transactionDate.getMonth() === currentMonth;
        });
    }

    // Rendering
    updateSummary() {
        // Monthly Calculations
        const monthlyTransactions = this.getCurrentMonthTransactions();

        const monthlyIncome = monthlyTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const monthlyExpense = monthlyTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        // Active Installments
        const activeInstallmentAmount = this.installments.reduce((sum, i) => {
            const remaining = i.installmentCount - i.paidCount;
            return sum + (remaining * i.monthlyAmount);
        }, 0);

        // Overall Balances (Initial + All Transactions)
        let cashBalance = this.initialBalances.cash || 0;
        let bankBalance = this.initialBalances.bank || 0;

        this.transactions.forEach(t => {
            if (t.paymentMethod === 'cash') {
                if (t.type === 'income') cashBalance += t.amount;
                else cashBalance -= t.amount;
            } else {
                if (t.type === 'income') bankBalance += t.amount;
                else bankBalance -= t.amount;
            }
        });

        // Update UI
        document.getElementById('monthlyIncome').textContent = this.formatCurrency(monthlyIncome);
        document.getElementById('monthlyExpense').textContent = this.formatCurrency(monthlyExpense);
        document.getElementById('cashBalance').textContent = this.formatCurrency(cashBalance);
        document.getElementById('bankBalance').textContent = this.formatCurrency(bankBalance);
        document.getElementById('activeInstallmentAmount').textContent = this.formatCurrency(activeInstallmentAmount);

        // Update Detailed Summary
        this.renderMonthlySummary(monthlyTransactions, monthlyIncome, monthlyExpense);
        this.renderMonthlyHistory();
    }

    renderMonthlySummary(transactions, totalIncome, totalExpense) {
        const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const now = new Date();
        const monthYear = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        const monthEl = document.getElementById('summaryMonthName');
        if (monthEl) monthEl.textContent = monthYear;

        // Net Status
        const netStatus = totalIncome - totalExpense;
        const netEl = document.getElementById('monthlyNetStatus');
        if (netEl) {
            netEl.textContent = this.formatCurrency(netStatus);
            netEl.style.color = netStatus >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
        }

        // Update Column Totals
        const summaryIncomeTotal = document.getElementById('summaryIncomeTotal');
        if (summaryIncomeTotal) {
            summaryIncomeTotal.textContent = `Toplam: ${this.formatCurrency(totalIncome)}`;
        }

        const summaryExpenseTotal = document.getElementById('summaryExpenseTotal');
        if (summaryExpenseTotal) {
            summaryExpenseTotal.textContent = `Toplam: ${this.formatCurrency(totalExpense)}`;
        }

        // Grouping
        const groupByCategory = (type) => {
            const list = transactions.filter(t => t.type === type);
            const groups = {};
            list.forEach(t => {
                const catId = t.category;
                groups[catId] = (groups[catId] || 0) + t.amount;
            });
            return Object.entries(groups)
                .map(([id, amount]) => ({
                    id,
                    amount,
                    name: this.getCategoryName(id)
                }))
                .sort((a, b) => b.amount - a.amount);
        };

        const incomeGroups = groupByCategory('income');
        const expenseGroups = groupByCategory('expense');

        const renderList = (groups, containerId, total, type) => {
            const container = document.getElementById(containerId);
            if (!container) return;

            if (groups.length === 0) {
                container.innerHTML = `<p class="empty-hint">Bu ay henüz ${type === 'income' ? 'gelir' : 'gider'} bulunmuyor</p>`;
                return;
            }

            container.innerHTML = groups.map(g => {
                const percentage = total > 0 ? (g.amount / total) * 100 : 0;
                return `
                    <div class="breakdown-item">
                        <div class="item-info">
                            <span>${this.escapeHtml(g.name)}</span>
                            <span>${this.formatCurrency(g.amount)} (${percentage.toFixed(1)}%)</span>
                        </div>
                        <div class="item-bar-container">
                            <div class="item-bar" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        };

        renderList(incomeGroups, 'incomeBreakdownList', totalIncome, 'income');
        renderList(expenseGroups, 'expenseBreakdownList', totalExpense, 'expense');
    }

    renderMonthlyHistory() {
        const container = document.getElementById('monthlyHistoryList');
        if (!container) return;

        if (this.transactions.length === 0) {
            container.innerHTML = '<p class="empty-hint">Henüz işlem geçmişi bulunmuyor</p>';
            return;
        }

        // Group by month/year
        const groups = {};
        this.transactions.forEach(t => {
            const date = new Date(t.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!groups[key]) {
                groups[key] = {
                    year: date.getFullYear(),
                    month: date.getMonth(),
                    income: 0,
                    expense: 0
                };
            }
            if (t.type === 'income') groups[key].income += t.amount;
            else groups[key].expense += t.amount;
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

        container.innerHTML = sortedKeys.map(key => {
            const group = groups[key];
            const net = group.income - group.expense;
            return `
                <div class="history-card" data-year="${group.year}" data-month="${group.month}">
                    <div class="history-card-header">
                        <span>${monthNames[group.month]} ${group.year}</span>
                    </div>
                    <div class="history-card-body">
                        <div class="history-stat income">
                            <span class="label">Gelir:</span>
                            <span class="value">+${this.formatCurrency(group.income)}</span>
                        </div>
                        <div class="history-stat expense">
                            <span class="label">Gider:</span>
                            <span class="value">-${this.formatCurrency(group.expense)}</span>
                        </div>
                        <div class="history-stat net">
                            <span class="label">Net:</span>
                            <span class="value" style="color: ${net >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}">
                                ${this.formatCurrency(net)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    openMonthlyDetail(year, month) {
        console.log("Opening monthly detail for:", year, month);
        try {
            const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
            const filtered = this.transactions.filter(t => {
                const d = new Date(t.date);
                return d.getFullYear() === year && d.getMonth() === month;
            });

            const totalIncome = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
            const totalExpense = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

            document.getElementById('monthlyDetailTitle').textContent = `${monthNames[month]} ${year} Detayı`;

            const netStatus = totalIncome - totalExpense;
            const netEl = document.getElementById('detailNetStatus');
            netEl.textContent = this.formatCurrency(netStatus);
            netEl.style.color = netStatus >= 0 ? 'var(--income-color)' : 'var(--expense-color)';

            const groupByCategory = (type) => {
                const list = filtered.filter(t => t.type === type);
                const groups = {};
                list.forEach(t => {
                    const catId = t.category;
                    groups[catId] = (groups[catId] || 0) + t.amount;
                });
                return Object.entries(groups)
                    .map(([id, amount]) => ({
                        id,
                        amount,
                        name: this.getCategoryName(id)
                    }))
                    .sort((a, b) => b.amount - a.amount);
            };

            const incomeGroups = groupByCategory('income');
            const expenseGroups = groupByCategory('expense');

            const renderTo = (groups, containerId, total, type) => {
                const container = document.getElementById(containerId);
                if (groups.length === 0) {
                    container.innerHTML = `<p class="empty-hint">${type === 'income' ? 'Gelir' : 'Gider'} bulunmuyor</p>`;
                    return;
                }
                container.innerHTML = groups.map(g => {
                    const percentage = total > 0 ? (g.amount / total) * 100 : 0;
                    return `
                    <div class="breakdown-item">
                        <div class="item-info">
                            <span>${this.escapeHtml(g.name)}</span>
                            <span>${this.formatCurrency(g.amount)}</span>
                        </div>
                        <div class="item-bar-container">
                            <div class="item-bar" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
                }).join('');
            };

            renderTo(incomeGroups, 'detailIncomeList', totalIncome, 'income');
            renderTo(expenseGroups, 'detailExpenseList', totalExpense, 'expense');

            document.getElementById('monthlyDetailModal').classList.add('active');
        } catch (err) {
            logAppError("Aylık detay penceresi açılamadı", err);
        }
    }

    closeMonthlyDetailModal() {
        document.getElementById('monthlyDetailModal').classList.remove('active');
    }

    // Debt Management
    async loadDebts() {
        try {
            const querySnapshot = await getDocs(query(this.getDebtsRef(), orderBy("createdAt", "desc")));
            this.debts = [];
            querySnapshot.forEach((doc) => {
                this.debts.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            this.renderDebts();
        } catch (err) {
            logAppError("Borçlar yüklenemedi", err);
        }
    }

    openDebtModal(debt = null) {
        const form = document.getElementById('debtForm');
        form.reset();
        document.getElementById('debtId').value = debt ? debt.id : '';
        document.getElementById('debtModalTitle').textContent = debt ? 'Borç / Alacak Düzenle' : 'Borç / Alacak Ekle';

        if (debt) {
            document.getElementById('debtPerson').value = debt.person;
            document.getElementById('debtAmount').value = debt.amount;
            document.getElementById('debtDueDate').value = debt.dueDate || '';
            document.getElementById('debtDescription').value = debt.description || '';
            document.getElementById('selectedDebtType').value = debt.type;

            const typeBtns = document.querySelectorAll('.debt-type-selector .type-btn');
            typeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === debt.type);
            });
        } else {
            document.getElementById('selectedDebtType').value = 'receivable';
            const typeBtns = document.querySelectorAll('.debt-type-selector .type-btn');
            typeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === 'receivable');
            });
        }

        document.getElementById('debtModal').classList.add('active');
    }

    closeDebtModal() {
        document.getElementById('debtModal').classList.remove('active');
    }

    async handleDebtSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('debtId').value;
        const debtData = {
            type: document.getElementById('selectedDebtType').value,
            person: document.getElementById('debtPerson').value,
            amount: parseFloat(document.getElementById('debtAmount').value),
            dueDate: document.getElementById('debtDueDate').value,
            description: document.getElementById('debtDescription').value,
            status: id ? this.debts.find(d => d.id === id).status : 'waiting',
            createdAt: id ? this.debts.find(d => d.id === id).createdAt : new Date().toISOString()
        };

        try {
            if (id) {
                await updateDoc(this.getDebtDoc(id), debtData);
            } else {
                await addDoc(this.getDebtsRef(), debtData);
            }
            this.closeDebtModal();
            await this.loadDebts();
        } catch (err) {
            logAppError("Borç kaydedilemedi", err);
        }
    }

    async deleteDebt(id) {
        if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
        try {
            await deleteDoc(this.getDebtDoc(id));
            await this.loadDebts();
        } catch (err) {
            logAppError("Borç silinemedi", err);
        }
    }

    async toggleDebtStatus(id) {
        const debt = this.debts.find(d => d.id === id);
        const newStatus = debt.status === 'paid' ? 'waiting' : 'paid';
        try {
            await updateDoc(doc(db, "debts", id), { status: newStatus });
            await this.loadDebts();
        } catch (err) {
            logAppError("Borç durumu güncellenemedi", err);
        }
    }

    renderDebts() {
        const container = document.getElementById('debtsList');
        if (!container) return;

        let totalReceivable = 0;
        let totalPayable = 0;

        if (this.debts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Henüz borç veya alacak kaydı bulunmuyor</p>
                </div>`;
        } else {
            container.innerHTML = this.debts.map(debt => {
                const isPaid = debt.status === 'paid';
                if (!isPaid) {
                    if (debt.type === 'receivable') totalReceivable += debt.amount;
                    else totalPayable += debt.amount;
                }

                return `
                    <div class="debt-card ${debt.type} ${isPaid ? 'paid' : ''}">
                        <div class="debt-info">
                            <h4>${this.escapeHtml(debt.person)}</h4>
                            <p>${this.escapeHtml(debt.description)}</p>
                            ${debt.dueDate ? `<p class="due-date">Vade: ${this.formatDate(debt.dueDate)}</p>` : ''}
                        </div>
                        <div class="debt-amount">
                            <span class="value">${this.formatCurrency(debt.amount)}</span>
                            <span class="status">${isPaid ? 'Ödendi' : 'Bekliyor'}</span>
                        </div>
                        <div class="debt-actions">
                            <button class="btn-icon" data-action="toggle" data-id="${debt.id}" title="${isPaid ? 'Bekliyor Yap' : 'Ödendi İşaretle'}">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                                    <path d="M5 10l3 3l7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>
                            <button class="btn-icon" data-action="edit" data-id="${debt.id}" title="Düzenle">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1l1-4l9.5-9.5z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>
                            <button class="btn-icon" data-action="delete" data-id="${debt.id}" title="Sil">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                                    <path d="M3 6h14m-2 0v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        document.getElementById('totalReceivable').textContent = this.formatCurrency(totalReceivable);
        document.getElementById('totalPayable').textContent = this.formatCurrency(totalPayable);
    }

    renderTransactions() {
        const container = document.getElementById('transactionsList');
        if (!container) return;

        const filtered = this.transactions.filter(t => {
            const typeMatch = this.currentFilter === 'all' || t.type === this.currentFilter;
            const categoryMatch = this.currentCategoryFilter === 'all' || t.category === this.currentCategoryFilter;
            return typeMatch && categoryMatch;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2" opacity="0.2"/>
                        <path d="M32 20v24m12-12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
                    </svg>
                    <p>Henüz işlem bulunmuyor</p>
                    <p class="empty-state-hint">Yeni bir işlem ekleyerek başlayın</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(transaction => `
            <div class="transaction-item ${transaction.type}">
                <div class="transaction-icon">
                    ${transaction.type === 'income' ? `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M12 5v14m7-7l-7-7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    ` : `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M12 19V5m-7 7l7 7 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    `}
                </div>
                <div class="transaction-details">
                    <div class="transaction-description">${this.escapeHtml(transaction.description)}</div>
                    <div class="transaction-meta">
                        <span>${this.formatDate(transaction.date)}</span>
                        <span>•</span>
                        <span class="transaction-category-tag">${this.escapeHtml(this.getCategoryName(transaction.category))}</span>
                        <span>•</span>
                        <span>${transaction.paymentMethod === 'cash' ? 'Nakit' : 'Banka'}</span>
                    </div>
                </div>
                <div class="transaction-amount">
                    ${transaction.type === 'income' ? '+' : '-'}${this.formatCurrency(transaction.amount)}
                </div>
                <button class="transaction-delete" onclick="app.deleteTransaction('${transaction.id}')" aria-label="Sil">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6 6l8 8m0-8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    renderInstallments() {
        const container = document.getElementById('installmentsList');
        if (!container) return;

        if (this.installments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <rect x="12" y="16" width="40" height="32" rx="4" stroke="currentColor" stroke-width="2" opacity="0.2"/>
                        <path d="M12 26h40M22 36h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
                    </svg>
                    <p>Henüz taksit bulunmuyor</p>
                    <p class="empty-state-hint">Yeni bir taksit ekleyerek başlayın</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.installments.map(installment => {
            const progress = (installment.paidCount / installment.installmentCount) * 100;
            const remaining = installment.installmentCount - installment.paidCount;
            const remainingAmount = remaining * installment.monthlyAmount;

            return `
                <div class="installment-item">
                    <div class="installment-icon-wrapper installment-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="3" y="4" width="18" height="16" rx="2" stroke-width="2"/>
                            <path d="M3 10h18M7 15h4" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <div class="installment-details">
                        <div class="installment-description">${this.escapeHtml(installment.description)}</div>
                        <div class="installment-meta">
                            <span>${installment.paidCount}/${installment.installmentCount} Taksit</span>
                            <span>•</span>
                            <span>${this.formatCurrency(installment.monthlyAmount)}/ay</span>
                            <span>•</span>
                            <span>${this.formatDate(installment.startDate)}</span>
                        </div>
                        <div class="installment-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="installment-amount">
                        ${this.formatCurrency(remainingAmount)}
                    </div>
                    ${remaining > 0 ? `
                        <button class="btn-icon" onclick="app.payInstallment('${installment.id}')" aria-label="Taksit Öde" title="Taksit Öde">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                                <path d="M5 10l3 3 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    ` : ''}
                    <button class="installment-delete" onclick="app.deleteInstallment('${installment.id}')" aria-label="Sil">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M6 6l8 8m0-8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');
    }

    // Utilities
    formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2
            }).format(amount);
        } catch (e) {
            return '€' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).format(date);
        } catch (e) {
            return dateString;
        }
    }

    getCategoryName(category) {
        const defaultCategories = {
            'salary': 'Maaş',
            'freelance': 'Serbest Çalışma',
            'investment': 'Yatırım',
            'other-income': 'Diğer Gelir',
            'food': 'Yiyecek & İçecek',
            'transport': 'Ulaşım',
            'bills': 'Faturalar',
            'shopping': 'Alışveriş',
            'health': 'Sağlık',
            'entertainment': 'Eğlence',
            'other-expense': 'Diğer Gider'
        };

        if (defaultCategories[category]) return defaultCategories[category];

        const customIncome = this.customCategories.income?.find(c => c.id === category);
        if (customIncome) return customIncome.name;

        const customExpense = this.customCategories.expense?.find(c => c.id === category);
        if (customExpense) return customExpense.name;

        return category;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('transactionDate');
        if (dateInput) dateInput.value = today;
    }

    setDefaultInstallmentDate() {
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('installmentStart');
        if (dateInput) dateInput.value = today;
    }

    // PIN LOGIC
    setupPinUI() {
        console.log("Setting up PIN UI...");
        document.querySelectorAll('.pin-key[data-key]').forEach(key => {
            key.addEventListener('click', (e) => {
                const btn = e.target.closest('.pin-key');
                if (!btn) return;
                this.handlePinInput(btn.dataset.key);
            });
        });

        const deleteBtn = document.getElementById('pinDeleteBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handlePinInput('delete'));
        }

        const enterBtn = document.getElementById('pinEnterBtn');
        if (enterBtn) {
            console.log("Enter button found");
            enterBtn.addEventListener('click', () => {
                console.log("Enter button clicked");
                this.handlePinAction();
            });
        }

        const logoutBtn = document.getElementById('pinLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }
    }

    async checkPinStatus() {
        try {
            const userDoc = await getDoc(this.getUserDoc());
            const pinScreen = document.getElementById('pinScreen');
            const pinTitle = document.getElementById('pinTitle');
            const pinSubtitle = document.getElementById('pinSubtitle');

            this.pinInput = "";
            this.updatePinDisplay();
            pinScreen.style.display = 'flex';

            if (userDoc.exists() && userDoc.data().pin) {
                // PIN exists, ask to enter
                this.storedPin = userDoc.data().pin;
                this.pinMode = 'verify';
                pinTitle.textContent = "PIN Giriniz";
                pinSubtitle.textContent = "Devam etmek için 4 haneli PIN girin";
            } else {
                // No PIN, ask to create
                this.storedPin = null;
                this.pinMode = 'create';
                pinTitle.textContent = "PIN Oluşturun";
                pinSubtitle.textContent = "Güvenliğiniz için 4 haneli bir PIN belirleyin";
            }

            // Setup UI once
            if (!this.pinUIInitialized) {
                this.setupPinUI();
                this.pinUIInitialized = true;
            }
        } catch (error) {
            console.error("Error checking PIN:", error);
            alert("PIN durumu kontrol edilemedi: " + error.message);
        }
    }

    handlePinInput(key) {
        if (key === 'delete') {
            this.pinInput = this.pinInput.slice(0, -1);
        } else if (this.pinInput.length < 4) {
            this.pinInput += key;
        }

        this.updatePinDisplay();
    }

    handlePinAction() {
        console.log("Checking PIN action. Input:", this.pinInput, "Length:", this.pinInput.length);
        if (this.pinInput.length !== 4) {
            alert("Lütfen 4 haneli PIN giriniz.");
            return;
        }

        if (this.pinMode === 'verify') {
            this.verifyPin();
        } else {
            this.createPin();
        }
    }

    updatePinDisplay() {
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach((dot, index) => {
            if (index < this.pinInput.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    }

    async verifyPin() {
        console.log("Verifying PIN. Input:", this.pinInput, "Stored:", this.storedPin);
        // Force string comparison to avoid type issues
        if (String(this.pinInput) === String(this.storedPin)) {
            console.log("PIN Verified!");
            this.isPinVerified = true;
            document.getElementById('pinScreen').style.display = 'none';
            this.init();
            this.switchView('landing');
        } else {
            console.warn("PIN Mismatch");
            alert("Hatalı PIN!");
            this.pinInput = "";
            this.updatePinDisplay();
        }
    }

    async createPin() {
        if (confirm(`PIN kodunuz ${this.pinInput} olarak ayarlanacak. Onaylıyor musunuz?`)) {
            try {
                await setDoc(this.getUserDoc(), { pin: this.pinInput }, { merge: true });
                this.storedPin = this.pinInput;
                this.isPinVerified = true;
                alert("PIN Başarıyla Oluşturuldu!");
                document.getElementById('pinScreen').style.display = 'none';
                this.init();
                this.switchView('landing');
            } catch (error) {
                console.error("Error saving PIN:", error);
                alert("PIN kaydedilemedi.");
                this.pinInput = "";
                this.updatePinDisplay();
            }
        } else {
            this.pinInput = "";
            this.updatePinDisplay();
        }
    }

    // AUTH LOGIC
    setupAuth() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                if (this.user?.uid === user.uid) return;
                this.user = user;
                const authPage = document.getElementById('authPage');
                if (authPage) authPage.style.display = 'none';

                // Start PIN flow instead of direct init
                this.checkPinStatus();
            } else {
                this.user = null;
                this.isPinVerified = false;
                this.pinInput = "";
                const authPage = document.getElementById('authPage');
                if (authPage) authPage.style.display = 'flex';
                document.getElementById('landingPage').style.display = 'none';
                document.getElementById('dashboardPage').style.display = 'none';
                document.getElementById('pinScreen').style.display = 'none';
            }
        });

        const authForm = document.getElementById('authForm');
        if (authForm) {
            authForm.addEventListener('submit', (e) => this.handleAuthSubmit(e));
        }

        // Global toggle handler (event delegation) to avoid duplicate listeners on innerHTML change
        document.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'toggleAuth') {
                e.preventDefault();
                this.authMode = this.authMode === 'login' ? 'register' : 'login';

                const subtitle = document.getElementById('authSubtitle');
                const submitBtn = document.getElementById('authSubmitBtn');
                const toggleArea = document.querySelector('.auth-toggle');

                if (subtitle) subtitle.textContent = this.authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
                if (submitBtn) submitBtn.textContent = this.authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';

                if (toggleArea) {
                    toggleArea.innerHTML = this.authMode === 'login'
                        ? 'Hesabınız yok mu? <a href="#" id="toggleAuth">Kayıt Ol</a>'
                        : 'Zaten hesabınız var mı? <a href="#" id="toggleAuth">Giriş Yap</a>';
                }
            }
        });
    }

    async handleAuthSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        const btn = document.getElementById('authSubmitBtn');

        btn.disabled = true;
        btn.textContent = 'Bekleyin...';

        try {
            if (this.authMode === 'login') {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            console.error("Auth error:", err);
            alert("Hata: " + this.translateAuthError(err.code));
            btn.disabled = false;
            btn.textContent = this.authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
        }
    }

    async handleLogout() {
        try {
            await signOut(auth);
            window.location.reload();
        } catch (err) {
            logAppError("Çıkış yapılamadı", err);
        }
    }

    translateAuthError(code) {
        switch (code) {
            case 'auth/user-not-found': return 'Kullanıcı bulunamadı.';
            case 'auth/wrong-password': return 'Hatalı şifre.';
            case 'auth/invalid-email': return 'Geçersiz e-posta.';
            case 'auth/email-already-in-use': return 'Bu e-posta zaten kullanımda.';
            case 'auth/weak-password': return 'Şifre çok zayıf (en az 6 karakter).';
            case 'auth/invalid-credential': return 'Geçersiz bilgiler veya kullanıcı bulunamadı. Kayıt olduğunuzdan emin olun.';
            case 'auth/operation-not-allowed': return 'E-posta/Şifre girişi aktif değil. Lütfen Firebase Console\'dan açın.';
            default: return 'Bir hata oluştu: ' + code;
        }
    }

    // DATABASE HELPERS
    getUserDoc() { return doc(db, "users", this.user.uid); }
    getTransactionsRef() { return collection(db, `users/${this.user.uid}/transactions`); }
    getTransactionDoc(id) { return doc(db, `users/${this.user.uid}/transactions`, id); }
    getInstallmentsRef() { return collection(db, `users/${this.user.uid}/installments`); }
    getInstallmentDoc(id) { return doc(db, `users/${this.user.uid}/installments`, id); }
    getRecurringRef() { return collection(db, `users/${this.user.uid}/recurringTemplates`); }
    getRecurringDoc(id) { return doc(db, `users/${this.user.uid}/recurringTemplates`, id); }
    getDebtsRef() { return collection(db, `users/${this.user.uid}/debts`); }
    getDebtDoc(id) { return doc(db, `users/${this.user.uid}/debts`, id); }

    async migrateOldData() {
        if (!confirm("Eski verileri bu hesaba aktarmak istediğinize emin misiniz? Bu işlem mevcut verilerle birleşecektir.")) return;

        const btn = document.getElementById('migrateDataBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Aktarılıyor...';
        }

        try {
            const uid = this.user.uid;
            let count = 0;

            console.log("Starting migration for user:", uid);

            // 1. Transactions
            try {
                const oldTransSnapshot = await getDocs(collection(db, "transactions"));
                console.log(`Found ${oldTransSnapshot.size} old transactions`);
                for (const docSnap of oldTransSnapshot.docs) {
                    await setDoc(doc(db, `users/${uid}/transactions`, docSnap.id), docSnap.data());
                    count++;
                }
            } catch (e) { console.warn("Error migrating transactions:", e); }

            // 2. Installments
            try {
                const oldInstSnapshot = await getDocs(collection(db, "installments"));
                console.log(`Found ${oldInstSnapshot.size} old installments`);
                for (const docSnap of oldInstSnapshot.docs) {
                    await setDoc(doc(db, `users/${uid}/installments`, docSnap.id), docSnap.data());
                    count++;
                }
            } catch (e) { console.warn("Error migrating installments:", e); }

            // 3. Recurring
            try {
                const oldRecSnapshot = await getDocs(collection(db, "recurringTemplates"));
                console.log(`Found ${oldRecSnapshot.size} old recurring templates`);
                for (const docSnap of oldRecSnapshot.docs) {
                    await setDoc(doc(db, `users/${uid}/recurringTemplates`, docSnap.id), docSnap.data());
                    count++;
                }
            } catch (e) { console.warn("Error migrating recurring:", e); }

            // 4. Debts
            try {
                const oldDebtsSnapshot = await getDocs(collection(db, "debts"));
                console.log(`Found ${oldDebtsSnapshot.size} old debts`);
                for (const docSnap of oldDebtsSnapshot.docs) {
                    await setDoc(doc(db, `users/${uid}/debts`, docSnap.id), docSnap.data());
                    count++;
                }
            } catch (e) { console.warn("Error migrating debts:", e); }

            // 5. Settings (Custom Categories)
            try {
                const oldSettingsSnapshot = await getDocs(collection(db, "settings"));
                if (!oldSettingsSnapshot.empty) {
                    const settingsData = oldSettingsSnapshot.docs[0].data();
                    if (settingsData.customCategories) {
                        await setDoc(doc(db, "users", uid), {
                            customCategories: settingsData.customCategories
                        }, {
                            merge: true
                        });
                        console.log("Migrated custom categories");
                    }
                }
            } catch (e) { console.warn("Error migrating settings:", e); }

            alert(`İşlem Başarılı! Toplam ${count} kayıt aktarıldı. Sayfa yenileniyor...`);
            window.location.reload();

        } catch (error) {
            console.error("Migration fatal error:", error);
            alert("Bir hata oluştu: " + error.message);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Tekrar Dene';
            }
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('error', (event) => {
        logAppError('Sistem Hatası:', event.error);
    });
    window.addEventListener('unhandledrejection', (event) => {
        logAppError('Beklenmedik Hata:', event.reason);
    });

    try {
        console.log("DOM ready, initializing app...");
        window.app = new FinanceTracker();
    } catch (err) {
        logAppError("Uygulama başlatılamadı", err);
    }

    // Temporary Debug: Unregister Service Worker to clear cache issues
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (let registration of registrations) {
                registration.unregister();
                console.log("Service Worker unregistered for debug");
            }
        });
    }
});
