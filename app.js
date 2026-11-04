/* ==========================================================================
   CONFIGURACIÓN DE SUPABASE Y CLIENTE
   ========================================================================== */
const SUPABASE_URL = 'https://bpwgyimcreewipewrynp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7CXbNSDMPB705qUpUp_7A_w19foNfz';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const USUARIOS_PERMITIDOS = [
  { usuario: "RVALVERDE", password: "123", nombre: "Ruth Valverde", cargo: "Practicante de Inventario", rol: "admin" },
  { usuario: "OPERACIONES1", password: "123", nombre: "Operador de Turno", cargo: "Personal de Campo", rol: "usuario" }
];

// Estructura base por defecto de tus módulos
const BASE = [
  { id: "inventario", nombre: "Inventario", icono: "📦",
    desc: "Paletas, virtuales, inmovilizados y más.",
    dashboards: [
      { id: "paletas",       nombre: "Paletas",       url: "" },
      { id: "virtuales",     nombre: "Virtuales",     url: "" },
      { id: "inmovilizados", nombre: "Inmovilizados", url: "" }
    ] },
  { id: "operacion", nombre: "Operación", icono: "🚚",
    desc: "Indicadores de la operación diaria.",
    dashboards: [
      { id: "despachos",     nombre: "Despachos",     url: "" },
      { id: "recepcion",     nombre: "Recepción",     url: "" },
      { id: "productividad", nombre: "Productividad", url: "" }
    ] },
  { id: "rh", nombre: "RH", icono: "👥",
    desc: "Indicadores de recursos humanos.",
    dashboards: [ { id: "rh", nombre: "RH", url: "" } ] },
  { id: "seguridad", nombre: "Seguridad", icono: "🦺",
    desc: "Indicadores de seguridad y salud.",
    dashboards: [ { id: "seguridad", nombre: "Seguridad", url: "" } ] },
  { id: "facturacion", nombre: "Facturación", icono: "🧾",
    desc: "Reporte de facturación.",
    dashboards: [ { id: "facturacion", nombre: "Facturación", url: "" } ] }
];

const SECCIONES = [
  { id: "reportes", nombre: "Reportes", icono: "📊", desc: "Dashboards de Power BI organizados por módulo.", ruta: "#reportes" }
];

let CONFIG = JSON.parse(JSON.stringify(BASE));
let usuarioActual = cargarSesionActiva();
let edicion = null;

// Función para sincronizar y cargar los enlaces desde Supabase
async function cargarConfiguracionRemota() {
  try {
    const { data, error } = await supabaseClient.from('dashboards_config').select('*');
    if (!error && data && data.length > 0) {
      // Mapeamos los links guardados en la nube a nuestra estructura CONFIG
      CONFIG.forEach(mod => {
        mod.dashboards.forEach(dash => {
          const encontrado = data.find(item => item.id === dash.id);
          if (encontrado) {
            dash.url = encontrado.url;
          }
        });
      });
    }
  } catch (err) {
    console.error("Error al conectar con Supabase:", err);
  }
  render();
}

function cargarSesionActiva() {
  try {
    const u = JSON.parse(localStorage.getItem("ceva_sesion_activa"));
    return u || null;
  } catch(e) { return null; }
}

const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const esAdmin = () => usuarioActual && usuarioActual.rol === "admin";
const buscarModulo = id => CONFIG.find(m => m.id === id);

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 3000);
}

/* ---------- Botón para ver/ocultar contraseña ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const btnToggle = $("#btn-toggle-password");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      const inputPass = $("#login-password");
      if (inputPass.type === "password") {
        inputPass.type = "text";
        btnToggle.textContent = "🔒";
      } else {
        inputPass.type = "password";
        btnToggle.textContent = "👁️";
      }
    });
  }
});

/* ---------- Lógica de Login ---------- */
document.addEventListener("submit", e => {
  if (e.target && e.target.id === "form-login") {
    e.preventDefault();
    const uInput = $("#login-usuario").value.trim().toUpperCase();
    const pInput = $("#login-password").value.trim();

    const encontrado = USUARIOS_PERMITIDOS.find(u => u.usuario === uInput && u.password === pInput);
    
    if (encontrado) {
      usuarioActual = encontrado;
      localStorage.setItem("ceva_sesion_activa", JSON.stringify(encontrado));
      $("#error-login").style.display = "none";
      $("#form-login").reset();
      verificarEstadoSesion();
    } else {
      $("#error-login").style.display = "block";
    }
  }
});

