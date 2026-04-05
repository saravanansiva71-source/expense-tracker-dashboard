// Configuration
const CONFIG = {
    API_URL: localStorage.getItem('apiUrl') || 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE',
    SHEET_ID: localStorage.getItem('sheetId') || 'YOUR_GOOGLE_SHEET_ID_HERE'
};

// State Management
const state = {
    transactions: [],
    summary: null,
    currentMonth: new Date(),
    currentPage: 'overview',
    filters: {},
    sortBy: { field: 'date', order: 'desc' },
    pagination: { page: 1, perPage: 50 }
};

// Charts
let charts = {};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeMobileMenu();
    initializeMonthSelector();
    initializeForms();
    loadSettings();
    loadInitialData();
    updateCurrentMonth();
});

//=============================================================================
// NAVIGATION
//=============================================================================

function initializeNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            switchPage(page);
        });
    });
}

function switchPage(pageName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === pageName);
    });
    
    // Update pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.toggle('active', page.id === `page-${pageName}`);
    });
    
    // Update title
    const titles = {
        overview: 'Overview',
        cards: 'Cards',
        people: 'People',
        transactions: 'Transactions',
        add: 'Add Transaction',
        analytics: 'Analytics',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[pageName];
    
    state.currentPage = pageName;
    
    // Load page data
    loadPageData(pageName);
}

function loadPageData(pageName) {
    switch(pageName) {
        case 'overview':
            renderOverview();
            break;
        case 'cards':
            renderCards();
            break;
        case 'people':
            renderPeople();
            break;
        case 'transactions':
            renderTransactionsPage();
            break;
        case 'analytics':
            renderAnalytics();
            break;
    }
}

//=============================================================================
// MOBILE MENU
//=============================================================================

function initializeMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    
    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            !sidebar.contains(e.target) && 
            !toggle.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    });
}

//=============================================================================
// MONTH SELECTOR
//=============================================================================

function initializeMonthSelector() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
        updateCurrentMonth();
        loadData();
    });
    
    document.getElementById('nextMonth').addEventListener('click', () => {
        state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
        updateCurrentMonth();
        loadData();
    });
}

function updateCurrentMonth() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    const display = `${months[state.currentMonth.getMonth()]} ${state.currentMonth.getFullYear()}`;
    document.getElementById('currentMonthDisplay').textContent = display;
}

//=============================================================================
// DATA LOADING
//=============================================================================

async function loadInitialData() {
    showLoading(true);
    await loadData();
    showLoading(false);
}

async function loadData() {
    try {
        // Fetch transactions
        const transResponse = await fetchAPI('getTransactions');
        state.transactions = transResponse.data || [];
        
        // Fetch summary
        const summaryResponse = await fetchAPI('getSummary');
        state.summary = summaryResponse.data || null;
        
        // Update last update time
        document.getElementById('lastUpdate').textContent = 
            `Last updated: ${new Date().toLocaleTimeString()}`;
        
        // Render current page
        loadPageData(state.currentPage);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data. Please check your connection.');
    }
}

function fetchAPI(action, data = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'cb_' + Date.now();
        const params = new URLSearchParams({ action, ...data });
        const url = `${CONFIG.API_URL}?${params}&callback=${callbackName}`;
        
        window[callbackName] = (response) => {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(response);
        };
        
        const script = document.createElement('script');
        script.src = url;
        script.onerror = () => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('API request failed'));
        };
        
        document.body.appendChild(script);
        
        setTimeout(() => {
            if (window[callbackName]) {
                delete window[callbackName];
                reject(new Error('Request timeout'));
            }
        }, 10000);
    });
}

//=============================================================================
// OVERVIEW PAGE
//=============================================================================

function renderOverview() {
    calculateMetrics();
    renderRecentTransactions();
    renderAlerts();
    renderCharts();
}

function calculateMetrics() {
    const cards = state.summary?.cards || [];
    
    // Total outstanding
    const totalOutstanding = cards.reduce((sum, card) => sum + (card.outstanding || 0), 0);
    document.getElementById('totalOutstanding').textContent = formatCurrency(totalOutstanding);
    
    // Monthly spend
    const monthlySpend = cards.reduce((sum, card) => sum + (card.monthlySpend || 0), 0);
    document.getElementById('monthlySpend').textContent = formatCurrency(monthlySpend);
    
    // Money lent
    const lent = state.transactions
        .filter(t => t.type === 'Cash Lent')
        .reduce((sum, t) => sum + t.amount, 0);
    document.getElementById('moneyLent').textContent = formatCurrency(lent);
    
    // Unpaid cards
    const unpaid = cards.filter(c => c.status === 'Not Paid').length;
    document.getElementById('unpaidCards').textContent = unpaid;
}

