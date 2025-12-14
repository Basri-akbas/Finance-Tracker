// Data Management
class FinanceTracker {
    constructor() {
        this.transactions = this.loadFromStorage('transactions') || [];
        this.installments = this.loadFromStorage('installments') || [];
        this.initialBalances = this.loadFromStorage('initialBalances') || null;
        this.customCategories = this.loadFromStorage('customCategories') || {
            income: [],
            expense: []
        };
        this.currentFilter = 'all';
        this.currentTransactionType = 'income';
        this.currentPaymentMethod = 'cash';
        this.init();
    }

    init() {
        // Initialize with zero balances if not set
        if (!this.initialBalances) {
            this.initialBalances = { cash: 0, bank: 0 };
            this.saveToStorage('initialBalances', this.initialBalances);
        }

        // Remove initial balance modal (not needed anymore)
        document.getElementById('initialBalanceModal').classList.remove('active');

        this.setupEventListeners();
        this.updateSummary();
        this.renderTransactions();
        this.renderInstallments();
        this.loadTheme();
        this.setDefaultDate();
        this.updateCategoryDropdowns();
    }

    // Storage
    loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error loading from storage:', e);
            return null;
        }
    }

    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving to storage:', e);
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
        const currentBalance = this.initialBalances[type] || 0;
        const label = type === 'cash' ? 'Nakit Bakiye' : 'Banka Bakiye';
        const newBalance = prompt(`${label} düzenle (€):`, currentBalance);

        if (newBalance !== null && newBalance !== '') {
            const parsedBalance = parseFloat(newBalance);
            if (!isNaN(parsedBalance)) {
                this.initialBalances[type] = parsedBalance;
                this.saveToStorage('initialBalances', this.initialBalances);
                this.updateSummary();
            } else {
                alert('Lütfen geçerli bir sayı girin.');
            }
        }
    }
    // Event Listeners
    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // Balance card click to edit
        document.getElementById('cashBalance').addEventListener('click', () => this.editBalance('cash'));
        document.getElementById('bankBalance').addEventListener('click', () => this.editBalance('bank'));

        // Category management
        document.getElementById('categoryManageBtn').addEventListener('click', () => this.openCategoryModal());
        document.getElementById('closeCategoryModal').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('addIncomeCategory').addEventListener('click', () => this.addCustomCategory('income'));
        document.getElementById('addExpenseCategory').addEventListener('click', () => this.addCustomCategory('expense'));

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

        // Filter
        document.getElementById('filterType').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
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

    // Category Management
    openCategoryModal() {
        document.getElementById('categoryModal').classList.add('active');
        this.renderCustomCategories();
    }

    closeCategoryModal() {
        document.getElementById('categoryModal').classList.remove('active');
    }

    addCustomCategory(type) {
        const inputId = type === 'income' ? 'newIncomeCategory' : 'newExpenseCategory';
        const input = document.getElementById(inputId);
        const categoryName = input.value.trim();

        if (!categoryName) return;

        const categoryId = `custom_${type}_${Date.now()}`;
        this.customCategories[type].push({
            id: categoryId,
            name: categoryName
        });

        this.saveToStorage('customCategories', this.customCategories);
        input.value = '';
        this.renderCustomCategories();
        this.updateCategoryDropdowns();
    }

    deleteCustomCategory(type, categoryId) {
        if (confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) {
            this.customCategories[type] = this.customCategories[type].filter(cat => cat.id !== categoryId);
            this.saveToStorage('customCategories', this.customCategories);
            this.renderCustomCategories();
            this.updateCategoryDropdowns();
        }
    }

    renderCustomCategories() {
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
    }

    // Tabs
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
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
        }

        modal.classList.add('active');
    }

    closeTransactionModal() {
        document.getElementById('transactionModal').classList.remove('active');
        document.getElementById('transactionForm').reset();
    }

    selectTransactionType(btn) {
        const type = btn.dataset.type;
        this.currentTransactionType = type;

        // Update button states
        document.querySelectorAll('.type-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });

        // Update category options
        const incomeCategories = document.getElementById('incomeCategories');
        const expenseCategories = document.getElementById('expenseCategories');

        if (type === 'income') {
            incomeCategories.style.display = '';
            expenseCategories.style.display = 'none';
            // Select first income category
            const firstOption = incomeCategories.querySelector('option');
            if (firstOption) document.getElementById('transactionCategory').value = firstOption.value;
        } else {
            incomeCategories.style.display = 'none';
            expenseCategories.style.display = '';
            // Select first expense category
            const firstOption = expenseCategories.querySelector('option');
            if (firstOption) document.getElementById('transactionCategory').value = firstOption.value;
        }
    }

    selectPaymentMethod(btn) {
        const payment = btn.dataset.payment;
        this.currentPaymentMethod = payment;

        // Update button states
        document.querySelectorAll('.payment-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });
    }

    handleTransactionSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const transaction = {
            id: form.dataset.editId || Date.now().toString(),
            type: this.currentTransactionType,
            paymentMethod: this.currentPaymentMethod,
            description: document.getElementById('transactionDescription').value,
            amount: parseFloat(document.getElementById('transactionAmount').value),
            date: document.getElementById('transactionDate').value,
            category: document.getElementById('transactionCategory').value,
            createdAt: form.dataset.editId ? this.transactions.find(t => t.id === form.dataset.editId).createdAt : new Date().toISOString()
        };

        if (form.dataset.editId) {
            // Update existing
            const index = this.transactions.findIndex(t => t.id === form.dataset.editId);
            this.transactions[index] = transaction;
        } else {
            // Add new
            this.transactions.unshift(transaction);
        }

        this.saveToStorage('transactions', this.transactions);
        this.updateSummary();
        this.renderTransactions();
        this.closeTransactionModal();
    }

    deleteTransaction(id) {
        if (confirm('Bu işlemi silmek istediğinizden emin misiniz?')) {
            this.transactions = this.transactions.filter(t => t.id !== id);
            this.saveToStorage('transactions', this.transactions);
            this.updateSummary();
            this.renderTransactions();
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

    handleInstallmentSubmit(e) {
        e.preventDefault();

        const installment = {
            id: Date.now().toString(),
            description: document.getElementById('installmentDescription').value,
            totalAmount: parseFloat(document.getElementById('installmentTotal').value),
            installmentCount: parseInt(document.getElementById('installmentCount').value),
            startDate: document.getElementById('installmentStart').value,
            paidCount: 0,
            createdAt: new Date().toISOString()
        };

        installment.monthlyAmount = installment.totalAmount / installment.installmentCount;

        this.installments.unshift(installment);
        this.saveToStorage('installments', this.installments);
        this.updateSummary();
        this.renderInstallments();
        this.closeInstallmentModal();
    }

    deleteInstallment(id) {
        if (confirm('Bu taksiti silmek istediğinizden emin misiniz?')) {
            this.installments = this.installments.filter(i => i.id !== id);
            this.saveToStorage('installments', this.installments);
            this.updateSummary();
            this.renderInstallments();
        }
    }

    payInstallment(id) {
        const installment = this.installments.find(i => i.id === id);
        if (installment && installment.paidCount < installment.installmentCount) {
            installment.paidCount++;
            this.saveToStorage('installments', this.installments);
            this.updateSummary();
            this.renderInstallments();
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
    }

    renderTransactions() {
        const container = document.getElementById('transactionsList');
        const filtered = this.currentFilter === 'all'
            ? this.transactions
            : this.transactions.filter(t => t.type === this.currentFilter);

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
            // Fallback for browsers without Intl support
            return '€' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return new Intl.DateFormat('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).format(date);
        } catch (e) {
            // Fallback for browsers without Intl support
            const date = new Date(dateString);
            const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
            return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
        }
    }

    getCategoryName(category) {
        const defaultCategories = {
            // Income
            'salary': 'Maaş',
            'freelance': 'Serbest Çalışma',
            'investment': 'Yatırım',
            'other-income': 'Diğer Gelir',
            // Expense
            'food': 'Yiyecek & İçecek',
            'transport': 'Ulaşım',
            'bills': 'Faturalar',
            'shopping': 'Alışveriş',
            'health': 'Sağlık',
            'entertainment': 'Eğlence',
            'other-expense': 'Diğer Gider'
        };

        // Check if it's a default category
        if (defaultCategories[category]) {
            return defaultCategories[category];
        }

        // Check if it's a custom category
        const customIncome = this.customCategories.income.find(c => c.id === category);
        if (customIncome) return customIncome.name;

        const customExpense = this.customCategories.expense.find(c => c.id === category);
        if (customExpense) return customExpense.name;

        return category;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('transactionDate').value = today;
    }

    setDefaultInstallmentDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('installmentStart').value = today;
    }
}

// Initialize app
// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FinanceTracker();
});
