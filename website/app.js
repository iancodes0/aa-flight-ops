document.querySelectorAll('.navigation .nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.navigation .nav-link').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
  });
});

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
