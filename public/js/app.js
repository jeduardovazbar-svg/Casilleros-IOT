// ==========================================
// ESTADO GLOBAL DEL KIOSCO
// ==========================================
let currentPin = '';
let currentUser = null;
let selectedLocker = null;
let currentWithdrawQty = 1;
let availableLockers = [];
let chartProductsInstance = null;
let chartUsersInstance = null;

// Lista de reproducción de videos promocionales
const promoPlaylist = [
  '/videos/promocionalVideo1.mp4',
  '/videos/promocionalVideo2.mp4',
  '/videos/promocionalVideo3.mp4',
  '/videos/promocionalVideo4.mp4'
];
let currentVideoIndex = 0;

// En tu app.js

function setupScreensaverVideo() {
  const videoEl = document.getElementById('screensaver-video');
  const ambientEl = document.getElementById('screensaver-video-ambient');
  if (!videoEl) return;

  // Sincronizar cambio de video en bucle
  videoEl.addEventListener('ended', () => {
    currentVideoIndex = (currentVideoIndex + 1) % promoPlaylist.length;
    const nextVideo = promoPlaylist[currentVideoIndex];

    videoEl.src = nextVideo;
    videoEl.play().catch(() => {});

    if (ambientEl) {
      ambientEl.src = nextVideo;
      ambientEl.play().catch(() => {});
    }
  });
}

// Reloj digital en encabezado
setInterval(() => {
  const now = new Date();
  const el = document.getElementById('header-clock');
  if (el) el.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

// ==========================================
// TECLADO NUMÉRICO Y CONTROL DE ACCESO (PIN)
// ==========================================
function pressKey(k) {
  if (currentPin.length < 4) {
    currentPin += k;
    updatePinDots();
    if (currentPin.length === 4) submitLogin();
  }
}

function clearPin() {
  currentPin = '';
  updatePinDots();
  const err = document.getElementById('login-error');
  if (err) err.innerText = '';
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) continue;
    if (i < currentPin.length) {
      dot.className = 'w-4 h-4 rounded-full border-2 border-blue-400 bg-blue-500 shadow-md shadow-blue-500/50 scale-110 transition-all duration-150';
    } else {
      dot.className = 'w-4 h-4 rounded-full border-2 border-slate-700 bg-slate-800/50 transition-all duration-150';
    }
  }
}

async function submitLogin() {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: currentPin })
    });
    const json = await res.json();

    if (!json.ok) {
      document.getElementById('login-error').innerText = json.error;
      clearPin();
      return;
    }

    currentUser = json.data;
    clearPin();

    FlowManager.goTo('dashboard');
    document.getElementById('user-display').innerText = currentUser.username;
    const badge = document.getElementById('role-badge');
    badge.innerText = currentUser.role;
    badge.className = `text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-bold border ${
      currentUser.role === 'admin' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
      currentUser.role === 'operador' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    }`;

    if (currentUser.role === 'admin') {
      document.getElementById('btn-admin-logs').classList.remove('hidden');
      document.getElementById('btn-admin-users').classList.remove('hidden');
      document.getElementById('btn-admin-stats').classList.remove('hidden');
    }

    loadLockers();
  } catch (err) {
    document.getElementById('login-error').innerText = 'Sin respuesta del servidor local';
    clearPin();
  }
}

function logout() {
  const previousUser = currentUser ? currentUser.username : null;
  currentUser = null;
  clearPin();
  Cart.clear();

  const bLogs = document.getElementById('btn-admin-logs');
  const bUsers = document.getElementById('btn-admin-users');
  const bStats = document.getElementById('btn-admin-stats');
  if (bLogs) bLogs.classList.add('hidden');
  if (bUsers) bUsers.classList.add('hidden');
  if (bStats) bStats.classList.add('hidden');

  FlowManager.goTo('screensaver');
  triggerBotGreeting(previousUser);
}

