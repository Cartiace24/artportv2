import { artworks, portfolio } from './artworks.js';
import { getCommissionEmail, getCommissionServices } from './commissions.js';
import { focusArt, returnToRoom, goToRoom } from './scene.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  intro: $('#intro-note'),
  hint: $('#scene-hint'),
  panel: $('#work-panel'),
  archive: $('#archive-view'),
  commissions: $('#commissions-view'),
  story: $('#story-view'),
  about: $('#about-view'),
  contact: $('#contact-view'),
  archiveGrid: $('#archive-grid'),
  related: $('#related-works'),
};

let currentView = 'work';
let selectedArtwork = null;
let introDismissed = false;
let lastArtworkTrigger = null;

function setView(view) {
  currentView = view;
  $('#app').classList.toggle('editorial-open', view !== 'work');
  $('#app').classList.toggle('archive-open', view === 'archive');
  const activeView = view === 'story' ? 'work' : view;
  document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === activeView));
  for (const [key, element] of Object.entries({ archive: elements.archive, commissions: elements.commissions, story: elements.story, about: elements.about, contact: elements.contact })) {
    const open = key === view;
    element.classList.toggle('open', open);
    element.setAttribute('aria-hidden', String(!open));
  }
  elements.intro.classList.toggle('dismissed', view !== 'work' || Boolean(selectedArtwork) || introDismissed);
  elements.hint.classList.toggle('hidden', view !== 'work' || Boolean(selectedArtwork));
}

function commissionTypeFor(art) {
  const commissionServices = getCommissionServices();
  return commissionServices.find(service => service.artworkId === art.id && service.published)?.id
    || commissionServices.find(service => service.category === art.category && service.published)?.id
    || '';
}

function openCommissions(type = 'unsure', destination = 'options') {
  const commissionServices = getCommissionServices();
  if (selectedArtwork) closeArtwork();
  const typeControl = $('#inquiry-type');
  if (typeControl.tagName === 'SELECT') typeControl.value = commissionServices.some(service => service.id === type && service.published) ? type : 'unsure';
  else if (typeControl instanceof HTMLInputElement) typeControl.value = type && type !== 'unsure' ? type : '';
  setView('commissions');
  requestAnimationFrame(() => {
    const target = destination === 'inquiry' ? $('#inquiry') : type === 'unsure' ? elements.commissions : $(`#commission-service-${type}`);
    if (target) {
      const top = Math.max(0, target.offsetTop - (destination === 'inquiry' ? 18 : 110));
      elements.commissions.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (destination === 'inquiry') {
        const focusTarget = $('#commission-form').hidden ? $('#inquiry-unavailable') : $('#inquiry-type');
        focusTarget?.focus({ preventScroll: true });
      }
      else if (type !== 'unsure') {
        const heading = target.querySelector('h3');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  });
}

function makeCommissionServices() {
  const commissionServices = getCommissionServices();
  const hasInbox = Boolean(getCommissionEmail()?.trim());
  const byId = new Map(artworks.map(art => [art.id, art]));
  const publishedServices = commissionServices.filter(service => service.published && service.title?.trim());
  $('#commission-services').replaceChildren(...[...publishedServices].sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured))).map(service => {
    const candidate = byId.get(service.artworkId);
    const art = candidate && candidate.published !== false && candidate.visible !== false && !candidate.archived ? candidate : null;
    const card = document.createElement('article');
    card.className = 'commission-service';
    card.id = `commission-service-${service.id}`;
    card.dataset.service = service.id;

    let imageLink = null;
    if (art) {
      imageLink = document.createElement('button');
      imageLink.type = 'button';
      imageLink.className = 'service-image-link';
      imageLink.setAttribute('aria-label', `View ${art.title}, an example of ${service.title}`);
      const image = document.createElement('img');
      image.src = art.image;
      image.alt = `Illustration: ${art.title}`;
      image.loading = 'lazy';
      imageLink.append(image);
      imageLink.addEventListener('click', () => openArtwork(art));
    }

    const meta = document.createElement('p');
    meta.className = 'service-meta';
    meta.textContent = `${service.categoryLabel || service.category?.toUpperCase() || 'COMMISSION'}${art ? `  /  ${art.year}` : ''}`;
    const title = document.createElement('h3');
    title.textContent = service.title;
    const description = document.createElement('p');
    description.className = 'service-description';
    description.textContent = service.description;
    const receivesLabel = document.createElement('span');
    receivesLabel.className = 'service-receives-label';
    receivesLabel.textContent = 'WHAT YOU RECEIVE';
    const receives = document.createElement('p');
    receives.className = 'service-receives';
    receives.textContent = service.receives;
    const pricing = document.createElement('p');
    pricing.className = 'service-price';
    pricing.textContent = service.price ? `Starting at ${service.price}` : 'Request a quote';
    if (service.turnaround) pricing.textContent += ` · ${service.turnaround}`;
    if (service.availability) pricing.textContent += ` · ${service.availability}`;
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'service-cta';
    cta.textContent = 'Start an inquiry ↗';
    cta.addEventListener('click', () => openCommissions(service.id, 'inquiry'));

    card.append(...(imageLink ? [imageLink] : []), meta, title, description, ...(service.receives ? [receivesLabel, receives] : []), pricing, cta);
    return card;
  }));
  const empty = $('#commission-empty');
  empty.hidden = publishedServices.length > 0;
  $('#commission-form').hidden = !hasInbox;
  $('#inquiry-unavailable').hidden = hasInbox;
  if (publishedServices.length && !hasInbox) empty.textContent = 'Offerings are shown for preview; inquiries are not connected yet.';
  const process = $('.commission-process');
  process.hidden = publishedServices.length === 0;
  const typeSelect = $('#inquiry-type');
  const field = $('#inquiry-type-field');
  if (publishedServices.length) {
    const options = publishedServices.map(service => Object.assign(document.createElement('option'),{value:service.id,textContent:service.title}));
    options.push(Object.assign(document.createElement('option'),{value:'unsure',textContent:'I’m not sure yet'}));
    typeSelect.replaceChildren(...options);
    field.hidden = false;
  } else {
    const input = document.createElement('input'); input.id='inquiry-type'; input.name='commissionType'; input.placeholder='e.g. character artwork, stream assets';
    const label=document.createElement('label'); label.textContent='What are you looking for? '; label.append(Object.assign(document.createElement('span'),{textContent:'OPTIONAL'}),input);
    field.replaceChildren(label); field.hidden=false;
  }
}