function renderRecentTransactions() {
    const container = document.getElementById('recentTransactions');
    const recent = state.transactions.slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<p>No recent transactions</p>';
        return;
    }
    
    container.innerHTML = recent.map(t => `
        <div class="transaction-mini-item">
            <div>
                <strong>${t.type}</strong>
                <p>${t.card} • ${t.person}</p>
            </div>
            <div class="amount ${isIncome(t.type) ? 'positive' : 'negative'}">
                ${isIncome(t.type) ? '+' : '-'}${formatCurrency(t.amount)}
            </div>
        </div>
    `).join('');
}

function renderAlerts() {
    const container = document.getElementById('alertsList');
    const alerts = [];
    
    // Check for unpaid cards
    const cards = state.summary?.cards || [];
    cards.forEach(card => {
        if (card.status === 'Not Paid' && card.outstanding > 0) {
            alerts.push({
                type: 'warning',
                message: `${card.name} has outstanding balance of ${formatCurrency(card.outstanding)}`
            });
        }
    });
    
    // Check for high spending
    const monthlyTotal = cards.reduce((sum, c) => sum + (c.monthlySpend || 0), 0);
    if (monthlyTotal > 50000) {
        alerts.push({
            type: 'info',
            message: `High monthly spending detected: ${formatCurrency(monthlyTotal)}`
        });
    }
    
    if (alerts.length === 0) {
        container.innerHTML = '<p>No alerts</p>';
    } else {
        container.innerHTML = alerts.map(alert => `
            <div class="alert alert-${alert.type}">
                <i class="fas fa-${alert.type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                ${alert.message}
            </div>
        `).join('');
    }
}