function triggerBotGreeting(lastUser = null) {
  const welcomeText = document.getElementById('bot-welcome-text');
  const bubble = welcomeText ? welcomeText.closest('.liquid-glass') : null;

  if (welcomeText) {
    if (lastUser) {
      welcomeText.innerHTML = `👋 ¡Hasta pronto, <span class="text-blue-600">${lastUser}</span>!`;
      setTimeout(() => {
        welcomeText.innerHTML = '👋 ¡Hola! Bienvenido a EDCAM Locker.';
      }, 2500);
    } else {
      welcomeText.innerHTML = '👋 ¡Hola! Bienvenido a EDCAM Locker.';
    }
  }

  if (bubble) {
    bubble.classList.remove('scale-100');
    bubble.classList.add('scale-95', 'opacity-80');
    setTimeout(() => {
      bubble.classList.remove('scale-95', 'opacity-80');
      bubble.classList.add('scale-100', 'transition-all', 'duration-200');
    }, 50);
  }
}

// ==========================================
// RENDERIZADO Y CONTROL DE CASILLEROS
// ==========================================
async function loadLockers() {
  try {
    const res = await fetch('/api/lockers');
    const json = await res.json();
    const container = document.getElementById('lockers-container');
    container.innerHTML = '';

    json.data.forEach(l => {
      if (currentUser && currentUser.role === 'empleado' && l.id !== currentUser.assigned_locker_id) {
        return;
      }

      const card = document.createElement('div');
      const sizeClass = `size-${l.size_type || 'S'}`;
      const isWarning = l.status === 'maintenance';
      const hasStock = l.current_stock > 0;

      card.className = `${sizeClass} group relative liquid-glass rounded-2xl p-4 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all overflow-hidden ${
        isWarning ? 'border-amber-400/80 bg-amber-50/60' : 'hover:border-blue-400 hover:shadow-lg'
      }`;

      card.innerHTML = `
        <div class="flex justify-between items-start">
          <span class="text-xl font-black tracking-tight text-slate-800 group-hover:text-blue-600 transition-colors">
            #${l.locker_number.toString().padStart(2, '0')}
          </span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-600 uppercase tracking-wider shadow-sm">
            ${l.size_type}
          </span>
        </div>

        <div class="my-auto py-2">
          <h4 class="font-bold text-xs sm:text-sm text-slate-800 leading-tight line-clamp-2">
            ${l.product_name || '<span class="text-slate-400 italic font-normal">Sin Asignar</span>'}
          </h4>
          <div class="flex items-center gap-1.5 mt-1.5">
            <span class="w-2 h-2 rounded-full ${hasStock ? 'bg-blue-500' : 'bg-rose-500'}"></span>
            <span class="text-[11px] font-medium text-slate-600">
              Stock: <strong class="${hasStock ? 'text-slate-800' : 'text-rose-500'}">${l.current_stock}</strong>
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between text-[10px] pt-2 border-t border-slate-200/60">
          <span class="flex items-center gap-1.5 font-semibold ${isWarning ? 'text-amber-600' : 'text-emerald-600'}">
            <span class="w-1.5 h-1.5 rounded-full ${isWarning ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse"></span>
            ${isWarning ? 'Abierto' : 'Listo'}
          </span>
          ${currentUser && currentUser.role === 'admin' ? '<span class="text-amber-600 font-bold group-hover:underline">⚙️ Panel</span>' : ''}
        </div>
      `;

      card.onclick = () => {
        if (currentUser && currentUser.role === 'admin') {
          openAdminModal(l);
        } else {
          openWithdrawModal(l);
        }
      };

      container.appendChild(card);
    });
  } catch (e) {
    console.error('Error al cargar casilleros:', e);
  }
}

// ==========================================
// MODAL DE ADMINISTRACIÓN Y CONFIGURACIÓN
// ==========================================
function openAdminModal(locker) {
  selectedLocker = locker;
  document.getElementById('ma-title').innerText = `Casillero #${locker.locker_number.toString().padStart(2, '0')}`;
  document.getElementById('ma-product').value = locker.product_name || '';
  document.getElementById('ma-stock-current').value = `${locker.current_stock} piezas`;
  document.getElementById('ma-stock-add').value = 0;
  document.getElementById('modal-admin').classList.remove('hidden');
  document.getElementById('modal-admin').classList.add('flex');
}

