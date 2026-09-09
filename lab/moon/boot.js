// Keep the small loading shell usable while the 3D bundle is being downloaded.
const script = document.currentScript;
const entry = new URL(script.dataset.entry || './moon.js', script.src).href;
const desktop = matchMedia('(min-width: 820px) and (pointer: fine)');
let requested = false;
function loadScene() {
  document.querySelector('#desktop-only').hidden = desktop.matches;
  if (!desktop.matches || requested) return;
  requested = true;
  import(entry).catch(error => {
    console.error(error);
    document.querySelector('#loading').hidden = false;
    document.querySelector('#loading h2').textContent = 'Could not load. Please refresh.';
    document.querySelector('#load-progress').hidden = true;
  });
}
desktop.addEventListener('change', loadScene);
loadScene();
