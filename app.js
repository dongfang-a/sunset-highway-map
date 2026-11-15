(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const colors = { surviving: '#13856c', corridor: '#5267ca', uncertain: '#c65b65', ferry: '#16aabd', historical1915: '#d88a24', seattle: '#87949c' };
  const qualityLabels = {
    surviving: '现存旧路几何',
    corridor: '现存道路追踪的历史走廊参照',
    uncertain: '原线待考证 / 改建区或推定连接',
    ferry: '历史渡河概略示意'
  };
  const versionTitles = { '1919': '1919 主走廊', '1915': '1915 替代走廊', both: '1915 / 1919 两线对比' };
  const state = { version: '1919', remnants: true, pois: true, south: false, seattle: false };
  let map;
  let tiles;
  let dataset;
  let routeLayers = [];
  let poiLayer;
  let allBounds;
  let fetching = false;
  let tileErrors = 0;
  let tileSuccesses = 0;

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const latLng = (coords) => [coords[1], coords[0]];
  const isCoordinate = (coords) => Array.isArray(coords) && coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]) && Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 90;

  function segmentColor(segment) {
    if (segment.quality !== 'corridor') return colors[segment.quality] || colors.corridor;
    if (segment.group === '1915' || segment.group === 'south_branch') return colors.historical1915;
    return segment.group === 'seattle' ? colors.seattle : colors.corridor;
  }

  function sourceLinks(sources) {
    const values = typeof sources === 'string' ? [sources] : sources;
    if (!Array.isArray(values)) return '';
    return [...new Set(values)].map((value) => {
      try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        return `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener">${escapeHTML(url.hostname.replace(/^www\./, ''))} ↗</a>`;
      } catch (_) { return ''; }
    }).filter(Boolean).join('');
  }

  function routePopup(segment) {
    const km = Number(segment.length_km);
    const metrics = Number.isFinite(km) ? `本段折线约 ${km.toFixed(2)} km` : '';
    const quality = qualityLabels[segment.quality] || '历史路线资料';
    return `<article><p class="popup-eyebrow">HISTORIC HIGHWAY · ${escapeHTML(segment.id || '')}</p><h2 class="popup-title">${escapeHTML(segment.name)}</h2><div class="popup-quality" style="--qcolor:${segmentColor(segment)}">${escapeHTML(quality)}</div><p class="popup-note">${escapeHTML(segment.note || '此路段的具体线位与年代仍需结合来源资料判断。')}</p>${metrics ? `<p class="popup-metrics">${escapeHTML(metrics)} · 坐标密度不等于历史线位精度</p>` : ''}<div class="popup-sources">${sourceLinks(segment.sources)}</div><p class="popup-disclaimer">历史查看用途；不代表当前可通行。</p></article>`;
  }

  function poiPopup(point) {
    return `<article><p class="popup-eyebrow">HISTORIC PLACE</p><h2 class="popup-title">${escapeHTML(point.name)}</h2><p class="popup-note">${escapeHTML(point.note || '')}</p><div class="popup-sources">${sourceLinks(point.sources)}</div></article>`;
  }

  function groupVisible(group) {
    if (group === '1919') return state.version !== '1915';
    if (group === '1915') return state.version !== '1919';
    if (group === 'south_branch') return state.south;
    if (group === 'remnants') return state.remnants;
    if (group === 'seattle') return state.seattle;
    return true;
  }

  function updateLayers() {
    if (!map || !dataset) return;
    let visibleCount = 0;
    for (const record of routeLayers) {
      const visible = groupVisible(record.segment.group);
      if (visible) {
        visibleCount++;
        if (!map.hasLayer(record.line)) record.line.addTo(map);
      } else if (map.hasLayer(record.line)) {
        map.removeLayer(record.line);
      }
    }
    // Draw surviving road details above the broad corridor reference.
    routeLayers.filter((record) => record.segment.quality === 'surviving' && map.hasLayer(record.line)).forEach((record) => record.line.bringToFront());
    if (state.pois && !map.hasLayer(poiLayer)) poiLayer.addTo(map);
    else if (!state.pois && map.hasLayer(poiLayer)) map.removeLayer(poiLayer);
    $('viewTitle').textContent = versionTitles[state.version];
    $('viewSubtitle').textContent = `已显示 ${visibleCount} 个路段${state.pois ? ` · ${dataset.pois.length} 个地点` : ''}`;
    $('panelToggleText').textContent = `${versionTitles[state.version]} · 路线与图层`;
    document.body.dataset.routeVersion = state.version;
    document.body.dataset.visibleSegments = String(visibleCount);
  }

  function fitAll() {
    if (!map || !allBounds?.isValid()) return;
    map.invalidateSize({ pan: false });
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    if (mobile) {
      $('panel').classList.remove('is-expanded');
      $('panelToggle').setAttribute('aria-expanded', 'false');
    }
    map.fitBounds(allBounds, { paddingTopLeft: mobile ? [28, 80] : [35, 80], paddingBottomRight: mobile ? [28, 105] : [35, 44], animate: false });
  }

  function setDataStatus(mode, title, message) {
    $('dataStatus').hidden = mode === 'ready';
    $('dataStatus').classList.toggle('error', mode === 'error');
    $('dataStatus').classList.toggle('loading', mode === 'loading');
    $('statusTitle').textContent = title;
    $('statusMessage').textContent = message;
    $('retryData').hidden = mode !== 'error';
    document.body.dataset.state = mode;
  }

  function initMap() {
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true, preferCanvas: false, attributionControl: true, zoomSnap: .25, zoomDelta: .5, minZoom: 4, maxZoom: 19 }).setView([47.36, -119.72], 7);
    map.attributionControl.setPrefix(false);
    map.createPane('roadDetails');
    map.getPane('roadDetails').style.zIndex = '410';
    map.createPane('places');
    map.getPane('places').style.zIndex = '420';
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 2
    }).addTo(map);
    tiles.on('loading', () => { tileErrors = 0; tileSuccesses = 0; });
    tiles.on('tileerror', () => {
      tileErrors++;
      if (tileErrors >= 8 && tileSuccesses < 3) $('tileNotice').hidden = false;
    });
    tiles.on('tileload', () => {
      tileSuccesses++;
      if (tileSuccesses >= 3) $('tileNotice').hidden = true;
    });
    map.on('popupopen', () => { $('mapHint').hidden = true; });
    map.on('popupclose', () => { $('mapHint').hidden = false; });
    poiLayer = L.layerGroup();
  }

  function clearDataLayers() {
    routeLayers.forEach((record) => map.removeLayer(record.line));
    routeLayers = [];
    poiLayer.clearLayers();
  }

  function renderData(data) {
    if (!Array.isArray(data.segments) || !Array.isArray(data.pois) || !data.segments.length) throw new Error('invalid_data');
    const validSegments = data.segments.filter((segment) => Array.isArray(segment.coords) && segment.coords.length >= 2 && segment.coords.every(isCoordinate));
    if (validSegments.length !== data.segments.length || !data.pois.every((point) => isCoordinate(point.coords))) throw new Error('invalid_coordinates');
    clearDataLayers();
    dataset = data;
    allBounds = L.latLngBounds([]);
    for (const segment of data.segments) {
      const points = segment.coords.map(latLng);
      const surviving = segment.quality === 'surviving';
      const line = L.polyline(points, {
        color: segmentColor(segment),
        weight: surviving ? 4.3 : segment.quality === 'uncertain' ? 3 : 3.6,
        opacity: .94,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: segment.quality === 'uncertain' ? '6 5' : segment.quality === 'ferry' ? '4 5' : undefined,
        pane: surviving ? 'roadDetails' : 'overlayPane',
        bubblingMouseEvents: false,
        smoothFactor: .5
      });
      line.on('add', () => {
        const element = line.getElement();
        if (!element) return;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', `查看路段：${segment.name}`);
        element.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            line.openPopup();
          }
        };
      });
      line.bindPopup(routePopup(segment), { maxWidth: 350, minWidth: 225, autoPanPaddingTopLeft: [18, 88], autoPanPaddingBottomRight: [18, window.matchMedia('(max-width:760px)').matches ? 85 : 25] });
      line.on('mouseover', () => line.setStyle({ weight: surviving ? 6 : 5 }));
      line.on('mouseout', () => line.setStyle({ weight: surviving ? 4.3 : segment.quality === 'uncertain' ? 3 : 3.6 }));
      routeLayers.push({ segment, line });
      allBounds.extend(line.getBounds());
    }
    for (const point of data.pois) {
      const marker = L.circleMarker(latLng(point.coords), { radius: 4.2, color: '#fffdf8', fillColor: '#29464b', fillOpacity: 1, weight: 1.8, pane: 'places' });
      marker.bindTooltip(escapeHTML(point.name), { direction: 'top', offset: [0, -5] });
      marker.bindPopup(poiPopup(point), { maxWidth: 330, minWidth: 215, autoPanPaddingTopLeft: [18, 88], autoPanPaddingBottomRight: [18, 85] });
      poiLayer.addLayer(marker);
    }
    updateLayers();
    fitAll();
    requestAnimationFrame(() => fitAll());
  }

  async function loadData() {
    if (fetching) return;
    if (!window.L) {
      setDataStatus('error', '地图组件未能加载', '请刷新页面重试，或使用右上角下载 KMZ。');
      $('retryData').onclick = () => window.location.reload();
      return;
    }
    fetching = true;
    setDataStatus('loading', '正在展开历史路线', '载入详细路线与地点资料…');
    try {
      if (!map) initMap();
      const response = await fetch('./data/routes.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderData(data);
      setDataStatus('ready', '', '');
    } catch (error) {
      console.error('Route data could not be loaded:', error);
      setDataStatus('error', '路线资料暂时无法加载', '请检查网络后重试，也可以下载 KMZ 查看。');
    } finally {
      fetching = false;
    }
  }

  document.querySelectorAll('input[name="version"]').forEach((input) => input.addEventListener('change', () => { state.version = input.value; updateLayers(); }));
  for (const [id, property] of [['layerRemnants', 'remnants'], ['layerPois', 'pois'], ['layerSouth', 'south'], ['layerSeattle', 'seattle']]) {
    $(id).addEventListener('change', () => { state[property] = $(id).checked; updateLayers(); });
  }
  $('panelToggle').addEventListener('click', () => {
    const expanded = $('panel').classList.toggle('is-expanded');
    $('panelToggle').setAttribute('aria-expanded', String(expanded));
    if (map) window.setTimeout(() => map.invalidateSize({ pan: false }), 80);
  });
  $('fitAll').addEventListener('click', fitAll);
  $('retryData').addEventListener('click', loadData);
  $('retryTiles').addEventListener('click', () => {
    tileErrors = 0;
    tileSuccesses = 0;
    $('tileNotice').hidden = true;
    tiles?.redraw();
  });
  window.addEventListener('resize', () => { if (map) map.invalidateSize({ pan: false }); });
  loadData();
})();