function makeArchive() {
  const publicArtworks = artworks.filter(art => art.published !== false && art.visible !== false && !art.archived).sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)));
  $('#archive-nav-count').textContent = String(publicArtworks.length).padStart(2,'0');
  $('#browse-work-count').textContent = String(publicArtworks.length).padStart(2,'0');
  elements.archiveGrid.replaceChildren(...publicArtworks.map((art, index) => {
    const button = document.createElement('button');
    button.className = 'archive-item';
    button.type = 'button';
    button.setAttribute('aria-label', `Open ${art.title}`);

    const image = document.createElement('img');
    image.className = 'archive-image';
    image.src = art.image;
    image.alt = `Illustration: ${art.title}`;
    image.loading = index > 2 ? 'lazy' : 'eager';

    const meta = document.createElement('div');
    meta.className = 'archive-meta';
    const category = document.createElement('span');
    category.textContent = art.categoryLabel;
    const year = document.createElement('span');
    year.textContent = art.year;
    const title = document.createElement('p');
    title.className = 'archive-title';
    title.textContent = art.title;
    const medium = document.createElement('span');
    medium.className = 'archive-medium';
    medium.textContent = art.medium;

    meta.append(category, year);
    button.append(image, meta, title, medium);
    button.addEventListener('click', () => openArtwork(art));
    return button;
  }));
}

function makeRelatedWorks(art) {
  const others = artworks.filter(item => item.id !== art.id && item.published !== false && item.visible !== false && !item.archived);
  const related = [
    ...others.filter(item => item.category === art.category),
    ...others.filter(item => item.category !== art.category),
  ].slice(0, 2);
  elements.related.replaceChildren(...related.map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'related-item';
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = '';
    const copy = document.createElement('span');
    const meta = document.createElement('small');
    meta.textContent = `${item.categoryLabel} · ${item.year}`;
    const title = document.createElement('strong');
    title.textContent = item.title;
    copy.append(meta, title);
    button.append(image, copy);
    button.addEventListener('click', () => openArtwork(item));
    return button;
  }));
}