document.addEventListener("click", async e => {
  if (e.target && e.target.id === "btn-cerrar-sesion") {
    localStorage.removeItem("ceva_sesion_activa");
    usuarioActual = null;
    verificarEstadoSesion();
    return;
  }

  const b = e.target.closest("[data-acc]"); if (!b) return;
  const a = b.dataset.acc, m = b.dataset.m, d = b.dataset.d;
  if (a === "editar") abrirModal(m, d);
  else if (a === "nuevo") abrirModal(m, "");
  else if (a === "cerrar-modal") cerrarModal();
  else if (a === "guardar-modal") await guardarModal();
  else if (a === "borrar") {
    if (confirm("¿Quitar este dashboard de la lista?")) {
      const mod = buscarModulo(m); 
      mod.dashboards = mod.dashboards.filter(x => x.id !== d);
      // Opcional: borrar de supabase si deseas
      render(); 
      toast("Dashboard quitado");
    }
  }
  else if (a === "pantalla") {
    const f = $("#marco");
    if (f && f.requestFullscreen) f.requestFullscreen(); else alert("Primero conecta un dashboard.");
  }
  else if (a === "exportar") {
    const texto = "const BASE = " + JSON.stringify(CONFIG, null, 2) + ";";
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => toast("Configuración copiada ✔"), () => prompt("Copia este texto:", texto));
    else prompt("Copia este texto:", texto);
  }
  else if (a === "reset") {
    if (confirm("¿Seguro que deseas restablecer los datos?")) {
      CONFIG = JSON.parse(JSON.stringify(BASE)); 
      render(); 
      toast("Restablecido localmente");
    }
  }
});

function verificarEstadoSesion() {
  if (usuarioActual) {
    $("#vista-login").style.display = "none";
    $("#contenedor-principal").style.display = "flex";
    $("#nombre-usuario-display").textContent = usuarioActual.nombre;
    $("#cargo-usuario-display").textContent = usuarioActual.cargo;
    cargarConfiguracionRemota(); // Carga de la nube al iniciar sesión
  } else {
    $("#vista-login").style.display = "flex";
    $("#contenedor-principal").style.display = "none";
  }
}

/* ---------- Rutas y Vistas de la App ---------- */
function ruta() { return (location.hash.replace("#", "") || "inicio").split("/"); }

function render() {
  if (!usuarioActual) return;
  const p = ruta();
  const etiquetaRol = $("#etiqueta-rol");
  if (etiquetaRol) etiquetaRol.textContent = esAdmin() ? "ADMINISTRADORA" : "USUARIO";
  
  dibujarMenu(p);
  const main = $("#principal");
  if (!main) return;

  if (p[0] === "admin" && esAdmin()) vistaAdmin(main);
  else if (p[0] === "reportes") { if (p[1]) vistaModulo(main, p[1], p[2]); else vistaReportes(main); }
  else vistaInicio(main);
  window.scrollTo(0, 0);
}

function dibujarMenu(p) {
  let h = '<a href="#inicio" class="' + (p[0] === "inicio" || !p[0] ? "activo" : "") + '">🏠 Inicio</a>';
  SECCIONES.forEach(s => {
    const dentro = p[0] === s.id;
    h += '<a href="' + s.ruta + '" class="' + (dentro && !p[1] ? "activo" : "") + '">' + esc(s.icono) + " " + esc(s.nombre) + "</a>";
    if (dentro && s.id === "reportes") {
      CONFIG.forEach(m => {
        h += '<a class="sub ' + (p[1] === m.id ? "activo" : "") + '" href="#reportes/' + esc(m.id) + '">' + esc(m.icono) + " " + esc(m.nombre) + "</a>";
      });
    }
  });
  if (esAdmin()) {
    h += '<div class="titulo-seccion">ADMINISTRACIÓN</div>';
    h += '<a href="#admin" class="' + (p[0] === "admin" ? "activo" : "") + '">⚙️ Panel de administración</a>';
  }
  const menuElem = $("#menu");
  if (menuElem) menuElem.innerHTML = h;
}

