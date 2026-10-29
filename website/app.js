const pageNames = { welcome: 'Welcome', home: 'Overview', flights: 'Flight logs', commands: 'Bot commands', moderation: 'AutoMod', settings: 'Settings', request: 'Request a flight plan' };
const pageTitle = document.querySelector('#page-title');
const validPages = new Set(Object.keys(pageNames));

function updateNavigation() {
  const requestedPage = window.location.hash.slice(1);
  const page = validPages.has(requestedPage) ? requestedPage : 'welcome';
  if (requestedPage !== page) history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${page}`);
  document.querySelector('.main-content').classList.toggle('show-welcome', page === 'welcome');
  document.querySelector('.main-content').classList.toggle('page-settings', page === 'settings');
  document.querySelectorAll('.navigation .nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${page}` || (page === 'request' && link.getAttribute('href') === '#home'));
  });
  if (pageTitle) pageTitle.textContent = pageNames[page] || pageNames.home;
}

window.addEventListener('hashchange', updateNavigation);
updateNavigation();

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
  statusMessage.className = 'form-status';
  statusMessage.textContent = 'Sending to operations...';
  const formData = new FormData(flightPlanForm);
  try {
    const response = await fetch('http://localhost:3001/api/flight-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to send flight plan.');
    statusMessage.className = 'form-status success';
    statusMessage.textContent = `${result.message} Estimated time: ${result.estimatedTime}.`;
    flightPlanForm.reset();
    updateRoutePreview();
  } catch (error) {
    statusMessage.className = 'form-status error';
    statusMessage.textContent = error.message;
  }
});