function openStory(art) {
  if (!art.story) return;
  $('#story-image').src = art.image;
  $('#story-image').alt = `Illustration: ${art.title}`;
  $('#story-category').textContent = `${art.categoryLabel}  /  ${art.year}`;
  $('#story-title').textContent = art.title;
  $('#story-intro').textContent = art.story;
  $('#story-year').textContent = art.year;
  $('#story-medium').textContent = art.medium;
  $('#story-category-name').textContent = art.categoryLabel;
  const paragraphs = (art.storyBody || art.story).split('\n\n');
  $('#story-body').replaceChildren(...paragraphs.map(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }));
  makeRelatedWorks(art);
  elements.panel.classList.remove('open');
  elements.panel.setAttribute('aria-hidden', 'true');
  setView('story');
}

function returnToArtwork() {
  if (!selectedArtwork) return;
  setView('work');
  elements.panel.classList.add('open');
  elements.panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#read-story').focus({ preventScroll: true }));
}

function openArtwork(art) {
  const activeElement = document.activeElement;
  lastArtworkTrigger = activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null;
  selectedArtwork = art;
  $('#app').classList.add('artwork-open');
  setView('work');
  focusArt(art);
  $('#work-category').textContent = `${art.categoryLabel || art.category?.toUpperCase() || 'OTHER'}  /  ${art.year}`;
  $('#work-title').textContent = art.title;
  $('#work-medium').textContent = art.medium;
  $('#work-description').textContent = art.description;
  $('#commission-prompt').hidden = Boolean(art.isDemo);
  $('#commission-from-artwork').dataset.commissionType = commissionTypeFor(art);
  $('#commission-from-artwork').textContent = art.category && art.category !== 'other' ? 'Commission a similar piece ↗' : 'Ask about a similar piece ↗';
  const client = $('#work-client');
  client.textContent = art.client ? `Made for ${art.client}` : '';
  client.hidden = !art.client;
  $('#work-number').textContent = `${String(artworks.indexOf(art) + 1).padStart(2, '0')} / ${String(artworks.length).padStart(2, '0')}`;
  $('#read-story').hidden = !art.story;

  const external = $('#work-external');
  if (art.link) {
    external.href = art.link;
    external.textContent = art.client ? `See the ${art.client} project ↗` : 'Read the full story ↗';
    external.hidden = false;
  } else external.hidden = true;

  elements.panel.classList.add('open');
  elements.panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#close-work').focus({ preventScroll: true }));
}

function closeArtwork() {
  if (!selectedArtwork) return;
  selectedArtwork = null;
  $('#app').classList.remove('artwork-open');
  elements.panel.classList.remove('open');
  $('#commission-prompt').hidden = true;
  elements.panel.setAttribute('aria-hidden', 'true');
  returnToRoom();
  setView('work');
  requestAnimationFrame(() => {
    const triggerIsVisible = lastArtworkTrigger && getComputedStyle(lastArtworkTrigger).visibility !== 'hidden' && lastArtworkTrigger.getClientRects().length > 0;
    (triggerIsVisible ? lastArtworkTrigger : $('[data-view="work"]')).focus({ preventScroll: true });
    lastArtworkTrigger = null;
  });
}

