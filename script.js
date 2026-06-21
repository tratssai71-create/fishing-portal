// SP Drawer
const spBtn = document.getElementById('spMenuBtn');
const spDrawer = document.getElementById('spDrawer');
const spOverlay = document.getElementById('spOverlay');
const spClose = document.getElementById('spClose');
const openDrawer = () => { spDrawer.classList.add('open'); spOverlay.classList.add('open'); };
const closeDrawer = () => { spDrawer.classList.remove('open'); spOverlay.classList.remove('open'); };
spBtn?.addEventListener('click', openDrawer);
spClose?.addEventListener('click', closeDrawer);
spOverlay?.addEventListener('click', closeDrawer);

// Ranking tabs
document.querySelectorAll('.rtab').forEach(tab => {
  tab.addEventListener('click', () => {
    tab.closest('.rank-tabs-wrap, .rank-tabs')?.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// Pickup horizontal scroll with drag
const track = document.querySelector('.pickup-track');
if (track) {
  let isDown = false, startX, scrollLeft;
  track.addEventListener('mousedown', e => { isDown = true; startX = e.pageX - track.offsetLeft; scrollLeft = track.scrollLeft; });
  track.addEventListener('mouseleave', () => isDown = false);
  track.addEventListener('mouseup', () => isDown = false);
  track.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); track.scrollLeft = scrollLeft - (e.pageX - track.offsetLeft - startX); });
}
