// SPDX-License-Identifier: AGPL-3.0-or-later
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import { initRenderer, setDimensionClickHandler } from '../core/renderer.js';
import { initHistory, undo, redo } from '../core/history.js';
import { initReactive } from '../core/reactive.js';
import { store } from '../core/store.js';
import { addFixedDistanceConstraint } from '../core/constraints.js';

import { initMap } from './map.js';
import { initLayers, addCustomLayer } from './layers.js';
import { initDrawing, setActiveLayerEntity } from './drawing.js';
import { initProperties, showShapeProperties } from './properties.js';
import { initMeasurement } from './measurement.js';
import { initStorage } from './storage.js';
import { escHtml } from './html.js';
import { initDataSources, getAllSources, toggleSource } from './datasources.js';
import { registerOSMSources } from './sources/osm.js';
import { registerParcelSource } from './sources/parcels.js';
import { registerFemaSource } from './sources/fema.js';
import { registerZoningSource } from './sources/zoning.js';
import { registerUSGSSource } from './sources/usgs.js';
import { registerSoilsSource } from './sources/soils.js';
import { registerMichiganSources } from './sources/michigan.js';
import { registerInfrastructureSources } from './sources/infrastructure.js';
import { initTerrain } from './terrain.js';
import { initSnap, toggleSnap, getSnapConfig } from './snap.js';
import { initDimensions } from './dimensions.js';
import { initGrid, toggleGrid, isGridEnabled, getGridSpacing } from './grid.js';
import { initStatusBar, updateSnapStatus, updateSnapEnabled, updateGridStatus, updateCasStatus } from './statusbar.js';
import { initDiscover } from './discover.js';
import {
  initIntelligence,
  computeProximityForEntity,
  renderConflictsForEntity,
  elevationAtVerticesForEntity,
} from './intelligence.js';
import { initAgentBridge } from './agent-bridge.js';
import {
  initAgentPanel,
  onAgentMessage,
  setAgentConnectionStatus,
  onPetalTongueNotification,
  onPetalTongueStatusChange,
} from './agent-panel.js';
import { initPetalTongue } from './petal-tongue.js';
import { casHealthCheck } from './nestgate-cas.js';
import { initFootPrintPrimals } from './primals.js';
import { FEET_PER_DEGREE_LAT } from '../constants.js';
import type { SourceRegistry } from '../types/source.js';
import { modalPrompt } from './modal.js';
import { initWelcome } from './welcome.js';
import { initTutorial } from './tutorial.js';

const map = initMap();

// Responsive sidebar toggle
const layerPanel = document.getElementById('layer-panel');
const toggleLayersBtn = document.getElementById('btn-toggle-layers');
if (toggleLayersBtn && layerPanel) {
  toggleLayersBtn.addEventListener('click', () => {
    layerPanel.classList.toggle('panel-open');
  });
  map.on('click', () => {
    layerPanel.classList.remove('panel-open');
  });
}

// Core architecture
initFootPrintPrimals();
initRenderer(map);
initHistory();
initReactive();

// Keyboard bindings for undo/redo (client-layer policy, not in core)
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
  } else if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    redo();
  }
});

// Layers -- creates layer entities in the store
initLayers(map, (layerEntityId, color) => {
  setActiveLayerEntity(layerEntityId, color);
  map.pm.setGlobalOptions({
    pathOptions: {
      color,
      fillColor: color,
      fillOpacity: 0.25,
      weight: 3,
    },
  });
});

// Drawing -- routes Geoman events through command pipeline
initDrawing(map, (entityId) => {
  showShapeProperties(entityId);
  if (entityId) {
    const proxHtml = computeProximityForEntity(entityId);
    const container = document.getElementById('props-content');
    if (container && proxHtml) {
      const div = document.createElement('div');
      div.innerHTML = proxHtml;
      container.appendChild(div);
    }
    renderConflictsForEntity(entityId);
    void elevationAtVerticesForEntity(entityId).then((elevHtml) => {
      if (elevHtml && container) {
        const elevDiv = document.createElement('div');
        elevDiv.innerHTML = elevHtml;
        container.appendChild(elevDiv);
      }
    });
  }
});

