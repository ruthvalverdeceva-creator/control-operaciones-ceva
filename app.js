/* ==========================================================================
   CONFIGURACIÓN DE SUPABASE Y CLIENTE
   ========================================================================== */
const SUPABASE_URL = 'https://bpwgyimcreewipewrynp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7CXbNSDMPB705qUpUp_7A_w19foNfz';

const CLAVE_TOKEN = "ceva_token";
let tokenSesion = null;
try { tokenSesion = localStorage.getItem(CLAVE_TOKEN) || null; } catch (e) {}

function crearCliente(token) {
  const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  if (token) opciones.global = { headers: { "x-val-token": token } };
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, opciones);
}

let supabaseClient = crearCliente(tokenSesion);

function fijarToken(token) {
  tokenSesion = token || null;
  try { token ? localStorage.setItem(CLAVE_TOKEN, token) : localStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
  supabaseClient = crearCliente(tokenSesion);
}

let usuarioActual = null;

const $ = s => document.querySelector(s);

// ================= PÁGINA DE LOGIN =================
document.addEventListener("submit", async e => {
  if (!e.target || e.target.id !== "form-login") return;
  e.preventDefault();
  
  const usuarioInput = $("#login-usuario");
  const passwordInput = $("#login-password");
  const errDiv = $("#error-login");
  const btnIngresar = document.querySelector("#form-login .btn-ingresar");

  if (!usuarioInput) return;

  const usuario = usuarioInput.value.trim();
  const pass = passwordInput ? passwordInput.value : "";

  if (errDiv) errDiv.style.display = "none";
  if (btnIngresar) { 
    btnIngresar.disabled = true; 
    btnIngresar.textContent = "INGRESANDO…"; 
  }

  try {
    const { data, error } = await supabaseClient.rpc("val_entrar", { 
      p_usuario: usuario, 
      p_password: pass || null 
    });

    if (error) throw new Error("Error en Supabase: " + error.message);
    if (!data || !data.ok) throw new Error((data && data.msg) || "Usuario o contraseña incorrectos.");
    
    fijarToken(data.token);
    usuarioActual = { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
    
    const formLogin = $("#form-login");
    if (formLogin) formLogin.reset();
    
    verificarEstadoSesion();
  } catch (ex) {
    if (errDiv) { 
      errDiv.textContent = ex.message; 
      errDiv.style.display = "block"; 
    } else {
      alert(ex.message);
    }
  } finally {
    if (btnIngresar) { 
      btnIngresar.disabled = false; 
      btnIngresar.textContent = "INGRESAR"; 
    }
  }
});

// Botón de cerrar sesión
document.addEventListener("click", e => {
  if (e.target && e.target.id === "btn-cerrar-sesion") {
    fijarToken(null);
    usuarioActual = null;
    verificarEstadoSesion();
  }
});

function verificarEstadoSesion() {
  const vistaLogin = $("#vista-login");
  const contenedorPrincipal = $("#contenedor-principal");
  
  if (usuarioActual) {
    if (vistaLogin) vistaLogin.style.display = "none";
    if (contenedorPrincipal) contenedorPrincipal.style.display = "flex";
    
    const nombreDisplay = $("#nombre-usuario-display");
    const cargoDisplay = $("#cargo-usuario-display");
    const rolDisplay = $("#etiqueta-rol");
    
    if (nombreDisplay) nombreDisplay.textContent = usuarioActual.nombre;
    if (cargoDisplay) cargoDisplay.textContent = usuarioActual.cargo;
    if (rolDisplay) rolDisplay.textContent = usuarioActual.rol.toUpperCase();

    // Renderizamos tu menú corporativo y tus módulos completos
    renderizarMenuYContenido();
  } else {
    if (vistaLogin) vistaLogin.style.display = "flex";
    if (contenedorPrincipal) contenedorPrincipal.style.display = "none";
  }
}

async function cargarPerfil() {
  if (!tokenSesion) return null;
  try {
    const { data, error } = await supabaseClient.rpc("val_yo");
    if (error || !data) { fijarToken(null); return null; }
    return { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
  } catch (err) { 
    return null; 
  }
}

// Inicialización al cargar la página
(async function iniciar() {
  usuarioActual = await cargarPerfil();
  verificarEstadoSesion();
})();

// ================= RENDERIZADO DE MENÚ Y MÓDULOS COMPLETOS =================
function renderizarMenuYContenido() {
    const menu = $("#menu");
    if (menu) {
        menu.innerHTML = `
            <div class="titulo-seccion">MÓDULOS OPERATIVOS</div>
            <a href="#" class="activo" onclick="mostrarVistaExcel(); return false;">📊 Validación Outbound</a>
        `;
    }
    mostrarVistaExcel();
}

function mostrarVistaExcel() {
    const principal = $("#principal");
    if (!principal) return;

    principal.innerHTML = `
        <div class="tarjeta encabezado">
            <h2>Validación Outbound & Control de Fases</h2>
            <p>Carga tu archivo Excel para procesar dinámicamente las columnas de FO y Fase.</p>
        </div>
        <div class="tarjeta bloque-admin">
            <h3>Seleccionar Archivo de Despachos</h3>
            <div class="form-group" style="margin-bottom: 15px;">
                <input type="file" id="inputExcel" accept=".xlsx, .xls, .csv" style="width:100%; padding:12px; border:1px solid #c3cbd9; border-radius:8px;">
            </div>
            <h3>Consola de Registro</h3>
            <div id="log" style="background: #1e1e1e; color: #00ff00; padding: 15px; border-radius: 8px; font-family: monospace; height: 220px; overflow-y: auto;">Esperando archivo Excel...</div>
        </div>
    `;

    const inputExcel = document.getElementById('inputExcel');
    if (inputExcel) {
        inputExcel.addEventListener('change', procesarExcelDinamico);
    }
}

// ================= PROCESAMIENTO DINÁMICO DE EXCEL CON SHEETJS =================
function registrarLog(mensaje, esError = false) {
    const logDiv = document.getElementById('log');
    if (!logDiv) return;
    const color = esError ? '#ff6b6b' : '#00ff00';
    logDiv.innerHTML += `<div style="color: ${color};">[${new Date().toLocaleTimeString()}] ${mensaje}</div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(mensaje);
}

function procesarExcelDinamico(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;

    registrarLog(`Cargando archivo: ${archivo.name}...`);

    const lector = new FileReader();
    lector.onload = function (evento) {
        try {
            const datos = new Uint8Array(evento.target.result);
            const libro = XLSX.read(datos, { type: 'array' });
            
            const nombreHoja = libro.SheetNames[0];
            const hoja = libro.Sheets[nombreHoja];
            
            const filasJson = XLSX.utils.sheet_to_json(hoja, { defval: "" });

            if (filasJson.length === 0) {
                registrarLog("El archivo Excel está vacío o no tiene datos legibles.", true);
                return;
            }

            registrarLog(`Total de filas leídas: ${filasJson.length}`);

            const primeraFila = filasJson[0];
            const llaves = Object.keys(primeraFila);

            const colFO = llaves.find(k => k.trim().toUpperCase() === 'FO' || k.trim().toUpperCase() === 'FO REAL' || k.trim().toUpperCase().includes('FO'));
            const colFase = llaves.find(k => k.trim().toUpperCase() === 'FASE' || k.trim().toUpperCase().includes('FASE'));

            if (!colFO || !colFase) {
                registrarLog("ERROR: No se detectaron automáticamente las columnas 'FO' y 'Fase' en los encabezados.", true);
                registrarLog(`Encabezados encontrados: [ ${llaves.join(', ')} ]`, true);
                return;
            }

            registrarLog(`¡Columnas detectadas con éxito! -> FO: [${colFO}] | Fase: [${colFase}]`);

            const resultadosProcesados = filasJson.map((fila, index) => {
                return {
                    fila: index + 2,
                    fo: fila[colFO],
                    fase: fila[colFase]
                };
            }).filter(item => item.fo !== "" || item.fase !== "");

            registrarLog(`Procesamiento exitoso. Se validaron ${resultadosProcesados.length} registros.`);
            console.table(resultadosProcesados.slice(0, 5));

            enviarDatosAlServidor(resultadosProcesados);

        } catch (error) {
            registrarLog(`Error al procesar el archivo: ${error.message}`, true);
        }
    };

    lector.readAsArrayBuffer(archivo);
}

function enviarDatosAlServidor(datos) {
    registrarLog("Datos listos para sincronizar con la lógica de operaciones.");
}