function renderCharts() {
    // Spending Trend Chart
    const ctx1 = document.getElementById('spendingTrendChart');
    if (ctx1 && charts.spending) charts.spending.destroy();
    
    const last30Days = getLast30DaysData();
    charts.spending = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: last30Days.labels,
            datasets: [{
                label: 'Daily Spend',
                data: last30Days.values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    // Category Breakdown Chart
    const ctx2 = document.getElementById('categoryChart');
    if (ctx2 && charts.category) charts.category.destroy();
    
    const categories = getCategoryBreakdown();
    charts.category = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: categories.labels,
            datasets: [{
                data: categories.values,
                backgroundColor: [
                    '#6366f1', '#10b981', '#f59e0b', '#ef4444', 
                    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function getLast30DaysData() {
    const labels = [];
    const values = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
        
        const dayTotal = state.transactions
            .filter(t => {
                const tDate = new Date(t.date);
                return tDate.toDateString() === date.toDateString() && 
                       !isIncome(t.type);
            })
            .reduce((sum, t) => sum + t.amount, 0);
        
        values.push(dayTotal);
    }
    
    return { labels, values };
}

function getCategoryBreakdown() {
    const categories = {};
    
    state.transactions.forEach(t => {
        if (!isIncome(t.type)) {
            categories[t.type] = (categories[t.type] || 0) + t.amount;
        }
    });
    
    return {
        labels: Object.keys(categories),
        values: Object.values(categories)
    };
}

//=============================================================================
// CARDS PAGE
//=============================================================================

function renderCards() {
    const container = document.getElementById('cardsGrid');
    const cards = state.summary?.cards || [];
    
    // Sort cards
    const sortBy = document.getElementById('cardSortBy')?.value || 'outstanding';
    const sorted = [...cards].sort((a, b) => {
        switch(sortBy) {
            case 'outstanding':
                return b.outstanding - a.outstanding;
            case 'spend':
                return b.monthlySpend - a.monthlySpend;
            case 'name':
                return a.name.localeCompare(b.name);
            case 'status':
                return a.status.localeCompare(b.status);
            default:
                return 0;
        }
    });
    
    container.innerHTML = sorted.map(card => `
        <div class="card-detail ${card.status.toLowerCase().replace(' ', '-')}">
            <div class="card-detail-header">
                <h3>${card.name}</h3>
                <span class="status-badge status-${card.status.toLowerCase().replace(' ', '-')}">
                    ${card.status}
                </span>
            </div>
            <div class="card-detail-body">
                <div class="detail-row">
                    <span>Monthly Spend</span>
                    <strong>${formatCurrency(card.monthlySpend)}</strong>
                </div>
                <div class="detail-row">
                    <span>Outstanding</span>
                    <strong class="${card.outstanding > 0 ? 'text-danger' : 'text-success'}">
                        ${formatCurrency(card.outstanding)}
                    </strong>
                </div>
            </div>
            <div class="card-detail-footer">
                <button onclick="viewCardTransactions('${card.name}')" class="btn-view">
                    <i class="fas fa-eye"></i> View Transactions
                </button>
                <button onclick="payCard('${card.name}')" class="btn-pay">
                    <i class="fas fa-money-check-alt"></i> Pay Bill
                </button>
            </div>
        </div>
    `).join('');
}

//=============================================================================
// PEOPLE PAGE
//=============================================================================

function renderPeople() {
    const container = document.getElementById('peopleGrid');
    const people = state.summary?.persons || [];
    
    container.innerHTML = people.map(person => `
        <div class="person-detail">
            <div class="person-avatar">
                ${person.name.charAt(0)}
            </div>
            <h3>${person.name}</h3>
            <div class="person-stats">
                <div class="stat">
                    <span>Monthly Spend</span>
                    <strong>${formatCurrency(person.monthlySpend)}</strong>
                </div>
                <div class="stat">
                    <span>Outstanding</span>
                    <strong>${formatCurrency(person.outstanding)}</strong>
                </div>
            </div>
            <button onclick="viewPersonTransactions('${person.name}')" class="btn-view-full">
                View All Transactions
            </button>
        </div>
    `).join('');
}

//=============================================================================
// TRANSACTIONS PAGE
//=============================================================================

function renderTransactionsPage() {
    populateFilterDropdowns();
    renderTransactionsTable();
}

function populateFilterDropdowns() {
    const cards = [...new Set(state.transactions.map(t => t.card))];
    const persons = [...new Set(state.transactions.map(t => t.person))];
    const types = [...new Set(state.transactions.map(t => t.type))];
    
    document.getElementById('filterCard').innerHTML = 
        '<option value="">All Cards</option>' +
        cards.map(c => `<option value="${c}">${c}</option>`).join('');
    
    document.getElementById('filterPerson').innerHTML = 
        '<option value="">All Persons</option>' +
        persons.map(p => `<option value="${p}">${p}</option>`).join('');
    
    document.getElementById('filterType').innerHTML = 
        '<option value="">All Types</option>' +
        types.map(t => `<option value="${t}">${t}</option>`).join('');
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTableBody');
    let filtered = filterTransactions();
    
    // Sort
    filtered.sort((a, b) => {
        const field = state.sortBy.field;
        const order = state.sortBy.order === 'asc' ? 1 : -1;
        
        if (field === 'date') {
            return (new Date(a.date) - new Date(b.date)) * order;
        } else if (field === 'amount') {
            return (a.amount - b.amount) * order;
        } else {
            return a[field].localeCompare(b[field]) * order;
        }
    });
    
    // Paginate
    const start = (state.pagination.page - 1) * state.pagination.perPage;
    const end = start + state.pagination.perPage;
    const page = filtered.slice(start, end);
    
    tbody.innerHTML = page.map(t => `
        <tr>
            <td>${formatDate(t.date)}</td>
            <td>${t.type}</td>
            <td>${t.card}</td>
            <td>${t.person}</td>
            <td class="${isIncome(t.type) ? 'text-success' : 'text-danger'}">
                ${isIncome(t.type) ? '+' : ''}${formatCurrency(t.amount)}
            </td>
            <td>${t.description || '-'}</td>
            <td>
                <button onclick="editTransaction(${t.id})" class="btn-icon">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    renderPagination(filtered.length);
}

function filterTransactions() {
    return state.transactions.filter(t => {
        if (state.filters.search && 
            !t.description?.toLowerCase().includes(state.filters.search.toLowerCase())) {
            return false;
        }
        if (state.filters.card && t.card !== state.filters.card) return false;
        if (state.filters.person && t.person !== state.filters.person) return false;
        if (state.filters.type && t.type !== state.filters.type) return false;
        if (state.filters.dateFrom && new Date(t.date) < new Date(state.filters.dateFrom)) return false;
        if (state.filters.dateTo && new Date(t.date) > new Date(state.filters.dateTo)) return false;
        return true;
    });
}

function renderPagination(total) {
    const container = document.getElementById('pagination');
    const totalPages = Math.ceil(total / state.pagination.perPage);
    
    let html = `
        <button ${state.pagination.page === 1 ? 'disabled' : ''} 
                onclick="goToPage(${state.pagination.page - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - state.pagination.page) <= 2) {
            html += `
                <button class="${i === state.pagination.page ? 'active' : ''}"
                        onclick="goToPage(${i})">
                    ${i}
                </button>
            `;
        } else if (Math.abs(i - state.pagination.page) === 3) {
            html += '<span>...</span>';
        }
    }
    
    html += `
        <button ${state.pagination.page === totalPages ? 'disabled' : ''}
                onclick="goToPage(${state.pagination.page + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    container.innerHTML = html;
}

//=============================================================================
// FORMS
//=============================================================================

function initializeForms() {
    // Transaction form
    const form = document.getElementById('transactionForm');
    if (form) {
        document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitTransaction();
        });
    }
    
    // Refresh button
    document.getElementById('refreshAll')?.addEventListener('click', loadData);
}

async function submitTransaction() {
    const data = {
        date: document.getElementById('txDate').value,
        type: document.getElementById('txType').value,
        card: document.getElementById('txCard').value,
        person: document.getElementById('txPerson').value,
        amount: document.getElementById('txAmount').value,
        description: document.getElementById('txDescription').value
    };
    
    try {
        showLoading(true);
        const response = await fetchAPI('addTransaction', data);
        
        if (response.success) {
            showFormMessage('Transaction added successfully!', 'success');
            clearForm();
            await loadData();
        } else {
            showFormMessage('Error: ' + (response.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showFormMessage('Failed to add transaction', 'error');
    } finally {
        showLoading(false);
    }
}

function clearForm() {
    document.getElementById('transactionForm').reset();
    document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
}

function showFormMessage(message, type) {
    const el = document.getElementById('formMessage');
    el.textContent = message;
    el.className = `form-message ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

//=============================================================================
// ANALYTICS PAGE
//=============================================================================

function renderAnalytics() {
    // Render analytics charts
    console.log('Rendering analytics...');
}

//=============================================================================
// SETTINGS
//=============================================================================

function loadSettings() {
    document.getElementById('settingsApiUrl').value = CONFIG.API_URL;
    document.getElementById('settingsSheetId').value = CONFIG.SHEET_ID;
}

function saveSettings() {
    CONFIG.API_URL = document.getElementById('settingsApiUrl').value;
    CONFIG.SHEET_ID = document.getElementById('settingsSheetId').value;
    
    localStorage.setItem('apiUrl', CONFIG.API_URL);
    localStorage.setItem('sheetId', CONFIG.SHEET_ID);
    
    alert('Settings saved!');
}

async function testConnection() {
    try {
        showLoading(true);
        await fetchAPI('getTransactions');
        alert('Connection successful!');
    } catch (error) {
        alert('Connection failed: ' + error.message);
    } finally {
        showLoading(false);
    }
}

//=============================================================================
// UTILITY FUNCTIONS
//=============================================================================

function formatCurrency(amount) {
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function isIncome(type) {
    return ['Card Refund', 'Cash Received', 'Cash Returned', 'Income', 'Loan Taken'].includes(type);
}

function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('active', show);
}

function showError(message) {
    alert(message); // Replace with better error UI
}

// Quick Actions
function showQuickAdd(type) {
    document.getElementById('quickAddModal').classList.add('active');
    document.getElementById('quickAddType').value = type;
    document.getElementById('quickAddTitle').textContent = `Quick Add: ${type}`;
}

function closeQuickAdd() {
    document.getElementById('quickAddModal').classList.remove('active');
}

// Card actions
function viewCardTransactions(cardName) {
    state.filters.card = cardName;
    switchPage('transactions');
    applyFilters();
}

function payCard(cardName) {
    document.getElementById('txCard').value = cardName;
    document.getElementById('txType').value = 'CC Bill Payment';
    switchPage('add');
}

function viewPersonTransactions(personName) {
    state.filters.person = personName;
    switchPage('transactions');
    applyFilters();
}

// Filters
function applyFilters() {
    state.filters = {
        search: document.getElementById('searchTransactions')?.value,
        dateFrom: document.getElementById('dateFrom')?.value,
        dateTo: document.getElementById('dateTo')?.value,
        card: document.getElementById('filterCard')?.value,
        person: document.getElementById('filterPerson')?.value,
        type: document.getElementById('filterType')?.value
    };
    state.pagination.page = 1;
    renderTransactionsTable();
}

function resetFilters() {
    state.filters = {};
    document.getElementById('searchTransactions').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('filterCard').value = '';
    document.getElementById('filterPerson').value = '';
    document.getElementById('filterType').value = '';
    renderTransactionsTable();
}

function sortTable(field) {
    if (state.sortBy.field === field) {
        state.sortBy.order = state.sortBy.order === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortBy = { field, order: 'asc' };
    }
    renderTransactionsTable();
}

function goToPage(page) {
    state.pagination.page = page;
    renderTransactionsTable();
}

// Export functions
function exportCardsData() {
    const data = state.summary?.cards || [];
    downloadCSV(data, 'cards-export.csv');
}

function exportTransactions() {
    downloadCSV(state.transactions, 'transactions-export.csv');
}

function exportAllData() {
    const data = {
        transactions: state.transactions,
        summary: state.summary
    };
    downloadJSON(data, 'expense-tracker-backup.json');
}

function downloadCSV(data, filename) {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}

function clearCache() {
    if (confirm('This will clear all cached data. Continue?')) {
        localStorage.clear();
        location.reload();
    }
}

function updateFormFields() {
    // Add dynamic fields based on transaction type if needed
}

function editTransaction(id) {
    console.log('Edit transaction:', id);
    // Implement edit functionality
}