async function submitRestock() {
  const pName = document.getElementById('ma-product').value.trim();
  const addQty = parseInt(document.getElementById('ma-stock-add').value, 10) || 0;

  try {
    const res = await fetch('/api/inventory/restock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        locker_id: selectedLocker.id,
        quantity: addQty,
        product_name: pName
      })
    });
    const json = await res.json();

    if (json.ok) {
      alert('Información del casillero actualizada exitosamente');
      closeModal('modal-admin');
      loadLockers();
    } else {
      alert(json.error);
    }
  } catch (err) {
    alert('Error al comunicarse con el servidor');
  }
}

async function openLockerDirect() {
  try {
    const res = await fetch(`/api/lockers/${selectedLocker.id}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id })
    });
    const json = await res.json();
    if (!json.ok) return alert(json.error);
    alert(json.message);
  } catch (err) {
    alert('Error de conexión al intentar destrabar la cerradura');
  }
}

async function submitResize(size) {
  try {
    const res = await fetch(`/api/lockers/${selectedLocker.id}/resize`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        size_type: size
      })
    });
    const json = await res.json();
    if (json.ok) {
      closeModal('modal-admin');
      loadLockers();
    } else {
      alert(json.error);
    }
  } catch (err) {
    alert('Error al cambiar dimensiones');
  }
}

// ==========================================
// MODAL DE SELECCIÓN Y CANTIDAD DE INSUMO
// ==========================================
function openWithdrawModal(locker) {
  selectedLocker = locker;
  currentWithdrawQty = 1;
  document.getElementById('mw-locker-title').innerText = `Casillero #${locker.locker_number.toString().padStart(2, '0')}`;
  document.getElementById('mw-product-name').innerText = `Insumo: ${locker.product_name || 'Sin Asignar'} (Disponibles: ${locker.current_stock})`;
  document.getElementById('mw-qty').innerText = currentWithdrawQty;
  document.getElementById('modal-withdraw').classList.remove('hidden');
  document.getElementById('modal-withdraw').classList.add('flex');
}

function changeQty(delta) {
  let max = selectedLocker.current_stock;
  if (currentUser && currentUser.role === 'empleado' && currentUser.allowed_qty < max) {
    max = currentUser.allowed_qty;
  }
  const next = currentWithdrawQty + delta;
  if (next >= 1 && next <= max) {
    currentWithdrawQty = next;
    document.getElementById('mw-qty').innerText = currentWithdrawQty;
  }
}

function addToCartCurrent() {
  if (!selectedLocker) return;
  Cart.add(selectedLocker, currentWithdrawQty);
  closeModal('modal-withdraw');
  toggleCartDrawer(true);
}

async function confirmWithdraw() {
  try {
    const res = await fetch('/api/inventory/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        locker_id: selectedLocker.id,
        quantity: currentWithdrawQty
      })
    });
    const json = await res.json();
    if (!json.ok) return alert(json.error);

    alert(json.message);
    closeModal('modal-withdraw');
    loadLockers();
  } catch (err) {
    alert('Error al procesar el retiro');
  }
}

// ==========================================
// BITÁCORA Y REGISTRO DE AUDITORÍA
// ==========================================
async function showLogsModal() {
  try {
    const res = await fetch(`/api/reports/daily?user_id=${currentUser.id}`);
    const json = await res.json();
    const list = document.getElementById('logs-list');
    list.innerHTML = '';

    if (!json.data || json.data.length === 0) {
      list.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">No hay movimientos registrados hoy.</div>';
    } else {
      json.data.forEach(log => {
        const isOut = log.quantity_changed <= 0;
        const item = document.createElement('div');
        item.className = 'p-3 rounded-2xl bg-white/70 border border-white/90 text-xs flex justify-between items-center shadow-sm';
        item.innerHTML = `
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-slate-800">${log.username}</span> 
              <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 uppercase font-semibold">${log.role}</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-0.5">
              Casillero <strong class="text-slate-700">#${log.locker_number}</strong> 
              <span class="text-slate-400 mx-1">•</span> 
              ${new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div class="text-right">
            <div class="${isOut ? 'text-rose-500' : 'text-emerald-600'} font-black text-sm">
              ${log.quantity_changed > 0 ? '+' : ''}${log.quantity_changed} pzas
            </div>
            <div class="text-[10px] text-slate-500">
              Stock: ${log.stock_before} ➔ <span class="text-slate-700 font-bold">${log.stock_after}</span>
            </div>
          </div>
        `;
        list.appendChild(item);
      });
    }

    document.getElementById('modal-logs').classList.remove('hidden');
    document.getElementById('modal-logs').classList.add('flex');
  } catch (err) {
    alert('Error al consultar registros');
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }
}

