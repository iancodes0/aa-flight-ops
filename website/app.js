const pageNames = { welcome: 'Welcome', home: 'Overview', flights: 'Flight logs', commands: 'Bot commands', moderation: 'AutoMod', request: 'Request a flight plan' };
const pageTitle = document.querySelector('#page-title');
const validPages = new Set(Object.keys(pageNames));
const API_BASE = window.AA_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '');
let currentUser = null;
const discordLogin = document.querySelector('#discord-login');
if (discordLogin && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) discordLogin.href = '/api/auth/login';

async function apiFetch(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const sessionToken = localStorage.getItem('aa-flight-ops-session');
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The dashboard request failed.');
  return result;
}

function updateNavigation() {
  const requestedPage = window.location.hash.slice(1);
  const page = validPages.has(requestedPage) ? requestedPage : 'welcome';
  const isSignedIn = Boolean(localStorage.getItem('aa-flight-ops-session'));
  if (page === 'request' && !isSignedIn) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#welcome`);
    return updateNavigation();
  }
  if (requestedPage !== page) history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${page}`);
  document.querySelector('.main-content').classList.toggle('show-welcome', page === 'welcome');
  document.querySelectorAll('.navigation .nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${page}` || (page === 'request' && link.getAttribute('href') === '#home'));
  });
  if (pageTitle) pageTitle.textContent = pageNames[page] || pageNames.home;
}

window.addEventListener('hashchange', updateNavigation);
updateNavigation();

const sidebarToggle = document.querySelector('.sidebar-toggle');
const savedSidebarState = localStorage.getItem('aa-flight-ops-sidebar') || 'expanded';
function setSidebarState(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle?.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
  if (sidebarToggle) sidebarToggle.textContent = collapsed ? '›' : '‹';
  localStorage.setItem('aa-flight-ops-sidebar', collapsed ? 'collapsed' : 'expanded');
}
sidebarToggle?.addEventListener('click', () => setSidebarState(!document.body.classList.contains('sidebar-collapsed')));
setSidebarState(savedSidebarState === 'collapsed');

const savedTheme = localStorage.getItem('aa-flight-ops-theme') || 'red-white-blue';
const themeButtons = document.querySelectorAll('[data-theme-choice]');
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('aa-flight-ops-theme', theme);
  themeButtons.forEach(button => {
    const selected = button.dataset.themeChoice === theme;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-checked', String(selected));
  });
}
themeButtons.forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.themeChoice)));
applyTheme(savedTheme);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderPlans(plans) {
  const list = document.querySelector('#my-plans-list');
  if (!list) return;
  if (!plans.length) {
    list.innerHTML = '<p class="empty-state">No flight plans yet. Your next route starts here.</p>';
    return;
  }
  list.innerHTML = plans.map(plan => `<article class="plan-row"><div><strong>${escapeHtml(plan.departure)} <span>→</span> ${escapeHtml(plan.arrival)}</strong><small>${escapeHtml(plan.callsign)} · ${escapeHtml(plan.aircraft)}</small></div><div class="plan-meta"><span class="plan-status ${escapeHtml(plan.status)}">${escapeHtml(plan.status)}</span>${plan.reason ? `<small>${escapeHtml(plan.reason)}</small>` : ''}</div></article>`).join('');
}

function renderDashboard(data) {
  currentUser = data.user;
  document.body.classList.add('signed-in');
  document.querySelector('#account-state').innerHTML = '<i></i> Connected';
  document.querySelector('#account-name').textContent = data.user.globalName || data.user.username;
  document.querySelector('#stat-flights').textContent = data.stats.flights;
  document.querySelector('#stat-hours').textContent = Math.floor(data.stats.hours);
  document.querySelector('#stat-miles').textContent = Math.round(data.stats.miles).toLocaleString();
  renderPlans(data.plans);
  const login = document.querySelector('#discord-login');
  if (login) { login.textContent = 'Discord connected'; login.href = '#home'; }
  const description = document.querySelector('#request-description');
  if (description) description.textContent = 'Send your route to the operations channel and get a route-based time estimate. Moderators will review your request.';
  const submitButton = document.querySelector('#flight-plan-submit');
  if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = 'Send flight plan <span>→</span>'; }
}

async function loadDashboard() {
  try {
    const data = await apiFetch('/api/me');
    renderDashboard(data);
  } catch (error) {
    const status = document.querySelector('#account-state');
    if (status) status.innerHTML = '<i></i> Sign in required';
    document.body.classList.remove('signed-in');
    if (error.message !== 'Sign in with Discord to continue.') console.warn(error.message);
  }
}

async function exchangeOAuthCode() {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return;
  const login = document.querySelector('#discord-login');
  if (login) login.textContent = 'Connecting Discord...';
  try {
    const result = await apiFetch('/api/auth/exchange', { method: 'POST', body: JSON.stringify({ code, redirectUri: window.location.origin + window.location.pathname }) });
    localStorage.setItem('aa-flight-ops-session', result.token);
    history.replaceState(null, '', window.location.pathname + '#home');
    await loadDashboard();
    updateNavigation();
  } catch (error) {
    if (login) login.textContent = 'Discord sign-in failed';
    console.error(error.message);
  }
}

exchangeOAuthCode().then(loadDashboard);

const flightPlanForm = document.querySelector('#flight-plan-form');
const statusMessage = document.querySelector('.form-status');
const departureInput = flightPlanForm?.elements.departure;
const arrivalInput = flightPlanForm?.elements.arrival;
const previewDeparture = document.querySelector('#preview-departure');
const previewArrival = document.querySelector('#preview-arrival');
const previewTime = document.querySelector('#preview-time');

function updateRoutePreview() {
  const departure = departureInput.value.toUpperCase();
  const arrival = arrivalInput.value.toUpperCase();
  previewDeparture.textContent = departure || '----';
  previewArrival.textContent = arrival || '----';
  previewTime.textContent = departure && arrival ? 'Estimate calculated by the bot on submission' : 'Enter your route to estimate time';
}

departureInput?.addEventListener('input', updateRoutePreview);
arrivalInput?.addEventListener('input', updateRoutePreview);

flightPlanForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !localStorage.getItem('aa-flight-ops-session')) {
    statusMessage.className = 'form-status error';
    statusMessage.textContent = 'Sign in with Discord before requesting a flight plan.';
    window.location.hash = 'welcome';
    return;
  }
  statusMessage.className = 'form-status';
  statusMessage.textContent = 'Sending to operations...';
  const formData = new FormData(flightPlanForm);
  try {
    const result = await apiFetch('/api/flight-plan', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(formData))
    });
    statusMessage.className = 'form-status success';
    statusMessage.textContent = `${result.message} Estimated time: ${result.estimatedTime}.`;
    flightPlanForm.reset();
    updateRoutePreview();
    await loadDashboard();
  } catch (error) {
    statusMessage.className = 'form-status error';
    statusMessage.textContent = error.message;
  }
});