function vistaInicio(main) {
  let h = '<div class="tarjeta encabezado"><h2>Panel Principal</h2>' +
          '<p>Elige una sección para continuar.</p></div><div class="grid">';
  SECCIONES.forEach(s => {
    const meta = s.id === "reportes" ? CONFIG.length + " módulos" : "";
    h += '<a class="tarjeta modulo" href="' + s.ruta + '">' +
           '<div class="icono">' + esc(s.icono) + '</div>' +
           '<h3>' + esc(s.nombre.toUpperCase()) + '</h3>' +
           '<p>' + esc(s.desc) + '</p>' +
           '<div class="meta">' + meta + '</div>' +
           '<span class="abrir">Abrir →</span>' +
         '</a>';
  });
  h += "</div>";
  main.innerHTML = h;
}

function vistaReportes(main) {
  let h = '<div class="tarjeta encabezado">' +
          '<div class="migas"><a href="#inicio">Inicio</a> / Reportes</div>' +
          '<h2>Reportes</h2>' +
          '<p>Elige un módulo para ver sus dashboards.</p></div>';
  h += '<div class="grid">';
  CONFIG.forEach(m => {
    const total = m.dashboards.length;
    const conectados = m.dashboards.filter(d => d.url).length;
    const meta = total + (total === 1 ? " dashboard" : " dashboards") +
                 (esAdmin() ? " · " + conectados + " conectado" + (conectados === 1 ? "" : "s") : "");
    h += '<a class="tarjeta modulo" href="#reportes/' + esc(m.id) + '">' +
           '<div class="icono">' + esc(m.icono) + '</div>' +
           '<h3>' + esc(m.nombre.toUpperCase()) + '</h3>' +
           '<p>' + esc(m.desc || "") + '</p>' +
           '<div class="meta">' + meta + '</div>' +
           '<span class="abrir">Abrir módulo →</span>' +
         '</a>';
  });
  h += "</div>";
  main.innerHTML = h;
}

function vistaModulo(main, modId, dashId) {
  const m = buscarModulo(modId);
  if (!m) { location.hash = "#reportes"; return; }
  const d = m.dashboards.find(x => x.id === dashId) || m.dashboards[0];

  let h = '<div class="tarjeta encabezado">' +
            '<div class="migas"><a href="#inicio">Inicio</a> / <a href="#reportes">Reportes</a> / ' + esc(m.nombre) + (d ? " / " + esc(d.nombre) : "") + "</div>" +
            "<h2>" + esc(m.icono) + " " + esc(m.nombre.toUpperCase()) + "</h2>" +
            "<p>" + esc(m.desc || "") + "</p></div>";

  if (!d) {
    h += '<div class="tarjeta visor"><div class="vacio"><div class="icono">📭</div><h4>Este módulo aún no tiene dashboards</h4>' +
         (esAdmin() ? '<button class="btn grande" data-acc="nuevo" data-m="' + esc(m.id) + '">+ Agregar dashboard</button>' : "<p>Pronto estará disponible.</p>") +
         "</div></div>";
    main.innerHTML = h; return;
  }

  if (m.dashboards.length > 1) {
    h += '<div class="pestanas">';
    m.dashboards.forEach(x => {
      h += '<a class="pestana ' + (x.id === d.id ? "activa" : "") + '" href="#reportes/' + esc(m.id) + "/" + esc(x.id) + '">' + esc(x.nombre) + "</a>";
    });
    h += "</div>";
  }

  h += '<div class="tarjeta visor"><div class="visor-barra"><h3>' + esc(d.nombre) + "</h3><div>" +
       '<button class="btn gris" data-acc="pantalla">⛶ Pantalla completa</button> ' +
       (esAdmin() ? '<button class="btn" data-acc="editar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">⚙ Configurar enlace</button>' : "") +
       "</div></div>";

  if (d.url) {
    h += '<iframe class="marco" id="marco" src="' + esc(d.url) + '" allowfullscreen title="' + esc(d.nombre) + '"></iframe>';
  } else if (esAdmin()) {
    h += '<div class="vacio"><div class="icono">📊</div><h4>Aún no hay un Power BI conectado</h4>' +
         "<p>Pega el enlace del reporte para verlo aquí.</p>" +
         '<button class="btn grande" data-acc="editar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">Conectar Power BI</button></div>';
  } else {
    h += '<div class="vacio"><div class="icono">🛠️</div><h4>Dashboard no disponible por ahora</h4>' +
         "<p>Este reporte se está preparando. Vuelve pronto.</p></div>";
  }
  h += "</div>";
  main.innerHTML = h;
}