// ==========================================
// REGISTRO DE NUEVOS USUARIOS
// ==========================================
async function openCreateUserModal() {
  document.getElementById('form-create-user').reset();
  toggleRoleFields();

  try {
    const res = await fetch('/api/lockers');
    const json = await res.json();
    availableLockers = json.data || [];
    
    const select = document.getElementById('cu-locker');
    select.innerHTML = '';
    availableLockers.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.innerText = `#${l.locker_number.toString().padStart(2, '0')} - ${l.product_name || 'Sin Producto'}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Error cargando lista de casilleros:', err);
  }

  document.getElementById('modal-create-user').classList.remove('hidden');
  document.getElementById('modal-create-user').classList.add('flex');
}

function toggleRoleFields() {
  const role = document.getElementById('cu-role').value;
  const employeeSection = document.getElementById('cu-employee-section');
  if (role === 'empleado') {
    employeeSection.classList.remove('hidden');
  } else {
    employeeSection.classList.add('hidden');
  }
}

async function submitCreateUser(e) {
  e.preventDefault();

  const role = document.getElementById('cu-role').value;
  const payload = {
    admin_id: currentUser.id,
    username: document.getElementById('cu-username').value.trim(),
    pin: document.getElementById('cu-pin').value.trim(),
    role: role,
    email: document.getElementById('cu-mail').value.trim(),
    phone: document.getElementById('cu-phone').value.trim(),
    assigned_locker_id: role === 'empleado' ? parseInt(document.getElementById('cu-locker').value, 10) : null,
    allowed_qty: role === 'empleado' ? parseInt(document.getElementById('cu-allowed-qty').value, 10) : null
  };

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (!json.ok) {
      alert(json.error || 'No se pudo crear el usuario');
      return;
    }

    alert(`Usuario "${payload.username}" creado exitosamente`);
    closeModal('modal-create-user');
  } catch (err) {
    alert('Error de conexión al registrar usuario');
  }
}

// ==========================================
// MÉTRICAS Y GRÁFICAS (CHART.JS)
// ==========================================
async function openStatsModal() {
  document.getElementById('modal-stats').classList.remove('hidden');
  document.getElementById('modal-stats').classList.add('flex');

  try {
    const res = await fetch(`/api/stats/summary?user_id=${currentUser.id}`);
    const json = await res.json();
    if (!json.ok) return alert(json.error);

    const { products, userActivity } = json.data;

    if (chartProductsInstance) chartProductsInstance.destroy();
    if (chartUsersInstance) chartUsersInstance.destroy();

    const ctxProducts = document.getElementById('chart-products').getContext('2d');
    chartProductsInstance = new Chart(ctxProducts, {
      type: 'bar',
      data: {
        labels: products.map(p => p.product_name || 'Sin Asignar'),
        datasets: [{
          label: 'Piezas retiradas',
          data: products.map(p => p.total_withdrawn),
          backgroundColor: '#3b82f6',
          borderRadius: 8
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
          y: { ticks: { color: '#1e293b', font: { weight: 'bold' } }, grid: { display: false } }
        }
      }
    });

    const ctxUsers = document.getElementById('chart-users').getContext('2d');
    chartUsersInstance = new Chart(ctxUsers, {
      type: 'doughnut',
      data: {
        labels: userActivity.map(u => u.username),
        datasets: [{
          data: userActivity.map(u => u.total_items),
          backgroundColor: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#475569', font: { size: 11 } } }
        }
      }
    });

  } catch (err) {
    console.error('Error cargando analíticas:', err);
  }
}

// ==========================================
// MÓDULO: DIÁLOGO CON EL MAYORDOMO (BYTE)
// ==========================================
let currentTutorialStep = 0;

const botDialogs = [
  {
    tag: 'Presentación',
    bubbleTitle: '¡Hola! Qué gusto verte.',
    message: 'Soy <strong>Byte</strong>, tu mayordomo digital. Me encargo de la comunicación con las placas de relés y los sensores para que retirar tus materiales sea facilísimo y seguro.',
    hint: '¿Es tu primera vez usando el casillero? Te explico en tres pasos rápidos.',
    buttonText: '¡Cuéntame cómo funciona!'
  },
  {
    tag: 'Paso 1: Acceso',
    bubbleTitle: 'Primero, identifícate en la pantalla.',
    message: 'En cuanto llegues a la estación, introduce tu <strong>PIN personal de 4 dígitos</strong> en el teclado numérico. Yo validaré tus permisos de inmediato.',
    hint: '💡 Si eres empleado, solo te mostraré tu casillero asignado. Si eres admin, verás todo el panel.',
    buttonText: 'Entendido, ¿qué sigue?'
  },
  {
    tag: 'Paso 2: Selección',
    bubbleTitle: 'Elige tu casillero y la cantidad.',
    message: 'Toca la tarjeta del casillero que necesitas. Podrás ajustar con los botones <strong>(+) y (-)</strong> las piezas exactas que vas a llevarte y agregarlas al carrito.',
    hint: '📦 Descontaremos el inventario en la base de datos automáticamente al confirmar.',
    buttonText: 'De acuerdo, ¿y cómo abre?'
  },
  {
    tag: 'Paso 3: Mecanismo',
    bubbleTitle: '¡La compuerta saltará sola hacia ti!',
    message: 'Le enviaré un pulso eléctrico al cerrojo industrial para destrabar la garra y la puerta <strong>brincará hacia afuera</strong>. Toma tu insumo y simplemente empújala de nuevo hasta escuchar el <em>clic</em>.',
    hint: '🚪 Mi microswitch integrado me avisará cuando esté cerrada y guardaré la bitácora.',
    buttonText: '¡Excelente, empecemos!'
  }
];

function renderTutorialStep() {
  const step = botDialogs[currentTutorialStep];
  document.getElementById('dialog-tag').innerText = step.tag;

  const bubble = document.getElementById('dialog-bubble');
  bubble.innerHTML = `
    <h4 class="text-base font-black text-slate-800 tracking-tight">${step.bubbleTitle}</h4>
    <p class="text-xs sm:text-sm text-slate-600 leading-relaxed">${step.message}</p>
    <div class="mt-1 p-2.5 rounded-xl bg-white/70 border border-white/90 text-[11px] text-slate-500 font-medium">
      ${step.hint}
    </div>
  `;

  const btnPrev = document.getElementById('btn-dialog-prev');
  if (currentTutorialStep === 0) {
    btnPrev.classList.add('hidden');
  } else {
    btnPrev.classList.remove('hidden');
  }

  const btnText = document.getElementById('btn-next-text');
  btnText.innerText = step.buttonText;

  const btnNext = document.getElementById('btn-dialog-next');
  if (currentTutorialStep === botDialogs.length - 1) {
    btnNext.className = 'px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5';
  } else {
    btnNext.className = 'px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5';
  }

  const dotsContainer = document.getElementById('tutorial-dots');
  dotsContainer.innerHTML = '';
  botDialogs.forEach((_, idx) => {
    const dot = document.createElement('div');
    dot.className = `h-2 rounded-full transition-all duration-200 ${
      idx === currentTutorialStep ? 'w-5 bg-blue-600' : 'w-2 bg-slate-300'
    }`;
    dotsContainer.appendChild(dot);
  });
}

function nextTutorialStep() {
  if (currentTutorialStep < botDialogs.length - 1) {
    currentTutorialStep++;
    renderTutorialStep();
  } else {
    skipTutorial();
  }
}

function prevTutorialStep() {
  if (currentTutorialStep > 0) {
    currentTutorialStep--;
    renderTutorialStep();
  }
}

function skipTutorial() {
  closeModal('modal-tutorial');
  localStorage.setItem('hasSeenLockerTutorial', 'true');
}

function updateAdminHeaderButtons() {
  const isAdmin = currentUser && (currentUser.role || '').toLowerCase() === 'admin';
  const adminButtons = ['btn-admin-logs', 'btn-admin-users', 'btn-admin-stats'];

  adminButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (isAdmin) {
      btn.classList.remove('hidden');
      btn.classList.add('flex');
    } else {
      btn.classList.add('hidden');
      btn.classList.remove('flex');
    }
  });
}

function startTutorial(force = false) {
  if (!force && localStorage.getItem('hasSeenLockerTutorial') === 'true') {
    return;
  }
  currentTutorialStep = 0;
  renderTutorialStep();
  const modal = document.getElementById('modal-tutorial');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// ==========================================
// GESTOR DE FLUJO DE PANTALLAS (EDCAM FLOW)
// ==========================================
const FlowManager = {
  screens: {},
  currentScreen: 'screensaver',
  inactivityTimer: null,
  successCountdownTimer: null,
  INACTIVITY_LIMIT_MS: 75000,

  init() {
    this.screens = {
      screensaver: document.getElementById('screen-screensaver'),
      welcome: document.getElementById('screen-welcome'),
      tutorial: document.getElementById('screen-tutorial'),
      login: document.getElementById('view-login'),
      dashboard: document.getElementById('view-dashboard'),
      success: document.getElementById('screen-success')
    };

    this.setupListeners();
    this.setupInactivityWatcher();
    this.goTo('screensaver');
  },

  goTo(target) {
    // 1. Cerrar cualquier modal abierto para evitar superposiciones
    ['modal-withdraw', 'modal-admin', 'modal-logs', 'modal-create-user', 'modal-stats', 'modal-tutorial'].forEach(id => {
      closeModal(id);
    });

    // 2. Cerrar cajón del carrito
    toggleCartDrawer(false);

    // 3. Ocultar todas las pantallas
    Object.values(this.screens).forEach(screen => {
      if (screen) {
        screen.classList.add('hidden');
        screen.classList.remove('flex');
      }
    });

    // 4. Activar pantalla objetivo
    const active = this.screens[target];
    if (active) {
      active.classList.remove('hidden');
      active.classList.add('flex');
      this.currentScreen = target;
    }

    // 5. Control inteligente de reproducción de video
    const videoEl = document.getElementById('screensaver-video');
    if (videoEl) {
      if (target === 'screensaver') {
        videoEl.play().catch(() => {});
      } else {
        videoEl.pause();
      }
    }

    // 6. Acciones específicas por pantalla
    if (target === 'screensaver') {
      Cart.clear();
      clearPin();
      currentUser = null;
      clearTimeout(this.inactivityTimer);
      clearInterval(this.successCountdownTimer);

      const bLogs = document.getElementById('btn-admin-logs');
      const bUsers = document.getElementById('btn-admin-users');
      const bStats = document.getElementById('btn-admin-stats');
      if (bLogs) bLogs.classList.add('hidden');
      if (bUsers) bUsers.classList.add('hidden');
      if (bStats) bStats.classList.add('hidden');
    } else if (target === 'success') {
      clearTimeout(this.inactivityTimer);
      this.startSuccessCountdown(8);
    } else if (target === 'dashboard') {
      updateAdminHeaderButtons();
      loadLockers();
      this.resetInactivityTimer();
    } else {
      clearInterval(this.successCountdownTimer);
      this.resetInactivityTimer();
    }
  },

  setupListeners() {
    const screensaver = document.getElementById('screen-screensaver');
    if (screensaver) {
      screensaver.addEventListener('pointerdown', () => this.goTo('welcome'));
    }
  },

  setupInactivityWatcher() {
    const activityEvents = ['pointerdown', 'touchstart', 'mousemove', 'keydown'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, () => {
        if (this.currentScreen !== 'screensaver' && this.currentScreen !== 'success') {
          this.resetInactivityTimer();
        }
      }, { passive: true });
    });
  },

  resetInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      console.log('Inactividad detectada. Retornando a modo reposo por seguridad.');
      this.goTo('screensaver');
    }, this.INACTIVITY_LIMIT_MS);
  },

  startSuccessCountdown(seconds) {
    let count = seconds;
    const label = document.getElementById('success-countdown');
    if (label) label.textContent = count;

    clearInterval(this.successCountdownTimer);
    this.successCountdownTimer = setInterval(() => {
      count--;
      if (label) label.textContent = count;
      if (count <= 0) {
        clearInterval(this.successCountdownTimer);
        this.goTo('screensaver');
      }
    }, 1000);
  }
};

// ==========================================
// GESTIÓN DEL CARRITO (TIPO AMAZON)
// ==========================================
const Cart = {
  items: [],

  add(locker, qty = 1) {
    const existing = this.items.find(i => i.id === locker.id);
    const maxStock = locker.current_stock;

    if (existing) {
      const newQty = existing.quantity + qty;
      if (newQty > maxStock) {
        alert(`Stock insuficiente en el casillero #${locker.locker_number}. Solo hay ${maxStock} piezas.`);
        existing.quantity = maxStock;
      } else {
        existing.quantity = newQty;
      }
    } else {
      if (qty > maxStock) {
        alert(`Stock insuficiente. Solo hay ${maxStock} piezas disponibles.`);
        qty = maxStock;
      }
      this.items.push({
        ...locker,
        quantity: qty
      });
    }
    this.render();
  },

  remove(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.render();
  },

  clear() {
    this.items = [];
    this.render();
  },

  render() {
    const counter = document.getElementById('cart-counter');
    const container = document.getElementById('cart-items');

    if (counter) {
      const totalUnits = this.items.reduce((acc, curr) => acc + curr.quantity, 0);
      counter.innerText = totalUnits;
    }

    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <span class="text-3xl block mb-2 opacity-40">🛒</span>
          <p class="text-slate-500 text-xs font-semibold">Tu carrito está vacío</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.items.map(item => `
      <div class="p-3 rounded-2xl bg-white/70 border border-white/90 text-xs flex justify-between items-center shadow-sm">
        <div class="flex-1 mr-2">
          <div class="flex items-center gap-1.5">
            <span class="font-black text-slate-800 text-xs">#${item.locker_number.toString().padStart(2, '0')}</span>
            <span class="font-bold text-slate-700 text-xs truncate max-w-[130px]">${item.product_name || 'Insumo'}</span>
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5">
            Cantidad: <strong class="text-blue-600 font-bold">${item.quantity}</strong> pza(s)
          </div>
        </div>
        <button onclick="Cart.remove(${item.id})" class="text-rose-500 hover:text-rose-700 font-bold text-xs p-1">
          ✕
        </button>
      </div>
    `).join('');
  },

  async checkout() {
    if (this.items.length === 0) {
      alert('Tu carrito está vacío. Selecciona al menos un insumo.');
      return;
    }

    const userId = currentUser ? currentUser.id : 1;

    try {
      toggleCartDrawer(false);

      const res = await fetch('/api/inventory/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          items: this.items
        })
      });

      const json = await res.json();
      if (!json.ok) return alert(json.error || 'Ocurrió un error al procesar el retiro');

      this.clear();
      loadLockers();
      FlowManager.goTo('success');
    } catch (err) {
      console.error('Error durante el proceso de apertura:', err);
      alert('Error al comunicar con los casilleros. Contacte a soporte.');
    }
  }
};

// ==========================================
// FUNCIONES AUXILIARES DEL CARRITO
// ==========================================
function toggleCartDrawer(forceState) {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  if (typeof forceState === 'boolean') {
    drawer.classList.toggle('translate-x-full', !forceState);
  } else {
    drawer.classList.toggle('translate-x-full');
  }
}

function confirmOrderCheckout() {
  Cart.checkout();
}

function clearCurrentCart() {
  Cart.clear();
}

// ==========================================
// INICIALIZACIÓN GLOBAL
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  setupScreensaverVideo();
  FlowManager.init();
  Cart.render();
});