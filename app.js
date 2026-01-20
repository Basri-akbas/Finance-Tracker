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
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Data Management
class FinanceTracker {
    constructor() {
        this.transactions = [];
        this.installments = [];
        this.initialBalances = { cash: 0, bank: 0 };
        this.customCategories = { income: [], expense: [] };
        this.recurringTemplates = [];

        this.currentFilter = 'all';
        this.currentCategoryFilter = 'all';
        this.currentTransactionType = 'income';
        this.currentLandingTransactionType = 'income';
        this.currentPaymentMethod = 'cash';
        this.currentLandingPaymentMethod = 'cash';

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadTheme();
        this.setDefaultDate();
        this.setupLandingForm();

        try {
            await this.loadAllData();
            await this.checkAndProcessRecurringPayments();
            await this.checkInstallments();
        } catch (error) {
            console.error("Error loading data:", error);
            alert("Veriler yüklenirken bir hata oluştu. Lütfen internet bağlantınızı kontrol edin.");
        }

        this.updateSummary();
        this.renderTransactions();
        this.renderInstallments();
        this.renderRecurringTemplates();
        this.renderCustomCategories();
        this.updateCategoryDropdowns();
        this.updateFilterCategoryDropdown();
    }


    async loadAllData() {
        // Load Initial Balances
        const settingsSnap = await getDocs(collection(db, "settings"));
        settingsSnap.forEach(doc => {
            if (doc.id === "initialBalances") {
                this.initialBalances = doc.data();
            } else if (doc.id === "customCategories") {
                this.customCategories = doc.data();
            }
        });

        // Initialize settings if they don't exist
        if (settingsSnap.empty || !this.initialBalances) {
            await this.saveInitialBalances({ cash: 0, bank: 0 });
        }
        if (!this.customCategories.income) {
            await this.saveCustomCategories({ income: [], expense: [] });
        }

        // Load Transactions
        const qTransactions = query(collection(db, "transactions"), orderBy("date", "desc"));
        const transSnap = await getDocs(qTransactions);
        this.transactions = [];
        transSnap.forEach(doc => {
            this.transactions.push({ id: doc.id, ...doc.data() });
        });

        // Load Installments
        const qInstallments = query(collection(db, "installments"), orderBy("createdAt", "desc"));
        const instSnap = await getDocs(qInstallments);
        this.installments = [];
        instSnap.forEach(doc => {
            this.installments.push({ id: doc.id, ...doc.data() });
        });

        // Load Recurring Templates
        const qRecurring = query(collection(db, "recurringTemplates"), orderBy("createdAt", "desc"));
        const recSnap = await getDocs(qRecurring);
        this.recurringTemplates = [];
        recSnap.forEach(doc => {
            this.recurringTemplates.push({ id: doc.id, ...doc.data() });
        });
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
                    const docRef = await addDoc(collection(db, "transactions"), transactionData);
                    this.transactions.unshift({ id: docRef.id, ...transactionData });

                    // Update template next date (add 1 month)
                    const newNextDate = new Date(template.nextDate);
                    newNextDate.setMonth(newNextDate.getMonth() + 1);
                    const newNextDateStr = newNextDate.toISOString().split('T')[0];

                    await updateDoc(doc(db, "recurringTemplates", template.id), {
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
        this.initialBalances = data;
        await setDoc(doc(db, "settings", "initialBalances"), data);
    }

    async saveCustomCategories(data) {
        this.customCategories = data;
        await setDoc(doc(db, "settings", "customCategories"), data);
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

                const newBalances = { ...this.initialBalances, [type]: newInitialBalance };
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

        // Close modal on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
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
        console.log("Handling landing transaction submit...");
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const description = document.getElementById('landingTransactionDescription').value;
            const amountVal = document.getElementById('landingTransactionAmount').value;
            const date = document.getElementById('landingTransactionDate').value;
            const category = document.getElementById('landingTransactionCategory').value;

            console.log("Data:", { description, amountVal, date, category, type: this.currentLandingTransactionType });

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

            const docRef = await addDoc(collection(db, "transactions"), transactionData);
            console.log("Document saved with ID:", docRef.id);
            this.transactions.unshift({ id: docRef.id, ...transactionData });

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
        const newCategories = { ...this.customCategories };
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
            const newCategories = { ...this.customCategories };
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
                const ref = doc(db, "transactions", form.dataset.editId);
                await updateDoc(ref, transactionData);
                const index = this.transactions.findIndex(t => t.id === form.dataset.editId);
                if (index !== -1) {
                    this.transactions[index] = { id: form.dataset.editId, ...transactionData };
                }
            } else {
                const docRef = await addDoc(collection(db, "transactions"), transactionData);
                this.transactions.unshift({ id: docRef.id, ...transactionData });

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

                    const recRef = await addDoc(collection(db, "recurringTemplates"), templateData);
                    this.recurringTemplates.unshift({ id: recRef.id, ...templateData });
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
                await deleteDoc(doc(db, "transactions", id));
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

            const docRef = await addDoc(collection(db, "installments"), installmentData);
            this.installments.unshift({ id: docRef.id, ...installmentData });

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
                await deleteDoc(doc(db, "installments", id));
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

                const transRef = await addDoc(collection(db, "transactions"), transactionData);
                this.transactions.unshift({ id: transRef.id, ...transactionData });

                await updateDoc(doc(db, "installments", id), {
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
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        let hasChanges = false;

        for (const installment of this.installments) {
            if (installment.paidCount >= installment.installmentCount) continue;

            const start = new Date(installment.startDate);

            // Calculate how many installments should have been paid by now
            // Logic: For each month that has passed since startDate (inclusive of the month of the date), 
            // if today's date >= start date's day, it counts as a month passed.
            // Better logic: Compare current year/month with start year/month + paidCount

            let shouldBePaidCount = installment.paidCount;
            let checkY = start.getFullYear();
            let checkM = start.getMonth() + installment.paidCount;

            while (true) {
                const targetDate = new Date(checkY, checkM, 1);
                const targetYear = targetDate.getFullYear();
                const targetMonth = targetDate.getMonth();

                if (targetYear < currentYear || (targetYear === currentYear && targetMonth <= currentMonth)) {
                    // This month's installment should be paid
                    // Check if we already have a transaction for this installment in this specific month
                    const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
                    const alreadyPaid = this.transactions.some(t =>
                        t.installmentId === installment.id &&
                        t.date.startsWith(monthKey)
                    );

                    if (!alreadyPaid) {
                        try {
                            const newPaidCount = installment.paidCount + 1;
                            const paymentDate = new Date(targetYear, targetMonth, Math.min(start.getDate(), 28)).toISOString().split('T')[0];

                            const transactionData = {
                                type: 'expense',
                                paymentMethod: installment.paymentMethod || 'cash',
                                description: `${installment.description} (Otomatik Taksit ${newPaidCount}/${installment.installmentCount})`,
                                amount: installment.monthlyAmount,
                                date: paymentDate,
                                category: 'bills',
                                createdAt: new Date().toISOString(),
                                isAutoGenerated: true,
                                installmentId: installment.id
                            };

                            const transRef = await addDoc(collection(db, "transactions"), transactionData);
                            this.transactions.unshift({ id: transRef.id, ...transactionData });

                            await updateDoc(doc(db, "installments", installment.id), {
                                paidCount: newPaidCount
                            });

                            installment.paidCount = newPaidCount;
                            hasChanges = true;
                            shouldBePaidCount = newPaidCount;
                            checkM++; // Check next month
                        } catch (error) {
                            console.error("Error processing auto installment:", error);
                            break;
                        }
                    } else {
                        // Already paid for this month, skip to next month in our check
                        checkM++;
                        if (checkM - start.getMonth() > installment.installmentCount) break;
                    }
                } else {
                    break;
                }

                if (installment.paidCount >= installment.installmentCount) break;
            }
        }

        if (hasChanges) {
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

                    const docRef = await addDoc(collection(db, "transactions"), transactionData);
                    this.transactions.unshift({ id: docRef.id, ...transactionData });

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
                    await updateDoc(doc(db, "recurringTemplates", template.id), {
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
                await deleteDoc(doc(db, "recurringTemplates", id));
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
                .map(([id, amount]) => ({ id, amount, name: this.getCategoryName(id) }))
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
                <div class="history-card">
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
                        <span>${this.getCategoryName(transaction.category)}</span>
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
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('error', (event) => {
        console.error('GLOBAL ERROR:', event.error);
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('UNHANDLED REJECTION:', event.reason);
    });

    window.app = new FinanceTracker();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered:', reg))
                .catch(err => console.log('Service Worker registration failed:', err));
        });
    }
});