function vistaAdmin(main) {
  let h = '<div class="tarjeta encabezado"><h2>Panel de administración</h2>' +
          "<p>Aquí conectas los Power BI y sincronizas los dashboards directamente en Supabase.</p></div>";

  h += '<div class="aviso">💡 Los cambios que guardes aquí se sincronizan automáticamente <strong>en la nube</strong> para todos los dispositivos.</div>';

  h += '<div class="barra-admin">' +
       '<button class="btn" data-acc="exportar">📋 Copiar configuración</button>' +
       '<button class="btn gris" data-acc="reset">↺ Restablecer</button></div>';

  CONFIG.forEach(m => {
    h += '<div class="tarjeta bloque-admin"><h3><span>' + esc(m.icono) + " " + esc(m.nombre) + "</span>" +
         '<button class="btn" data-acc="nuevo" data-m="' + esc(m.id) + '">+ Agregar dashboard</button></h3>' +
         "<table><tr><th>Dashboard</th><th>Estado</th><th></th></tr>";
    m.dashboards.forEach(d => {
      h += "<tr><td>" + esc(d.nombre) + "</td><td>" +
           (d.url ? '<span class="estado ok">Conectado</span>' : '<span class="estado pend">Pendiente</span>') + "</td>" +
           '<td class="acc"><a class="btn gris" style="text-decoration:none;display:inline-block" href="#reportes/' + esc(m.id) + "/" + esc(d.id) + '">Ver</a>' +
           '<button class="btn" data-acc="editar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">Editar</button>' +
           '<button class="btn peligro" data-acc="borrar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">Quitar</button></td></tr>';
    });
    if (!m.dashboards.length) h += '<tr><td colspan="3" style="color:#6b7585">Sin dashboards todavía.</td></tr>';
    h += "</table></div>";
  });
  main.innerHTML = h;
}

function abrirModal(modId, dashId) {
  const m = buscarModulo(modId); if (!m) return;
  const d = dashId ? m.dashboards.find(x => x.id === dashId) : null;
  edicion = { m: modId, d: dashId || "" };
  const modalTitulo = $("#modal-titulo");
  if (modalTitulo) modalTitulo.textContent = d ? "Configurar: " + d.nombre : "Nuevo dashboard en " + m.nombre;
  $("#input-nombre").value = d ? d.nombre : "";
  $("#input-url").value = d ? d.url : "";
  $("#modal").classList.add("abierto");
  $("#input-nombre").focus();
}

function cerrarModal() { 
  const modal = $("#modal");
  if (modal) modal.classList.remove("abierto"); 
  edicion = null; 
}

function limpiarUrl(texto) {
  let u = texto.trim();
  const m = u.match(/src=["']([^"']+)["']/i);
  if (m) u = m[1];
  return u;
}

// Función actualizada para guardar directamente en Supabase
async function guardarModal() {
  if (!edicion) return;
  const m = buscarModulo(edicion.m);
  const nombre = $("#input-nombre").value.trim();
  const url = limpiarUrl($("#input-url").value);
  
  if (!nombre) { alert("Escribe un nombre para el dashboard."); return; }
  if (url && !/^https:\/\//i.test(url)) { alert("El enlace debe empezar con https://"); return; }

  let targetId = edicion.d;
  if (targetId) {
    const d = m.dashboards.find(x => x.id === targetId);
    d.nombre = nombre; 
    d.url = url;
  } else {
    targetId = "d" + Date.now();
    m.dashboards.push({ id: targetId, nombre: nombre, url: url });
  }

  // Guardar en la base de datos de Supabase
  try {
    const { error } = await supabaseClient
      .from('dashboards_config')
      .upsert({ id: targetId, url: url, updated_at: new Date() });

    if (error) {
      console.error("Error al guardar en Supabase:", error.message);
      alert("Hubo un error al guardar en la nube.");
      return;
    }
  } catch (err) {
    console.error("Excepción al guardar:", err);
  }

  cerrarModal(); 
  render(); 
  toast("Guardado y sincronizado en la nube ✔");
}

window.addEventListener("hashchange", render);

// Inicializar al cargar la página
verificarEstadoSesion();
