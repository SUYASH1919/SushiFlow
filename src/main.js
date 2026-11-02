import * as THREE from 'three';
import './style.css';

const DB_NAME = 'SushiFlowDB';
const STORE_NAME = 'intakes';

let db;
let records = [];
let goal = Number(localStorage.getItem('sf_goal')) || 2500;
let waterMaterial;
let waterSphere;
let shell;
let renderer;

const $ = id => document.getElementById(id);

function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadRecords() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function saveRecord(amount) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');

    tx.objectStore(STORE_NAME).add({
      amount,
      date: localDate(),
      timestamp: Date.now()
    });

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function deleteTodayRecords() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    const today = localDate();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      if (cursor.value.date === today) {
        cursor.delete();
      }
      cursor.continue();
    };

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function todayRecords() {
  const today = localDate();
  return records
    .filter(record => record.date === today)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function todayTotal() {
  return todayRecords().reduce((sum, record) => sum + record.amount, 0);
}

async function adjustWater(amount) {
  if (!Number.isFinite(amount) || amount === 0) return;

  let adjustment = amount;

  if (adjustment < 0) {
    const current = todayTotal();

    if (current <= 0) {
      alert('Aaj ka water intake already zero hai.');
      return;
    }

    adjustment = -Math.min(Math.abs(adjustment), current);
  }

  try {
    await saveRecord(adjustment);
    records = await loadRecords();
    render();
  } catch (error) {
    console.error(error);
    alert('Water intake save nahi ho paya.');
  }
}

/* 3D SPHERE */

function init3D() {
  const container = $('sphere');

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(280, 280);
    container.replaceChildren(renderer.domElement);

    const geometry = new THREE.SphereGeometry(1.25, 128, 128);

    waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uLevel: { value: -1.25 },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uLevel;
        uniform float uTime;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          float wave =
            sin(vPosition.x * 4.0 + uTime * 1.3) * 0.035 +
            sin(vPosition.z * 5.0 + uTime * 1.7) * 0.025;

          if (vPosition.y > uLevel + wave) discard;

          float depth = smoothstep(-1.25, 1.25, vPosition.y);
          vec3 darkBlue = vec3(0.005, 0.16, 0.48);
          vec3 brightBlue = vec3(0.02, 0.62, 1.0);
          vec3 color = mix(darkBlue, brightBlue, depth * 0.65);

          float shine = pow(
            max(dot(normalize(vNormal), normalize(vec3(-0.5, 0.8, 1.0))), 0.0),
            3.0
          );

          color += shine * 0.22;
          gl_FragColor = vec4(color, 0.96);
        }
      `,
      transparent: true
    });

    waterSphere = new THREE.Mesh(geometry, waterMaterial);
    scene.add(waterSphere);

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9bdcff,
      metalness: 0.12,
      roughness: 0.08,
      transmission: 0.25,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });

    shell = new THREE.Mesh(geometry, shellMaterial);
    scene.add(shell);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    const light = new THREE.PointLight(0x54baff, 3);
    light.position.set(2, 3, 4);
    scene.add(light);

    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      waterMaterial.uniforms.uTime.value = time;

      waterSphere.rotation.y = Math.sin(time * 0.25) * 0.08;
      shell.rotation.y = waterSphere.rotation.y;

      renderer.render(scene, camera);
    }

    updateSphere(todayTotal());
    animate();

  } catch (error) {
    console.error('3D initialization failed:', error);
    container.textContent = '3D graphics unavailable on this device.';
  }
}

function updateSphere(total) {
  if (!waterMaterial) return;

  const percentage = Math.max(0, Math.min(total / goal, 1));
  waterMaterial.uniforms.uLevel.value = -1.25 + percentage * 2.5;
}

/* UI */

function render() {
  const total = todayTotal();
  const percentage = Math.max(0, Math.min(Math.round(total / goal * 100), 100));
  const remaining = Math.max(goal - total, 0);

  $('percentage').textContent = `${percentage}%`;
  $('consumed').textContent = `${total.toLocaleString()} ml`;
  $('remaining').textContent = `${remaining.toLocaleString()} ml`;
  $('progress').style.width = `${percentage}%`;

  updateSphere(total);
  renderTodayActivity();
}

function renderTodayActivity() {
  const entries = todayRecords();
  const container = $('history-list');

  $('entry-count').textContent = `${entries.length} entries`;

  if (!entries.length) {
    container.innerHTML = '<p class="empty-history">No water intake recorded today.</p>';
    return;
  }

  container.innerHTML = entries.map(record => {
    const isReduction = record.amount < 0;
    const amount = Math.abs(record.amount);
    const time = new Date(record.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="history-row">
        <span>${time} · ${isReduction ? 'Reduced' : 'Added'}</span>
        <strong class="${isReduction ? 'reduction' : ''}">
          ${isReduction ? '−' : '+'}${amount.toLocaleString()} ml
        </strong>
      </div>
    `;
  }).join('');
}

function showSettings() {
  $('home-screen').classList.add('hidden');
  $('settings-screen').classList.remove('hidden');
  $('goal-input').value = goal;
}

function showHome() {
  $('settings-screen').classList.add('hidden');
  $('home-screen').classList.remove('hidden');
}

/* EVENTS */

function bindEvents() {
  $('settings-button').addEventListener('click', showSettings);
  $('back-button').addEventListener('click', showHome);

  document.querySelectorAll('[data-amount]').forEach(button => {
    button.addEventListener('click', () => {
      adjustWater(Number(button.dataset.amount));
    });
  });

  $('custom-add').addEventListener('click', () => {
    const input = $('custom-amount');
    const amount = Number(input.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Valid amount enter karo.');
      return;
    }

    adjustWater(amount);
    input.value = '';
  });

  $('custom-reduce').addEventListener('click', () => {
    const input = $('custom-amount');
    const amount = Number(input.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Valid amount enter karo.');
      return;
    }

    adjustWater(-amount);
    input.value = '';
  });

  $('custom-amount').addEventListener('keydown', event => {
    if (event.key === 'Enter') $('custom-add').click();
  });

  $('save-goal').addEventListener('click', () => {
    const value = Number($('goal-input').value);

    if (!Number.isFinite(value) || value < 250 || value > 10000) {
      alert('Daily limit 250 ml se 10000 ml ke beech rakho.');
      return;
    }

    goal = value;
    localStorage.setItem('sf_goal', String(goal));
    render();
    alert('Daily limit saved!');
  });

  $('reset-today').addEventListener('click', async () => {
    if (!confirm("Aaj ka saara water data reset karna hai? Ye action undo nahi hoga.")) {
      return;
    }

    try {
      await deleteTodayRecords();
      records = await loadRecords();
      render();
      alert("Today's data reset ho gaya.");
      showHome();
    } catch (error) {
      console.error(error);
      alert('Reset nahi ho paya.');
    }
  });
}

/* START */

async function start() {
  $('current-date').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  bindEvents();

  try {
    db = await openDatabase();
    records = await loadRecords();
    render();
    init3D();
  } catch (error) {
    console.error('SushiFlow startup error:', error);
    alert('SushiFlow database start nahi ho paya.');
  }
}

start();