function makeProfile() {
  const profile = portfolio.profile;
  const aboutBio = $('#about-bio');
  aboutBio.replaceChildren(...profile.biography.split('\n\n').map(text => { const paragraph = document.createElement('span'); paragraph.textContent = text; return paragraph; }));
  aboutBio.style.whiteSpace = 'pre-line';
  $('#about-focus').textContent = profile.focus || 'To be supplied by the artist';
  $('#about-mediums').textContent = profile.mediums || 'To be supplied by the artist';
  $('#about-location').textContent = profile.location || '';
  $('#about-location').hidden = !profile.location;
  $('#about-location-label').hidden = !profile.location;
  $('#contact-location').textContent = profile.location?.toUpperCase() || '';
  $('#contact-location').hidden = !profile.location;
  $('#contact-availability').textContent = profile.availability || 'Availability to be confirmed';
  const email = $('#contact-email');
  email.hidden = !profile.email;
  if (profile.email) {
    email.href = `mailto:${profile.email}`;
    email.textContent = `${profile.email} ↗`;
  }
  const socialLinks = [
    [$('#contact-instagram'), profile.instagram],
    [$('#contact-arena'), profile.areNa],
  ];
  for (const [link, url] of socialLinks) {
    link.hidden = !url;
    if (url) link.href = url;
  }
  $('#contact-socials').hidden = !socialLinks.some(([, url]) => url);
  if (profile.email) $('#contact-blurb').textContent = 'For commissions, collaborations, and thoughtful hellos, write or find me elsewhere.';
  const siteName = $('#home-link');
  if (siteName?.firstChild) siteName.firstChild.textContent = profile.artistName;
}
function refreshEditorialContent() { makeArchive(); makeCommissionServices(); makeProfile(); }
refreshEditorialContent();
$('#copyright-year').textContent = String(new Date().getFullYear());
window.addEventListener('portfolio-updated', refreshEditorialContent);
if (import.meta.env.DEV) import('./manage.js');
window.addEventListener('artwork-select', event => openArtwork(event.detail));
$('#close-work').addEventListener('click', closeArtwork);
$('#read-story').addEventListener('click', () => openStory(selectedArtwork));
$('#commission-from-artwork').addEventListener('click', () => {
  const art = selectedArtwork;
  const service = $('#commission-from-artwork').dataset.commissionType;
  openCommissions(service || art?.categoryLabel || 'unsure', 'inquiry');
  const description = $('#commission-form').elements.description;
  if (art && !description.value) description.value = `I’m interested in a piece in the style of “${art.title}” (${art.categoryLabel || art.category}). `;
});
$('#story-return').addEventListener('click', returnToArtwork);
$('#enter-world').addEventListener('click', () => {
  introDismissed = true;
  elements.intro.classList.add('dismissed');
  goToRoom('all');
});
$('#browse-work').addEventListener('click', () => setView('archive'));
$('#contact-commission-link').addEventListener('click', () => openCommissions('unsure', 'inquiry'));
$('#error-browse').addEventListener('click', () => setView('archive'));
$('#home-link').addEventListener('click', event => {
  event.preventDefault();
  if (selectedArtwork) closeArtwork();
  introDismissed = false;
  setView('work');
  goToRoom('all');
});

document.querySelectorAll('.nav-link').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view;
  if (selectedArtwork) closeArtwork();
  if (view === 'work') {
    setView('work');
    goToRoom('all');
  } else setView(view);
}));

$('#commission-form').addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const typeInput = $('#inquiry-type');
  const typeLabel = typeInput.tagName === 'SELECT' ? (typeInput.selectedOptions[0]?.textContent || 'Not specified') : (typeInput.value || 'Not specified');
  const references = [...event.currentTarget.elements.references.files].map(file => file.name);
  const body = [
    `Name: ${formData.get('name')}`,
    `Email: ${formData.get('email')}`,
    `Commission type: ${typeLabel}`,
    `Preferred deadline: ${formData.get('deadline') || 'Not specified'}`,
    `Budget: ${formData.get('budget') || 'Not specified'}`,
    '',
    'Project details:',
    formData.get('description'),
    ...(formData.get('notes') ? ['', 'Additional notes:', formData.get('notes')] : []),
    ...(references.length ? ['', `Reference images to attach: ${references.join(', ')}`] : []),
  ].join('\n');
  const subject = `Illustration inquiry — ${typeLabel}`;
  const mailto = `mailto:${getCommissionEmail()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  $('#inquiry-note').textContent = references.length
    ? 'Your email app will open with the inquiry. Attach the selected reference images before sending.'
    : 'Your email app will open with the inquiry ready to review.';
  window.location.href = mailto;
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (currentView === 'story') returnToArtwork();
  else if (selectedArtwork) closeArtwork();
  else if (currentView !== 'work') {
    setView('work');
    $('[data-view="work"]').focus({ preventScroll: true });
  }
});