initProperties();
initMeasurement(map);
initStorage();

document.getElementById('btn-add-layer')?.addEventListener('click', () => {
  void addCustomLayer();
});

initDataSources(map, renderDataSourceList);

registerOSMSources();
registerParcelSource();
registerFemaSource();
registerZoningSource();
registerUSGSSource();
registerSoilsSource();
registerMichiganSources();
registerInfrastructureSources();

renderDataSourceList(getAllSources());

// Parametric dimensions: clicking a dimension lets you set a constraint
setDimensionClickHandler((dimEntityId) => {
  const res = store.get(dimEntityId);
  if (!res.ok || res.value.kind !== 'dimension') return;
  const dim = res.value.components.dimension;

  const currentFt = dim.value.toFixed(1);
  void modalPrompt('Distance Constraint', `Set distance constraint (current: ${currentFt} ft):`, currentFt).then(
    (input) => {
      if (!input) return;

      const newDist = parseFloat(input);
      if (isNaN(newDist) || newDist <= 0) return;

      const distDeg = newDist / FEET_PER_DEGREE_LAT;

      addFixedDistanceConstraint(dim.targetEntityId, dim.fromVertex, dim.targetEntityId, dim.toVertex, distDeg);
    },
  );
});

initTerrain(map);
initSnap(map, (info) => {
  updateSnapStatus(info);
});
initDimensions(map);
initGrid(map, (enabled, spacing) => {
  updateGridStatus(enabled, spacing);
});
initStatusBar(map);
initDiscover(map);
initIntelligence(map);

// Agent system
initAgentPanel();
initAgentBridge(onAgentMessage, setAgentConnectionStatus);
initPetalTongue(onPetalTongueNotification, onPetalTongueStatusChange);

void casHealthCheck().then(updateCasStatus);

// First-run welcome
initWelcome();

// Interactive tutorial (after welcome)
initTutorial();

document.getElementById('btn-grid')?.addEventListener('click', () => {
  const active = toggleGrid();
  const btn = document.getElementById('btn-grid');
  if (btn) btn.classList.toggle('active', active);
  updateGridStatus(isGridEnabled(), getGridSpacing());
});

document.getElementById('btn-snap')?.addEventListener('click', () => {
  const active = toggleSnap();
  const btn = document.getElementById('btn-snap');
  if (btn) btn.classList.toggle('active', active);
  updateSnapEnabled(active);
});

const snapBtn = document.getElementById('btn-snap');
if (snapBtn && getSnapConfig().enabled) {
  snapBtn.classList.add('active');
}

function renderDataSourceList(sources: SourceRegistry): void {
  const ul = document.getElementById('data-source-list');
  if (!ul) return;
  ul.innerHTML = '';

  const allSources = sources;
  const byCategory: Record<string, (typeof allSources)[string][]> = {};

  for (const src of Object.values(allSources)) {
    const cat = src.category || 'Other';
    const existing = byCategory[cat];
    if (!existing) {
      byCategory[cat] = [src];
    } else {
      existing.push(src);
    }
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    const catEl = document.createElement('li');
    catEl.className = 'ds-category';
    catEl.textContent = cat;
    ul.appendChild(catEl);

    for (const src of items) {
      const li = document.createElement('li');

      let statusHtml = '';
      if (src.loading) {
        statusHtml = '<span class="ds-spinner"></span>';
      } else if (src.error) {
        statusHtml = `<span class="ds-error" title="${escHtml(src.error)}">!</span>`;
      } else if (src.enabled && src.type === 'vector' && src.featureCount > 0) {
        statusHtml = `<span class="ds-status">${String(src.featureCount)}</span>`;
      }

      li.innerHTML = `
        <input type="checkbox" class="ds-toggle" ${src.enabled ? 'checked' : ''} />
        <span class="ds-color" style="background:${escHtml(src.color)}"></span>
        <span class="ds-name" title="${escHtml(src.name)}">${escHtml(src.name)}</span>
        ${statusHtml}
      `;

      li.querySelector('.ds-toggle')?.addEventListener('change', () => {
        void toggleSource(src.id);
      });

      ul.appendChild(li);
    }
  }
}
