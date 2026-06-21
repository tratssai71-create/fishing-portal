// Search overlay
const searchToggle = document.getElementById('searchToggle');
const searchOverlay = document.getElementById('searchOverlay');
const searchClose = document.getElementById('searchClose');
searchToggle?.addEventListener('click', () => searchOverlay.classList.toggle('open'));
searchClose?.addEventListener('click', () => searchOverlay.classList.remove('open'));
searchOverlay?.addEventListener('click', (e) => { if (e.target === searchOverlay) searchOverlay.classList.remove('open'); });

// Mobile menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const menuOverlay = document.getElementById('menuOverlay');
const menuClose = document.getElementById('menuClose');
const openMenu = () => { mobileMenu.classList.add('open'); menuOverlay.classList.add('open'); };
const closeMenu = () => { mobileMenu.classList.remove('open'); menuOverlay.classList.remove('open'); };
hamburger?.addEventListener('click', openMenu);
menuClose?.addEventListener('click', closeMenu);
menuOverlay?.addEventListener('click', closeMenu);

// Ranking tabs
document.querySelectorAll('.rtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});
